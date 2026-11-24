/**
 * SAMPLE workday timelines: what an employee's day looks like, block by block.
 * Generated from a seed (employee + date), so a given day always looks the same.
 * "Lost to bottlenecks" time comes from the employee's sample bottlenecks, so the
 * timeline agrees with their hours-lost numbers.
 */
import { EMPLOYEE_BOTTLENECKS, EMPLOYEE_BY_ID } from './sampleData';

export type ActivityKind = 'focus' | 'meeting' | 'admin' | 'lost';

/** Fixed order: also the order of the chart's colors and legend. */
export const ACTIVITY_KINDS: { key: ActivityKind; label: string }[] = [
  { key: 'focus', label: 'Focused work' },
  { key: 'meeting', label: 'Meetings' },
  { key: 'admin', label: 'Admin & email' },
  { key: 'lost', label: 'Lost to bottlenecks' },
];

export interface DayBlock {
  /** Minutes after midnight. */
  start: number;
  end: number;
  kind: ActivityKind;
  label: string;
}

export const DAY_START = 8 * 60;
export const DAY_END = 17 * 60;
export const LUNCH_START = 12 * 60;
export const LUNCH_END = 12 * 60 + 30;
const WORK_MINUTES = DAY_END - DAY_START - (LUNCH_END - LUNCH_START);
/** How many past workdays the typical day averages. */
export const TYPICAL_SAMPLE_DAYS = 20;

// ---- seeded random ----
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: string) {
  let s = hash(seed) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
type Rand = () => number;
const between = (r: Rand, lo: number, hi: number) => lo + r() * (hi - lo);
const pick = <T>(r: Rand, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const to15 = (m: number) => Math.max(0, Math.round(m / 15) * 15);

// ---- role profiles ----
const PROFILE: Record<string, { meeting: number; admin: number; focus: string[] }> = {
  sales: { meeting: 0.2, admin: 0.14, focus: ['Prospecting', 'Client demos', 'Proposal writing', 'Follow-ups'] },
  ops: { meeting: 0.16, admin: 0.18, focus: ['Process work', 'Vendor coordination', 'Scheduling', 'Inventory review'] },
  finance: { meeting: 0.12, admin: 0.22, focus: ['Reconciliation', 'Reporting', 'Forecasting', 'Invoice review'] },
  cs: { meeting: 0.14, admin: 0.16, focus: ['Support tickets', 'Customer calls', 'Onboarding sessions', 'Help articles'] },
};
const MEETINGS = ['1:1', 'Client call', 'Planning', 'Pipeline review', 'Cross-team sync', 'Training'];
const ADMIN = ['Email', 'Data entry', 'Expense reports', 'CRM updates', 'Scheduling'];

function profileOf(employeeId: string) {
  const e = EMPLOYEE_BY_ID[employeeId];
  const base = PROFILE[e?.teamId ?? ''] ?? PROFILE.ops;
  const manages = /Manager|Lead|Controller/.test(e?.role ?? '');
  return { ...base, meeting: base.meeting + (manages ? 0.12 : 0) };
}

/** Average minutes per workday lost to this employee's bottlenecks. */
export function lostMinutesPerDay(employeeId: string): number {
  const weekly = EMPLOYEE_BOTTLENECKS.filter((b) => b.employeeId === employeeId).reduce((s, b) => s + b.hoursPerWeek, 0);
  return (weekly * 60) / 5;
}

type Allocation = Record<ActivityKind, number>;

/** Minutes per kind for one day; always adds up to a full workday. */
function allocate(employeeId: string, r: Rand | null): Allocation {
  const p = profileOf(employeeId);
  const jitter = () => (r ? between(r, 0.6, 1.4) : 1);
  const lost = to15(lostMinutesPerDay(employeeId) * jitter());
  const meeting = to15(WORK_MINUTES * p.meeting * jitter());
  const admin = to15(WORK_MINUTES * p.admin * jitter());
  const focus = Math.max(60, WORK_MINUTES - lost - meeting - admin);
  return normalize({ focus, meeting, admin, lost });
}

/** Trims focus time (then admin) so the day is exactly one workday long. */
function normalize(a: Allocation): Allocation {
  const out = { ...a };
  let over = out.focus + out.meeting + out.admin + out.lost - WORK_MINUTES;
  for (const k of ['focus', 'admin', 'meeting'] as ActivityKind[]) {
    if (over <= 0) break;
    const cut = Math.min(over, Math.max(0, out[k] - 30));
    out[k] -= cut;
    over -= cut;
  }
  if (over < 0) out.focus -= over; // fill a short day with focus time
  return out;
}

/** Breaks each kind's minutes into blocks, orders them, and lays them out around lunch. */
function layout(employeeId: string, alloc: Allocation, r: Rand): DayBlock[] {
  const p = profileOf(employeeId);
  const bottlenecks = EMPLOYEE_BOTTLENECKS.filter((b) => b.employeeId === employeeId);
  const sizes: Record<ActivityKind, [number, number]> = {
    focus: [45, 120],
    meeting: [15, 60],
    admin: [15, 45],
    lost: [15, 45],
  };
  const chunks: { kind: ActivityKind; minutes: number; label: string }[] = [];
  let lostIndex = 0;
  for (const { key } of ACTIVITY_KINDS) {
    let left = alloc[key];
    let first = true;
    while (left > 0) {
      const [lo, hi] = sizes[key];
      const m = Math.min(left, to15(between(r, lo, hi)) || 15);
      left -= m;
      let label: string;
      if (key === 'meeting') label = first ? 'Team standup' : pick(r, MEETINGS);
      else if (key === 'focus') label = pick(r, p.focus);
      else if (key === 'admin') label = pick(r, ADMIN);
      else label = bottlenecks.length ? bottlenecks[lostIndex++ % bottlenecks.length].name : 'Waiting on others';
      chunks.push({ kind: key, minutes: key === 'meeting' && first ? Math.min(m, 15) : m, label });
      if (key === 'meeting' && first && m > 15) left += m - 15; // standup is 15 minutes
      first = false;
    }
  }

  // Standup opens the day; everything else is shuffled.
  const standup = chunks.findIndex((c) => c.label === 'Team standup');
  const opening = standup >= 0 ? chunks.splice(standup, 1) : [];
  for (let i = chunks.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
  }

  const blocks: DayBlock[] = [];
  let t = DAY_START;
  const push = (kind: ActivityKind, label: string, start: number, end: number) => {
    const prev = blocks[blocks.length - 1];
    if (prev && prev.end === start && prev.kind === kind && prev.label === label) prev.end = end;
    else blocks.push({ start, end, kind, label });
  };
  for (const ch of [...opening, ...chunks]) {
    let left = ch.minutes;
    while (left > 0) {
      if (t >= LUNCH_START && t < LUNCH_END) t = LUNCH_END;
      const limit = t < LUNCH_START ? LUNCH_START : DAY_END;
      const end = Math.min(t + left, limit);
      if (end <= t) break;
      push(ch.kind, ch.label, t, end);
      left -= end - t;
      t = end;
    }
  }
  return blocks;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const isWorkday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

/** One specific day, or null on weekends. */
export function dayFor(employeeId: string, date: Date): DayBlock[] | null {
  if (!isWorkday(date)) return null;
  const key = `${employeeId}|${dateKey(date)}`;
  return layout(employeeId, allocate(employeeId, rng(key)), rng(`${key}|layout`));
}

/** The most recent `n` workdays before `from` (today isn't over yet), newest first. */
export function recentWorkdays(n: number, from = new Date()): Date[] {
  const out: Date[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (out.length < n) {
    d.setDate(d.getDate() - 1);
    if (isWorkday(d)) out.push(new Date(d));
  }
  return out;
}

/** An average day: each kind's average minutes over recent workdays, laid out in a typical order. */
export function typicalDay(employeeId: string): DayBlock[] {
  const days = recentWorkdays(TYPICAL_SAMPLE_DAYS);
  const sum: Allocation = { focus: 0, meeting: 0, admin: 0, lost: 0 };
  for (const d of days) {
    const a = allocate(employeeId, rng(`${employeeId}|${dateKey(d)}`));
    for (const { key } of ACTIVITY_KINDS) sum[key] += a[key];
  }
  const avg = normalize({
    focus: to15(sum.focus / days.length),
    meeting: to15(sum.meeting / days.length),
    admin: to15(sum.admin / days.length),
    lost: to15(sum.lost / days.length),
  });
  return layout(employeeId, avg, rng(`${employeeId}|typical`));
}

/** Minutes per kind in a day. */
export function minutesByKind(blocks: DayBlock[]): Allocation {
  const out: Allocation = { focus: 0, meeting: 0, admin: 0, lost: 0 };
  for (const b of blocks) out[b.kind] += b.end - b.start;
  return out;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
}
