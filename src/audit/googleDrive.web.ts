/**
 * Google Drive on the web: Google sign-in (Google Identity Services), the
 * Google Picker for choosing a folder, and uploads through the Drive REST API.
 *
 * Uses the narrow drive.file permission: the app can only see files it created
 * and folders the user picked with the Picker. A folder pasted as a link must be
 * picked once (Settings → Choose in Google Drive) before the app can write to it.
 */
import { GOOGLE_CONFIG, driveFolderId, googleDriveConfigured } from './googleConfig';
import { DriveError, type DriveFile, type DriveFolder } from './googleDrive.types';

export { DriveError };
export type { DriveFile, DriveFolder };

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Google's browser libraries add these globals; they have no bundled types.
declare const google: any;
declare const gapi: any;

export const driveAvailable = true;

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src);
        reject(new DriveError("Couldn't load Google sign-in. Check your connection or ad blocker."));
      };
      document.head.appendChild(el);
    });
    scripts.set(src, p);
  }
  return p;
}

/** Loads Google sign-in ahead of time, so the sign-in popup can open straight from a button press. */
export function preloadDrive(): void {
  if (googleDriveConfigured()) loadScript('https://accounts.google.com/gsi/client').catch(() => {});
}

let token: { value: string; expiresAt: number } | null = null;

/**
 * An access token, asking the user to sign in if needed. Call this directly from
 * a button press: browsers block the sign-in popup otherwise.
 */
export async function getDriveToken(): Promise<string> {
  if (!googleDriveConfigured()) {
    throw new DriveError('Google Drive is not set up for this app yet (see GOOGLE_DRIVE_SETUP.md).');
  }
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;
  await loadScript('https://accounts.google.com/gsi/client');
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CONFIG.clientId,
      scope: SCOPE,
      callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
        if (resp.error || !resp.access_token) {
          reject(new DriveError('Google sign-in did not give access to Drive.'));
          return;
        }
        token = { value: resp.access_token, expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000 };
        resolve(resp.access_token);
      },
      error_callback: (err: { type?: string }) => {
        reject(
          new DriveError(
            err?.type === 'popup_failed_to_open'
              ? 'The browser blocked the Google sign-in popup. Allow popups for this site and try again.'
              : 'Google sign-in was closed before it finished.',
          ),
        );
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** Opens the Google Picker to choose a folder. Resolves to null if the user cancels. */
export async function pickDriveFolder(): Promise<DriveFolder | null> {
  const accessToken = await getDriveToken();
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((resolve) => gapi.load('picker', () => resolve()));
  return new Promise<DriveFolder | null>((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(FOLDER_MIME)
      .setEnableDrives(true);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_CONFIG.apiKey)
      .setAppId(GOOGLE_CONFIG.appId)
      .setTitle('Choose the data folder')
      .setCallback((data: { action: string; docs?: { id: string; name: string; url?: string }[] }) => {
        if (data.action === google.picker.Action.PICKED && data.docs?.[0]) {
          const doc = data.docs[0];
          resolve({ id: doc.id, name: doc.name, url: doc.url ?? `https://drive.google.com/drive/folders/${doc.id}` });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}

async function driveFetch(url: string, init: RequestInit): Promise<any> {
  const accessToken = await getDriveToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` } });
  if (res.ok) return res.json();
  if (res.status === 401) token = null;
  if (res.status === 404) {
    throw new DriveError(
      "Starstell can't write to that Drive folder yet. In Settings, use “Choose in Google Drive” to pick it once, then try again.",
    );
  }
  if (res.status === 403) throw new DriveError("Your Google account doesn't have permission to add files to that folder.");
  throw new DriveError(`Google Drive error ${res.status}. Try again in a moment.`);
}

/**
 * Creates a new subfolder named `runName` inside the Drive folder at
 * `parentFolderUrl` and uploads `files` into it. Returns the new folder.
 */
export async function saveToDrive(parentFolderUrl: string, runName: string, files: DriveFile[]): Promise<DriveFolder> {
  const parentId = driveFolderId(parentFolderUrl);
  if (!parentId) throw new DriveError('The data folder in Settings is not a Google Drive folder link.');

  const folder = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: runName, mimeType: FOLDER_MIME, parents: [parentId] }),
  });

  for (const f of files) {
    const boundary = `starstell-${Math.random().toString(36).slice(2)}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify({ name: f.name, mimeType: f.mimeType, parents: [folder.id] })}\r\n` +
      `--${boundary}\r\nContent-Type: ${f.mimeType}; charset=UTF-8\r\n\r\n${f.content}\r\n--${boundary}--`;
    await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  }
  return { id: folder.id, name: folder.name, url: folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}` };
}
