/** iOS/Android folder picker: opens the system folder chooser and lists every file inside it. */
import { Directory, File } from 'expo-file-system';
import { type AuditFile, type AuditFolder, FolderPickError, MAX_AUDIT_FILES } from './folderPicker.types';

export { FolderPickError };
export type { AuditFile, AuditFolder };

/** Resolves to null if the user cancels. */
export async function pickAuditFolder(): Promise<AuditFolder | null> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return null;
    throw new FolderPickError("Couldn't open that folder. Try choosing it again.");
  }
  if (!dir) return null;

  const files: AuditFile[] = [];
  try {
    walk(dir, '', files);
  } catch {
    throw new FolderPickError("Couldn't read the files in that folder.");
  }
  return { name: dir.name, files };
}

/** No-op on iOS/Android (web frees blob URLs here). */
export function releaseAuditFolder(_folder: AuditFolder | null) {}

function walk(dir: Directory, prefix: string, out: AuditFile[]) {
  for (const item of dir.list()) {
    if (out.length >= MAX_AUDIT_FILES) return;
    if (item.name.startsWith('.')) continue; // skip hidden/system files
    if (item instanceof Directory) {
      walk(item, `${prefix}${item.name}/`, out);
    } else if (item instanceof File) {
      out.push({ path: prefix + item.name, name: item.name, size: item.size, uri: item.uri });
    }
  }
}
