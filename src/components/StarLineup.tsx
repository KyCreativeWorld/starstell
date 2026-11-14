import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, frosted } from '../theme/themes';
import { teamColor, withAlpha } from '../theme/color';
import { SkyTwinkles, SunStar } from './StarEffects';
import { formatHours, formatMoney } from '../report/format';
import type { Bottleneck, Report } from '../report/types';

const SKY_TEXT = '#eef1fb';
const SKY_MUTED = 'rgba(238, 241, 251, 0.62)';
const NO_TEAM_COLOR = '#c9ccd6';

export type LineupMetric = 'cost' | 'hours';

interface Props {
  report: Report;
  /** False while the Report tab is hidden: pauses the animations. */
  active: boolean;
  hiddenTeamIds: string[];
  isVisible: (bottleneckId: string) => boolean;
  selectedBottleneckId: string | null;
  /** Px kept clear at the top (for overlaid controls). */
  insetTop: number;
  onSelect: (teamId: string, bottleneckId: string) => void;
  onClose: () => void;
  /** Details panel for the selected star. */
  menu: React.ReactNode;
}

interface Item {
  b: Bottleneck;
  value: number | undefined;
  /** Visible teams, in report order. */
  teams: { id: string; name: string; color: string }[];
}

/** Height of the controls bar along the bottom. */
const BOTTOM_BAR = 64;
/** Space under each star for its rank, name, value and team dots. */
const LABEL_SPACE = 92;
const MIN_D = 10;
/** How far apart the stars sit (1 = each star's full glow has room). */
const SPACING = 2 / 3;

/**
 * Every bottleneck as a star, lined up from biggest to smallest along one line,
 * like a solar-system model or a star-size comparison. Size = annual cost or
 * hours lost per week (area is proportional to the value).
 */
export function StarLineup({
  report,
  active,
  hiddenTeamIds,
  isVisible,
  selectedBottleneckId,
  insetTop,
  onSelect,
  onClose,
  menu,
}: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const accent = c.primary;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [scrollX, setScrollX] = useState(0);
  const [contentW, setContentW] = useState(0);

  // Animations stop while the tab is hidden or the device asks for reduced motion.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);
  const paused = !active || reduceMotion;

  const hasCost = report.bottlenecks.some((b) => b.annualCost !== undefined);
  const [metric, setMetric] = useState<LineupMetric>(hasCost ? 'cost' : 'hours');

  const teamInfo = useMemo(
    () => new Map(report.teams.map((t, i) => [t.id, { id: t.id, name: t.name, color: teamColor(i) }])),
    [report],
  );
  const hidden = useMemo(() => new Set(hiddenTeamIds), [hiddenTeamIds]);

  const { items, hiddenCount } = useMemo(() => {
    const valueOf = (b: Bottleneck) => (metric === 'cost' ? b.annualCost : b.totalHours);
    const shown: Item[] = [];
    for (const b of report.bottlenecks) {
      const teams = b.teamIds.filter((id) => !hidden.has(id)).flatMap((id) => teamInfo.get(id) ?? []);
      // Drop it when its teams are all hidden or it fails the other filters.
      if ((b.teamIds.length > 0 && teams.length === 0) || !isVisible(b.id)) continue;
      shown.push({ b, value: valueOf(b), teams });
    }
    // Biggest first; stars without a value go at the end, in report rank order.
    shown.sort((p, q) => {
      if (p.value === undefined || q.value === undefined) {
        if (p.value !== q.value) return p.value === undefined ? 1 : -1;
        return (p.b.rank ?? 99) - (q.b.rank ?? 99);
      }
      return q.value - p.value;
    });
    return { items: shown, hiddenCount: report.bottlenecks.length - shown.length };
  }, [report, metric, hidden, teamInfo, isVisible]);

  const maxValue = Math.max(0, ...items.map((it) => it.value ?? 0));
  const narrow = size.w < 700;
  // Largest star fills what's left of the height after the labels and controls.
  const maxD = Math.max(
    48,
    Math.min(240, size.h - insetTop - BOTTOM_BAR - LABEL_SPACE - 28, size.w * (narrow ? 0.55 : 0.32)),
  );
  const diameter = (v: number | undefined) =>
    v === undefined || maxValue <= 0 ? MIN_D : Math.max(MIN_D, maxD * Math.sqrt(Math.max(0, v) / maxValue));

  const formatValue = (v: number | undefined) =>
    v === undefined
      ? metric === 'cost' ? 'No cost given' : 'No hours given'
      : metric === 'cost' ? `${formatMoney(v, true)}/yr` : formatHours(v);

  // Web: let a vertical mouse wheel scroll the line sideways.
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement })?.getScrollableNode?.();
    if (!node || typeof node.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      node.scrollLeft += e.deltaY;
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [size.w]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: Math.round(width), h: Math.round(height) });
  };

  const starBox = maxD + 20;
  // Items are top-aligned (so every star sits on the same line) and the row is centered by padding.
  const scrollH = size.h - insetTop - BOTTOM_BAR;
  const padTop = Math.max(8, (scrollH - starBox - LABEL_SPACE) / 2);
  const legendTeams = report.teams.filter((t) => !hidden.has(t.id)).flatMap((t) => teamInfo.get(t.id) ?? []);
  const panelOpen = !!menu;

  // More stars off either side: show arrows and fade that edge.
  const maxScroll = Math.max(0, contentW - size.w);
  const canLeft = scrollX > 4;
  const canRight = scrollX < maxScroll - 4;
  const pageStep = size.w * 0.75;
  const scrollToX = (x: number) => scrollRef.current?.scrollTo({ x: Math.max(0, Math.min(maxScroll, x)), animated: true });
  const onScrollLeft = () => scrollToX(scrollX - pageStep);
  const onScrollRight = () => scrollToX(scrollX + pageStep);
  const arrowTop = insetTop + padTop + starBox / 2 - 22;
  const skyEdge = theme.dark ? 'rgba(6, 7, 12, 0.7)' : 'rgba(11, 17, 30, 0.75)';

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.sky,
        {
          borderColor: c.glassBorder,
          backgroundColor: theme.dark ? 'rgba(6, 7, 12, 0.78)' : '#0b111e',
          backgroundImage:
            `radial-gradient(ellipse at 50% 120%, ${withAlpha(accent, 0.24)} 0%, transparent 55%), ` +
            `radial-gradient(ellipse at 15% 20%, ${withAlpha(accent, 0.12)} 0%, transparent 45%)`,
        },
      ]}
      accessibilityLabel={`${items.length} bottlenecks lined up by ${metric === 'cost' ? 'annual cost' : 'hours lost'}`}
    >
      <SkyTwinkles width={size.w} height={size.h} paused={paused} />

      {size.w > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          style={[styles.scroll, { marginTop: insetTop, marginBottom: BOTTOM_BAR }]}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: padTop, gap: (narrow ? 16 : 36) * SPACING, paddingHorizontal: narrow ? 16 : 40 },
          ]}
          showsHorizontalScrollIndicator
          onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={32}
          onContentSizeChange={(w) => setContentW(w)}
        >
          {/* The line every star sits on */}
          <View
            pointerEvents="none"
            style={[styles.line, { top: padTop + starBox / 2, backgroundColor: withAlpha(accent, 0.45) }]}
          />
          {items.map((it, i) => {
            const d = diameter(it.value);
            const color = it.teams[0]?.color ?? NO_TEAM_COLOR;
            const selected = it.b.id === selectedBottleneckId;
            // Slot width; SPACING scales how far apart the stars sit.
            const itemW = Math.max(d * 1.7 + 32, narrow ? 130 : 160) * SPACING;
            const teamId = it.teams[0]?.id ?? it.b.teamIds[0];
            const value = formatValue(it.value);
            return (
              <Pressable
                key={it.b.id}
                onPress={teamId ? () => onSelect(teamId, it.b.id) : undefined}
                disabled={!teamId}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Number ${i + 1}: ${it.b.name}, ${value}${it.teams.length ? `, ${it.teams.map((t) => t.name).join(', ')}` : ''}`}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.item,
                  { width: itemW, opacity: pressed ? 0.75 : panelOpen && !selected ? 0.55 : 1 },
                  hovered && !selected ? styles.itemHover : null,
                ]}
              >
                <View style={[styles.starBox, { height: starBox }]}>
                  <SunStar
                    d={d}
                    color={color}
                    seed={it.b.id}
                    selected={selected}
                    faded={it.value === undefined}
                    paused={paused}
                  />
                </View>
                <Text style={[styles.rank, { color: selected ? color : SKY_MUTED }]}>{`#${i + 1}`}</Text>
                <Text numberOfLines={2} style={styles.name}>
                  {it.b.name}
                </Text>
                <Text numberOfLines={1} style={styles.value}>
                  {value}
                </Text>
                {it.teams.length ? (
                  <View style={styles.dots}>
                    {it.teams.slice(0, 6).map((t) => (
                      <View key={t.id} style={[styles.teamDot, { backgroundColor: t.color }]} />
                    ))}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
          {items.length === 0 ? (
            <View style={[styles.empty, { width: size.w - 40, marginTop: starBox / 2 - 10 }]}>
              <Text style={styles.emptyText}>No bottlenecks match your filters.</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {/* Faded edges and arrows when more stars are off-screen */}
      {!panelOpen
        ? ([-1, 1] as const).map((dir) => {
            const can = dir < 0 ? canLeft : canRight;
            if (!can) return null;
            const side = dir < 0 ? { left: 0 } : { right: 0 };
            return (
              <React.Fragment key={dir}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.edgeFade,
                    side,
                    Platform.OS === 'web'
                      ? { backgroundImage: `linear-gradient(to ${dir < 0 ? 'right' : 'left'}, ${skyEdge} 0%, rgba(0,0,0,0) 100%)` }
                      : null,
                  ]}
                />
                <Pressable
                  onPress={dir < 0 ? onScrollLeft : onScrollRight}
                  accessibilityRole="button"
                  accessibilityLabel={dir < 0 ? 'Scroll to bigger stars' : 'Scroll to smaller stars'}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.arrow,
                    frosted,
                    dir < 0 ? { left: 12 } : { right: 12 },
                    {
                      top: arrowTop,
                      backgroundColor: c.menu,
                      borderColor: c.glassBorder,
                      opacity: pressed ? 0.7 : hovered ? 1 : 0.9,
                    },
                  ]}
                >
                  <Text style={[styles.arrowText, { color: c.text }]}>{dir < 0 ? '‹' : '›'}</Text>
                </Pressable>
              </React.Fragment>
            );
          })
        : null}

      {/* Bottom controls: size-by toggle and team legend */}
      <View style={styles.bottomBar} pointerEvents="box-none">
        <View style={[styles.segment, frosted, { backgroundColor: c.menu, borderColor: c.glassBorder }]}>
          {(['cost', 'hours'] as const).map((m, i) => {
            const on = metric === m;
            return (
              <React.Fragment key={m}>
                {i > 0 ? <View style={[styles.segmentDivider, { backgroundColor: c.glassBorder }]} /> : null}
                <Pressable
                  onPress={() => setMetric(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={m === 'cost' ? 'Size stars by annual cost' : 'Size stars by hours lost per week'}
                  style={[styles.segmentButton, on && { backgroundColor: withAlpha(accent, 0.3) }]}
                >
                  <Text style={[styles.segmentText, { color: on ? c.text : c.mutedText }]}>
                    {m === 'cost' ? 'Cost' : 'Hours'}
                  </Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.legend} contentContainerStyle={styles.legendContent}>
          {legendTeams.map((t) => (
            <View key={t.id} style={styles.legendItem}>
              <View style={[styles.teamDot, { backgroundColor: t.color }]} />
              <Text numberOfLines={1} style={styles.legendText}>{t.name}</Text>
            </View>
          ))}
          {hiddenCount > 0 ? (
            <Text style={[styles.legendText, { color: SKY_MUTED }]}>{`${hiddenCount} hidden by filters`}</Text>
          ) : null}
        </ScrollView>
      </View>

      {/* Details for the tapped star */}
      {panelOpen ? (
        <>
          <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close details" />
          <View
            style={[
              styles.panelWrap,
              narrow ? { left: 10, right: 10, bottom: 10, top: '38%' } : { right: 16, top: 16, bottom: 16, width: Math.min(420, size.w * 0.46) },
            ]}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.panel,
                frosted,
                {
                  backgroundColor: c.menu,
                  borderColor: c.glassBorder,
                  borderTopColor: c.glassHighlight,
                  shadowColor: c.shadow,
                  backgroundImage: c.glassSheen,
                },
              ]}
            >
              <ScrollView contentContainerStyle={styles.panelContent} showsVerticalScrollIndicator={false}>
                {menu}
              </ScrollView>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sky: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'flex-start', justifyContent: 'center' },
  edgeFade: { position: 'absolute', top: 0, bottom: 0, width: 64, zIndex: 5 },
  arrow: {
    position: 'absolute',
    zIndex: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { fontSize: 28, lineHeight: 30, marginTop: -3, fontWeight: '300' },
  line: { position: 'absolute', left: 0, right: 0, height: 1 },
  item: { alignItems: 'center', paddingHorizontal: 4, borderRadius: 14 },
  itemHover: { backgroundColor: 'rgba(255,255,255,0.05)' },
  starBox: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  rank: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', marginTop: 4 },
  name: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700', color: SKY_TEXT, textAlign: 'center', marginTop: 2, lineHeight: 17 },
  value: { fontFamily: fonts.body, fontSize: 12, color: SKY_MUTED, textAlign: 'center', marginTop: 2 },
  dots: { flexDirection: 'row', gap: 4, marginTop: 5, marginBottom: 4 },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  empty: { alignItems: 'center' },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: SKY_MUTED },
  bottomBar: {
    position: 'absolute',
    zIndex: 7,
    left: 14,
    right: 14,
    bottom: 12,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  segmentDivider: { width: 1, alignSelf: 'stretch' },
  segmentButton: { height: 38, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700' },
  legend: { flex: 1 },
  legendContent: { alignItems: 'center', gap: 14, paddingRight: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: fonts.body, fontSize: 12, color: SKY_TEXT },
  scrim: { backgroundColor: 'rgba(0,0,0,0.25)', zIndex: 90 },
  panelWrap: { position: 'absolute', zIndex: 100, justifyContent: 'center' },
  panel: {
    maxHeight: '100%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 10,
  },
  panelContent: { padding: 16 },
});
