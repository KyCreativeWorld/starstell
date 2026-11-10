/** Structured data read from a Workflow Efficiency Consulting Report PDF. */

export interface LabeledValue {
  label: string;
  value: string;
}

export interface SolutionOption {
  /** "A", "B", "C" … */
  letter: string;
  name: string;
  type?: string;
  howItSolves?: string;
  vendors?: string;
  upfrontCost?: string;
  ongoingCost?: string;
  implementationTime?: string;
  effort?: string;
  hoursSaved?: string;
  annualSavings?: string;
  payback?: string;
  governanceRisk?: string;
  risks?: string;
  /** Every criterion row, in the report's order (includes the fields above). */
  rows: LabeledValue[];
  /** Named in the report's main recommendation. */
  recommended: boolean;
  /** Mentioned later as an add-on / phase 2, but not the main pick. */
  alsoSuggested: boolean;
}

export interface Bottleneck {
  id: string;
  rank?: number;
  name: string;
  /** Team ids this bottleneck affects. */
  teamIds: string[];
  /** Raw "Department(s)" / "Roles / departments affected" text. */
  departmentsText?: string;
  hoursPerEmployee?: number;
  employees?: number;
  totalHours?: number;
  annualCost?: number;
  pctLostTime?: string;
  feasibility?: string;
  /** Opening sentence of the bottleneck section. */
  summary?: string;
  whatHappensToday?: string;
  impact: LabeledValue[];
  rootCauses: string[];
  options: SolutionOption[];
  recommendation?: string;
}

export interface Team {
  id: string;
  name: string;
  headcount?: number;
  employeesAffected?: number;
  hoursLost?: number;
  pctTime?: string;
  bottleneckIds: string[];
}

export interface Report {
  /** Bump when the shape changes so stale saved reports are re-imported. */
  version: 1;
  fileName: string;
  importedAt: string;
  client?: string;
  title?: string;
  reportDate?: string;
  preparedBy?: string;
  preparedFor?: string;
  engagementPeriod?: string;
  executiveSummary?: string;
  decisionRequested?: string;
  assumptions: LabeledValue[];
  teams: Team[];
  bottlenecks: Bottleneck[];
  totals: {
    hoursPerWeek?: number;
    annualCost?: number;
    employees?: number;
  };
  /** Things the reader should know, e.g. data that couldn't be matched. */
  notes: string[];
}
