/**
 * Averages of the SAMPLE day timelines across a group of people (a team or the
 * whole company): what share of the group is doing what at each time of day,
 * and the average minutes per person spent on each kind of work.
 */
import {
  ACTIVITY_KINDS,
  type ActivityKind,
  DAY_END,
  DAY_START,
  dayFor,
  type DayBlock,
  minutesByKind,
  typicalDay,
} from './dayTimeline';

export const SLOT_MINUTES = 15;
export const SLOT_COUNT = (DAY_END - DAY_START) / SLOT_MINUTES;

export type KindCounts = Record<ActivityKind, number>;
const empty = (): KindCounts => ({ focus: 0, meeting: 0, admin: 0, lost: 0 });

/** One person's day: a specific workday, or their typical day when `day` is null. */
export function blocksFor(employeeId: string, day: Date | null): DayBlock[] | null {
  return day ? dayFor(employeeId, day) : typicalDay(employeeId);
}

export interface Slot {
  start: number;
  /** How many people are doing each kind of work in this slot. */
  counts: KindCounts;
  /** People working in this slot (0 during lunch). */
  total: number;
}

/** For each 15-minute slot of the workday, how many people are doing each kind of work. */
export function slotShares(days: DayBlock[][]): Slot[] {
  const slots: Slot[] = Array.from({ length: SLOT_COUNT }, (_, i) => ({
    start: DAY_START + i * SLOT_MINUTES,
    counts: empty(),
    total: 0,
  }));
  for (const blocks of days) {
    for (const b of blocks) {
      for (let t = b.start; t < b.end; t += SLOT_MINUTES) {
        const slot = slots[(t - DAY_START) / SLOT_MINUTES];
        if (!slot) continue;
        slot.counts[b.kind]++;
        slot.total++;
      }
    }
  }
  return slots;
}

/** Average minutes per person on each kind of work. */
export function averageMinutes(days: DayBlock[][]): KindCounts {
  const sum = empty();
  for (const blocks of days) {
    const m = minutesByKind(blocks);
    for (const { key } of ACTIVITY_KINDS) sum[key] += m[key];
  }
  const n = days.length || 1;
  const out = empty();
  for (const { key } of ACTIVITY_KINDS) out[key] = Math.round(sum[key] / n);
  return out;
}

/** The busiest slot for a kind of work, e.g. when most meetings happen. */
export function peakSlot(slots: Slot[], kind: ActivityKind): Slot | undefined {
  let best: Slot | undefined;
  for (const s of slots) if (s.total && (!best || s.counts[kind] / s.total > best.counts[kind] / best.total)) best = s;
  return best && best.counts[kind] ? best : undefined;
}
