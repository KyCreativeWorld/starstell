/**
 * Minimal, dependency-light PDF reader (pako for Flate only) that runs the same
 * on web, iOS and Android. It does just enough to recover the *layout* of a
 * text-based PDF: every piece of text with its position and font size, and the
 * thin ruled lines used to draw table borders.
 *
 * Not supported (the caller gets a readable error or simply no text): encrypted
 * PDFs, scanned/image-only PDFs, and exotic encodings without a ToUnicode map.
 */
import { inflate, Inflate } from 'pako';

// ---------------------------------------------------------------------------
// Object model
// ---------------------------------------------------------------------------

export class PdfName {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
}
export class PdfRef {
  readonly num: number;
  readonly gen: number;
  constructor(num: number, gen: number) {
    this.num = num;
    this.gen = gen;
  }
}
export class PdfString {
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }
}
export class PdfDict {
  readonly map: Record<string, PdfObj>;
  constructor(map: Record<string, PdfObj> = {}) {
    this.map = map;
  }
  get(key: string): PdfObj | undefined {
    return this.map[key];
  }
}
export class PdfStream {
  readonly dict: PdfDict;
  readonly raw: Uint8Array;
  constructor(dict: PdfDict, raw: Uint8Array) {
    this.dict = dict;
    this.raw = raw;
  }
}
/** A content-stream operator such as `Tj` or `re`. */
class PdfOp {
  readonly op: string;
  constructor(op: string) {
    this.op = op;
  }
}

export type PdfObj =
  | null
  | boolean
  | number
  | PdfName
  | PdfRef
  | PdfString
  | PdfDict
  | PdfStream
  | PdfObj[];

export class PdfError extends Error {}

// ---------------------------------------------------------------------------
// Lexer / parser
// ---------------------------------------------------------------------------

const WS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of '()<>[]{}/%') DELIM[c.charCodeAt(0)] = 1;

const isDigitOrNum = (c: number) => (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46;

class Lexer {
  pos: number;
  readonly b: Uint8Array;
  readonly end: number;
  constructor(b: Uint8Array, start = 0, end = b.length) {
    this.b = b;
    this.pos = start;
    this.end = end;
  }

  skipWs() {
    const b = this.b;
    while (this.pos < this.end) {
      const c = b[this.pos];
      if (WS[c]) this.pos++;
      else if (c === 37 /* % */) {
        while (this.pos < this.end && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
      } else break;
    }
  }

  /** Reads one object. Bare keywords become PdfOp (used by content streams). */
  read(): PdfObj | PdfOp | undefined {
    this.skipWs();
    if (this.pos >= this.end) return undefined;
    const b = this.b;
    const c = b[this.pos];

    if (c === 47 /* / */) {
      this.pos++;
      let s = '';
      while (this.pos < this.end && !WS[b[this.pos]] && !DELIM[b[this.pos]]) {
        if (b[this.pos] === 35 /* # */ && this.pos + 2 < this.end) {
          s += String.fromCharCode(parseInt(String.fromCharCode(b[this.pos + 1], b[this.pos + 2]), 16));
          this.pos += 3;
        } else s += String.fromCharCode(b[this.pos++]);
      }
      return new PdfName(s);
    }
    if (c === 40 /* ( */) return this.readLiteralString();
    if (c === 60 /* < */) {
      if (b[this.pos + 1] === 60) {
        this.pos += 2;
        return this.readDict();
      }
      return this.readHexString();
    }
    if (c === 91 /* [ */) {
      this.pos++;
      const arr: PdfObj[] = [];
      for (;;) {
        this.skipWs();
        if (this.pos >= this.end) break;
        if (b[this.pos] === 93) {
          this.pos++;
          break;
        }
        const v = this.read();
        if (v === undefined) break;
        if (v instanceof PdfOp) {
          if (v.op === 'R' && arr.length >= 2) {
            const gen = arr.pop() as number;
            const num = arr.pop() as number;
            arr.push(new PdfRef(num, gen));
          }
          continue; // ignore stray keywords inside arrays
        }
        arr.push(v);
      }
      return arr;
    }
    if (c === 93 || c === 62 || c === 41 || c === 123 || c === 125) {
      // stray closing delimiter — skip it
      this.pos++;
      return this.read();
    }
    if (isDigitOrNum(c)) {
      const start = this.pos;
      this.pos++;
      while (this.pos < this.end && isDigitOrNum(b[this.pos])) this.pos++;
      const n = parseFloat(latin1(b, start, this.pos));
      return Number.isFinite(n) ? n : 0;
    }
    // keyword
    const start = this.pos;
    while (this.pos < this.end && !WS[b[this.pos]] && !DELIM[b[this.pos]]) this.pos++;
    if (this.pos === start) {
      this.pos++;
      return this.read();
    }
    const word = latin1(b, start, this.pos);
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    return new PdfOp(word);
  }

  private readDict(): PdfDict {
    const map: Record<string, PdfObj> = {};
    let key: string | null = null;
    const vals: PdfObj[] = [];
    const flush = () => {
      if (key !== null && vals.length) map[key] = vals[vals.length - 1];
    };
    for (;;) {
      this.skipWs();
      if (this.pos >= this.end) break;
      if (this.b[this.pos] === 62 && this.b[this.pos + 1] === 62) {
        this.pos += 2;
        break;
      }
      const v = this.read();
      if (v === undefined) break;
      if (v instanceof PdfOp) {
        if (v.op === 'R' && vals.length >= 2) {
          const gen = vals.pop() as number;
          const num = vals.pop() as number;
          vals.push(new PdfRef(num, gen));
        }
        continue;
      }
      if (v instanceof PdfName && (key === null || vals.length > 0)) {
        flush();
        key = v.name;
        vals.length = 0;
        continue;
      }
      vals.push(v);
    }
    flush();
    return new PdfDict(map);
  }

  private readLiteralString(): PdfString {
    const b = this.b;
    this.pos++; // (
    const out: number[] = [];
    let depth = 1;
    while (this.pos < this.end) {
      const c = b[this.pos++];
      if (c === 92 /* \ */) {
        const n = b[this.pos++];
        switch (n) {
          case 110: out.push(10); break; // n
          case 114: out.push(13); break; // r
          case 116: out.push(9); break; // t
          case 98: out.push(8); break; // b
          case 102: out.push(12); break; // f
          case 13: if (b[this.pos] === 10) this.pos++; break; // line continuation
          case 10: break;
          default:
            if (n >= 48 && n <= 55) {
              let v = n - 48;
              for (let i = 0; i < 2 && b[this.pos] >= 48 && b[this.pos] <= 55; i++) {
                v = v * 8 + (b[this.pos++] - 48);
              }
              out.push(v & 0xff);
            } else out.push(n);
        }
      } else if (c === 40) {
        depth++;
        out.push(c);
      } else if (c === 41) {
        if (--depth === 0) break;
        out.push(c);
      } else out.push(c);
    }
    return new PdfString(Uint8Array.from(out));
  }

  private readHexString(): PdfString {
    const b = this.b;
    this.pos++; // <
    const out: number[] = [];
    let hi = -1;
    while (this.pos < this.end) {
      const c = b[this.pos++];
      if (c === 62) break;
      const v = hexVal(c);
      if (v < 0) continue;
      if (hi < 0) hi = v;
      else {
        out.push((hi << 4) | v);
        hi = -1;
      }
    }
    if (hi >= 0) out.push(hi << 4);
    return new PdfString(Uint8Array.from(out));
  }
}

function hexVal(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  if (c >= 97 && c <= 102) return c - 87;
  return -1;
}

function latin1(b: Uint8Array, start = 0, end = b.length): string {
  let s = '';
  const CHUNK = 8192;
  for (let i = start; i < end; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(b.subarray(i, Math.min(end, i + CHUNK))));
  }
  return s;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function flate(data: Uint8Array): Uint8Array {
  try {
    return inflate(data);
  } catch {
    // Tolerate truncated/garbled streams: keep whatever decoded.
    const inf = new Inflate();
    inf.push(data, false);
    const chunks = (inf as unknown as { chunks?: Uint8Array[] }).chunks ?? [];
    const result = inf.result instanceof Uint8Array && inf.result.length ? inf.result : concat(chunks);
    return result;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function pngPredictor(data: Uint8Array, columns: number, colors: number, bpc: number): Uint8Array {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((columns * colors * bpc) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const row = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const cur = new Uint8Array(rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (type === 1) v += a;
      else if (type === 2) v += up;
      else if (type === 3) v += (a + up) >> 1;
      else if (type === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      cur[i] = v & 0xff;
    }
    out.set(cur, r * rowLen);
    prev = cur;
  }
  return out;
}

function asciiHex(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let hi = -1;
  for (const c of data) {
    if (c === 62) break;
    const v = hexVal(c);
    if (v < 0) continue;
    if (hi < 0) hi = v;
    else {
      out.push((hi << 4) | v);
      hi = -1;
    }
  }
  if (hi >= 0) out.push(hi << 4);
  return Uint8Array.from(out);
}

function ascii85(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let group: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === 126 /* ~ */) break;
    if (WS[c]) continue;
    if (c === 122 /* z */ && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(c - 33);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length > 1) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n - 1));
  }
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export class PdfDocument {
  private readonly objects = new Map<number, PdfObj>();
  private readonly decoded = new WeakMap<PdfStream, Uint8Array>();
  readonly pages: PdfDict[] = [];
  readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    const text = latin1(bytes);
    const header = text.indexOf('%PDF');
    if (header < 0 || header > 1024) {
      throw new PdfError("This file doesn't look like a PDF.");
    }
    this.scanObjects(text);
    if (/\/Encrypt\s/.test(text)) {
      throw new PdfError('This PDF is encrypted or password-protected. Export an unprotected copy and try again.');
    }
    this.collectPages();
    if (this.pages.length === 0) throw new PdfError("Couldn't find any pages in this PDF.");
  }

  /**
   * Finds every `N G obj` in the file (rather than trusting the xref table,
   * which is often slightly wrong in real-world files). Later definitions win.
   */
  private scanObjects(text: string) {
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    const objStreams: PdfStream[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const num = parseInt(m[1], 10);
      const lx = new Lexer(this.bytes, m.index + m[0].length);
      let obj: PdfObj | PdfOp | undefined;
      try {
        obj = lx.read();
      } catch {
        continue;
      }
      if (obj instanceof PdfOp || obj === undefined) continue;
      if (obj instanceof PdfDict) {
        lx.skipWs();
        if (text.startsWith('stream', lx.pos)) {
          let start = lx.pos + 6;
          if (this.bytes[start] === 13) start++;
          if (this.bytes[start] === 10) start++;
          const len = obj.get('Length');
          let end = -1;
          if (typeof len === 'number' && len >= 0) {
            const after = text.indexOf('endstream', start + len);
            if (after >= 0 && after - (start + len) <= 3) end = start + len;
          }
          if (end < 0) {
            end = text.indexOf('endstream', start);
            if (end < 0) end = this.bytes.length;
            // trim the EOL before `endstream`
            if (this.bytes[end - 1] === 10) end--;
            if (this.bytes[end - 1] === 13) end--;
          }
          const stream = new PdfStream(obj, this.bytes.subarray(start, end));
          this.objects.set(num, stream);
          if (nameOf(obj.get('Type')) === 'ObjStm') objStreams.push(stream);
          re.lastIndex = Math.max(re.lastIndex, end);
          continue;
        }
      }
      this.objects.set(num, obj);
    }

    // Objects packed inside object streams (PDF 1.5+). Direct definitions win.
    for (const os of objStreams) {
      try {
        const data = this.decode(os);
        const n = num(os.dict.get('N'));
        const first = num(os.dict.get('First'));
        const header = new Lexer(data, 0, first);
        const entries: [number, number][] = [];
        for (let i = 0; i < n; i++) {
          const objNum = header.read();
          const off = header.read();
          if (typeof objNum !== 'number' || typeof off !== 'number') break;
          entries.push([objNum, off]);
        }
        for (const [objNum, off] of entries) {
          if (this.objects.has(objNum)) continue;
          const v = new Lexer(data, first + off).read();
          if (v !== undefined && !(v instanceof PdfOp)) this.objects.set(objNum, v);
        }
      } catch {
        // skip unreadable object streams
      }
    }
  }

  resolve(o: PdfObj | undefined): PdfObj | undefined {
    let guard = 0;
    while (o instanceof PdfRef && guard++ < 32) o = this.objects.get(o.num);
    return o instanceof PdfRef ? undefined : o;
  }

  dict(o: PdfObj | undefined): PdfDict | undefined {
    const r = this.resolve(o);
    if (r instanceof PdfDict) return r;
    if (r instanceof PdfStream) return r.dict;
    return undefined;
  }

  /** Decoded bytes of a stream (filters applied). */
  decode(s: PdfStream): Uint8Array {
    const cached = this.decoded.get(s);
    if (cached) return cached;
    let data = s.raw;
    const filterObj = this.resolve(s.dict.get('Filter'));
    const filters = Array.isArray(filterObj) ? filterObj : filterObj ? [filterObj] : [];
    const parmsObj = this.resolve(s.dict.get('DecodeParms'));
    const parmsList = Array.isArray(parmsObj) ? parmsObj : [parmsObj];
    filters.forEach((f, i) => {
      const name = nameOf(this.resolve(f));
      const parms = this.dict(parmsList[i] ?? undefined);
      if (name === 'FlateDecode' || name === 'Fl') {
        data = flate(data);
        const predictor = num(parms?.get('Predictor'), 1);
        if (predictor >= 10) {
          data = pngPredictor(
            data,
            num(parms?.get('Columns'), 1),
            num(parms?.get('Colors'), 1),
            num(parms?.get('BitsPerComponent'), 8),
          );
        }
      } else if (name === 'ASCIIHexDecode' || name === 'AHx') data = asciiHex(data);
      else if (name === 'ASCII85Decode' || name === 'A85') data = ascii85(data);
      else data = new Uint8Array(0); // images / unsupported: not needed for text
    });
    this.decoded.set(s, data);
    return data;
  }

  private collectPages() {
    let root: PdfDict | undefined;
    for (const o of this.objects.values()) {
      const d = o instanceof PdfDict ? o : undefined;
      if (d && nameOf(d.get('Type')) === 'Catalog') root = d;
    }
    const visit = (node: PdfDict | undefined, inherited: Record<string, PdfObj>, depth: number) => {
      if (!node || depth > 64) return;
      const inh = { ...inherited };
      for (const k of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
        const v = node.get(k);
        if (v !== undefined) inh[k] = v;
      }
      const kids = this.resolve(node.get('Kids'));
      if (Array.isArray(kids)) {
        for (const k of kids) visit(this.dict(k), inh, depth + 1);
      } else if (nameOf(node.get('Type')) === 'Page' || node.get('Contents') !== undefined) {
        this.pages.push(new PdfDict({ ...inh, ...node.map }));
      }
    };
    if (root) visit(this.dict(root.get('Pages')), {}, 0);
    if (this.pages.length === 0) {
      // Fall back to every Page object in file order.
      for (const o of this.objects.values()) {
        if (o instanceof PdfDict && nameOf(o.get('Type')) === 'Page') this.pages.push(o);
      }
    }
  }
}

export function nameOf(o: PdfObj | undefined): string | undefined {
  return o instanceof PdfName ? o.name : undefined;
}

export function num(o: PdfObj | undefined, fallback = 0): number {
  return typeof o === 'number' ? o : fallback;
}

export { Lexer, PdfOp, latin1 };
