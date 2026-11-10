/**
 * Turns positioned text + ruled lines into a reading-order list of blocks:
 * headings, paragraphs, list items, and tables (as rows of cell strings).
 */
import type { PageLayout, Rule, TextItem } from './pdfLayout';

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string; page: number }
  | { kind: 'para'; text: string; list: boolean; page: number }
  | { kind: 'table'; rows: string[][]; page: number };

interface Line {
  text: string;
  /** Starts a new list item (bullet glyph or a drawn bullet/checkbox to its left). */
  bullet?: boolean;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  page: number;
}

interface Table {
  top: number;
  bottom: number;
  left: number;
  right: number;
  rows: string[][];
}

const BULLET_CHARS = /^[•◦▪▫■□●○‣⁃∙·☐☑✓✔–-]\s+/;

/** Joins wrapped lines: no space after a hyphen that breaks a word ("auto-" + "routing"). */
export function joinWrapped(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return /[A-Za-z0-9][-–—]$/.test(a) ? a + b : `${a} ${b}`;
}

const LIGATURES: Record<string, string> = {
  'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st',
  ' ': ' ', ' ': ' ', ' ': ' ', '­': '',
};

function clean(s: string): string {
  return s
    .replace(/[ﬀ-ﬆ   ­]/g, (c) => LIGATURES[c] ?? c)
    .replace(/[\u0000-\u0008\u000B-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Joins glyph runs on one baseline into text, adding spaces at visible gaps. */
function joinItems(items: TextItem[]): string {
  let out = '';
  let prev: TextItem | null = null;
  for (const it of items) {
    if (prev) {
      const gap = it.x - prev.x2;
      const needsSpace = gap > Math.max(prev.size, it.size) * 0.18;
      if (needsSpace && !out.endsWith(' ') && !it.text.startsWith(' ')) out += ' ';
    }
    out += it.text;
    prev = it;
  }
  return out;
}

/** Groups items into lines by baseline. */
function toLines(items: TextItem[], page: number): Line[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: TextItem[][] = [];
  for (const it of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g[0].y - it.y) < Math.max(1.5, it.size * 0.35)) g.push(it);
    else groups.push([it]);
  }
  return groups
    .map((g) => {
      g.sort((a, b) => a.x - b.x);
      const text = clean(joinItems(g));
      const chars = g.reduce((n, i) => n + i.text.trim().length, 0);
      const boldChars = g.reduce((n, i) => n + (i.bold ? i.text.trim().length : 0), 0);
      return {
        text,
        x: g[0].x,
        y: g[0].y,
        size: Math.max(...g.map((i) => i.size)),
        bold: chars > 0 && boldChars / chars > 0.85,
        page,
      };
    })
    .filter((l) => l.text.length > 0);
}

// ---------------------------------------------------------------------------
// Table detection from ruled lines
// ---------------------------------------------------------------------------

function mergeSegments(rules: Rule[], horizontal: boolean): Rule[] {
  const key = (r: Rule) => (horizontal ? r.y1 : r.x1);
  const lo = (r: Rule) => (horizontal ? r.x1 : r.y1);
  const hi = (r: Rule) => (horizontal ? r.x2 : r.y2);
  const sorted = [...rules].sort((a, b) => key(a) - key(b) || lo(a) - lo(b));
  const out: Rule[] = [];
  for (const r of sorted) {
    const match = out.find(
      (o) => Math.abs(key(o) - key(r)) <= 1.5 && lo(r) <= hi(o) + 3 && hi(r) >= lo(o) - 3,
    );
    if (match) {
      if (horizontal) {
        match.x1 = Math.min(match.x1, r.x1);
        match.x2 = Math.max(match.x2, r.x2);
      } else {
        match.y1 = Math.min(match.y1, r.y1);
        match.y2 = Math.max(match.y2, r.y2);
      }
    } else out.push({ ...r });
  }
  return out;
}

function dedupe(values: number[], tol: number): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  }
  return out;
}

function findTables(page: PageLayout): { tables: Table[]; used: Set<TextItem> } {
  const hs = mergeSegments(page.hRules, true);
  const vs = mergeSegments(page.vRules, false);
  const T = 2.5;
  const touches = (h: Rule, v: Rule) =>
    v.x1 >= h.x1 - T && v.x1 <= h.x2 + T && h.y1 >= v.y1 - T && h.y1 <= v.y2 + T;

  // Connected components of crossing horizontal/vertical segments.
  const parent = new Map<Rule, Rule>();
  const find = (r: Rule): Rule => {
    let p = parent.get(r) ?? r;
    while (parent.get(p) && parent.get(p) !== p) p = parent.get(p)!;
    return p;
  };
  for (const r of [...hs, ...vs]) parent.set(r, r);
  for (const h of hs) for (const v of vs) if (touches(h, v)) parent.set(find(h), find(v));
  const comps = new Map<Rule, { h: Rule[]; v: Rule[] }>();
  for (const h of hs) {
    const c = comps.get(find(h)) ?? comps.set(find(h), { h: [], v: [] }).get(find(h))!;
    c.h.push(h);
  }
  for (const v of vs) {
    const c = comps.get(find(v)) ?? comps.set(find(v), { h: [], v: [] }).get(find(v))!;
    c.v.push(v);
  }

  const tables: Table[] = [];
  const used = new Set<TextItem>();
  for (const { h, v } of comps.values()) {
    if (h.length < 2 || v.length < 2) continue;
    const left = Math.min(...h.map((r) => r.x1));
    const right = Math.max(...h.map((r) => r.x2));
    const top = Math.min(...v.map((r) => r.y1));
    const bottom = Math.max(...v.map((r) => r.y2));
    const ys = dedupe(h.map((r) => r.y1), 2);
    if (ys.length < 2) continue;

    const inside = page.items.filter((it) => {
      const cx = (it.x + it.x2) / 2;
      const cy = it.y - it.size * 0.3;
      return cx >= left - 1 && cx <= right + 1 && cy >= top - 1 && cy <= bottom + 1;
    });

    const rows: string[][] = [];
    let maxCols = 0;
    for (let r = 0; r + 1 < ys.length; r++) {
      const y0 = ys[r], y1 = ys[r + 1];
      if (y1 - y0 < 4) continue;
      const mid = (y0 + y1) / 2;
      // Column boundaries that actually cross this row (handles merged cells).
      const xs = dedupe(
        v.filter((s) => s.y1 <= mid + T && s.y2 >= mid - T).map((s) => s.x1),
        2,
      );
      if (xs.length < 2) continue;
      const cells: TextItem[][] = Array.from({ length: xs.length - 1 }, () => []);
      for (const it of inside) {
        const cy = it.y - it.size * 0.3;
        if (cy < y0 || cy >= y1) continue;
        const cx = (it.x + it.x2) / 2;
        const c = xs.findIndex((x, i) => i + 1 < xs.length && cx >= x - 1 && cx < xs[i + 1] + 1);
        if (c >= 0) cells[c].push(it);
      }
      const texts = cells.map((items) => toLines(items, page.index).map((l) => l.text).reduce(joinWrapped, '').trim());
      if (texts.every((t) => !t)) continue;
      maxCols = Math.max(maxCols, texts.length);
      rows.push(texts);
    }
    // A single box (code block, callout) is not a table.
    if (maxCols < 2 || rows.length === 0) continue;
    inside.forEach((it) => used.add(it));
    tables.push({ top, bottom, left, right, rows });
  }
  return { tables, used };
}

// ---------------------------------------------------------------------------
// Running headers / footers
// ---------------------------------------------------------------------------

function marginKey(l: Line, pageHeight: number): string | null {
  const band = pageHeight * 0.075;
  if (l.y > band && l.y < pageHeight - band) return null;
  return l.text.replace(/\d+/g, '#').toLowerCase();
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export function buildBlocks(pages: PageLayout[]): Block[] {
  type Entry = { top: number; line?: Line; table?: Table; page: number };
  const perPage: Entry[][] = [];
  const marginCounts = new Map<string, number>();

  for (const page of pages) {
    const { tables, used } = findTables(page);
    const lines = toLines(page.items.filter((i) => !used.has(i)), page.index);
    for (const l of lines) {
      const mid = l.y - l.size * 0.35;
      const drawn = page.markers.some(
        (m) => m.x < l.x - 1 && l.x - m.x < 30 && Math.abs(m.y - mid) < l.size * 0.6,
      );
      if (drawn || BULLET_CHARS.test(l.text)) {
        l.bullet = true;
        l.text = l.text.replace(BULLET_CHARS, '');
      }
    }
    const entries: Entry[] = [
      ...lines.map((line) => ({ top: line.y - line.size * 0.8, line, page: page.index })),
      ...tables.map((table) => ({ top: table.top, table, page: page.index })),
    ].sort((a, b) => a.top - b.top);
    perPage.push(entries);
    const seen = new Set<string>();
    for (const e of entries) {
      const k = e.line ? marginKey(e.line, page.height) : null;
      if (k && !seen.has(k)) {
        seen.add(k);
        marginCounts.set(k, (marginCounts.get(k) ?? 0) + 1);
      }
    }
  }

  // Drop running headers/footers: margin text repeated on many pages, or "Page N of M".
  const repeatThreshold = Math.max(2, Math.ceil(pages.length * 0.5));
  const flow: Entry[] = [];
  perPage.forEach((entries, i) => {
    for (const e of entries) {
      if (e.line) {
        const k = marginKey(e.line, pages[i].height);
        if (k && (pages.length >= 2 && (marginCounts.get(k) ?? 0) >= repeatThreshold)) continue;
        if (k && /^page #( of #)?$/.test(k)) continue;
      }
      flow.push(e);
    }
  });

  // Body text size = the size used by the most characters outside tables.
  const sizeWeight = new Map<number, number>();
  for (const e of flow) {
    if (!e.line) continue;
    const s = Math.round(e.line.size * 2) / 2;
    sizeWeight.set(s, (sizeWeight.get(s) ?? 0) + e.line.text.length);
  }
  const body = [...sizeWeight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
  const leftMargin = Math.min(
    ...flow.filter((e) => e.line && Math.abs(e.line.size - body) < 0.6).map((e) => e.line!.x),
    Infinity,
  );
  // Typical distance between wrapped lines of one paragraph.
  const gaps: number[] = [];
  for (let i = 1; i < flow.length; i++) {
    const a = flow[i - 1].line, b = flow[i].line;
    if (a && b && a.page === b.page && Math.abs(a.size - body) < 0.6 && Math.abs(b.size - body) < 0.6) {
      const g = b.y - a.y;
      if (g > body * 0.9 && g < body * 2.2) gaps.push(g);
    }
  }
  gaps.sort((a, b) => a - b);
  const lineGap = gaps.length ? gaps[Math.floor(gaps.length * 0.25)] : body * 1.4;

  const blocks: Block[] = [];
  let prevLine: Line | null = null;
  let open: Extract<Block, { kind: 'para' }> | null = null;

  for (const e of flow) {
    if (e.table) {
      const last = blocks[blocks.length - 1];
      // A table continued from the previous page (often with its header repeated).
      if (
        last?.kind === 'table' &&
        last.page === e.page - 1 &&
        last.rows[0]?.length === e.table.rows[0]?.length
      ) {
        const rows = [...e.table.rows];
        if (rows[0] && rows[0].join('|') === last.rows[0].join('|')) rows.shift();
        last.rows.push(...rows);
        last.page = e.page;
      } else {
        blocks.push({ kind: 'table', rows: e.table.rows, page: e.page });
      }
      open = null;
      prevLine = null;
      continue;
    }
    const line = e.line!;
    const isHeading = line.size >= body * 1.25;
    if (isHeading) {
      const level: 1 | 2 = line.size >= body * 1.7 ? 1 : 2;
      const last = blocks[blocks.length - 1];
      // Wrapped heading.
      if (last?.kind === 'heading' && last.level === level && prevLine && line.page === prevLine.page && line.y - prevLine.y < line.size * 1.6) {
        last.text = joinWrapped(last.text, line.text);
      } else {
        blocks.push({ kind: 'heading', level, text: line.text, page: line.page });
      }
      open = null;
      prevLine = line;
      continue;
    }
    const indented = line.x > leftMargin + 8;
    if (line.bold && line.text.length <= 70 && !indented) {
      blocks.push({ kind: 'heading', level: 3, text: line.text.replace(/:$/, ''), page: line.page });
      open = null;
      prevLine = line;
      continue;
    }
    // "1. Text that wraps" — the wrapped line is indented past the number.
    const numberedWrap = !!open && !!prevLine && /^\d+[.)]\s/.test(open.text) && line.x > prevLine.x + 4;
    const sameFlow =
      open &&
      prevLine &&
      !line.bullet &&
      Math.abs(prevLine.size - line.size) < 0.6 &&
      (Math.abs(prevLine.x - line.x) < 3 || numberedWrap) &&
      // Across a page break, continue only if the previous page ended mid-paragraph.
      (line.page === prevLine.page ? line.y - prevLine.y <= lineGap * 1.08 + 0.5 : !/[.!?:\]]$/.test(open.text));

    if (open && sameFlow) {
      open.text = joinWrapped(open.text, line.text);
    } else {
      open = { kind: 'para', text: line.text, list: indented || !!line.bullet, page: line.page };
      blocks.push(open);
    }
    prevLine = line;
  }
  return blocks;
}
