/** Per-employee summary numbers built from the SAMPLE employee data. */
import {
  CONTRIBUTIONS,
  DEALS,
  EMP_TEAM_BY_ID,
  EMPLOYEE_BOTTLENECKS,
  EMPLOYEE_BY_ID,
  MILESTONES,
  type Deal,
  type Employee,
  type Milestone,
} from './sampleData';

/** Working weeks per year, used to turn weekly hours into a yearly cost. */
export const WORK_WEEKS = 48;

export interface EmployeeStats {
  employee: Employee;
  teamName: string;
  hoursLostPerWeek: number;
  /** Estimated yearly cost of the lost hours (hours × weeks × sample hourly cost). */
  costPerYear: number;
  /** Share of a 40-hour week lost. */
  pctLost: number;
  bottlenecks: { name: string; hoursPerWeek: number; costPerYear: number }[];
  deals: Deal[];
  wonValue: number;
  openValue: number;
  winRate: number | undefined;
  contributions6mo: number;
  projects: Milestone[];
}

export function employeeStats(id: string): EmployeeStats {
  const employee = EMPLOYEE_BY_ID[id];
  const bns = EMPLOYEE_BOTTLENECKS.filter((b) => b.employeeId === id)
    .map((b) => ({
      name: b.name,
      hoursPerWeek: b.hoursPerWeek,
      costPerYear: b.hoursPerWeek * WORK_WEEKS * employee.hourlyCost,
    }))
    .sort((a, b) => b.hoursPerWeek - a.hoursPerWeek);
  const hours = bns.reduce((s, b) => s + b.hoursPerWeek, 0);
  const deals = DEALS.filter((d) => d.employeeId === id).sort((a, b) => b.closeDate.localeCompare(a.closeDate));
  const won = deals.filter((d) => d.stage === 'Won');
  const lost = deals.filter((d) => d.stage === 'Lost');
  const open = deals.filter((d) => d.stage === 'Negotiation' || d.stage === 'Proposal');
  const sum = (xs: Deal[]) => xs.reduce((s, d) => s + d.value, 0);
  return {
    employee,
    teamName: EMP_TEAM_BY_ID[employee.teamId]?.name ?? '',
    hoursLostPerWeek: hours,
    costPerYear: hours * WORK_WEEKS * employee.hourlyCost,
    pctLost: hours / 40,
    bottlenecks: bns,
    deals,
    wonValue: sum(won),
    openValue: sum(open),
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : undefined,
    contributions6mo: (CONTRIBUTIONS[id] ?? []).reduce((a, b) => a + b, 0),
    projects: MILESTONES.filter((m) => m.employeeId === id),
  };
}
