/** The pages inside the Audit section, shared by the sidebar dropdown and the Audit screen. */
export type AuditPage = 'new' | 'history' | 'checklists' | 'findings';

export const AUDIT_PAGES: { key: AuditPage; title: string; short: string; description: string }[] = [
  { key: 'new', title: 'Start a new audit', short: 'New audit', description: 'Walk through a guided review of a team or process.' },
  { key: 'history', title: 'Audit history', short: 'History', description: 'Past audits and their results.' },
  { key: 'checklists', title: 'Checklists', short: 'Checklists', description: 'The questions and criteria each audit uses.' },
  { key: 'findings', title: 'Findings', short: 'Findings', description: 'Issues raised by audits and their follow-up status.' },
];
