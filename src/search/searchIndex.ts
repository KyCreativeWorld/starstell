/**
 * What the header search can find, and how a query is matched against it.
 *
 * Every result has a short label and detail (what the dropdown shows), optional
 * keywords (other words people might type for it, e.g. "annual cost"), and an
 * optional body of longer text (e.g. a solution's vendors and description) so a
 * tool name like "Google Meet" finds the solution that mentions it.
 */
import type { TabName } from '../components/Sidebar';
import { formatCount, formatHours, formatMoney } from '../report/format';
import { costByTeam, planSummary, solutionKey, sumOf } from '../report/solutions';
import type { Report } from '../report/types';
import { EMP_TEAMS, EMPLOYEES } from '../employees/sampleData';
import { employeeStats } from '../employees/stats';

/** Where a search result takes you. */
export interface SearchTarget {
  tab: TabName;
  teamId?: string;
  bottleneckId?: string;
  /** Solution to scroll to on the Solutions tab. */
  solutionKey?: string;
  /** Employee page to open on the Employees tab. */
  employeeId?: string;
}

export interface SearchResult {
  key: string;
  kind: string;
  label: string;
  detail?: string;
  /** Other words this result should be found by (not shown). */
  keywords?: string;
  /** Longer text, as "Label: text" sections; a match here is shown as a snippet. */
  body?: string[];
  target: SearchTarget;
}

const money = (n: number | undefined) => formatMoney(n, true);
const join = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ');
const section = (label: string, text: string | undefined) => (text?.trim() ? `${label}: ${text.trim()}` : undefined);
const defined = <T>(xs: (T | undefined)[]) => xs.filter((x): x is T => x !== undefined);

const PAGES: SearchResult[] = [
  { key: 'p-dash', kind: 'Page', label: 'Dashboard', detail: 'Cards, charts and chat', keywords: 'home overview', target: { tab: 'home' } },
  { key: 'p-report', kind: 'Page', label: 'Report', detail: 'Constellation, line-up and PDF', keywords: 'teams pdf constellation', target: { tab: 'report' } },
  { key: 'p-bottlenecks', kind: 'Page', label: 'Bottlenecks', detail: 'Every bottleneck at a glance', keywords: 'problems issues annual cost hours lost', target: { tab: 'bottlenecks' } },
  { key: 'p-employees', kind: 'Page', label: 'Employees', detail: 'Day timelines, time lost and deals', keywords: 'people staff team', target: { tab: 'employees' } },
  { key: 'p-timelines', kind: 'Page', label: 'Timelines', detail: 'Average workday by team', keywords: 'workday schedule meetings', target: { tab: 'timelines' } },
  { key: 'p-solutions', kind: 'Page', label: 'Solutions', detail: 'Charts and every solution option', keywords: 'fixes options vendors tools savings payback upfront', target: { tab: 'solutions' } },
  { key: 'p-audit', kind: 'Page', label: 'Audit', detail: 'Audits, checklists and findings', target: { tab: 'audit' } },
  { key: 'p-settings', kind: 'Page', label: 'Settings', detail: 'AI model, report data, Salesforce, profile', target: { tab: 'settings' } },
  { key: 'p-folder', kind: 'Setting', label: 'Data folder link', detail: 'CSV files for the report', target: { tab: 'settings' } },
  { key: 'p-ai', kind: 'Setting', label: 'AI API key', keywords: 'model claude anthropic', target: { tab: 'settings' } },
  { key: 'p-profile', kind: 'Setting', label: 'Profile', detail: 'Your name and role', target: { tab: 'settings' } },
];

/** Sample employee data: always available, with or without a report. */
function employeeItems(): SearchResult[] {
  const stats = EMPLOYEES.map((e) => employeeStats(e.id));
  const hours = stats.reduce((s, x) => s + x.hoursLostPerWeek, 0);
  const cost = stats.reduce((s, x) => s + x.costPerYear, 0);
  const items: SearchResult[] = [
    {
      key: 'm-emp-cost',
      kind: 'Metric',
      label: `Employee lost-time cost · ${money(cost)}/yr`,
      detail: `${EMPLOYEES.length} employees · ${hours} h/wk lost`,
      keywords: 'annual cost total cost yearly hours lost employees',
      target: { tab: 'employees' },
    },
  ];
  for (const t of EMP_TEAMS) {
    const members = stats.filter((s) => s.employee.teamId === t.id);
    items.push({
      key: `et-${t.id}`,
      kind: 'Team',
      label: t.name,
      detail: join(`${members.length} employees`, 'Workday timelines'),
      keywords: 'team timelines',
      body: [section('Members', members.map((m) => m.employee.name).join(', '))!],
      target: { tab: 'timelines' },
    });
  }
  for (const s of stats) {
    items.push({
      key: `e-${s.employee.id}`,
      kind: 'Employee',
      label: s.employee.name,
      detail: join(s.employee.role, s.teamName, `${money(s.costPerYear)}/yr lost`),
      keywords: 'employee person annual cost hours lost',
      body: defined([
        section('Bottlenecks', s.bottlenecks.map((b) => b.name).join(', ')),
        section('Deals', s.deals.map((d) => d.name).join(', ')),
        section('Projects', s.projects.map((p) => p.name).join(', ')),
      ]),
      target: { tab: 'employees', employeeId: s.employee.id },
    });
  }
  return items;
}

/** Headline numbers from the report, each pointing at the screen that shows it. */
function metricItems(report: Report): SearchResult[] {
  const annualCost = report.totals.annualCost ?? sumOf(report.bottlenecks.map((b) => b.annualCost));
  const hours = report.totals.hoursPerWeek ?? sumOf(report.bottlenecks.map((b) => b.totalHours));
  const employees = report.totals.employees ?? sumOf(report.teams.map((t) => t.employeesAffected ?? t.headcount));
  const s = planSummary(report);
  const plan = s.planWord.toLowerCase();
  const payback = s.payback === undefined ? undefined : s.payback < 1 ? '< 1 month' : `${Math.round(s.payback)} months`;

  const metrics: (SearchResult | false)[] = [
    annualCost !== undefined && {
      key: 'm-cost',
      kind: 'Metric',
      label: `Total annual cost · ${money(annualCost)}/yr`,
      detail: `Time lost to ${report.bottlenecks.length} ${report.bottlenecks.length === 1 ? 'bottleneck' : 'bottlenecks'}`,
      keywords: 'annual cost total cost yearly money spend bottleneck',
      target: { tab: 'bottlenecks' },
    },
    hours !== undefined && {
      key: 'm-hours',
      kind: 'Metric',
      label: `Hours lost · ${formatHours(hours)}`,
      detail: 'Across all teams',
      keywords: 'hours lost time wasted weekly',
      target: { tab: 'bottlenecks' },
    },
    employees !== undefined && {
      key: 'm-employees',
      kind: 'Metric',
      label: `Employees affected · ${formatCount(employees)}`,
      detail: `Across ${report.teams.length} teams`,
      keywords: 'employees people headcount staff affected',
      target: { tab: 'report' },
    },
    s.upfront !== undefined && {
      key: 'm-upfront',
      kind: 'Metric',
      label: `Upfront investment · ${money(s.upfront)}`,
      detail: `One-time cost of the ${plan} solutions`,
      keywords: 'upfront cost investment one-time price budget',
      target: { tab: 'solutions' },
    },
    s.savings !== undefined && {
      key: 'm-savings',
      kind: 'Metric',
      label: `Annual savings · ${money(s.savings)}/yr`,
      detail: `From the ${plan} solutions`,
      keywords: 'annual savings save yearly',
      target: { tab: 'solutions' },
    },
    payback !== undefined && {
      key: 'm-payback',
      kind: 'Metric',
      label: `Payback · ${payback}`,
      detail: `Until the ${plan} solutions pay for themselves`,
      keywords: 'payback roi return break even',
      target: { tab: 'solutions' },
    },
    {
      key: 'm-plan',
      kind: 'Metric',
      label: `${s.planWord} solutions · ${s.plan.length}`,
      detail: `Out of ${s.rows.length} options in the report`,
      keywords: 'recommended solutions fixes count plan',
      target: { tab: 'solutions' },
    },
  ];
  return metrics.filter((m): m is SearchResult => !!m);
}

export function buildIndex(report: Report | null): SearchResult[] {
  if (!report) return [...PAGES, ...employeeItems()];

  const items: SearchResult[] = metricItems(report);
  const teamCost = new Map(costByTeam(report).map((t) => [t.id, t.value]));

  for (const t of report.teams) {
    const cost = teamCost.get(t.id);
    items.push({
      key: `t-${t.id}`,
      kind: 'Team',
      label: t.name,
      detail: join(cost !== undefined && `${money(cost)}/yr`, formatHours(t.hoursLost)),
      keywords: 'team annual cost hours lost',
      body: [
        section(
          'Bottlenecks',
          t.bottleneckIds
            .map((id) => report.bottlenecks.find((b) => b.id === id)?.name)
            .filter(Boolean)
            .join(', '),
        ),
      ].filter((x): x is string => !!x),
      target: { tab: 'report', teamId: t.id },
    });
  }

  for (const b of report.bottlenecks) {
    const teamId = b.teamIds[0];
    items.push({
      key: `b-${b.id}`,
      kind: 'Bottleneck',
      label: b.name,
      detail: join(b.annualCost !== undefined && `${money(b.annualCost)}/yr`, b.departmentsText),
      keywords: 'bottleneck problem annual cost hours lost',
      body: defined([
        section('Summary', b.summary),
        section('Today', b.whatHappensToday),
        section('Root causes', b.rootCauses.join('; ')),
        ...b.impact.map((r) => section(r.label, r.value)),
        section('Recommendation', b.recommendation),
      ]),
      target: teamId ? { tab: 'report', teamId, bottleneckId: b.id } : { tab: 'report' },
    });
    for (const o of b.options) {
      items.push({
        key: `o-${b.id}-${o.letter}`,
        kind: o.recommended ? 'Recommended fix' : 'Solution',
        label: o.name,
        detail: join(b.name, o.annualSavings && `Saves ${o.annualSavings}`),
        keywords: 'solution fix option',
        body: defined([section('Type', o.type), ...o.rows.map((r) => section(r.label, r.value))]),
        target: { tab: 'solutions', solutionKey: solutionKey(b, o) },
      });
    }
  }
  return [...items, ...PAGES, ...employeeItems()];
}

// ---- matching ----

/** "teams" → "team", "solutions" → "solution", so plurals find singular labels. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const has = (hay: string, w: string) => hay.includes(w) || hay.includes(stem(w));

/** Up to ~90 characters of a body section, centered on the first query word. */
function snippet(text: string, words: string[]): string {
  const lower = text.toLowerCase();
  const hits = words.map((w) => lower.indexOf(stem(w))).filter((i) => i >= 0);
  const at = hits.length ? Math.min(...hits) : 0;
  const colon = text.indexOf(': ');
  const label = colon > 0 && colon < 40 ? text.slice(0, colon + 2) : '';
  const rest = label ? text.slice(label.length) : text;
  const start = Math.max(0, at - label.length - 30);
  const cut = rest.slice(start, start + 90);
  return `${label}${start > 0 ? '…' : ''}${cut}${start + 90 < rest.length ? '…' : ''}`;
}

/**
 * Every result containing all the query's words, best first:
 * label matches, then kind/detail/keyword matches, then matches in the body text
 * (shown with a snippet of where the words were found).
 */
export function search(index: SearchResult[], query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  return index
    .map((r, order) => {
      const label = r.label.toLowerCase();
      const head = `${label} ${r.kind} ${r.detail ?? ''} ${r.keywords ?? ''}`.toLowerCase();
      const body = (r.body ?? []).join('\n').toLowerCase();
      if (!words.every((w) => has(head, w) || has(body, w))) return null;

      let score: number;
      let result = r;
      if (label.startsWith(q) || label.startsWith(stem(q))) score = 0;
      else if (words.every((w) => has(label, w))) score = 1;
      else if (words.every((w) => has(head, w))) score = 2;
      else {
        score = 3;
        // Show where in the body it matched, so "Google Meet" explains why a solution came up.
        const hit = r.body?.find((s) => words.some((w) => has(s.toLowerCase(), w)));
        if (hit) result = { ...r, detail: snippet(hit, words) };
      }
      return { r: result, score, order };
    })
    .filter((x): x is { r: SearchResult; score: number; order: number } => !!x)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map((x) => x.r);
}
