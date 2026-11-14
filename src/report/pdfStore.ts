/**
 * Keeps a copy of the imported report PDF on the device for the "Original PDF" view.
 * iOS/Android: a file in the app's documents folder. (Web: see pdfStore.web.ts.)
 */
import { File, Paths } from 'expo-file-system';

const NATIVE_FILE = 'starstell-report.pdf';

export async function savePdf(bytes: Uint8Array): Promise<void> {
  try {
    const f = new File(Paths.document, NATIVE_FILE);
    if (!f.exists) f.create();
    await f.write(bytes);
  } catch {
    // Not fatal: the visual views still work without the original PDF.
  }
}

/** A URI for the saved PDF, or null if there isn't one. Pass it to `releasePdfUri` when done. */
export async function loadPdfUri(): Promise<string | null> {
  try {
    const f = new File(Paths.document, NATIVE_FILE);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}

export function releasePdfUri(_uri: string): void {
  // Nothing to release for a file URI.
}

export async function clearPdf(): Promise<void> {
  try {
    const f = new File(Paths.document, NATIVE_FILE);
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
}
