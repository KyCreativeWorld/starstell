/**
 * Reads a "Workflow Efficiency Consulting Report" PDF (the template's section
 * and table layout) into structured teams, bottlenecks, and solution options.
 * Runs entirely on the device.
 */
import { PdfDocument, PdfError } from './pdf/pdfDocument';
import { extractLayout } from './pdf/pdfLayout';
import { type Block, buildBlocks } from './pdf/pdfStructure';
import type { Bottleneck, LabeledValue, Report, SolutionOption, Team } from './types';

export class ReportParseError extends Error {}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

/** True for template placeholders like "[ ]", "$[ ] per hour", "[e.g., 48]". */
export function isPlaceholder(s: string | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  if (!t || /^(n\/?a|tbd|—|–|-)$/i.test(t)) return true;
  if (!t.includes('[')) return false;
  const rest = t.replace(/\[[^\]]*\]?/g, '').trim();
  return !/\d/.test(rest) && rest.replace(/[^a-z]/gi, '').length <= 10;
}

function value(s: string | undefined): string | undefined {
  return isPlaceholder(s) ? undefined : s!.trim();
}

/** "$12,400" → 12400, "1.5 hrs" → 1.5, "$1.2M" → 1200000, "4–6" → 5. */
export function parseNumber(s: string | undefined): number | undefined {
  const v = value(s);
  if (!v) return undefined;
  const t = v.replace(/,/g, '');
  const one = (str: string, suffix?: string) => {
    let n = parseFloat(str);
    if (!Number.isFinite(n)) return undefined;
    const sfx = (suffix ?? '').toLowerCase();
    if (sfx === 'k') n *= 1e3;
    else if (sfx === 'm' || sfx === 'mm' || sfx === 'million') n *= 1e6;
    else if (sfx === 'b' || sfx === 'billion') n *= 1e9;
    return n;
  };
  const range = /(-?\d+(?:\.\d+)?)\s*(k|m|mm|million)?\s*(?:–|—|-|to)\s*\$?(-?\d+(?:\.\d+)?)\s*(k|m|mm|million)?\b/i.exec(t);
  if (range) {
    const a = one(range[1], range[2] ?? range[4]);
    const b = one(range[3], range[4]);
    if (a !== undefined && b !== undefined) return (a + b) / 2;
  }
  const m = /(-?\d+(?:\.\d+)?)\s*(k|mm|m|million|billion|b)?\b/i.exec(t);
  return m ? one(m[1], m[2]) : undefined;
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

function slug(s: string, taken: Set<string>): string {
  const base = norm(s).replace(/ /g, '-') || 'item';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

const isGuidance = (text: string) => /^guidance\s*:/i.test(text);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

type Rows = string[][];

/** Index of the first header cell matching any pattern, or -1. */
function col(header: string[], ...patterns: RegExp[]): number {
  return header.findIndex((h) => patterns.some((p) => p.test(h)));
}

function findTable(blocks: Block[], test: (header: string[]) => boolean): Rows | undefined {
  for (const b of blocks) {
    if (b.kind === 'table' && b.rows.length && test(b.rows[0].map((h) => h.toLowerCase()))) return b.rows;
  }
  return undefined;
}

function keyValueRows(rows: Rows | undefined): LabeledValue[] {
  if (!rows) return [];
  return rows
    .slice(1)
    .map((r) => ({ label: r[0]?.trim() ?? '', value: value(r[1]) ?? '' }))
    .filter((r) => r.label && r.value);
}

const isTotalRow = (r: string[]) => r.some((c) => /^total\b/i.test(c.trim()));

// ---------------------------------------------------------------------------
// Bottleneck sections
// ---------------------------------------------------------------------------

interface Section {
  number: number;
  heading: string;
  blocks: Block[];
}

function bottleneckSections(blocks: Block[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const b of blocks) {
    if (b.kind === 'heading' && b.level <= 2) {
      const m = /^bottleneck\s*#?\s*(\d+)\s*[:.\-–—]?\s*(.*)$/i.exec(b.text);
      current = m ? { number: parseInt(m[1], 10), heading: m[2].trim(), blocks: [] } : null;
      if (current) sections.push(current);
      continue;
    }
    current?.blocks.push(b);
  }
  return sections;
}

const OPTION_FIELDS: [keyof SolutionOption, RegExp][] = [
  ['type', /^type\b/i],
  ['howItSolves', /how it solves|solves the problem|description/i],
  ['vendors', /vendor|program|example/i],
  ['upfrontCost', /upfront|one[- ]time|initial cost/i],
  ['ongoingCost', /ongoing|recurring|per year\)?$/i],
  ['implementationTime', /implementation|time to implement/i],
  ['effort', /effort|disruption/i],
  ['hoursSaved', /hours saved/i],
  ['annualSavings', /savings/i],
  ['payback', /payback/i],
  ['governanceRisk', /governance/i],
  ['risks', /risk|dependenc/i],
];

function parseOptions(rows: Rows, recommendation: string | undefined): SolutionOption[] {
  const header = rows[0];
  const options: SolutionOption[] = [];
  header.forEach((h, i) => {
    if (i === 0) return;
    const m = /^option\s+([a-z0-9])\s*[:.\-–—]?\s*(.*)$/i.exec(h.trim());
    const letter = m ? m[1].toUpperCase() : String.fromCharCode(64 + i);
    const name = value(m ? m[2] : h) ?? `Option ${letter}`;
    const opt: SolutionOption = { letter, name, rows: [], recommended: false, alsoSuggested: false };
    for (const r of rows.slice(1)) {
      const label = r[0]?.trim();
      const v = value(r[i]);
      if (!label || !v) continue;
      opt.rows.push({ label, value: v });
      const field = OPTION_FIELDS.find(([, re]) => re.test(label));
      if (field && opt[field[0]] === undefined) (opt as unknown as Record<string, string>)[field[0]] = v;
    }
    options.push(opt);
  });

  if (recommendation) {
    // The sentence that says "recommend" names the main pick; later mentions are add-ons.
    // (No regex lookbehind: it breaks older Safari.)
    const sentences = recommendation.replace(/([.!?])\s+(?=[A-Z])/g, '$1\u0000').split('\u0000');
    const mainIdx = Math.max(0, sentences.findIndex((s) => /recommend/i.test(s)));
    const mentioned = (text: string) => {
      const letters = [...text.matchAll(/\boption\s+([a-z0-9])\b/gi)].map((m) => m[1].toUpperCase());
      const byLetter = options.filter((o) => letters.includes(o.letter));
      return byLetter.length
        ? byLetter
        : options.filter((o) => o.name.length > 3 && norm(text).includes(norm(o.name)));
    };
    mentioned(sentences[mainIdx]).forEach((o) => (o.recommended = true));
    mentioned(sentences.slice(mainIdx + 1).join(' ')).forEach((o) => {
      if (!o.recommended) o.alsoSuggested = true;
    });
  }
  // Drop columns that were left entirely blank.
  return options.filter((o) => o.rows.length > 0 || !/^option [a-z0-9]$/i.test(o.name));
}

interface SectionData {
  number: number;
  name?: string;
  summary?: string;
  whatHappensToday?: string;
  impact: LabeledValue[];
  rootCauses: string[];
  options: SolutionOption[];
  recommendation?: string;
}

function parseSection(s: Section): SectionData {
  let sub = '';
  let summary: string | undefined;
  const today: string[] = [];
  const rec: string[] = [];
  const rootCauses: string[] = [];
  let impactRows: Rows | undefined;
  let optionRows: Rows | undefined;

  for (const b of s.blocks) {
    if (b.kind === 'heading') {
      sub = b.text.toLowerCase();
      continue;
    }
    if (b.kind === 'para') {
      if (isGuidance(b.text) || isPlaceholder(b.text)) continue;
      if (!sub) summary ??= b.text;
      else if (/what happens|current (state|process)|today/.test(sub)) today.push(b.text);
      else if (/root cause/.test(sub)) rootCauses.push(b.text);
      else if (/recommend/.test(sub)) rec.push(b.text);
      continue;
    }
    const head = b.rows[0]?.map((h) => h.toLowerCase()) ?? [];
    if (!optionRows && head.some((h) => /^option\b/.test(h))) optionRows = b.rows;
    else if (!impactRows && (/impact/.test(sub) || /^metric/.test(head[0] ?? ''))) impactRows = b.rows;
  }

  const recommendation = rec.length ? rec.join(' ') : undefined;
  return {
    number: s.number,
    name: value(s.heading),
    summary: summary && !isPlaceholder(summary) ? summary : undefined,
    whatHappensToday: today.length ? today.join(' ') : undefined,
    impact: impactRows
      ? impactRows
          .filter((r, i) => !(i === 0 && /^metric$/i.test(r[0]?.trim() ?? '')))
          .map((r) => ({ label: r[0]?.trim() ?? '', value: value(r[1]) ?? '' }))
          .filter((r) => r.label && r.value)
      : [],
    rootCauses,
    options: optionRows ? parseOptions(optionRows, recommendation) : [],
    recommendation,
  };
}

const impactValue = (impact: LabeledValue[], re: RegExp) => impact.find((i) => re.test(i.label))?.value;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function parseReportPdf(bytes: Uint8Array, fileName: string): Report {
  let blocks: Block[];
  try {
    const doc = new PdfDocument(bytes);
    blocks = buildBlocks(extractLayout(doc));
  } catch (e) {
    if (e instanceof PdfError) throw new ReportParseError(e.message);
    throw new ReportParseError("Couldn't read this PDF. It may be damaged or use an unsupported format.");
  }
  if (!blocks.some((b) => b.kind !== 'heading')) {
    throw new ReportParseError(
      "This PDF has no selectable text (it may be a scan). Export the report as a text PDF and try again.",
    );
  }
  return parseBlocks(blocks, fileName);
}

export function parseBlocks(blocks: Block[], fileName: string): Report {
  const notes: string[] = [];

  // --- Report details ---
  const details = keyValueRows(findTable(blocks, (h) => /^field/.test(h[0] ?? '') || /^entry/.test(h[1] ?? '')));
  const detail = (re: RegExp) => details.find((d) => re.test(d.label))?.value;

  // --- Executive summary ---
  let executiveSummary: string | undefined;
  let decisionRequested: string | undefined;
  let inExec = false;
  for (const b of blocks) {
    if (b.kind === 'heading' && b.level <= 2) inExec = /executive summary/i.test(b.text);
    else if (inExec && b.kind === 'para' && !isGuidance(b.text)) {
      const d = /^decision requested\s*:\s*(.*)$/i.exec(b.text);
      if (d) decisionRequested = value(d[1]) ?? decisionRequested;
      else if (!executiveSummary && !b.list && !isPlaceholder(b.text) && !/\[[^\]]*\]/.test(b.text)) {
        executiveSummary = b.text;
      }
    }
  }

  // --- Assumptions ---
  const assumptions = keyValueRows(findTable(blocks, (h) => /^assumption/.test(h[0] ?? '')));
  const hourlyRate = parseNumber(assumptions.find((a) => /hourly rate/i.test(a.label))?.value);
  const weeks = parseNumber(assumptions.find((a) => /working weeks|weeks per year/i.test(a.label))?.value);

  // --- Teams (departments) ---
  const teamIds = new Set<string>();
  const teams: Team[] = [];
  const teamByNorm = new Map<string, Team>();
  const addTeam = (rawName: string): Team | undefined => {
    const name = rawName.replace(/\s+/g, ' ').trim().replace(/^[-–•]\s*/, '').replace(/[.;:]$/, '');
    if (!name || isPlaceholder(name) || /^(all|total|none|unassigned)$/i.test(name)) return undefined;
    const key = norm(name);
    const existing = teamByNorm.get(key);
    if (existing) return existing;
    const team: Team = { id: slug(name, teamIds), name, bottleneckIds: [] };
    teams.push(team);
    teamByNorm.set(key, team);
    return team;
  };

  const deptRows = findTable(blocks, (h) => /^department/.test(h[0] ?? '') && h.some((c) => /headcount|hours lost|affected/.test(c)));
  if (deptRows) {
    const h = deptRows[0].map((c) => c.toLowerCase());
    const cHead = col(h, /headcount/);
    const cAff = col(h, /affected/);
    const cHours = col(h, /hours/);
    const cPct = col(h, /%|percent/);
    for (const r of deptRows.slice(1)) {
      if (isTotalRow(r)) continue;
      const team = addTeam(r[0] ?? '');
      if (!team) continue;
      team.headcount = parseNumber(r[cHead]);
      team.employeesAffected = parseNumber(r[cAff]);
      team.hoursLost = parseNumber(r[cHours]);
      team.pctTime = value(r[cPct]);
    }
  }
  const inScope = detail(/departments? in scope|teams? in scope/i);
  if (inScope) splitNames(inScope).forEach(addTeam);

  /** Matches department text to known teams, creating new ones when nothing matches. */
  const resolveTeams = (text: string | undefined): Team[] => {
    const v = value(text);
    if (!v) return [];
    // Known team names first (longest first, so "Sales & Marketing" beats "Sales"),
    // removing each match so the leftovers can be read as new teams.
    let rest = ` ${norm(v.replace(/\([^)]*\)/g, ' '))} `;
    const found: Team[] = [];
    for (const tm of [...teams].sort((a, b) => b.name.length - a.name.length)) {
      const key = ` ${norm(tm.name)} `;
      if (rest.includes(key)) {
        found.push(tm);
        rest = rest.replace(key, ' , ');
      }
    }
    if (found.length && !/[a-z]{3,}/.test(rest.replace(/\band\b/g, ''))) return found;
    const fresh = splitNames(v.replace(/\([^)]*\)/g, ' '))
      .filter((n) => !found.some((f) => norm(f.name) === norm(n)) && /[a-z]{3,}/i.test(n))
      .filter((n) => !teams.some((tm) => ` ${norm(n)} `.includes(` ${norm(tm.name)} `)))
      .map(addTeam)
      .filter((x): x is Team => !!x);
    return [...found, ...fresh];
  };

  // --- Bottlenecks from the summary tables ---
  const bottleneckIds = new Set<string>();
  const bottlenecks: Bottleneck[] = [];
  const newBottleneck = (name: string, rank?: number): Bottleneck => ({
    id: slug(name, bottleneckIds),
    rank,
    name,
    teamIds: [],
    impact: [],
    rootCauses: [],
    options: [],
  });

  const allRows = findTable(blocks, (h) => h.some((c) => /bottleneck/.test(c)) && h.some((c) => /department/.test(c)));
  const topRows = findTable(blocks, (h) => h.some((c) => /bottleneck/.test(c)) && !h.some((c) => /department|recommended/.test(c)) && h.some((c) => /hours|cost/.test(c)));
  for (const rows of [allRows, topRows]) {
    if (!rows) continue;
    const h = rows[0].map((c) => c.toLowerCase());
    const cRank = col(h, /^rank|^#|^no\.?$/);
    const cName = col(h, /bottleneck/);
    const cDept = col(h, /department/);
    const cPer = col(h, /per employee/);
    const cEmp = col(h, /employees/);
    const cTotal = col(h, /total hours|hours lost|hours per week/);
    const cCost = col(h, /annual cost|cost/);
    const cPct = col(h, /% of|lost time/);
    const cFeas = col(h, /feasib/);
    for (const r of rows.slice(1)) {
      if (isTotalRow(r)) continue;
      const name = value(r[cName]);
      if (!name) continue;
      const rank = parseNumber(r[cRank]);
      let b = bottlenecks.find((x) => sameName(x.name, name));
      if (!b) {
        // The top-three table only adds detail to what the full table already listed.
        if (rows === topRows && allRows && bottlenecks.length) continue;
        b = newBottleneck(name, rank);
        bottlenecks.push(b);
      }
      b.rank ??= rank;
      if (cDept >= 0) b.departmentsText ??= value(r[cDept]);
      if (cPer >= 0) b.hoursPerEmployee ??= parseNumber(r[cPer]);
      if (cEmp >= 0) b.employees ??= parseNumber(r[cEmp]);
      if (cTotal >= 0) b.totalHours ??= parseNumber(r[cTotal]);
      if (cCost >= 0) b.annualCost ??= parseNumber(r[cCost]);
      if (cPct >= 0) b.pctLostTime ??= value(r[cPct]);
      if (cFeas >= 0) b.feasibility ??= value(r[cFeas]);
    }
  }

  // --- Detailed bottleneck sections ---
  for (const sec of bottleneckSections(blocks).map(parseSection)) {
    let b =
      (sec.name ? bottlenecks.find((x) => sameName(x.name, sec.name!)) : undefined) ??
      bottlenecks.find((x) => x.rank === sec.number && !x.whatHappensToday && !x.options.length);
    const hasContent = sec.impact.length || sec.rootCauses.length || sec.options.length || sec.whatHappensToday;
    if (!b) {
      if (!sec.name && !hasContent) continue;
      b = newBottleneck(sec.name ?? `Bottleneck ${sec.number}`, sec.number);
      bottlenecks.push(b);
    }
    if (sec.name && isPlaceholder(b.name)) b.name = sec.name;
    b.summary = sec.summary;
    b.whatHappensToday = sec.whatHappensToday;
    b.impact = sec.impact;
    b.rootCauses = sec.rootCauses;
    b.options = sec.options;
    b.recommendation = sec.recommendation;
    b.departmentsText ??= impactValue(sec.impact, /department|roles/i);
    b.hoursPerEmployee ??= parseNumber(impactValue(sec.impact, /per employee/i));
    b.employees ??= parseNumber(impactValue(sec.impact, /employees/i));
    b.totalHours ??= parseNumber(impactValue(sec.impact, /total hours/i));
    b.annualCost ??= parseNumber(impactValue(sec.impact, /annual cost/i));
  }

  if (!bottlenecks.length) {
    throw new ReportParseError(
      "Couldn't find any filled-in bottlenecks. Starstell reads the \"All bottlenecks measured\" table and the " +
        '"Bottleneck 1/2/3" sections of the Workflow Efficiency Consulting Report. Fill in the template ' +
        '(the blank template only has placeholders) and export it as a PDF.',
    );
  }

  // --- Derived numbers ---
  for (const b of bottlenecks) {
    if (b.totalHours === undefined && b.hoursPerEmployee !== undefined && b.employees !== undefined) {
      b.totalHours = b.hoursPerEmployee * b.employees;
    }
    if (b.annualCost === undefined && b.totalHours !== undefined && hourlyRate && weeks) {
      b.annualCost = b.totalHours * weeks * hourlyRate;
    }
  }

  // --- Link bottlenecks ↔ teams ---
  let unassigned: Team | undefined;
  for (const b of bottlenecks) {
    let linked = resolveTeams(b.departmentsText);
    if (!linked.length) {
      unassigned ??= { id: slug('Unassigned', teamIds), name: 'Unassigned', bottleneckIds: [] };
      linked = [unassigned];
    }
    b.teamIds = linked.map((t) => t.id);
    linked.forEach((t) => t.bottleneckIds.push(b.id));
  }
  if (unassigned) {
    teams.push(unassigned);
    notes.push('Some bottlenecks have no department listed, so they appear under "Unassigned".');
  }

  for (const t of teams) {
    const mine = bottlenecks.filter((b) => b.teamIds.includes(t.id));
    if (t.hoursLost === undefined && mine.length) {
      const sum = mine.reduce((n, b) => n + (b.totalHours ?? 0), 0);
      if (sum > 0) t.hoursLost = sum;
    }
  }

  bottlenecks.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || (b.annualCost ?? 0) - (a.annualCost ?? 0));

  const totalRow = allRows?.find(isTotalRow);
  const sum = (f: (b: Bottleneck) => number | undefined) => {
    const vals = bottlenecks.map(f).filter((v): v is number => v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : undefined;
  };
  const header = allRows?.[0].map((c) => c.toLowerCase()) ?? [];
  const totals = {
    hoursPerWeek: parseNumber(totalRow?.[col(header, /total hours/)]) ?? sum((b) => b.totalHours),
    annualCost: parseNumber(totalRow?.[col(header, /annual cost|cost/)]) ?? sum((b) => b.annualCost),
    employees: parseNumber(totalRow?.[col(header, /employees/)]),
  };

  return {
    version: 1,
    fileName,
    importedAt: new Date().toISOString(),
    client: detail(/^client|company/i),
    title: detail(/report title|^title/i),
    reportDate: detail(/report date|^date/i),
    preparedBy: detail(/prepared by/i),
    preparedFor: detail(/prepared for/i),
    engagementPeriod: detail(/engagement/i),
    executiveSummary,
    decisionRequested,
    assumptions,
    teams,
    bottlenecks,
    totals,
    notes,
  };
}

function sameName(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

function splitNames(text: string): string[] {
  return text
    .split(/,|;|\/|&|\+|\n|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}
