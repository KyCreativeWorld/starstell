/** The dashboard's card catalog and the saved layout (which cards show, in what order). */
import { useEffect, useState } from 'react';
import { storage, STORAGE_KEYS } from '../storage';

/**
 * Card footprint on the grid, as columns × rows. The grid has 4 columns on wide
 * screens and 2 on narrow ones (4-wide cards then fill the full width).
 */
export type CardSize = '1x1' | '2x1' | '2x2' | '4x2' | '4x4';

export const CARD_SIZES: CardSize[] = ['1x1', '2x1', '2x2', '4x2', '4x4'];

export function spanOf(size: CardSize): { cols: number; rows: number } {
  const [cols, rows] = size.split('x').map(Number);
  return { cols, rows };
}

export type CardId =
  | 'recommendedFixes'
  | 'upfront'
  | 'savings'
  | 'payback'
  | 'annualCost'
  | 'hoursLost'
  | 'employees'
  | 'dataSource'
  | 'costByBottleneck'
  | 'costByTeam'
  | 'costVsSavings'
  | 'savingsCurve'
  | 'teams'
  | 'topBottleneck'
  | 'quickWins'
  | 'reportInfo'
  | 'chat'
  | 'employeeTeam'
  | 'employeeGroup'
  | 'employeeOne'
  | 'notes';

export type CardCategory = 'numbers' | 'charts' | 'employees' | 'other';

export const CATEGORY_TITLES: Record<CardCategory, string> = {
  numbers: 'Numbers',
  charts: 'Charts & lists',
  employees: 'Employee data',
  other: 'Other',
};

export interface CardDef {
  id: CardId;
  title: string;
  description: string;
  /** Fixed size, or the starting size for resizable cards. */
  size: CardSize;
  /** Defaults to 'numbers' for 1×1 cards and 'charts' for the rest. */
  category?: CardCategory;
  /** Can be added more than once; each copy keeps its own settings. */
  repeatable?: boolean;
  /** The size can be changed per card in edit mode. */
  resizable?: boolean;
}

export function categoryOf(d: CardDef): CardCategory {
  return d.category ?? (d.size === '1x1' ? 'numbers' : 'charts');
}

export const CARDS: CardDef[] = [
  { id: 'recommendedFixes', title: 'Recommended solutions', description: 'How many solutions the report recommends', size: '1x1' },
  { id: 'upfront', title: 'Upfront investment', description: 'One-time cost of the recommended plan', size: '1x1' },
  { id: 'savings', title: 'Annual savings', description: 'Yearly savings from the recommended plan', size: '1x1' },
  { id: 'payback', title: 'Payback', description: 'Months until the plan pays for itself', size: '1x1' },
  { id: 'annualCost', title: 'Annual cost', description: 'Yearly cost of time lost to bottlenecks', size: '1x1' },
  { id: 'hoursLost', title: 'Hours lost', description: 'Hours lost each week across teams', size: '1x1' },
  { id: 'employees', title: 'Employees', description: 'People slowed down by bottlenecks', size: '1x1' },
  { id: 'dataSource', title: 'Data folder', description: 'The CSV folder linked in Settings', size: '1x1' },
  { id: 'costByBottleneck', title: 'Annual cost by bottleneck', description: 'Bar chart of the costliest bottlenecks', size: '2x2' },
  { id: 'costByTeam', title: 'Cost by team', description: 'Pie chart of cost per team', size: '2x2' },
  { id: 'costVsSavings', title: 'Upfront cost vs. annual savings', description: 'Bar chart for the recommended plan', size: '2x2' },
  { id: 'savingsCurve', title: 'Cumulative net savings', description: 'Line graph of savings over three years', size: '2x2' },
  { id: 'teams', title: 'Top teams', description: 'Teams losing the most hours', size: '2x2' },
  { id: 'topBottleneck', title: 'Top bottleneck', description: 'The costliest bottleneck', size: '2x1' },
  { id: 'quickWins', title: 'Quick wins', description: 'Bottlenecks that are easiest to fix', size: '2x2' },
  { id: 'reportInfo', title: 'Report', description: 'Client, date and who prepared it', size: '2x1' },
  { id: 'chat', title: 'Ask Starstell', description: 'Chat with the Starstell assistant', size: '4x4' },
  { id: 'employeeTeam', title: 'Team', description: "One team's timelines, deals, contributions or bottlenecks", size: '4x2', category: 'employees', repeatable: true },
  { id: 'employeeGroup', title: 'Mini team', description: 'Pick specific employees and see their data together', size: '4x2', category: 'employees', repeatable: true },
  { id: 'employeeOne', title: 'One employee', description: "A single person's timelines, deals, contributions or bottlenecks", size: '2x2', category: 'employees', repeatable: true },
  { id: 'notes', title: 'Notes', description: 'A text box for your own notes, in any size', size: '2x2', category: 'other', repeatable: true, resizable: true },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, CardDef>;

/**
 * An entry in the saved layout. Single cards use their CardId; repeatable cards
 * add a suffix ("employeeOne#k3f9") so each copy is unique.
 */
export type LayoutKey = string;

export function cardIdOf(key: LayoutKey): CardId {
  return key.split('#')[0] as CardId;
}

export function newLayoutKey(id: CardId): LayoutKey {
  return CARD_BY_ID[id].repeatable ? `${id}#${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` : id;
}

/** A card's size: its type's size, or the size saved for it if it's resizable. */
export function sizeOfCard(key: LayoutKey, saved: Record<string, unknown> | undefined): CardSize {
  const def = CARD_BY_ID[cardIdOf(key)];
  const s = saved?.size;
  return def.resizable && typeof s === 'string' && (CARD_SIZES as string[]).includes(s) ? (s as CardSize) : def.size;
}

export const DEFAULT_LAYOUT: LayoutKey[] = [
  'recommendedFixes',
  'upfront',
  'savings',
  'payback',
  'costByBottleneck',
  'costByTeam',
  'costVsSavings',
  'savingsCurve',
  'chat',
];

function isLayoutKey(v: unknown): v is LayoutKey {
  if (typeof v !== 'string') return false;
  const id = cardIdOf(v);
  if (!(id in CARD_BY_ID)) return false;
  // Repeatable cards need their suffix; single cards must not have one.
  return CARD_BY_ID[id].repeatable ? v.length > id.length + 1 : v === id;
}

/** Visible cards in order, saved across launches. */
export function useDashboardLayout() {
  const [layout, setLayoutState] = useState<LayoutKey[]>(DEFAULT_LAYOUT);

  useEffect(() => {
    storage.get(STORAGE_KEYS.dashboard).then((saved) => {
      try {
        if (!saved) return;
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed)) return;
        // Drop unknown or repeated ids so old saved layouts can't break the screen.
        setLayoutState([...new Set(parsed.filter(isLayoutKey))]);
      } catch {
        // ignore corrupt saved data
      }
    });
  }, []);

  const setLayout = (next: LayoutKey[]) => {
    setLayoutState(next);
    storage.set(STORAGE_KEYS.dashboard, JSON.stringify(next)).catch(() => {});
  };

  return { layout, setLayout };
}
