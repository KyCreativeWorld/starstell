/** Browser download fallback for audit results (web only). */
import { Platform } from 'react-native';
import type { DriveFile } from './googleDrive.types';

export const canDownload = Platform.OS === 'web';

/** Saves each file through the browser's downloads. */
export function downloadFiles(files: DriveFile[], prefix: string): void {
  if (!canDownload) return;
  const safe = prefix.replace(/[^\w.-]+/g, '_').slice(0, 60);
  for (const f of files) {
    const url = URL.createObjectURL(new Blob([f.content], { type: f.mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}_${f.name}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
