/**
 * Employee data cards: a team, a hand-picked "mini team", or one employee,
 * showing their timelines, deals, contributions or bottlenecks.
 * Uses SAMPLE data (src/employees/sampleData.ts) for now.
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassCard } from '../components/Glass';
import { BarList, LineChart } from '../charts/Charts';
import { formatMoney } from '../report/format';
import {
  CONTRIBUTIONS,
  DEALS,
  EMP_TEAM_BY_ID,
  EMP_TEAMS,
  EMPLOYEE_BOTTLENECKS,
  EMPLOYEE_BY_ID,
  EMPLOYEES,
  MILESTONES,
  MONTHS,
  type DealStage,
  type MilestoneStatus,
} from '../employees/sampleData';
import {
  DATA_KINDS,
  type EmployeeCardConfig,
  type EmployeeScope,
  setEmployeeCardConfig,
  useEmployeeCardConfig,
} from './employeeCardConfig';

const SCOPE_LABEL: Record<EmployeeScope, string> = { team: 'Team', group: 'Mini team', one: 'Employee' };
const money = (v: number) => formatMoney(v, true) ?? '';
const firstName = (id: string) => EMPLOYEE_BY_ID[id]?.name.split(' ')[0] ?? '';

/** The employee ids a card covers. */
function membersOf(scope: EmployeeScope, cfg: EmployeeCardConfig): string[] {
  if (scope === 'team') return EMPLOYEES.filter((e) => e.teamId === cfg.teamId).map((e) => e.id);
  const ids = (cfg.employeeIds ?? []).filter((id) => EMPLOYEE_BY_ID[id]);
  return scope === 'one' ? ids.slice(0, 1) : ids;
}

export function EmployeeCard({ cardKey, scope }: { cardKey: string; scope: EmployeeScope }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const cfg = useEmployeeCardConfig(cardKey, scope);
  const [picking, setPicking] = useState(false);
  const members = membersOf(scope, cfg);
  const multi = scope !== 'one';
  const update = (patch: Partial<EmployeeCardConfig>) => setEmployeeCardConfig(cardKey, { ...cfg, ...patch });

  const heading =
    scope === 'team'
      ? (EMP_TEAM_BY_ID[cfg.teamId ?? '']?.name ?? 'Choose a team')
      : scope === 'one'
        ? (EMPLOYEE_BY_ID[members[0]]?.name ?? 'Choose an employee')
        : members.length
          ? members.map(firstName).join(', ')
          : 'Choose employees';
  const sub =
    scope === 'one'
      ? [EMPLOYEE_BY_ID[members[0]]?.role, EMP_TEAM_BY_ID[EMPLOYEE_BY_ID[members[0]]?.teamId ?? '']?.name]
          .filter(Boolean)
          .join(' · ')
      : `${members.length} ${members.length === 1 ? 'person' : 'people'}`;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: c.mutedText }]}>
            {SCOPE_LABEL[scope]} · <Text style={{ color: c.accent }}>Sample data</Text>
          </Text>
          <Text numberOfLines={1} style={[styles.title, { color: c.text }]}>
            {heading}
          </Text>
          {sub ? <Text style={[styles.sub, { color: c.mutedText }]}>{sub}</Text> : null}
        </View>
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`Change ${SCOPE_LABEL[scope].toLowerCase()}`}
          hitSlop={8}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.change,
            { borderColor: hovered ? c.primary : c.inputBorder, backgroundColor: c.inputBg, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.changeText, { color: c.primary }]}>Change</Text>
        </Pressable>
      </View>

      <View style={styles.segments} accessibilityRole="tablist">
        {DATA_KINDS.map((k) => {
          const on = k.key === cfg.data;
          return (
            <Pressable
              key={k.key}
              onPress={() => update({ data: k.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[
                styles.segment,
                { borderColor: on ? c.primary : c.inputBorder, backgroundColor: on ? c.primary : c.inputBg },
              ]}
            >
              <Text style={[styles.segmentText, { color: on ? c.buttonText : c.text }]}>{k.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Header and data switch stay put; the data scrolls within the card's fixed size. */}
      <ScrollView style={styles.flex} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        {members.length === 0 ? (
          <Text style={[styles.body, { color: c.mutedText }]}>Tap Change to choose who this card shows.</Text>
        ) : cfg.data === 'deals' ? (
          <DealsView members={members} multi={multi} />
        ) : cfg.data === 'timelines' ? (
          <TimelineView members={members} multi={multi} />
        ) : cfg.data === 'contributions' ? (
          <ContributionsView members={members} multi={multi} />
        ) : (
          <BottlenecksView members={members} multi={multi} />
        )}
      </ScrollView>

      <PickerSheet
        visible={picking}
        scope={scope}
        cfg={cfg}
        onChange={update}
        onClose={() => setPicking(false)}
      />
    </GlassCard>
  );
}

// ---------------------------------------------------------------- data views

function Stat({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: c.mutedText }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.statValue, { color: c.text }]}>
        {value}
      </Text>
    </View>
  );
}

function DealsView({ members, multi }: { members: string[]; multi: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const deals = DEALS.filter((d) => members.includes(d.employeeId)).sort((a, b) => b.closeDate.localeCompare(a.closeDate));
  if (!deals.length) return <Text style={[styles.body, { color: c.mutedText }]}>No deals for this selection.</Text>;

  const won = deals.filter((d) => d.stage === 'Won');
  const lost = deals.filter((d) => d.stage === 'Lost');
  const open = deals.filter((d) => d.stage === 'Negotiation' || d.stage === 'Proposal');
  const sum = (xs: typeof deals) => xs.reduce((s, d) => s + d.value, 0);
  const closed = won.length + lost.length;
  const stageColor: Record<DealStage, string> = {
    Won: c.success,
    Lost: c.danger,
    Negotiation: c.primary,
    Proposal: c.mutedText,
  };

  return (
    <View style={styles.stack}>
      <View style={styles.stats}>
        <Stat label="Won" value={money(sum(won))} />
        <Stat label="Open pipeline" value={money(sum(open))} />
        <Stat label="Win rate" value={closed ? `${Math.round((won.length / closed) * 100)}%` : '—'} />
      </View>
      <View style={styles.list}>
        {deals.slice(0, 5).map((d) => (
          <View key={d.id} style={styles.row}>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={[styles.rowName, { color: c.text }]}>
                {d.name}
              </Text>
              <Text style={[styles.rowMeta, { color: c.mutedText }]}>
                {[multi ? EMPLOYEE_BY_ID[d.employeeId]?.name : null, formatDate(d.closeDate)].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={[styles.rowValue, { color: c.text }]}>{money(d.value)}</Text>
            <Text style={[styles.tag, { color: stageColor[d.stage], borderColor: stageColor[d.stage] }]}>{d.stage}</Text>
          </View>
        ))}
        {deals.length > 5 ? (
          <Text style={[styles.rowMeta, { color: c.mutedText }]}>and {deals.length - 5} more</Text>
        ) : null}
      </View>
    </View>
  );
}

function TimelineView({ members, multi }: { members: string[]; multi: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const items = MILESTONES.filter((m) => members.includes(m.employeeId)).sort((a, b) => a.start - b.start || a.end - b.end);
  if (!items.length) return <Text style={[styles.body, { color: c.mutedText }]}>No timelines for this selection.</Text>;
  const statusColor: Record<MilestoneStatus, string> = {
    Done: c.success,
    'On track': c.primary,
    'At risk': c.accent,
    Late: c.danger,
  };
  const n = MONTHS.length;
  const shown = items.slice(0, 7);

  return (
    <View style={styles.stack}>
      <View style={styles.tlRow}>
        <View style={styles.tlLabel} />
        <View style={styles.tlMonths}>
          {MONTHS.map((m) => (
            <Text key={m} style={[styles.tlMonth, { color: c.mutedText }]}>
              {m}
            </Text>
          ))}
        </View>
      </View>
      {shown.map((m) => (
        <View
          key={m.id}
          style={styles.tlRow}
          accessibilityLabel={`${m.name}, ${MONTHS[m.start]} to ${MONTHS[m.end]}, ${m.status}`}
        >
          <View style={styles.tlLabel}>
            <Text numberOfLines={1} style={[styles.rowName, { color: c.text }]}>
              {m.name}
            </Text>
            <Text numberOfLines={1} style={[styles.rowMeta, { color: c.mutedText }]}>
              {multi ? `${firstName(m.employeeId)} · ` : ''}
              <Text style={{ color: statusColor[m.status] }}>{m.status}</Text>
            </Text>
          </View>
          <View style={[styles.tlTrack, { backgroundColor: c.inputBg }]}>
            <View
              style={[
                styles.tlBar,
                {
                  left: `${(m.start / n) * 100}%`,
                  width: `${((m.end - m.start + 1) / n) * 100}%`,
                  backgroundColor: statusColor[m.status],
                },
              ]}
            />
          </View>
        </View>
      ))}
      {items.length > shown.length ? (
        <Text style={[styles.rowMeta, { color: c.mutedText }]}>and {items.length - shown.length} more</Text>
      ) : null}
    </View>
  );
}

function ContributionsView({ members, multi }: { members: string[]; multi: boolean }) {
  const monthly = MONTHS.map((_, i) => members.reduce((s, id) => s + (CONTRIBUTIONS[id]?.[i] ?? 0), 0));
  const total = monthly.reduce((a, b) => a + b, 0);
  const last = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];
  const change = prev ? Math.round(((last - prev) / prev) * 100) : 0;

  const people = members
    .map((id) => ({ id, total: (CONTRIBUTIONS[id] ?? []).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <View style={styles.stack}>
      <View style={styles.stats}>
        <Stat label="Last 6 months" value={String(total)} />
        <Stat label={`${MONTHS[MONTHS.length - 1]}`} value={String(last)} />
        <Stat label="vs. last month" value={`${change >= 0 ? '+' : '−'}${Math.abs(change)}%`} />
      </View>
      <LineChart
        height={120}
        points={monthly.map((y, x) => ({ x, y }))}
        xTicks={MONTHS.map((label, x) => ({ x, label }))}
        formatY={(v) => String(Math.round(v))}
        describe={(p) => ({ title: MONTHS[p.x], lines: [`${p.y} contributions`] })}
      />
      {multi && people.length > 1 ? (
        <BarList
          data={people.map((p) => ({
            key: p.id,
            label: EMPLOYEE_BY_ID[p.id].name,
            value: p.total,
            display: String(p.total),
            tip: [EMPLOYEE_BY_ID[p.id].role, `${p.total} contributions in 6 months`],
          }))}
        />
      ) : null}
    </View>
  );
}

function BottlenecksView({ members, multi }: { members: string[]; multi: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const byName = new Map<string, { hours: number; who: string[] }>();
  for (const b of EMPLOYEE_BOTTLENECKS) {
    if (!members.includes(b.employeeId)) continue;
    const cur = byName.get(b.name) ?? { hours: 0, who: [] };
    cur.hours += b.hoursPerWeek;
    cur.who.push(firstName(b.employeeId));
    byName.set(b.name, cur);
  }
  const rows = [...byName.entries()].sort((a, b) => b[1].hours - a[1].hours);
  if (!rows.length) return <Text style={[styles.body, { color: c.mutedText }]}>No bottlenecks for this selection.</Text>;
  const total = rows.reduce((s, [, v]) => s + v.hours, 0);

  return (
    <View style={styles.stack}>
      <View style={styles.stats}>
        <Stat label="Hours lost / week" value={String(total)} />
        <Stat label="Bottlenecks" value={String(rows.length)} />
      </View>
      <BarList
        data={rows.slice(0, 6).map(([name, v]) => ({
          key: name,
          label: name,
          value: v.hours,
          display: `${v.hours} h/wk`,
          tip: multi ? [`Affects ${v.who.join(', ')}`] : undefined,
        }))}
      />
    </View>
  );
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`;
}

// ---------------------------------------------------------------- picker

function PickerSheet({
  visible,
  scope,
  cfg,
  onChange,
  onClose,
}: {
  visible: boolean;
  scope: EmployeeScope;
  cfg: EmployeeCardConfig;
  onChange: (patch: Partial<EmployeeCardConfig>) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const selectedCount = cfg.employeeIds?.length ?? 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          {
            maxHeight: height * 0.8,
            paddingBottom: insets.bottom + 12,
            backgroundColor: c.menu,
            borderColor: c.glassBorder,
            shadowColor: c.shadow,
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: c.text }]}>{pickerTitle(scope)}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.done, { color: c.primary }]}>Done</Text>
          </Pressable>
        </View>
        {scope === 'group' ? (
          <Text style={[styles.sheetHint, { color: c.mutedText }]}>
            {selectedCount} selected. Tap people to add or remove them.
          </Text>
        ) : null}

        <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
          <MemberList scope={scope} cfg={cfg} onChange={onChange} onPicked={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}

export function pickerTitle(scope: EmployeeScope): string {
  return scope === 'team' ? 'Choose a team' : scope === 'one' ? 'Choose an employee' : 'Choose employees';
}

/**
 * The list of teams or employees to pick from. Team and one-employee lists call
 * `onPicked` as soon as something is chosen; the mini-team list is a checklist.
 */
export function MemberList({
  scope,
  cfg,
  onChange,
  onPicked,
}: {
  scope: EmployeeScope;
  cfg: EmployeeCardConfig;
  onChange: (patch: Partial<EmployeeCardConfig>) => void;
  onPicked?: (patch: Partial<EmployeeCardConfig>) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const selected = new Set(cfg.employeeIds ?? []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ employeeIds: EMPLOYEES.filter((e) => next.has(e.id)).map((e) => e.id) });
  };

  if (scope === 'team') {
    return (
      <>
        {EMP_TEAMS.map((t) => (
          <Choice
            key={t.id}
            label={t.name}
            meta={`${EMPLOYEES.filter((e) => e.teamId === t.id).length} people`}
            selected={cfg.teamId === t.id}
            radio
            onPress={() => {
              onChange({ teamId: t.id });
              onPicked?.({ teamId: t.id });
            }}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {EMP_TEAMS.map((t) => (
        <View key={t.id}>
          <Text style={[styles.group, { color: c.mutedText }]}>{t.name}</Text>
          {EMPLOYEES.filter((e) => e.teamId === t.id).map((e) => (
            <Choice
              key={e.id}
              label={e.name}
              meta={e.role}
              selected={scope === 'one' ? cfg.employeeIds?.[0] === e.id : selected.has(e.id)}
              radio={scope === 'one'}
              onPress={() => {
                if (scope === 'one') {
                  onChange({ employeeIds: [e.id] });
                  onPicked?.({ employeeIds: [e.id] });
                } else toggle(e.id);
              }}
            />
          ))}
        </View>
      ))}
    </>
  );
}

function Choice({
  label,
  meta,
  selected,
  radio,
  onPress,
}: {
  label: string;
  meta?: string;
  selected: boolean;
  radio?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={radio ? { selected } : { checked: selected }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.choice,
        { backgroundColor: pressed || hovered ? c.inputBg : 'transparent' },
      ]}
    >
      <View
        style={[
          styles.mark,
          radio ? styles.markRadio : null,
          { borderColor: selected ? c.primary : c.inputBorder, backgroundColor: selected ? c.primary : 'transparent' },
        ]}
      >
        {selected ? <Text style={[styles.markTick, { color: c.buttonText }]}>✓</Text> : null}
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowName, { color: c.text }]}>{label}</Text>
        {meta ? <Text style={[styles.rowMeta, { color: c.mutedText }]}>{meta}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { flex: 1, padding: 18, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrow: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontFamily: fonts.body, fontSize: 17, fontWeight: '700', marginTop: 3 },
  sub: { fontFamily: fonts.body, fontSize: 12.5, marginTop: 2 },
  change: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  changeText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700' },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segment: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  segmentText: { fontFamily: fonts.body, fontSize: 12.5, fontWeight: '600' },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  stack: { gap: 14 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  stat: { minWidth: 80 },
  statLabel: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  statValue: { fontFamily: fonts.display, fontSize: 22, marginTop: 2 },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowName: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
  rowMeta: { fontFamily: fonts.body, fontSize: 12, marginTop: 1 },
  rowValue: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
  tag: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 84,
    textAlign: 'center',
  },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tlLabel: { width: '38%' },
  tlMonths: { flex: 1, flexDirection: 'row' },
  tlMonth: { flex: 1, fontFamily: fonts.body, fontSize: 11, textAlign: 'center' },
  tlTrack: { flex: 1, height: 12, borderRadius: 6, overflow: 'hidden' },
  tlBar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 6 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 480,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    paddingTop: 14,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  sheetTitle: { fontFamily: fonts.body, fontSize: 18, fontWeight: '700' },
  sheetHint: { fontFamily: fonts.body, fontSize: 13, paddingHorizontal: 20, marginTop: 4 },
  done: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  sheetList: { flexGrow: 0, marginTop: 8 },
  sheetListContent: { paddingHorizontal: 12, paddingBottom: 8 },
  group: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, minHeight: 48 },
  mark: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  markRadio: { borderRadius: 11 },
  markTick: { fontSize: 13, fontWeight: '800', lineHeight: 15 },
});
