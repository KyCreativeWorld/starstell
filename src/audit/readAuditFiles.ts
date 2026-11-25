/**
 * Turns the files in an audit folder into plain-text records the model can read
 * and cite. Every record gets a short evidence handle the model must quote back
 * (the Phase 1 brief forbids it from making handles up):
 *
 *   F3:R12  file 3, data row 12 (CSV / TSV)
 *   F2:E4   file 2, calendar event 4 (.ics)
 *   F5:B9   file 5, text block 9 (PDF)
 *   F1:L30  file 1, line 30 (other text files)
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

export interface ReadFile {
  /** "F1", "F2", … — the prefix of every handle from this file. */
  id: string;
  path: string;
  kind: 'csv' | 'ics' | 'pdf' | 'text';
  /** Number of records (rows, events, blocks or lines) given handles. */
  records: number;
  /** The file as the model sees it, with handles. */
  text: string;
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
      const bytes = await readBytes(f.uri);
      const converted = convert(id, f.name, bytes);
      if (!converted) {
        skipped.push({ path: f.path, reason: 'Unrecognized file type. Supported: CSV, TSV, ICS, PDF, TXT, MD, JSON.' });
      } else if (!converted.records) {
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

function convert(id: string, name: string, bytes: Uint8Array): Omit<ReadFile, 'id' | 'path'> | null {
  if (/\.(csv|tsv)$/i.test(name)) return delimited(id, decode(bytes), /\.tsv$/i.test(name) ? '\t' : ',');
  if (/\.ics$/i.test(name)) return calendar(id, decode(bytes));
  if (/\.pdf$/i.test(name)) return pdf(id, bytes);
  if (TEXT_EXT.test(name)) return lines(id, decode(bytes));
  return null;
}

/** CSV/TSV: the header row, then each data row with a handle column in front. */
function delimited(id: string, text: string, sep: string) {
  const rows = splitRows(text);
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  if (!rows.length) return { kind: 'csv' as const, records: 0, text: '' };
  const [header, ...data] = rows;
  const out = [`handle${sep}${header}`];
  let n = 0;
  for (const row of data) {
    if (!row.trim()) continue;
    n++;
    out.push(`${id}:R${n}${sep}${row}`);
  }
  return { kind: 'csv' as const, records: n, text: out.join('\n') };
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

/** iCalendar: one record per VEVENT, with folded lines unfolded. */
function calendar(id: string, text: string) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const events = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  const out = events.map((ev, i) => {
    const props = ev
      .split(/\r?\n/)
      .filter((l) => l && !/^(BEGIN|END):VEVENT/.test(l))
      .join(' | ');
    return `[${id}:E${i + 1}] ${props}`;
  });
  return { kind: 'ics' as const, records: events.length, text: out.join('\n') };
}

/** Text PDF: one record per heading, paragraph or table row. */
function pdf(id: string, bytes: Uint8Array) {
  const blocks = buildBlocks(extractLayout(new PdfDocument(bytes)));
  const out: string[] = [];
  let n = 0;
  for (const b of blocks) {
    if (b.kind === 'table') {
      for (const r of b.rows) out.push(`[${id}:B${++n}] ${r.join(' | ')}`);
    } else {
      out.push(`[${id}:B${++n}] ${b.kind === 'heading' ? '# ' : ''}${b.text}`);
    }
  }
  return { kind: 'pdf' as const, records: n, text: out.join('\n') };
}

/** Any other text: one record per non-empty line. */
function lines(id: string, text: string) {
  const out: string[] = [];
  let n = 0;
  text.split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return;
    n++;
    out.push(`[${id}:L${i + 1}] ${l}`);
  });
  return { kind: 'text' as const, records: n, text: out.join('\n') };
}
