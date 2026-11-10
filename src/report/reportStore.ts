/**
 * Picking a report PDF, reading it on the device, and remembering the result.
 * The PDF itself is never uploaded anywhere; only the parsed data is saved
 * (localStorage on web, a JSON file in the app's documents folder on iOS/Android).
 */
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { parseReportPdf, ReportParseError } from './parseReport';
import type { Report } from './types';

const WEB_KEY = 'starstell.report';
const NATIVE_FILE = 'starstell-report.json';
const MAX_BYTES = 40 * 1024 * 1024;

export { ReportParseError };

/**
 * Opens the system file picker and parses the chosen PDF.
 * Resolves to null if the user cancels.
 */
export async function pickAndParseReport(onReading?: () => void): Promise<Report | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_BYTES) {
    throw new ReportParseError('That PDF is larger than 40 MB. Export a smaller copy and try again.');
  }
  const isPdfName = /\.pdf$/i.test(asset.name);
  if (asset.mimeType && asset.mimeType !== 'application/pdf' && !isPdfName) {
    throw new ReportParseError('Choose a PDF file.');
  }

  onReading?.();
  const bytes = await readBytes(asset);
  // Let the "Reading…" state paint before the synchronous parse.
  await new Promise((r) => setTimeout(r, 30));
  return parseReportPdf(bytes, asset.name);
}

async function readBytes(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  try {
    if (Platform.OS === 'web') {
      if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
      const res = await fetch(asset.uri);
      return new Uint8Array(await res.arrayBuffer());
    }
    return await new File(asset.uri).bytes();
  } catch {
    throw new ReportParseError("Couldn't open that file. Try choosing it again.");
  }
}

export async function loadSavedReport(): Promise<Report | null> {
  try {
    let json: string | null = null;
    if (Platform.OS === 'web') json = globalThis.localStorage?.getItem(WEB_KEY) ?? null;
    else {
      const f = new File(Paths.document, NATIVE_FILE);
      if (f.exists) json = await f.text();
    }
    if (!json) return null;
    const parsed = JSON.parse(json);
    return isReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveReport(report: Report): Promise<void> {
  const json = JSON.stringify(report);
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(WEB_KEY, json);
    else {
      const f = new File(Paths.document, NATIVE_FILE);
      if (!f.exists) f.create();
      await f.write(json);
    }
  } catch {
    // Not fatal: the report still shows for this session.
  }
}

export async function clearSavedReport(): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(WEB_KEY);
    else {
      const f = new File(Paths.document, NATIVE_FILE);
      if (f.exists) f.delete();
    }
  } catch {
    // ignore
  }
}

/** Light shape check so stale or corrupt saved data can't crash the app. */
function isReport(v: unknown): v is Report {
  const r = v as Report;
  return (
    !!r &&
    r.version === 1 &&
    Array.isArray(r.teams) &&
    Array.isArray(r.bottlenecks) &&
    r.teams.every((t) => typeof t?.id === 'string' && typeof t?.name === 'string' && Array.isArray(t.bottleneckIds)) &&
    r.bottlenecks.every(
      (b) =>
        typeof b?.id === 'string' &&
        typeof b?.name === 'string' &&
        Array.isArray(b.teamIds) &&
        Array.isArray(b.options) &&
        Array.isArray(b.rootCauses) &&
        Array.isArray(b.impact),
    )
  );
}
