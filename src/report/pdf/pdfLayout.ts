/**
 * Runs each page's content stream and records where text and ruled lines land.
 * Coordinates are in PDF points with the origin at the TOP-left of the page.
 */
import {
  latin1,
  Lexer,
  nameOf,
  num,
  PdfDict,
  PdfDocument,
  PdfName,
  type PdfObj,
  PdfOp,
  PdfStream,
  PdfString,
} from './pdfDocument';

export interface TextItem {
  /** Left edge of the first glyph. */
  x: number;
  /** Right edge after the last glyph's advance. */
  x2: number;
  /** Baseline, measured from the top of the page. */
  y: number;
  /** Effective font size in points. */
  size: number;
  text: string;
  bold: boolean;
}

/** An axis-aligned line segment (table border, rule, underline). */
export interface Rule {
  /** Horizontal: y is fixed, spans x1..x2. Vertical: x is fixed, spans y1..y2. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PageLayout {
  index: number;
  width: number;
  height: number;
  items: TextItem[];
  hRules: Rule[];
  vRules: Rule[];
  /** Small painted shapes (list bullets, checkboxes): center point and size. */
  markers: { x: number; y: number; size: number }[];
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

interface Font {
  /** Splits a shown string into character codes. */
  codes(bytes: Uint8Array): number[];
  /** Whether a code is the single-byte space (gets word spacing). */
  isSpace(code: number): boolean;
  unicode(code: number): string;
  /** Advance in thousandths of an em. */
  width(code: number): number;
  bold: boolean;
}

const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ',
  0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“',
  0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›',
  0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

const GLYPH_NAMES: Record<string, string> = {
  space: ' ', period: '.', comma: ',', hyphen: '-', minus: '-', colon: ':', semicolon: ';',
  parenleft: '(', parenright: ')', bracketleft: '[', bracketright: ']', braceleft: '{',
  braceright: '}', slash: '/', backslash: '\\', quoteright: '’', quoteleft: '‘',
  quotedblleft: '“', quotedblright: '”', quotesingle: "'", quotedbl: '"', endash: '–',
  emdash: '—', bullet: '•', dollar: '$', percent: '%', ampersand: '&', exclam: '!',
  question: '?', at: '@', numbersign: '#', plus: '+', equal: '=', less: '<', greater: '>',
  underscore: '_', asterisk: '*', ellipsis: '…', trademark: '™', copyright: '©',
  registered: '®', degree: '°', fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7',
  eight: '8', nine: '9', multiply: '×', divide: '÷', section: '§', periodcentered: '·',
  nbspace: ' ', arrowright: '→', checkmark: '✓',
};

function glyphNameToUnicode(name: string): string {
  if (GLYPH_NAMES[name]) return GLYPH_NAMES[name];
  if (name.length === 1) return name;
  const uni = /^uni([0-9A-Fa-f]{4})/.exec(name) ?? /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (uni) return String.fromCodePoint(parseInt(uni[1], 16));
  return '';
}

function utf16be(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  if (bytes.length % 2 === 1) s += String.fromCharCode(bytes[bytes.length - 1]);
  return s;
}

function bytesToInt(b: Uint8Array): number {
  let v = 0;
  for (const x of b) v = v * 256 + x;
  return v;
}

interface ToUnicode {
  map: Map<number, string>;
  /** Code byte lengths allowed by the codespace ranges. */
  ranges: { len: number; lo: number; hi: number }[];
}

function parseToUnicode(data: Uint8Array): ToUnicode {
  const map = new Map<number, string>();
  const ranges: ToUnicode['ranges'] = [];
  const lx = new Lexer(data);
  const stack: (PdfObj | PdfOp)[] = [];
  let mode = '';
  for (;;) {
    const t = lx.read();
    if (t === undefined) break;
    if (t instanceof PdfOp) {
      const op = t.op;
      if (op === 'begincodespacerange' || op === 'beginbfchar' || op === 'beginbfrange') {
        mode = op;
        stack.length = 0;
      } else if (op === 'endcodespacerange') {
        for (let i = 0; i + 1 < stack.length; i += 2) {
          const lo = stack[i], hi = stack[i + 1];
          if (lo instanceof PdfString && hi instanceof PdfString) {
            ranges.push({ len: lo.bytes.length, lo: bytesToInt(lo.bytes), hi: bytesToInt(hi.bytes) });
          }
        }
        mode = '';
      } else if (op === 'endbfchar') {
        for (let i = 0; i + 1 < stack.length; i += 2) {
          const src = stack[i], dst = stack[i + 1];
          if (src instanceof PdfString) {
            if (dst instanceof PdfString) map.set(bytesToInt(src.bytes), utf16be(dst.bytes));
            else if (dst instanceof PdfName) map.set(bytesToInt(src.bytes), glyphNameToUnicode(dst.name));
          }
        }
        mode = '';
      } else if (op === 'endbfrange') {
        for (let i = 0; i + 2 < stack.length; i += 3) {
          const lo = stack[i], hi = stack[i + 1], dst = stack[i + 2];
          if (!(lo instanceof PdfString) || !(hi instanceof PdfString)) continue;
          const a = bytesToInt(lo.bytes), b = bytesToInt(hi.bytes);
          if (b - a > 65536) continue;
          if (dst instanceof PdfString) {
            const base = dst.bytes;
            for (let c = a; c <= b; c++) {
              const out = Uint8Array.from(base);
              // increment the last byte(s)
              let carry = c - a;
              for (let k = out.length - 1; k >= 0 && carry > 0; k--) {
                const v = out[k] + carry;
                out[k] = v & 0xff;
                carry = v >> 8;
              }
              map.set(c, utf16be(out));
            }
          } else if (Array.isArray(dst)) {
            dst.forEach((d, k) => {
              if (d instanceof PdfString) map.set(a + k, utf16be(d.bytes));
            });
          }
        }
        mode = '';
      }
      continue;
    }
    if (mode) stack.push(t);
  }
  return { map, ranges };
}

function loadFont(doc: PdfDocument, fontDict: PdfDict | undefined): Font {
  const subtype = nameOf(fontDict?.get('Subtype'));
  const baseFont = nameOf(fontDict?.get('BaseFont')) ?? '';
  let tu: ToUnicode | null = null;
  const tuObj = doc.resolve(fontDict?.get('ToUnicode'));
  if (tuObj instanceof PdfStream) {
    try {
      tu = parseToUnicode(doc.decode(tuObj));
    } catch {
      tu = null;
    }
  }

  let descriptor = doc.dict(fontDict?.get('FontDescriptor'));
  let bold = /bold|semibold|demi|black|heavy|extrabold/i.test(baseFont);

  if (subtype === 'Type0') {
    const desc = doc.resolve(fontDict?.get('DescendantFonts'));
    const cid = doc.dict(Array.isArray(desc) ? desc[0] : undefined);
    descriptor = doc.dict(cid?.get('FontDescriptor')) ?? descriptor;
    const dw = num(doc.resolve(cid?.get('DW')), 1000);
    const widths = new Map<number, number>();
    const w = doc.resolve(cid?.get('W'));
    if (Array.isArray(w)) {
      let i = 0;
      while (i < w.length) {
        const first = doc.resolve(w[i]);
        const next = doc.resolve(w[i + 1]);
        if (typeof first !== 'number') break;
        if (Array.isArray(next)) {
          next.forEach((v, k) => widths.set(first + k, num(doc.resolve(v), dw)));
          i += 2;
        } else {
          const last = num(next);
          const v = num(doc.resolve(w[i + 2]), dw);
          for (let c = first; c <= last && c - first < 65536; c++) widths.set(c, v);
          i += 3;
        }
      }
    }
    if (descriptor && num(descriptor.get('FontWeight')) >= 600) bold = true;
    const twoByte = !tu || tu.ranges.length === 0 || tu.ranges.every((r) => r.len === 2);
    return {
      codes: (bytes) => {
        if (twoByte) {
          const out: number[] = [];
          for (let i = 0; i + 1 < bytes.length; i += 2) out.push((bytes[i] << 8) | bytes[i + 1]);
          return out;
        }
        return splitByCodespace(bytes, tu!.ranges);
      },
      isSpace: () => false,
      unicode: (code) => tu?.map.get(code) ?? '',
      width: (code) => widths.get(code) ?? dw,
      bold,
    };
  }

  // Simple fonts (Type1, TrueType, Type3, MMType1)
  const firstChar = num(doc.resolve(fontDict?.get('FirstChar')), 0);
  const widthsArr = doc.resolve(fontDict?.get('Widths'));
  const missing = num(doc.resolve(descriptor?.get('MissingWidth')), 500);
  let scale = 1;
  if (subtype === 'Type3') {
    const fm = doc.resolve(fontDict?.get('FontMatrix'));
    if (Array.isArray(fm) && typeof fm[0] === 'number') scale = fm[0] * 1000;
  }
  if (descriptor && num(descriptor.get('FontWeight')) >= 600) bold = true;

  const differences = new Map<number, string>();
  const enc = doc.resolve(fontDict?.get('Encoding'));
  const encDict = enc instanceof PdfDict ? enc : undefined;
  const diffs = doc.resolve(encDict?.get('Differences'));
  if (Array.isArray(diffs)) {
    let code = 0;
    for (const d of diffs) {
      if (typeof d === 'number') code = d;
      else if (d instanceof PdfName) differences.set(code++, glyphNameToUnicode(d.name));
    }
  }

  return {
    codes: (bytes) => Array.from(bytes),
    isSpace: (code) => code === 32,
    unicode: (code) => {
      const fromTu = tu?.map.get(code);
      if (fromTu !== undefined) return fromTu;
      const fromDiff = differences.get(code);
      if (fromDiff !== undefined) return fromDiff;
      if (WIN_ANSI_HIGH[code]) return WIN_ANSI_HIGH[code];
      if (code < 32) return '';
      return String.fromCharCode(code);
    },
    width: (code) => {
      if (Array.isArray(widthsArr)) {
        const v = doc.resolve(widthsArr[code - firstChar]);
        if (typeof v === 'number') return v * scale;
      }
      return missing;
    },
    bold,
  };
}

function splitByCodespace(bytes: Uint8Array, ranges: ToUnicode['ranges']): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    let matched = false;
    for (const len of [1, 2, 3, 4]) {
      if (i + len > bytes.length) break;
      const v = bytesToInt(bytes.subarray(i, i + len));
      if (ranges.some((r) => r.len === len && v >= r.lo && v <= r.hi)) {
        out.push(v);
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) out.push(bytes[i++]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Content stream interpreter
// ---------------------------------------------------------------------------

interface GState {
  ctm: Matrix;
  font: Font | null;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  leading: number;
  rise: number;
  fillLight: boolean;
  strokeLight: boolean;
}

const THIN = 2.6; // points; anything thinner than this is treated as a line

/** True if a color (given as gray / rgb / cmyk operands) is close to white. */
function isLight(operands: number[], space: 'g' | 'rg' | 'k'): boolean {
  if (space === 'g') return (operands[0] ?? 0) > 0.97;
  if (space === 'rg') return operands.slice(0, 3).every((v) => v > 0.97);
  return operands.slice(0, 4).every((v) => v < 0.03);
}

export function extractLayout(doc: PdfDocument): PageLayout[] {
  const fontCache = new Map<PdfDict, Font>();
  return doc.pages.map((page, index) => {
    const box = doc.resolve(page.get('CropBox')) ?? doc.resolve(page.get('MediaBox'));
    const [x0, y0, x1, y1] = Array.isArray(box) && box.length === 4
      ? box.map((v) => num(doc.resolve(v)))
      : [0, 0, 612, 792];
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    const layout: PageLayout = { index, width, height, items: [], hRules: [], vRules: [], markers: [] };
    const toPage = (x: number, y: number): [number, number] => [x - Math.min(x0, x1), Math.max(y0, y1) - y];

    const contents = doc.resolve(page.get('Contents'));
    const streams = (Array.isArray(contents) ? contents : [contents])
      .map((c) => doc.resolve(c))
      .filter((s): s is PdfStream => s instanceof PdfStream);
    const parts = streams.map((s) => doc.decode(s));
    // Content may be split across streams at arbitrary token boundaries.
    const joined = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0));
    let off = 0;
    for (const p of parts) {
      joined.set(p, off);
      off += p.length;
      joined[off++] = 10;
    }

    const resources = doc.dict(page.get('Resources'));
    const state: GState = {
      ctm: IDENTITY, font: null, fontSize: 12, charSpacing: 0, wordSpacing: 0, hScale: 1,
      leading: 0, rise: 0, fillLight: false, strokeLight: false,
    };
    run(doc, joined, resources, state, layout, toPage, fontCache, 0);
    return layout;
  });
}

function run(
  doc: PdfDocument,
  data: Uint8Array,
  resources: PdfDict | undefined,
  initial: GState,
  layout: PageLayout,
  toPage: (x: number, y: number) => [number, number],
  fontCache: Map<PdfDict, Font>,
  depth: number,
) {
  if (depth > 8) return;
  const lx = new Lexer(data);
  const operands: PdfObj[] = [];
  const stack: GState[] = [];
  let gs: GState = { ...initial };
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  // Current path, already in page coordinates.
  let rects: [number, number, number, number][] = [];
  let lines: [number, number, number, number][] = [];
  let cur: [number, number] | null = null;
  let subStart: [number, number] | null = null;
  // Bounding box of the whole current path (including curves), for bullet detection.
  let bbox: [number, number, number, number] | null = null;
  const grow = (p: [number, number]) => {
    bbox = bbox
      ? [Math.min(bbox[0], p[0]), Math.min(bbox[1], p[1]), Math.max(bbox[2], p[0]), Math.max(bbox[3], p[1])]
      : [p[0], p[1], p[0], p[1]];
  };

  const fontsRes = doc.dict(resources?.get('Font'));
  const xobjRes = doc.dict(resources?.get('XObject'));

  const getFont = (name: string): Font | null => {
    const fd = doc.dict(fontsRes?.get(name));
    if (!fd) return null;
    let f = fontCache.get(fd);
    if (!f) {
      f = loadFont(doc, fd);
      fontCache.set(fd, f);
    }
    return f;
  };

  const showString = (bytes: Uint8Array) => {
    const font = gs.font;
    if (!font) return;
    const codes = font.codes(bytes);
    let text = '';
    let startX = 0, startY = 0, size = 0;
    let first = true;
    for (const code of codes) {
      const trm = mul(mul([gs.fontSize * gs.hScale, 0, 0, gs.fontSize, 0, gs.rise], tm), gs.ctm);
      if (first) {
        [startX, startY] = toPage(trm[4], trm[5]);
        size = Math.hypot(trm[2], trm[3]);
        first = false;
      }
      text += font.unicode(code);
      const w0 = font.width(code) / 1000;
      const tx = (w0 * gs.fontSize + gs.charSpacing + (font.isSpace(code) ? gs.wordSpacing : 0)) * gs.hScale;
      tm = mul([1, 0, 0, 1, tx, 0], tm);
    }
    if (first) return;
    const endTrm = mul(mul([gs.fontSize * gs.hScale, 0, 0, gs.fontSize, 0, gs.rise], tm), gs.ctm);
    const [endX] = toPage(endTrm[4], endTrm[5]);
    if (text.length && size > 0.5) {
      layout.items.push({ x: startX, x2: Math.max(endX, startX), y: startY, size, text, bold: font.bold });
    }
  };

  const paint = (light: boolean) => {
    if (!light && bbox) {
      const [bx0, by0, bx1, by1] = bbox;
      const w = bx1 - bx0, h = by1 - by0;
      if (w >= 1.5 && h >= 1.5 && w <= 12 && h <= 12 && Math.abs(w - h) < 4) {
        layout.markers.push({ x: (bx0 + bx1) / 2, y: (by0 + by1) / 2, size: Math.max(w, h) });
      }
    }
    if (!light) {
      for (const [ax, ay, bx, by] of rects) {
        const w = Math.abs(bx - ax), h = Math.abs(by - ay);
        const left = Math.min(ax, bx), right = Math.max(ax, bx);
        const top = Math.min(ay, by), bottom = Math.max(ay, by);
        if (h <= THIN && w > 4) layout.hRules.push({ x1: left, x2: right, y1: (top + bottom) / 2, y2: (top + bottom) / 2 });
        else if (w <= THIN && h > 4) layout.vRules.push({ x1: (left + right) / 2, x2: (left + right) / 2, y1: top, y2: bottom });
        else if (w > 4 && h > 4) {
          // A filled/stroked box: its edges can act as table borders.
          layout.hRules.push({ x1: left, x2: right, y1: top, y2: top }, { x1: left, x2: right, y1: bottom, y2: bottom });
          layout.vRules.push({ x1: left, x2: left, y1: top, y2: bottom }, { x1: right, x2: right, y1: top, y2: bottom });
        }
      }
      for (const [ax, ay, bx, by] of lines) {
        if (Math.abs(ay - by) < 0.8 && Math.abs(bx - ax) > 4) {
          layout.hRules.push({ x1: Math.min(ax, bx), x2: Math.max(ax, bx), y1: ay, y2: ay });
        } else if (Math.abs(ax - bx) < 0.8 && Math.abs(by - ay) > 4) {
          layout.vRules.push({ x1: ax, x2: ax, y1: Math.min(ay, by), y2: Math.max(ay, by) });
        }
      }
    }
    rects = [];
    lines = [];
    cur = subStart = null;
    bbox = null;
  };

  for (;;) {
    const t = lx.read();
    if (t === undefined) break;
    if (!(t instanceof PdfOp)) {
      operands.push(t);
      continue;
    }
    const op = t.op;
    const n = (i: number) => num(operands[i]);
    switch (op) {
      case 'q':
        stack.push({ ...gs });
        break;
      case 'Q':
        if (stack.length) gs = stack.pop()!;
        break;
      case 'cm':
        gs.ctm = mul([n(0), n(1), n(2), n(3), n(4), n(5)], gs.ctm);
        break;
      case 'BT':
        tm = tlm = IDENTITY;
        break;
      case 'Tf': {
        const name = nameOf(operands[0]);
        gs.font = name ? getFont(name) : null;
        gs.fontSize = n(1);
        break;
      }
      case 'Tc': gs.charSpacing = n(0); break;
      case 'Tw': gs.wordSpacing = n(0); break;
      case 'Tz': gs.hScale = n(0) / 100; break;
      case 'TL': gs.leading = n(0); break;
      case 'Ts': gs.rise = n(0); break;
      case 'Td':
        tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm);
        tm = tlm;
        break;
      case 'TD':
        gs.leading = -n(1);
        tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm);
        tm = tlm;
        break;
      case 'Tm':
        tlm = tm = [n(0), n(1), n(2), n(3), n(4), n(5)];
        break;
      case 'T*':
        tlm = mul([1, 0, 0, 1, 0, -gs.leading], tlm);
        tm = tlm;
        break;
      case 'Tj':
        if (operands[0] instanceof PdfString) showString(operands[0].bytes);
        break;
      case "'":
        tlm = mul([1, 0, 0, 1, 0, -gs.leading], tlm);
        tm = tlm;
        if (operands[0] instanceof PdfString) showString(operands[0].bytes);
        break;
      case '"':
        gs.wordSpacing = n(0);
        gs.charSpacing = n(1);
        tlm = mul([1, 0, 0, 1, 0, -gs.leading], tlm);
        tm = tlm;
        if (operands[2] instanceof PdfString) showString(operands[2].bytes);
        break;
      case 'TJ': {
        const arr = operands[0];
        if (Array.isArray(arr)) {
          for (const el of arr) {
            if (el instanceof PdfString) showString(el.bytes);
            else if (typeof el === 'number') {
              tm = mul([1, 0, 0, 1, (-el / 1000) * gs.fontSize * gs.hScale, 0], tm);
            }
          }
        }
        break;
      }
      // --- paths ---
      case 'm': {
        const p = toPage(...apply(gs.ctm, n(0), n(1)));
        cur = subStart = p;
        grow(p);
        break;
      }
      case 'l': {
        const p = toPage(...apply(gs.ctm, n(0), n(1)));
        if (cur) lines.push([cur[0], cur[1], p[0], p[1]]);
        cur = p;
        grow(p);
        break;
      }
      case 'c': case 'v': case 'y': {
        // Curves are never table borders; just move the current point.
        const k = op === 'c' ? 4 : 2;
        cur = toPage(...apply(gs.ctm, n(k), n(k + 1)));
        grow(cur);
        break;
      }
      case 'h':
        if (cur && subStart) lines.push([cur[0], cur[1], subStart[0], subStart[1]]);
        cur = subStart;
        break;
      case 're': {
        const [ax, ay] = toPage(...apply(gs.ctm, n(0), n(1)));
        const [bx, by] = toPage(...apply(gs.ctm, n(0) + n(2), n(1) + n(3)));
        rects.push([ax, ay, bx, by]);
        grow([ax, ay]);
        grow([bx, by]);
        break;
      }
      case 'f': case 'F': case 'f*':
        paint(gs.fillLight);
        break;
      case 'S': case 's':
        paint(gs.strokeLight);
        break;
      case 'B': case 'B*': case 'b': case 'b*':
        paint(gs.fillLight && gs.strokeLight);
        break;
      case 'n':
        rects = [];
        lines = [];
        cur = subStart = null;
        bbox = null;
        break;
      // --- colors (only "is it white?" matters) ---
      case 'g': gs.fillLight = isLight(operands as number[], 'g'); break;
      case 'G': gs.strokeLight = isLight(operands as number[], 'g'); break;
      case 'rg': gs.fillLight = isLight(operands as number[], 'rg'); break;
      case 'RG': gs.strokeLight = isLight(operands as number[], 'rg'); break;
      case 'k': gs.fillLight = isLight(operands as number[], 'k'); break;
      case 'K': gs.strokeLight = isLight(operands as number[], 'k'); break;
      case 'sc': case 'scn': {
        const nums = operands.filter((o): o is number => typeof o === 'number');
        gs.fillLight = nums.length === 1 ? isLight(nums, 'g') : nums.length === 3 ? isLight(nums, 'rg') : nums.length === 4 ? isLight(nums, 'k') : false;
        break;
      }
      case 'SC': case 'SCN': {
        const nums = operands.filter((o): o is number => typeof o === 'number');
        gs.strokeLight = nums.length === 1 ? isLight(nums, 'g') : nums.length === 3 ? isLight(nums, 'rg') : nums.length === 4 ? isLight(nums, 'k') : false;
        break;
      }
      // --- form XObjects ---
      case 'Do': {
        const name = nameOf(operands[0]);
        const xo = name ? doc.resolve(xobjRes?.get(name)) : undefined;
        if (xo instanceof PdfStream && nameOf(xo.dict.get('Subtype')) === 'Form') {
          const mObj = doc.resolve(xo.dict.get('Matrix'));
          const m: Matrix = Array.isArray(mObj) && mObj.length === 6
            ? (mObj.map((v) => num(doc.resolve(v))) as Matrix)
            : IDENTITY;
          const inner: GState = { ...gs, ctm: mul(m, gs.ctm) };
          run(doc, doc.decode(xo), doc.dict(xo.dict.get('Resources')) ?? resources, inner, layout, toPage, fontCache, depth + 1);
        }
        break;
      }
      // --- inline images: skip binary data up to EI ---
      case 'ID': {
        const b = data;
        let p = lx.pos + 1;
        while (p + 2 < b.length) {
          if (b[p] === 69 && b[p + 1] === 73 && (p + 2 >= b.length || b[p + 2] <= 32) && b[p - 1] <= 32) break;
          p++;
        }
        lx.pos = p + 2;
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }
}

export { latin1 };
