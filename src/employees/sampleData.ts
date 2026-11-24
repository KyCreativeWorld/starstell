/**
 * SAMPLE employee data for the dashboard's Employee data cards.
 * Placeholder until a real source (CSV folder, Salesforce, …) is wired up.
 * Everything is generated from a fixed seed so it looks the same on every launch.
 */

export interface EmpTeam {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  teamId: string;
  /** Sample fully loaded cost per hour (pay + benefits), used to estimate the cost of lost time. */
  hourlyCost: number;
}

export type DealStage = 'Won' | 'Negotiation' | 'Proposal' | 'Lost';

export interface Deal {
  id: string;
  employeeId: string;
  name: string;
  value: number;
  stage: DealStage;
  /** ISO date (YYYY-MM-DD). */
  closeDate: string;
}

export type MilestoneStatus = 'Done' | 'On track' | 'At risk' | 'Late';

export interface Milestone {
  id: string;
  employeeId: string;
  name: string;
  /** Month index into CONTRIBUTION_MONTHS (0 = oldest). */
  start: number;
  end: number;
  status: MilestoneStatus;
}

export interface EmployeeBottleneck {
  employeeId: string;
  name: string;
  hoursPerWeek: number;
}

/** The six months the sample timelines and contributions cover, oldest first. */
export const MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

export const EMP_TEAMS: EmpTeam[] = [
  { id: 'sales', name: 'Sales' },
  { id: 'ops', name: 'Operations' },
  { id: 'finance', name: 'Finance' },
  { id: 'cs', name: 'Customer Success' },
];

export const EMPLOYEES: Employee[] = [
  { id: 'e1', name: 'Avery Chen', role: 'Account Executive', teamId: 'sales', hourlyCost: 62 },
  { id: 'e2', name: 'Jordan Patel', role: 'Account Executive', teamId: 'sales', hourlyCost: 62 },
  { id: 'e3', name: 'Sam Okafor', role: 'Sales Manager', teamId: 'sales', hourlyCost: 78 },
  { id: 'e4', name: 'Riley Novak', role: 'Sales Development Rep', teamId: 'sales', hourlyCost: 41 },
  { id: 'e5', name: 'Morgan Reyes', role: 'Operations Lead', teamId: 'ops', hourlyCost: 70 },
  { id: 'e6', name: 'Casey Lindqvist', role: 'Process Analyst', teamId: 'ops', hourlyCost: 55 },
  { id: 'e7', name: 'Taylor Brooks', role: 'Logistics Coordinator', teamId: 'ops', hourlyCost: 44 },
  { id: 'e8', name: 'Quinn Adeyemi', role: 'Controller', teamId: 'finance', hourlyCost: 88 },
  { id: 'e9', name: 'Drew Kowalski', role: 'Financial Analyst', teamId: 'finance', hourlyCost: 58 },
  { id: 'e10', name: 'Harper Moreau', role: 'Accounts Payable', teamId: 'finance', hourlyCost: 40 },
  { id: 'e11', name: 'Rowan Silva', role: 'CS Manager', teamId: 'cs', hourlyCost: 66 },
  { id: 'e12', name: 'Emerson Hale', role: 'Support Specialist', teamId: 'cs', hourlyCost: 38 },
  { id: 'e13', name: 'Skyler Nakamura', role: 'Onboarding Specialist', teamId: 'cs', hourlyCost: 45 },
];

// ---- deterministic generator ----
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const rand = rng(20261123);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));

const COMPANIES = ['Northwind', 'Bluefin', 'Cedar & Co', 'Halcyon', 'Ironbridge', 'Lumen Labs', 'Meridian', 'Orchard', 'Pinecrest', 'Quarry Point', 'Redwood', 'Summit Health'];
const DEAL_KINDS = ['renewal', 'expansion', 'new license', 'pilot'];
const PROJECTS = ['Quarterly close', 'Vendor onboarding', 'CRM cleanup', 'Pricing refresh', 'Process mapping', 'Training rollout', 'Audit prep', 'Forecast model', 'Help center update', 'Contract review'];
const BOTTLENECKS = ['Manual data entry', 'Waiting on approvals', 'Duplicate reporting', 'Searching for files', 'Status meetings', 'Re-keying invoices'];
const STATUSES: MilestoneStatus[] = ['Done', 'Done', 'On track', 'On track', 'At risk', 'Late'];

export const DEALS: Deal[] = [];
export const MILESTONES: Milestone[] = [];
export const EMPLOYEE_BOTTLENECKS: EmployeeBottleneck[] = [];
/** Contributions (tasks, tickets, documents…) per employee per month, aligned with MONTHS. */
export const CONTRIBUTIONS: Record<string, number[]> = {};

for (const e of EMPLOYEES) {
  const dealCount = e.teamId === 'sales' ? between(4, 7) : e.teamId === 'cs' ? between(1, 3) : between(0, 1);
  for (let i = 0; i < dealCount; i++) {
    const month = between(6, 12);
    DEALS.push({
      id: `${e.id}-d${i}`,
      employeeId: e.id,
      name: `${pick(COMPANIES)} ${pick(DEAL_KINDS)}`,
      value: between(8, 120) * 1000,
      stage: month <= 11 ? pick(['Won', 'Won', 'Lost'] as const) : pick(['Negotiation', 'Proposal'] as const),
      closeDate: `2026-${String(month).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`,
    });
  }

  const projectCount = between(2, 3);
  for (let i = 0; i < projectCount; i++) {
    const start = between(0, 4);
    MILESTONES.push({
      id: `${e.id}-m${i}`,
      employeeId: e.id,
      name: pick(PROJECTS),
      start,
      end: Math.min(MONTHS.length - 1, start + between(0, 2)),
      status: pick(STATUSES),
    });
  }

  const base = between(12, 30);
  CONTRIBUTIONS[e.id] = MONTHS.map(() => Math.max(0, base + between(-6, 8)));

  const bnCount = between(1, 3);
  const used = new Set<string>();
  for (let i = 0; i < bnCount; i++) {
    const name = pick(BOTTLENECKS);
    if (used.has(name)) continue;
    used.add(name);
    EMPLOYEE_BOTTLENECKS.push({ employeeId: e.id, name, hoursPerWeek: between(1, 6) });
  }
}

export const EMPLOYEE_BY_ID = Object.fromEntries(EMPLOYEES.map((e) => [e.id, e])) as Record<string, Employee>;
export const EMP_TEAM_BY_ID = Object.fromEntries(EMP_TEAMS.map((t) => [t.id, t])) as Record<string, EmpTeam>;
