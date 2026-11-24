/** Web folder picker: uses a hidden <input webkitdirectory> so the browser offers a folder chooser. */
import { type AuditFile, type AuditFolder, FolderPickError, MAX_AUDIT_FILES } from './folderPicker.types';

export { FolderPickError };
export type { AuditFile, AuditFolder };

/** Resolves to null if the user cancels. */
export function pickAuditFolder(): Promise<AuditFolder | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new FolderPickError('Folder upload is not available here.'));
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    document.body.appendChild(input);

    const done = () => input.remove();
    input.addEventListener('cancel', () => {
      done();
      resolve(null);
    });
    input.addEventListener('change', () => {
      const list = Array.from(input.files ?? []);
      done();
      if (!list.length) {
        resolve(null);
        return;
      }
      // webkitRelativePath is "<folder>/<sub>/<file>"; the first segment is the chosen folder.
      const rel = (f: File) => f.webkitRelativePath || f.name;
      const folderName = rel(list[0]).split('/')[0] || 'Folder';
      const files: AuditFile[] = list
        .filter((f) => !rel(f).split('/').some((part) => part.startsWith('.')))
        .slice(0, MAX_AUDIT_FILES)
        .map((f) => ({
          path: rel(f).split('/').slice(1).join('/') || f.name,
          name: f.name,
          size: f.size,
          uri: URL.createObjectURL(f),
        }));
      resolve({ name: folderName, files });
    });
    input.click();
  });
}

/** Frees the blob URLs created for a previously picked folder. */
export function releaseAuditFolder(folder: AuditFolder | null) {
  folder?.files.forEach((f) => URL.revokeObjectURL(f.uri));
}
