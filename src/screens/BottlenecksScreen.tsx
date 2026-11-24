import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassButton, GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { sidebarWidthFor } from '../components/Sidebar';
import { useReport } from '../report/ReportContext';
import { formatHours, formatMoney } from '../report/format';
import { feasibilityLevel, type Feasibility } from '../report/filters';
import type { Bottleneck, Report } from '../report/types';

const MAX_WIDTH = 1100;
const SIDE_PADDING = 16;
/** Below this content width each row stacks its numbers under the name. */
const TABLE_MIN_WIDTH = 720;

/** Bottlenecks tab: a compact list of every bottleneck, each linking to its solutions. */
export function BottlenecksScreen({
  onOpenSolutions,
  onOpenReport,
}: {
  onOpenSolutions: (bottleneckId: string) => void;
  onOpenReport: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { report } = useReport();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const available = windowWidth - sidebarWidthFor(windowWidth) - insets.left - insets.right;
  const table = Math.min(available, MAX_WIDTH) - SIDE_PADDING * 2 >= TABLE_MIN_WIDTH;

  if (!report) {
    return (
      <ScrollView contentContainerStyle={styles.emptyWrap}>
        <GlassCard style={styles.emptyCard}>
          <Text style={[styles.title, { color: c.text }]}>Bottlenecks</Text>
          <Text style={[styles.body, { color: c.mutedText }]}>
            Import a consulting report to see where your teams lose time.
          </Text>
          <GlassButton label="Go to Report" onPress={onOpenReport} style={styles.emptyButton} />
        </GlassCard>
      </ScrollView>
    );
  }

  const list = ordered(report.bottlenecks);
  const totalCost = report.totals.annualCost ?? sum(list.map((b) => b.annualCost));
  const totalHours = report.totals.hoursPerWeek ?? sum(list.map((b) => b.totalHours));
  const summary = [
    `${list.length} bottleneck${list.length === 1 ? '' : 's'}`,
    totalCost !== undefined ? `${formatMoney(totalCost, true)}/yr` : undefined,
    totalHours !== undefined ? `${formatHours(totalHours)} lost` : undefined,
  ].filter(Boolean);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={[styles.title, { color: c.text }]}>Bottlenecks</Text>
      <Text style={[styles.subtitle, { color: c.mutedText }]}>{summary.join(' · ')}</Text>

      <GlassCard style={styles.card}>
        {table ? (
          <View style={[styles.row, styles.headRow, { borderBottomColor: c.glassBorder }]}>
            <Text style={[styles.colRank, styles.headText, { color: c.mutedText }]}>#</Text>
            <Text style={[styles.colName, styles.headText, { color: c.mutedText }]}>Bottleneck</Text>
            <Text style={[styles.colNum, styles.headText, { color: c.mutedText }]}>Annual cost</Text>
            <Text style={[styles.colNum, styles.headText, { color: c.mutedText }]}>Hours lost</Text>
            <Text style={[styles.colFeas, styles.headText, { color: c.mutedText }]}>Feasibility</Text>
            <View style={styles.colAction} />
          </View>
        ) : null}
        {list.map((b, i) => (
          <BottleneckRow
            key={b.id}
            b={b}
            index={i}
            report={report}
            table={table}
            last={i === list.length - 1}
            onOpenSolutions={() => onOpenSolutions(b.id)}
          />
        ))}
        {!list.length ? (
          <Text style={[styles.body, styles.none, { color: c.mutedText }]}>This report lists no bottlenecks.</Text>
        ) : null}
      </GlassCard>
    </ScrollView>
  );
}

function BottleneckRow({
  b,
  index,
  report,
  table,
  last,
  onOpenSolutions,
}: {
  b: Bottleneck;
  index: number;
  report: Report;
  table: boolean;
  last: boolean;
  onOpenSolutions: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const teams = teamNames(b, report);
  const cost = b.annualCost !== undefined ? formatMoney(b.annualCost, true) : undefined;
  const hours = formatHours(b.totalHours);
  const feas = feasibilityLevel(b.feasibility);
  const border = last ? null : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.glassBorder };

  const name = (
    <View style={styles.colName}>
      <Text style={[styles.name, { color: c.text }]} numberOfLines={table ? 1 : 2}>
        {b.name}
      </Text>
      {teams ? (
        <Text style={[styles.teams, { color: c.mutedText }]} numberOfLines={1}>
          {teams}
        </Text>
      ) : null}
      {!table ? (
        <View style={styles.metaRow}>
          {[cost && `${cost}/yr`, hours].filter(Boolean).map((t) => (
            <Text key={t} style={[styles.meta, { color: c.text }]}>
              {t}
            </Text>
          ))}
          {feas ? <FeasibilityTag level={feas} suffix=" feasibility" /> : null}
        </View>
      ) : null}
      {!table ? (
        <View style={styles.stackedAction}>
          <SolutionsButton b={b} onPress={onOpenSolutions} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.row, !table && styles.rowStacked, border]}>
      <Text style={[styles.colRank, styles.rank, { color: c.mutedText }]}>{b.rank ?? index + 1}</Text>
      {name}
      {table ? (
        <>
          <Text style={[styles.colNum, styles.num, { color: c.text }]}>{cost ?? '—'}</Text>
          <Text style={[styles.colNum, styles.num, { color: c.text }]}>{hours ?? '—'}</Text>
          <View style={styles.colFeas}>{feas ? <FeasibilityTag level={feas} /> : <Text style={{ color: c.mutedText }}>—</Text>}</View>
        </>
      ) : null}
      {table ? (
        <View style={styles.colAction}>
          <SolutionsButton b={b} onPress={onOpenSolutions} />
        </View>
      ) : null}
    </View>
  );
}

/** "3 solutions ›" — opens the Solutions tab at this bottleneck. */
function SolutionsButton({ b, onPress }: { b: Bottleneck; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const n = b.options.length;
  if (!n) return <Text style={[styles.noSolutions, { color: c.mutedText }]}>No solutions</Text>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${n} solution${n === 1 ? '' : 's'} for ${b.name}`}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.solutionsBtn,
        {
          borderColor: hovered ? c.primary : c.inputBorder,
          backgroundColor: hovered || pressed ? c.inputBg : 'transparent',
        },
      ]}
    >
      <Text style={[styles.solutionsText, { color: c.accent }]}>
        {`${n} solution${n === 1 ? '' : 's'}`}
      </Text>
      <Icon name="chevron" size={14} color={c.accent} />
    </Pressable>
  );
}

function FeasibilityTag({ level, suffix = '' }: { level: Feasibility; suffix?: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const color = level === 'High' ? c.primary : level === 'Med' ? c.accent : c.mutedText;
  return (
    <View style={styles.feas}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.feasText, { color: c.text }]}>{level === 'Med' ? 'Medium' : level}
        {suffix}
      </Text>
    </View>
  );
}

/** Report rank order when every bottleneck has one, otherwise most costly first. */
function ordered(list: Bottleneck[]): Bottleneck[] {
  if (list.length && list.every((b) => b.rank !== undefined)) {
    return [...list].sort((a, b) => a.rank! - b.rank!);
  }
  return [...list].sort((a, b) => (b.annualCost ?? -1) - (a.annualCost ?? -1));
}

function teamNames(b: Bottleneck, report: Report): string | undefined {
  const names = b.teamIds
    .map((id) => report.teams.find((t) => t.id === id)?.name)
    .filter((n): n is string => !!n);
  return names.length ? names.join(', ') : b.departmentsText;
}

function sum(ns: (number | undefined)[]): number | undefined {
  const v = ns.filter((n): n is number => n !== undefined);
  return v.length ? v.reduce((a, n) => a + n, 0) : undefined;
}

const styles = StyleSheet.create({
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
  card: { paddingVertical: 4, paddingHorizontal: 0 },
  none: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  rowStacked: { alignItems: 'flex-start' },
  stackedAction: { alignItems: 'flex-start', marginTop: 8 },
  headRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headText: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  colRank: { width: 22 },
  colName: { flex: 1, minWidth: 0, gap: 2 },
  colNum: { width: 100, textAlign: 'right' },
  colFeas: { width: 110, paddingLeft: 16 },
  colAction: { width: 136, alignItems: 'flex-end' },
  rank: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600', paddingTop: 1 },
  name: { fontFamily: fonts.body, fontSize: 15, fontWeight: '600' },
  teams: { fontFamily: fonts.body, fontSize: 12 },
  num: { fontFamily: fonts.body, fontSize: 14, fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 4 },
  meta: { fontFamily: fonts.body, fontSize: 13, fontVariant: ['tabular-nums'] },
  feas: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feasText: { fontFamily: fonts.body, fontSize: 13 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  solutionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
  },
  solutionsText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700' },
  noSolutions: { fontFamily: fonts.body, fontSize: 12 },
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyCard: { maxWidth: 420, width: '100%', padding: 24, gap: 12 },
  emptyButton: { alignSelf: 'flex-start' },
});
