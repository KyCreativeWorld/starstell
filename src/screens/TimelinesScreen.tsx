/**
 * Timelines tab: how the workday is spent across the company and in each team,
 * built from the SAMPLE day timelines. One day choice (typical day, a recent
 * workday or a picked date) drives every chart on the page.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { EMP_TEAMS, EMPLOYEES } from '../employees/sampleData';
import {
  ACTIVITY_KINDS,
  type ActivityKind,
  DAY_END,
  DAY_START,
  type DayBlock,
  formatClock,
  formatMinutes,
  LUNCH_END,
  LUNCH_START,
} from '../employees/dayTimeline';
import { averageMinutes, blocksFor, type KindCounts, peakSlot, type Slot, SLOT_MINUTES, slotShares } from '../employees/teamTimeline';
import { DaySelector, useDaySelection, useKindColors } from '../employees/DaySelector';

const MAX_WIDTH = 1100;
const SIDE_PADDING = 16;
const SPAN = DAY_END - DAY_START;
const pct = (m: number) => `${((m - DAY_START) / SPAN) * 100}%` as const;
const kindLabel = (k: ActivityKind) => ACTIVITY_KINDS.find((x) => x.key === k)!.label;

export function TimelinesScreen({ onOpenEmployee }: { onOpenEmployee: (id: string) => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const sel = useDaySelection();

  // Every person's day for the chosen day (null on weekends).
  const days = new Map<string, DayBlock[]>();
  for (const e of EMPLOYEES) {
    const b = blocksFor(e.id, sel.day);
    if (b) days.set(e.id, b);
  }
  const teams = EMP_TEAMS.map((t) => {
    const members = EMPLOYEES.filter((e) => e.teamId === t.id);
    const memberDays = members.map((e) => days.get(e.id)).filter((d): d is DayBlock[] => !!d);
    return { team: t, members, avg: averageMinutes(memberDays), slots: slotShares(memberDays) };
  });
  const all = [...days.values()];

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={[styles.title, { color: c.text }]}>Timelines</Text>
      <Text style={[styles.subtitle, { color: c.mutedText }]}>
        How the workday is spent across teams · <Text style={{ color: c.accent }}>Sample data</Text>
      </Text>

      <GlassCard style={styles.card}>
        <DaySelector sel={sel} />
      </GlassCard>

      {!all.length ? (
        <GlassCard style={styles.card}>
          <Text style={[styles.body, { color: c.mutedText }]}>No workday on a weekend. Pick a weekday.</Text>
        </GlassCard>
      ) : (
        <>
          <GlassCard style={styles.card}>
            <CardHead title="Whole company" sub={`${all.length} people · average per person`} />
            <SlotChart slots={slotShares(all)} />
            <Legend avg={averageMinutes(all)} />
            <Insights slots={slotShares(all)} />
          </GlassCard>

          <GlassCard style={styles.card}>
            <CardHead title="Compare teams" sub="Average hours per person on each kind of work" />
            <CompareTeams rows={teams.map((t) => ({ key: t.team.id, label: t.team.name, avg: t.avg }))} />
          </GlassCard>

          {teams.map((t) => (
            <TeamCard
              key={t.team.id}
              name={t.team.name}
              members={t.members}
              days={days}
              slots={t.slots}
              avg={t.avg}
              onOpenEmployee={onOpenEmployee}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function CardHead({ title, sub }: { title: string; sub?: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View>
      <Text style={[styles.cardTitle, { color: c.text }]}>{title}</Text>
      {sub ? <Text style={[styles.cardSub, { color: c.mutedText }]}>{sub}</Text> : null}
    </View>
  );
}

/**
 * The group's day in 15-minute columns. Each column is stacked by the share of
 * people doing each kind of work then; lunch is a labeled gap.
 */
function SlotChart({ slots }: { slots: Slot[] }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const colors = useKindColors();
  const [active, setActive] = useState<number | null>(null);
  const a = active !== null ? slots[active] : null;
  const ticks = [8, 10, 12, 14, 16, 17].map((h) => h * 60);

  return (
    <View style={styles.chartWrap}>
      <Text style={[styles.detail, { color: a ? c.text : c.mutedText }]} numberOfLines={2}>
        {a
          ? a.total
            ? `${formatClock(a.start)}–${formatClock(a.start + SLOT_MINUTES)} · ` +
              ACTIVITY_KINDS.filter((k) => a.counts[k.key])
                .map((k) => `${k.label} ${Math.round((a.counts[k.key] / a.total) * 100)}%`)
                .join(' · ')
            : `${formatClock(a.start)}–${formatClock(a.start + SLOT_MINUTES)} · Lunch`
          : 'Hover or tap a time to see what people are doing.'}
      </Text>
      <View style={styles.columns}>
        {slots.map((s, i) => {
          const lunch = s.start >= LUNCH_START && s.start < LUNCH_END;
          return (
            <Pressable
              key={s.start}
              onHoverIn={() => setActive(i)}
              onHoverOut={() => setActive((x) => (x === i ? null : x))}
              onPress={() => setActive((x) => (x === i ? null : i))}
              accessibilityRole="button"
              accessibilityLabel={`${formatClock(s.start)}${lunch ? ', lunch' : ''}`}
              style={styles.column}
            >
              <View style={[styles.columnInner, { backgroundColor: lunch ? 'transparent' : c.inputBg }, active !== null && active !== i && styles.dim]}>
                {s.total
                  ? // Bottom to top in the fixed kind order.
                    [...ACTIVITY_KINDS].reverse().map((k) =>
                      s.counts[k.key] ? (
                        <View key={k.key} style={[styles.segment, { flex: s.counts[k.key], backgroundColor: colors[k.key] }]} />
                      ) : null,
                    )
                  : null}
              </View>
            </Pressable>
          );
        })}
        <View pointerEvents="none" style={[styles.lunchLabel, { left: pct(LUNCH_START), width: `${((LUNCH_END - LUNCH_START) / SPAN) * 100}%` }]}>
          <Text style={[styles.lunchText, { color: c.mutedText }]}>Lunch</Text>
        </View>
      </View>
      <TimeAxis ticks={ticks} />
    </View>
  );
}

function TimeAxis({ ticks }: { ticks: number[] }) {
  const { theme } = useTheme();
  return (
    <View style={styles.ticks}>
      {ticks.map((t) => (
        <Text key={t} style={[styles.tick, { left: pct(t), color: theme.colors.mutedText }]}>
          {formatClock(t)}
        </Text>
      ))}
    </View>
  );
}

function Legend({ avg }: { avg: KindCounts }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const colors = useKindColors();
  return (
    <View style={styles.legend}>
      {ACTIVITY_KINDS.map((k) => (
        <View key={k.key} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colors[k.key] }]} />
          <Text style={[styles.legendText, { color: c.text }]}>{k.label}</Text>
          <Text style={[styles.legendText, { color: c.mutedText }]}>{formatMinutes(avg[k.key])}</Text>
        </View>
      ))}
    </View>
  );
}

/** A few plain-language takeaways: when meetings and lost time peak. */
function Insights({ slots }: { slots: Slot[] }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const lines = (['meeting', 'lost', 'focus'] as ActivityKind[])
    .map((k) => {
      // Everyone starts with the 8am standup, so meetings look past that first slot.
      const p = peakSlot(k === 'meeting' ? slots.slice(1) : slots, k);
      if (!p) return null;
      const share = Math.round((p.counts[k] / p.total) * 100);
      const prefix = k === 'meeting' ? 'After the 8am standup, meetings' : kindLabel(k);
      return `${prefix} peak at ${formatClock(p.start)} (${share}% of people).`;
    })
    .filter((l): l is string => !!l);
  if (!lines.length) return null;
  return (
    <View style={styles.insights}>
      {lines.map((l) => (
        <Text key={l} style={[styles.insight, { color: c.mutedText }]}>
          • {l}
        </Text>
      ))}
    </View>
  );
}

/** One 100%-stacked bar per team: how an average person's day splits up. */
function CompareTeams({ rows }: { rows: { key: string; label: string; avg: KindCounts }[] }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const colors = useKindColors();
  const [active, setActive] = useState<{ row: string; kind: ActivityKind } | null>(null);
  const activeRow = active ? rows.find((r) => r.key === active.row) : null;

  return (
    <View style={styles.compare}>
      <Text style={[styles.detail, { color: active ? c.text : c.mutedText }]} numberOfLines={1}>
        {active && activeRow
          ? `${activeRow.label} · ${kindLabel(active.kind)} · ${formatMinutes(activeRow.avg[active.kind])} a day per person`
          : 'Hover or tap a bar segment for details.'}
      </Text>
      {rows.map((r) => {
        const total = ACTIVITY_KINDS.reduce((s, k) => s + r.avg[k.key], 0) || 1;
        return (
          <View key={r.key} style={styles.compareRow}>
            <Text style={[styles.compareLabel, { color: c.text }]} numberOfLines={1}>
              {r.label}
            </Text>
            <View style={styles.compareBar}>
              {ACTIVITY_KINDS.map((k) =>
                r.avg[k.key] ? (
                  <Pressable
                    key={k.key}
                    onHoverIn={() => setActive({ row: r.key, kind: k.key })}
                    onHoverOut={() => setActive((x) => (x?.row === r.key && x.kind === k.key ? null : x))}
                    onPress={() => setActive((x) => (x?.row === r.key && x.kind === k.key ? null : { row: r.key, kind: k.key }))}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.label}, ${k.label}, ${formatMinutes(r.avg[k.key])}`}
                    style={[styles.compareSegWrap, { flex: r.avg[k.key] / total }]}
                  >
                    <View
                      style={[
                        styles.compareSeg,
                        { backgroundColor: colors[k.key] },
                        active && !(active.row === r.key && active.kind === k.key) && styles.dim,
                      ]}
                    />
                  </Pressable>
                ) : null,
              )}
            </View>
            <Text style={[styles.compareValue, { color: c.mutedText }]}>
              {formatMinutes(r.avg.lost)} lost
            </Text>
          </View>
        );
      })}
      <View style={styles.legend}>
        {ACTIVITY_KINDS.map((k) => (
          <View key={k.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: colors[k.key] }]} />
            <Text style={[styles.legendText, { color: c.text }]}>{k.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TeamCard({
  name,
  members,
  days,
  slots,
  avg,
  onOpenEmployee,
}: {
  name: string;
  members: { id: string; name: string; role: string }[];
  days: Map<string, DayBlock[]>;
  slots: Slot[];
  avg: KindCounts;
  onOpenEmployee: (id: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const colors = useKindColors();
  const [open, setOpen] = useState(false);

  return (
    <GlassCard style={styles.card}>
      <CardHead title={name} sub={`${members.length} people · average per person`} />
      <SlotChart slots={slots} />
      <Legend avg={avg} />

      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.toggle}
        hitSlop={6}
      >
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <Icon name="chevron" size={14} color={c.primary} />
        </View>
        <Text style={[styles.toggleText, { color: c.primary }]}>
          {open ? 'Hide' : 'Show'} each person ({members.length})
        </Text>
      </Pressable>

      {open ? (
        <View style={styles.lanes}>
          {members.map((m) => {
            const blocks = days.get(m.id) ?? [];
            return (
              <Pressable
                key={m.id}
                onPress={() => onOpenEmployee(m.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${m.name}`}
                style={({ hovered, pressed }: { pressed: boolean; hovered?: boolean }) => [
                  styles.lane,
                  (hovered || pressed) && { backgroundColor: c.inputBg },
                ]}
              >
                <View style={styles.laneName}>
                  <Text style={[styles.laneTitle, { color: c.text }]} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text style={[styles.laneSub, { color: c.mutedText }]} numberOfLines={1}>
                    {m.role}
                  </Text>
                </View>
                <View style={[styles.laneBar, { backgroundColor: c.inputBg }]}>
                  {blocks.map((b, i) => (
                    <View key={i} style={[styles.laneBlockWrap, { left: pct(b.start), width: `${((b.end - b.start) / SPAN) * 100}%` }]}>
                      <View style={[styles.laneBlock, { backgroundColor: colors[b.kind] }]} />
                    </View>
                  ))}
                </View>
                <Icon name="chevron" size={14} color={c.mutedText} />
              </Pressable>
            );
          })}
          <View style={styles.laneAxis}>
            <View style={styles.laneName} />
            <View style={styles.flex}>
              <TimeAxis ticks={[8, 10, 12, 14, 16, 17].map((h) => h * 60)} />
            </View>
            <View style={styles.chevronSpace} />
          </View>
        </View>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    width: '100%',
    maxWidth: MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: SIDE_PADDING,
    paddingTop: 24,
    paddingBottom: 48,
  },
  title: { fontFamily: fonts.display, fontSize: 32, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, marginTop: 4, marginBottom: 20 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  card: { marginBottom: 18, gap: 14 },
  cardTitle: { fontFamily: fonts.body, fontSize: 19, fontWeight: '700' },
  cardSub: { fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  detail: { fontFamily: fonts.body, fontSize: 13, fontVariant: ['tabular-nums'], minHeight: 18 },
  dim: { opacity: 0.35 },

  chartWrap: { gap: 8 },
  columns: { height: 96, flexDirection: 'row', position: 'relative' },
  // 1px each side = a 2px gap between columns.
  column: { flex: 1, paddingHorizontal: 1 },
  columnInner: { flex: 1, borderRadius: 3, overflow: 'hidden', justifyContent: 'flex-end', gap: 1 },
  segment: { width: '100%' },
  lunchLabel: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  lunchText: { fontFamily: fonts.body, fontSize: 10 },
  ticks: { height: 16, position: 'relative' },
  tick: { position: 'absolute', fontFamily: fonts.body, fontSize: 11, width: 44, marginLeft: -22, textAlign: 'center' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: fonts.body, fontSize: 12.5 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  insights: { gap: 3 },
  insight: { fontFamily: fonts.body, fontSize: 13 },

  compare: { gap: 10 },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  compareLabel: { width: 130, fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
  compareBar: { flex: 1, height: 20, flexDirection: 'row' },
  compareSegWrap: { paddingHorizontal: 1 },
  compareSeg: { flex: 1, borderRadius: 4 },
  compareValue: { width: 76, textAlign: 'right', fontFamily: fonts.body, fontSize: 12.5, fontVariant: ['tabular-nums'] },

  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  toggleText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700' },
  lanes: { gap: 2 },
  lane: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8 },
  laneName: { width: 150 },
  laneTitle: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
  laneSub: { fontFamily: fonts.body, fontSize: 11.5 },
  laneBar: { flex: 1, height: 16, borderRadius: 4, position: 'relative' },
  laneBlockWrap: { position: 'absolute', top: 0, bottom: 0, paddingHorizontal: 0.5 },
  laneBlock: { flex: 1, borderRadius: 2 },
  laneAxis: { flexDirection: 'row', gap: 12, paddingHorizontal: 6 },
  chevronSpace: { width: 14 },
});
