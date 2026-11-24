export interface AuditFile {
  /** Path inside the chosen folder, e.g. "q3/expenses.csv". */
  path: string;
  name: string;
  size: number;
  /** URI the file can be read from later (file:// on iOS/Android, blob: on web). */
  uri: string;
}

export interface AuditFolder {
  name: string;
  files: AuditFile[];
}

/** Stops walking very large folders so the picker stays responsive. */
export const MAX_AUDIT_FILES = 5000;

export class FolderPickError extends Error {}
