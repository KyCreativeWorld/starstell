/** Numbers derived from a report's solution options, for the Solutions tab charts. */
import { parseNumber } from './parseReport';
import type { Bottleneck, Report, SolutionOption } from './types';

export interface SolutionRow {
  /** Stable id: "<bottleneck id>:<option letter>". */
  key: string;
  bottleneck: Bottleneck;
  option: SolutionOption;
  upfront?: number;
  /** Ongoing cost per year. */
  ongoing?: number;
  /** Savings per year. */
  savings?: number;
}

export function solutionKey(b: Bottleneck, o: SolutionOption): string {
  return `${b.id}:${o.letter}`;
}

/** Dollar amount from report text, converted to per-year when it says per month / per week. */
function perYear(text: string | undefined): number | undefined {
  const n = parseNumber(text);
  if (n === undefined) return undefined;
  if (/\/\s*mo|per\s+month|monthly|\bmo\b/i.test(text!)) return n * 12;
  if (/\/\s*w(ee)?k|per\s+week|weekly/i.test(text!)) return n * 52;
  return n;
}

export function solutionRows(report: Report): SolutionRow[] {
  return report.bottlenecks.flatMap((b) =>
    b.options.map((o) => ({
      key: solutionKey(b, o),
      bottleneck: b,
      option: o,
      upfront: parseNumber(o.upfrontCost),
      ongoing: perYear(o.ongoingCost),
      savings: perYear(o.annualSavings),
    })),
  );
}

/** Annual bottleneck cost per team. A bottleneck shared by several teams is split evenly. */
export function costByTeam(report: Report): { id: string; name: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const b of report.bottlenecks) {
    if (b.annualCost === undefined || !b.teamIds.length) continue;
    const share = b.annualCost / b.teamIds.length;
    for (const id of b.teamIds) totals.set(id, (totals.get(id) ?? 0) + share);
  }
  return report.teams
    .map((t) => ({ id: t.id, name: t.name, value: totals.get(t.id) ?? 0 }))
    .filter((t) => t.value > 0)
    .sort((a, b) => b.value - a.value);
}

/**
 * Cumulative net savings of a set of solutions, month by month: savings minus
 * ongoing costs, starting from minus the upfront cost.
 */
export function savingsCurve(rows: SolutionRow[], months = 36): { month: number; value: number }[] {
  const priced = rows.filter((r) => r.savings !== undefined);
  if (!priced.length) return [];
  const upfront = priced.reduce((a, r) => a + (r.upfront ?? 0), 0);
  const netPerMonth = priced.reduce((a, r) => a + ((r.savings ?? 0) - (r.ongoing ?? 0)) / 12, 0);
  return Array.from({ length: months + 1 }, (_, m) => ({ month: m, value: -upfront + netPerMonth * m }));
}

/** First month the curve reaches zero (fractional), or undefined if it never does. */
export function paybackMonth(curve: { month: number; value: number }[]): number | undefined {
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (a.value < 0 && b.value >= 0) return a.month + -a.value / (b.value - a.value);
    if (i === 1 && a.value >= 0) return 0;
  }
  return undefined;
}

export function sumOf(ns: (number | undefined)[]): number | undefined {
  const v = ns.filter((n): n is number => n !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) : undefined;
}

/**
 * The plan the charts describe: the recommended solutions, or every solution
 * when the report recommends none.
 */
export function planSummary(report: Report) {
  const rows = solutionRows(report);
  const recommended = rows.filter((r) => r.option.recommended);
  const plan = recommended.length ? recommended : rows;
  const curve = savingsCurve(plan);
  return {
    rows,
    recommended,
    plan,
    /** "Recommended" or "All", for chart titles. */
    planWord: recommended.length ? 'Recommended' : 'All',
    upfront: sumOf(plan.map((r) => r.upfront)),
    savings: sumOf(plan.map((r) => r.savings)),
    curve,
    payback: paybackMonth(curve),
  };
}
