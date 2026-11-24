/**
 * Per-card settings for the Employee data cards (who the card shows and which data).
 * Each card on the dashboard has its own entry, keyed by its layout key, so the
 * same kind of card can be added several times with different selections.
 */
import { EMP_TEAMS, EMPLOYEES } from '../employees/sampleData';
import { updateCardSettings, useCardSettings } from './cardSettings';
import type { CardId } from './cards';

export type EmployeeDataKind = 'timelines' | 'deals' | 'contributions' | 'bottlenecks';

export const DATA_KINDS: { key: EmployeeDataKind; label: string }[] = [
  { key: 'timelines', label: 'Timelines' },
  { key: 'deals', label: 'Deals' },
  { key: 'contributions', label: 'Contributions' },
  { key: 'bottlenecks', label: 'Bottlenecks' },
];

export type EmployeeScope = 'team' | 'group' | 'one';

/** Which Employee data card shows what kind of selection. */
export const EMPLOYEE_SCOPE: Partial<Record<CardId, EmployeeScope>> = {
  employeeTeam: 'team',
  employeeGroup: 'group',
  employeeOne: 'one',
};

export interface EmployeeCardConfig {
  data: EmployeeDataKind;
  /** scope 'team' */
  teamId?: string;
  /** scope 'group' and 'one' (one uses the first id). */
  employeeIds?: string[];
}

export function defaultConfig(scope: EmployeeScope): EmployeeCardConfig {
  if (scope === 'team') return { data: 'deals', teamId: EMP_TEAMS[0].id };
  if (scope === 'group') return { data: 'contributions', employeeIds: EMPLOYEES.slice(0, 3).map((e) => e.id) };
  return { data: 'deals', employeeIds: [EMPLOYEES[0].id] };
}

export function setEmployeeCardConfig(key: string, next: EmployeeCardConfig) {
  updateCardSettings(key, { ...next });
}

/** The card's saved settings, filled in with the defaults for its kind. */
export function useEmployeeCardConfig(key: string, scope: EmployeeScope): EmployeeCardConfig {
  const saved = useCardSettings<EmployeeCardConfig>(key);
  return { ...defaultConfig(scope), ...saved };
}
