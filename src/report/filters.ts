import type { Bottleneck } from './types';

export type Feasibility = 'High' | 'Med' | 'Low';
export const FEASIBILITY_LEVELS: Feasibility[] = ['High', 'Med', 'Low'];
export const MIN_COST_STEPS = [0, 50_000, 100_000, 200_000];

export interface ReportFilters {
  /** Teams whose clusters are hidden. */
  hiddenTeams: string[];
  /** Fix feasibility levels to show. */
  feasibility: Feasibility[];
  /** Only bottlenecks the report gives solutions for. */
  solutionsOnly: boolean;
  /** Minimum annual cost in dollars (0 = any). */
  minCost: number;
}

export const DEFAULT_FILTERS: ReportFilters = {
  hiddenTeams: [],
  feasibility: FEASIBILITY_LEVELS,
  solutionsOnly: false,
  minCost: 0,
};

export function feasibilityLevel(text: string | undefined): Feasibility | undefined {
  if (!text) return undefined;
  if (/high/i.test(text)) return 'High';
  if (/med/i.test(text)) return 'Med';
  if (/low/i.test(text)) return 'Low';
  return undefined;
}

export function hasSolutions(b: Bottleneck): boolean {
  return b.options.length > 0;
}

/** Whether a bottleneck passes the bottleneck filters (team visibility is separate). */
export function matchesFilters(b: Bottleneck, f: ReportFilters): boolean {
  const level = feasibilityLevel(b.feasibility);
  if (level && !f.feasibility.includes(level)) return false;
  if (f.solutionsOnly && !hasSolutions(b)) return false;
  if (f.minCost > 0 && (b.annualCost === undefined || b.annualCost < f.minCost)) return false;
  return true;
}

export function filtersActive(f: ReportFilters): boolean {
  return (
    f.hiddenTeams.length > 0 ||
    f.feasibility.length !== FEASIBILITY_LEVELS.length ||
    f.solutionsOnly ||
    f.minCost > 0
  );
}
