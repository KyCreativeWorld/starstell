/**
 * Turns the files in an audit folder into records the model can read and cite.
 * Every record gets a short evidence handle the model must quote back (the
 * briefs forbid it from making handles up):
 *
 *   F3:R12  file 3, data row 12 (CSV / TSV)
 *   F2:E4   file 2, calendar event 4 (.ics)
 *   F5:B9   file 5, text block 9 (PDF)
 *   F1:L30  file 1, line 30 (other text files)
 *
 * Records are kept separate (not one blob per file) so the audit pipeline can
 * group them by person, project or team and send each group in its own prompt.
 *
 * Files the app can't read yet (Excel, Word, images…) are listed as skipped with
 * the reason, never silently dropped.
 */
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type { AuditFile } from './folderPicker.types';
import { PdfDocument } from '../report/pdf/pdfDocument';
import { extractLayout } from '../report/pdf/pdfLayout';
import { buildBlocks } from '../report/pdf/pdfStructure';

export interface AuditRecord {
  /** Evidence handle, e.g. "F3:R12". */
  handle: string;
  /** The record as the model sees it (for CSV: the raw row). */
  text: string;
  /** CSV/TSV only: the row's cells, keyed by column name. */
  cells?: Record<string, string>;
}

export interface ReadFile {
  /** "F1", "F2", … — the prefix of every handle from this file. */
  id: string;
  path: string;
  kind: 'csv' | 'ics' | 'pdf' | 'text';
  /** CSV/TSV only: the header row, as written. */
  header?: string;
  /** CSV/TSV only: column names, in order. */
  columns?: string[];
  /** CSV/TSV only: the separator. */
  separator?: string;
  records: AuditRecord[];
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface ReadResult {
  files: ReadFile[];
  skipped: SkippedFile[];
}

const TEXT_EXT = /\.(txt|md|json|log|xml|html?)$/i;
const UNSUPPORTED: { re: RegExp; reason: string }[] = [
  { re: /\.(xlsx|xlsm|xls|numbers|ods)$/i, reason: 'Spreadsheet format not supported yet. Export it as CSV.' },
  { re: /\.(docx?|pages|odt|rtf)$/i, reason: 'Word documents are not supported yet. Export as PDF or text.' },
  { re: /\.(png|jpe?g|gif|heic|webp|svg|bmp|tiff?)$/i, reason: 'Images are not read.' },
  { re: /\.(zip|gz|tar|7z|rar)$/i, reason: 'Archives are not opened. Unzip the folder first.' },
  { re: /\.(mp3|mp4|mov|wav|m4a)$/i, reason: 'Audio and video are not read.' },
];

async function readBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new File(uri).bytes();
}

const decode = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');

/** Reads every file, in path order, reporting progress as it goes. */
export async function readAuditFiles(
  files: AuditFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<ReadResult> {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const out: ReadFile[] = [];
  const skipped: SkippedFile[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    onProgress?.(i, sorted.length);
    const unsupported = UNSUPPORTED.find((u) => u.re.test(f.name));
    if (unsupported) {
      skipped.push({ path: f.path, reason: unsupported.reason });
      continue;
    }
    if (f.size === 0) {
      skipped.push({ path: f.path, reason: 'Empty file.' });
      continue;
    }
    const id = `F${out.length + 1}`;
    try {
      const converted = convert(id, f.name, await readBytes(f.uri));
      if (!converted) {
        skipped.push({ path: f.path, reason: 'Unrecognized file type. Supported: CSV, TSV, ICS, PDF, TXT, MD, JSON.' });
      } else if (!converted.records.length) {
        skipped.push({ path: f.path, reason: 'No readable content (a PDF may be a scan).' });
      } else {
        out.push({ id, path: f.path, ...converted });
      }
    } catch {
      skipped.push({ path: f.path, reason: "Couldn't read the file." });
    }
  }
  onProgress?.(sorted.length, sorted.length);
  return { files: out, skipped };
}

type Converted = Omit<ReadFile, 'id' | 'path'>;

function convert(id: string, name: string, bytes: Uint8Array): Converted | null {
  if (/\.(csv|tsv)$/i.test(name)) return delimited(id, decode(bytes), /\.tsv$/i.test(name) ? '\t' : ',');
  if (/\.ics$/i.test(name)) return calendar(id, decode(bytes));
  if (/\.pdf$/i.test(name)) return { kind: 'pdf', records: pdfRecords(id, bytes) };
  if (TEXT_EXT.test(name)) return lines(id, decode(bytes));
  return null;
}

/** CSV/TSV: one record per data row, with its cells parsed. */
function delimited(id: string, text: string, sep: string): Converted {
  const rows = splitRows(text).filter((r) => r.trim());
  if (!rows.length) return { kind: 'csv', records: [] };
  const [header, ...data] = rows;
  const columns = parseCells(header, sep).map((c) => c.trim());
  const records = data.map((row, i) => {
    const values = parseCells(row, sep);
    const cells: Record<string, string> = {};
    columns.forEach((col, j) => (cells[col] = (values[j] ?? '').trim()));
    return { handle: `${id}:R${i + 1}`, text: row, cells };
  });
  return { kind: 'csv', header, columns, separator: sep, records };
}

/** Splits CSV text into rows at line breaks outside quoted cells (a quoted cell may span lines). */
function splitRows(text: string): string[] {
  const rows: string[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === '\n' && !quoted) {
      rows.push(text.slice(start, i).replace(/\r$/, ''));
      start = i + 1;
    }
  }
  rows.push(text.slice(start).replace(/\r$/, ''));
  return rows;
}

/** Splits one CSV row into cell values, honoring quotes and doubled quotes. */
function parseCells(row: string, sep: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (quoted) {
      if (ch === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      cells.push(cur);
      cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

/** iCalendar: one record per VEVENT, with folded lines unfolded. */
function calendar(id: string, text: string): Converted {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const events = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  const records = events.map((ev, i) => ({
    handle: `${id}:E${i + 1}`,
    text: ev
      .split(/\r?\n/)
      .filter((l) => l && !/^(BEGIN|END):VEVENT/.test(l))
      .join(' | '),
  }));
  return { kind: 'ics', records };
}

/** Text PDF: one record per heading, paragraph or table row. Throws if the PDF can't be read. */
export function pdfRecords(id: string, bytes: Uint8Array): AuditRecord[] {
  const blocks = buildBlocks(extractLayout(new PdfDocument(bytes)));
  const out: AuditRecord[] = [];
  for (const b of blocks) {
    if (b.kind === 'table') {
      for (const r of b.rows) out.push({ handle: `${id}:B${out.length + 1}`, text: r.join(' | ') });
    } else {
      out.push({ handle: `${id}:B${out.length + 1}`, text: `${b.kind === 'heading' ? '# ' : ''}${b.text}` });
    }
  }
  return out;
}

/** Any other text: one record per non-empty line. */
function lines(id: string, text: string): Converted {
  const records: AuditRecord[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    if (l.trim()) records.push({ handle: `${id}:L${i + 1}`, text: l });
  });
  return { kind: 'text', records };
}

/** One record as the model sees it: CSV rows keep their raw form after the handle. */
export function recordLine(file: ReadFile, r: AuditRecord): string {
  return file.kind === 'csv' ? `${r.handle}${file.separator}${r.text}` : `[${r.handle}] ${r.text}`;
}

/** A set of records from one file as a block of text, with the CSV header if there is one. */
export function fileBlock(file: ReadFile, records: AuditRecord[]): string {
  const head = file.kind === 'csv' ? `handle${file.separator}${file.header}\n` : '';
  return `<file id="${file.id}" path="${file.path.replace(/"/g, '&quot;')}" kind="${file.kind}">\n${head}${records
    .map((r) => recordLine(file, r))
    .join('\n')}\n</file>`;
}
