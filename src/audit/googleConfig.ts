/**
 * Google Cloud settings for saving audit results to Google Drive.
 *
 * These identify the app to Google; they are not secrets and are safe to
 * commit. They are set up once by whoever deploys Starstell (see
 * GOOGLE_DRIVE_SETUP.md); users only sign in with Google.
 */
export const GOOGLE_CONFIG = {
  /** OAuth 2.0 Client ID of type "Web application", e.g. "123-abc.apps.googleusercontent.com". */
  clientId: '',
  /** API key restricted to the Google Picker API and this site's address. */
  apiKey: '',
  /** Google Cloud project number (digits only). */
  appId: '',
};

export function googleDriveConfigured(): boolean {
  return !!(GOOGLE_CONFIG.clientId && GOOGLE_CONFIG.apiKey && GOOGLE_CONFIG.appId);
}

/** Folder ID from a Google Drive folder link, or null if the link isn't one. */
export function driveFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([\w-]{10,})/) ?? url.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : null;
}
