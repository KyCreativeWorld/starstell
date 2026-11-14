/**
 * Web version of pdfStore: the PDF is kept in IndexedDB (too big for localStorage).
 * An in-memory copy keeps the current session working where IndexedDB is unavailable
 * (e.g. some browsers when the page is opened straight from disk).
 */
const DB_NAME = 'starstell';
const STORE = 'files';
const KEY = 'report.pdf';

let memory: Blob | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function savePdf(bytes: Uint8Array): Promise<void> {
  memory = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
  try {
    await run('readwrite', (s) => s.put(memory, KEY));
  } catch {
    // Kept in memory for this session only.
  }
}

/** An object URL for the saved PDF, or null if there isn't one. Pass it to `releasePdfUri` when done. */
export async function loadPdfUri(): Promise<string | null> {
  let blob = memory;
  if (!blob) {
    try {
      const stored = await run<unknown>('readonly', (s) => s.get(KEY));
      if (stored instanceof Blob) blob = memory = stored;
    } catch {
      // No IndexedDB: nothing saved.
    }
  }
  return blob ? URL.createObjectURL(blob) : null;
}

export function releasePdfUri(uri: string): void {
  URL.revokeObjectURL(uri);
}

export async function clearPdf(): Promise<void> {
  memory = null;
  try {
    await run('readwrite', (s) => s.delete(KEY));
  } catch {
    // ignore
  }
}
