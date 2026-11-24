import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  ScrollViewInstance,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { GlassButton, GlassCard } from '../components/Glass';
import { sidebarWidthFor } from '../components/Sidebar';
import { useReport } from '../report/ReportContext';
import { formatHours, formatMoney } from '../report/format';
import { feasibilityLevel } from '../report/filters';
import { solutionRows, type SolutionRow } from '../report/solutions';
import type { Bottleneck } from '../report/types';

const GAP = 16;
const MAX_WIDTH = 1100;
const SIDE_PADDING = 16;

type Filter = 'all' | 'recommended';

export interface SolutionFocus {
  key?: string;
  bottleneckId?: string;
}

/** Solutions tab: every solution option, grouped by bottleneck. */
export function SolutionsScreen({
  focusKey,
  onOpenReport,
}: {
  /** A solution (key) or a bottleneck's group (bottleneckId) to scroll to. A new object scrolls again. */
  focusKey?: SolutionFocus | null;
  onOpenReport: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { report } = useReport();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const available = windowWidth - sidebarWidthFor(windowWidth) - insets.left - insets.right;
  const contentWidth = Math.min(available, MAX_WIDTH) - SIDE_PADDING * 2;
  const twoCol = contentWidth >= 720;
  const half = twoCol ? (contentWidth - GAP) / 2 : contentWidth;

  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => (report ? solutionRows(report) : []), [report]);

  // Searching for a solution the filter hides switches the filter back to All.
  const [prevFocus, setPrevFocus] = useState(focusKey);
  if (focusKey !== prevFocus) {
    setPrevFocus(focusKey);
    const target = rows.find((r) => r.key === focusKey?.key);
    const hidden = focusKey?.bottleneckId
      ? !rows.some((r) => r.bottleneck.id === focusKey.bottleneckId && r.option.recommended)
      : target && !target.option.recommended;
    if (hidden && filter !== 'all') setFilter('all');
  }

  // Scroll to the searched-for solution once it has been laid out.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const listY = useRef(0);
  const groupY = useRef(new Map<string, number>());
  const gridY = useRef(new Map<string, number>());
  const cardY = useRef(new Map<string, number>());
  const handledFocus = useRef<typeof focusKey>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  useEffect(() => {
    if (!focusKey || handledFocus.current === focusKey) return;
    if (focusKey.bottleneckId) {
      const g = groupY.current.get(focusKey.bottleneckId);
      if (g === undefined) return;
      handledFocus.current = focusKey;
      scrollRef.current?.scrollTo({ y: Math.max(0, listY.current + g - 12), animated: true });
      return;
    }
    const row = rows.find((r) => r.key === focusKey.key);
    if (!row) return;
    const bid = row.bottleneck.id;
    const g = groupY.current.get(bid);
    const gy = gridY.current.get(bid);
    const cy = focusKey.key ? cardY.current.get(focusKey.key) : undefined;
    if (g === undefined || gy === undefined || cy === undefined) return;
    handledFocus.current = focusKey;
    scrollRef.current?.scrollTo({ y: Math.max(0, listY.current + g + gy + cy - 12), animated: true });
  }, [focusKey, rows, layoutTick]);
  const bump = () => {
    if (focusKey && handledFocus.current !== focusKey) setLayoutTick((t) => t + 1);
  };

  if (!report) {
    return (
      <ScrollView contentContainerStyle={styles.emptyWrap}>
        <GlassCard style={styles.emptyCard}>
          <Text style={[styles.title, { color: c.text }]}>Solutions</Text>
          <Text style={[styles.body, { color: c.mutedText }]}>
            Import a consulting report to compare its solution options, costs and savings.
          </Text>
          <GlassButton label="Go to Report" onPress={onOpenReport} style={styles.emptyButton} />
        </GlassCard>
      </ScrollView>
    );
  }

  const recommended = rows.filter((r) => r.option.recommended);
  const byCost = [...report.bottlenecks].sort((a, b) => (b.annualCost ?? -1) - (a.annualCost ?? -1));
  const groups = byCost
    .map((b) => ({ b, rows: rows.filter((r) => r.bottleneck.id === b.id && (filter === 'all' || r.option.recommended)) }))
    .filter((g) => g.rows.length > 0);

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
      <Text style={[styles.title, { color: c.text }]}>Solutions</Text>
      <Text style={[styles.subtitle, { color: c.mutedText }]}>
        {rows.length} solution{rows.length === 1 ? '' : 's'} across {report.bottlenecks.filter((b) => b.options.length).length}{' '}
        bottlenecks · {recommended.length} recommended
      </Text>

      <View
        style={styles.listHead}
        onLayout={(e) => {
          listY.current = e.nativeEvent.layout.y;
          bump();
        }}
      >
        <Text style={[styles.sectionTitle, { color: c.text }]}>
          {filter === 'all' ? 'All solutions' : 'Recommended solutions'}
        </Text>
        <View style={[styles.segment, { borderColor: c.inputBorder, backgroundColor: c.inputBg }]}>
          {(['all', 'recommended'] as Filter[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f }}
              style={[styles.segmentItem, filter === f && { backgroundColor: c.panel, borderColor: c.glassBorder }]}
            >
              <Text style={[styles.segmentText, { color: filter === f ? c.text : c.mutedText }]}>
                {f === 'all' ? 'All' : 'Recommended'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        {groups.map(({ b, rows: gr }) => (
          <View
            key={b.id}
            style={styles.group}
            onLayout={(e) => {
              groupY.current.set(b.id, e.nativeEvent.layout.y);
              bump();
            }}
          >
            <GroupHeader b={b} highlighted={focusKey?.bottleneckId === b.id} />
            <View
              style={styles.cards}
              onLayout={(e) => {
                gridY.current.set(b.id, e.nativeEvent.layout.y);
                bump();
              }}
            >
              {gr.map((r) => (
                <View
                  key={r.key}
                  style={{ width: half }}
                  onLayout={(e) => {
                    cardY.current.set(r.key, e.nativeEvent.layout.y);
                    bump();
                  }}
                >
                  <SolutionCard row={r} highlighted={focusKey?.key === r.key} />
                </View>
              ))}
            </View>
          </View>
        ))}
        {!groups.length ? (
          <Text style={[styles.body, { color: c.mutedText }]}>No solutions match this filter.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}





function GroupHeader({ b, highlighted }: { b: Bottleneck; highlighted: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const meta = [
    b.annualCost !== undefined ? `${formatMoney(b.annualCost, true)}/yr` : undefined,
    formatHours(b.totalHours),
    feasibilityLevel(b.feasibility) ? `${feasibilityLevel(b.feasibility)} feasibility` : undefined,
  ].filter(Boolean);
  return (
    <View style={styles.groupHead}>
      <View style={styles.groupTitleRow}>
        <Text style={[styles.groupTitle, { color: highlighted ? c.primary : c.text }]}>{b.name}</Text>
        <Text style={[styles.groupMeta, { color: c.mutedText }]}>{meta.join(' · ')}</Text>
      </View>
      {b.recommendation ? (
        <Text style={[styles.recommendation, { color: c.mutedText, borderLeftColor: c.primary }]}>
          {b.recommendation}
        </Text>
      ) : null}
    </View>
  );
}

function SolutionCard({ row, highlighted }: { row: SolutionRow; highlighted: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const o = row.option;
  const metrics: [string, string | undefined][] = [
    ['Upfront cost', o.upfrontCost],
    ['Ongoing cost', o.ongoingCost],
    ['Annual savings', o.annualSavings],
    ['Payback', o.payback],
    ['Hours saved', o.hoursSaved],
    ['Time to implement', o.implementationTime],
    ['Effort', o.effort],
    ['Governance risk', o.governanceRisk],
  ];
  const shown = metrics.filter(([, v]) => v);
  return (
    <GlassCard style={[styles.solution, highlighted && { borderColor: c.primary, borderWidth: 2 }]}>
      <View style={styles.solutionTop}>
        <Text style={[styles.optionLetter, { color: c.mutedText }]}>Option {o.letter}</Text>
        {o.recommended ? (
          <View style={[styles.badge, { backgroundColor: c.accent }]}>
            <Text style={[styles.badgeText, { color: c.buttonText }]}>Recommended</Text>
          </View>
        ) : o.alsoSuggested ? (
          <View style={[styles.badge, styles.badgeOutline, { borderColor: c.inputBorder }]}>
            <Text style={[styles.badgeText, { color: c.accent }]}>Also suggested</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.solutionName, { color: c.text }]}>{o.name}</Text>
      {o.type ? <Text style={[styles.solutionType, { color: c.primary }]}>{o.type}</Text> : null}
      {o.howItSolves ? <Text style={[styles.body, { color: c.text }]}>{o.howItSolves}</Text> : null}
      {shown.length ? (
        <View style={[styles.metrics, { borderTopColor: c.glassBorder }]}>
          {shown.map(([label, v]) => (
            <View key={label} style={styles.metric}>
              <Text style={[styles.metricLabel, { color: c.mutedText }]}>{label}</Text>
              <Text style={[styles.metricValue, { color: c.text }]}>{v}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {o.vendors ? <Detail label="Vendors / programs" text={o.vendors} /> : null}
      {o.risks ? <Detail label="Risks & dependencies" text={o.risks} /> : null}
    </GlassCard>
  );
}

function Detail({ label, text }: { label: string; text: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={styles.detail}>
      <Text style={[styles.metricLabel, { color: c.mutedText }]}>{label}</Text>
      <Text style={[styles.detailText, { color: c.text }]}>{text}</Text>
    </View>
  );
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
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: GAP },
  kpi: { padding: 16, gap: 6 },
  kpiLabel: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  kpiValue: { fontFamily: fonts.display, fontSize: 28 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  chartCard: { padding: 18, gap: 16 },
  chartTitle: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: { fontFamily: fonts.display, fontSize: 24 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, padding: 3 },
  segmentItem: { borderRadius: 6, borderWidth: 1, borderColor: 'transparent', paddingVertical: 6, paddingHorizontal: 12 },
  segmentText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
  group: { marginTop: 20 },
  groupHead: { marginBottom: 12, gap: 8 },
  groupTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 2 },
  groupTitle: { fontFamily: fonts.body, fontSize: 18, fontWeight: '700' },
  groupMeta: { fontFamily: fonts.body, fontSize: 13 },
  recommendation: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, borderLeftWidth: 3, paddingLeft: 10 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  solution: { padding: 18, gap: 8 },
  solutionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  optionLetter: { fontFamily: fonts.body, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeOutline: { borderWidth: 1 },
  badgeText: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700' },
  solutionName: { fontFamily: fonts.body, fontSize: 17, fontWeight: '700' },
  solutionType: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  metric: { width: '50%', paddingRight: 8, gap: 2 },
  metricLabel: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  metricValue: { fontFamily: fonts.body, fontSize: 14 },
  detail: { gap: 2, marginTop: 4 },
  detailText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyCard: { maxWidth: 480, width: '100%', gap: 10 },
  emptyButton: { marginTop: 8 },
});
