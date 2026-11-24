import React, { useId, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Line, Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';
import { ChartBar, SvgStarDust, useChartColors } from './StarDust';
import { HoverLayer, Tooltip, type HoverPoint, type Tip } from './Tooltip';

export type { Tip } from './Tooltip';

/** Which data point the pointer is over, and where to anchor its tip. */
interface Hover {
  index: number;
  at: HoverPoint;
  /** Bottom of the hovered item, for tips placed below it. */
  under?: number;
}

interface Box {
  w: number;
  h: number;
}

interface Span {
  y: number;
  h: number;
}

/** Index of the vertical span containing y (with `slack` either side), or -1. */
function spanAt(spans: Span[], y: number, slack: number): number {
  return spans.findIndex((r) => r && y >= r.y - slack && y <= r.y + r.h + slack);
}

const DIM = 0.4;

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Shown at the end of the row, e.g. "$284K". */
  display?: string;
  /** Lines for the hover tip (defaults to `display`). */
  tip?: string[];
}

/** Labeled horizontal bars, largest value = full width. */
export function BarList({ data, barHeight = 12, gap = 12 }: { data: BarDatum[]; barHeight?: number; gap?: number }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const colors = useChartColors();
  const max = Math.max(...data.map((d) => d.value), 1);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hover | null>(null);
  const rows = useRef<Span[]>([]);
  const shown = hover && data[hover.index] ? data[hover.index] : null;
  return (
    <View style={{ gap }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {data.map((d, i) => (
        <View
          key={d.key}
          onLayout={(e) => {
            rows.current[i] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
          }}
          style={{ opacity: hover && hover.index !== i ? DIM : 1 }}
        >
          <View style={styles.rowHead}>
            <Text numberOfLines={1} style={[styles.rowLabel, { color: c.text }]}>
              {d.label}
            </Text>
            {d.display ? <Text style={[styles.rowValue, { color: c.mutedText }]}>{d.display}</Text> : null}
          </View>
          <View style={[styles.track, { height: barHeight, borderRadius: Math.min(4, barHeight / 2), backgroundColor: colors.track }]}>
            <ChartBar
              width={`${Math.max(2, (d.value / max) * 100)}%`}
              height={barHeight}
              color={colors.primary}
              seed={i + 1}
            />
          </View>
        </View>
      ))}
      <HoverLayer
        onMove={(p) => {
          const i = spanAt(rows.current, p.y, gap / 2);
          setHover(i < 0 ? null : { index: i, at: { x: p.x, y: rows.current[i].y }, under: rows.current[i].y + rows.current[i].h });
        }}
        onLeave={() => setHover(null)}
      />
      {shown && hover ? (
        <Tooltip tip={{ title: shown.label, lines: shown.tip ?? [shown.display] }} at={hover.at}
          under={hover.under} width={box.w} height={box.h} />
      ) : null}
    </View>
  );
}

export interface PairDatum {
  key: string;
  label: string;
  a: number;
  b: number;
  aDisplay?: string;
  bDisplay?: string;
  /** Extra lines for the hover tip, after the two values. */
  tip?: string[];
}

/** Two bars per row on a shared scale (e.g. upfront cost vs. annual savings). */
export function PairedBarList({
  data,
  aLabel,
  bLabel,
}: {
  data: PairDatum[];
  aLabel: string;
  bLabel: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const colors = useChartColors();
  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
  const pct = (v: number) => `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%` as const;
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hover | null>(null);
  const groups = useRef<Span[]>([]);
  const shown = hover && data[hover.index] ? data[hover.index] : null;
  return (
    <View style={{ gap: 14 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <View style={styles.legend}>
        <LegendKey color={colors.secondary} label={aLabel} />
        <LegendKey color={colors.primary} label={bLabel} />
      </View>
      {data.map((d, i) => (
        <View
          key={d.key}
          style={{ gap: 5, opacity: hover && hover.index !== i ? DIM : 1 }}
          onLayout={(e) => {
            groups.current[i] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
          }}
        >
          <Text numberOfLines={1} style={[styles.rowLabel, { color: c.text }]}>
            {d.label}
          </Text>
          <View style={styles.pairRow}>
            <View style={styles.pairBar}>
              <ChartBar width={pct(d.a)} height={9} color={colors.secondary} seed={i * 2 + 1} />
            </View>
            <Text style={[styles.pairValue, { color: c.mutedText }]}>{d.aDisplay ?? ''}</Text>
          </View>
          <View style={styles.pairRow}>
            <View style={styles.pairBar}>
              <ChartBar width={pct(d.b)} height={9} color={colors.primary} seed={i * 2 + 2} />
            </View>
            <Text style={[styles.pairValue, { color: c.mutedText }]}>{d.bDisplay ?? ''}</Text>
          </View>
        </View>
      ))}
      <HoverLayer
        onMove={(p) => {
          const i = spanAt(groups.current, p.y, 7);
          setHover(i < 0 ? null : { index: i, at: { x: p.x, y: groups.current[i].y }, under: groups.current[i].y + groups.current[i].h });
        }}
        onLeave={() => setHover(null)}
      />
      {shown && hover ? (
        <Tooltip
          tip={{
            title: shown.label,
            lines: [`${aLabel}: ${shown.aDisplay ?? '—'}`, `${bLabel}: ${shown.bDisplay ?? '—'}`, ...(shown.tip ?? [])],
          }}
          at={hover.at}
          under={hover.under}
          width={box.w}
          height={box.h}
        />
      ) : null}
    </View>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: theme.colors.mutedText }]}>{label}</Text>
    </View>
  );
}

export interface SliceDatum {
  key: string;
  label: string;
  value: number;
  display?: string;
  /** Extra lines for the hover tip, after the value and share. */
  tip?: string[];
}

function arcPath(cx: number, cy: number, r: number, ir: number, a0: number, a1: number): string {
  const p = (rad: number, angle: number) => [cx + rad * Math.sin(angle), cy - rad * Math.cos(angle)];
  // A full circle can't be drawn as one arc; split it.
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r, a0);
  const [x1, y1] = p(r, a1);
  const [x2, y2] = p(ir, a1);
  const [x3, y3] = p(ir, a0);
  return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${ir} ${ir} 0 ${large} 0 ${x3} ${y3} Z`;
}

/** Donut (pie) chart with a legend. */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
}: {
  data: SliceDatum[];
  centerValue?: string;
  centerLabel?: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const colors = useChartColors();
  const clipId = `donut${useId().replace(/[^a-z0-9]/gi, '')}`;
  const size = 168;
  const r = size / 2;
  const ir = r * 0.62;
  const total = data.reduce((a, d) => a + d.value, 0) || 1;

  const ends = data.map((_, i) =>
    (data.slice(0, i + 1).reduce((a, d) => a + d.value, 0) / total) * Math.PI * 2,
  );
  const slices = data.map((d, i) => ({
    ...d,
    a0: i ? ends[i - 1] : 0,
    a1: ends[i],
    color: colors.palette[i % colors.palette.length],
  }));
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hover | null>(null);
  const donutAt = useRef({ x: 0, y: 0 });
  const legendAt = useRef({ x: 0, y: 0, w: 0 });
  const legendRows = useRef<Span[]>([]);
  const sliceAt = (p: HoverPoint): number => {
    // Over the ring?
    const dx = p.x - donutAt.current.x - r;
    const dy = p.y - donutAt.current.y - r;
    const dist = Math.hypot(dx, dy);
    if (dist >= ir && dist <= r) {
      const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
      return slices.findIndex((s) => angle >= s.a0 && angle <= s.a1);
    }
    // Over a legend row?
    const l = legendAt.current;
    if (p.x >= l.x && p.x <= l.x + l.w) return spanAt(legendRows.current, p.y - l.y, 4);
    return -1;
  };
  const shown = hover && slices[hover.index] ? slices[hover.index] : null;

  const ring = `M${r} 0 A${r} ${r} 0 1 1 ${r - 0.01} 0 Z M${r} ${r - ir} A${ir} ${ir} 0 1 0 ${r + 0.01} ${r - ir} Z`;

  return (
    <View style={styles.donutWrap} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <View
        style={{ width: size, height: size }}
        onLayout={(e) => {
          donutAt.current = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y };
        }}
      >
        <Svg width={size} height={size}>
          <Defs>
            <ClipPath id={clipId}>
              <Path d={ring} fillRule="evenodd" clipRule="evenodd" />
            </ClipPath>
          </Defs>
          {slices.map((s, i) => (
            <Path
              key={s.key}
              d={arcPath(r, r, r, ir, s.a0, s.a1)}
              fill={s.color}
              opacity={hover && hover.index !== i ? DIM : 1}
            />
          ))}
          {colors.twinkle ? <SvgStarDust width={size} height={size} clipId={clipId} seed={7} density={80} /> : null}
          {/* Thin gaps between slices. */}
          {slices.length > 1
            ? slices.map((s) => (
                <Line
                  key={`gap-${s.key}`}
                  x1={r + ir * Math.sin(s.a0)}
                  y1={r - ir * Math.cos(s.a0)}
                  x2={r + r * Math.sin(s.a0)}
                  y2={r - r * Math.cos(s.a0)}
                  stroke={c.panel}
                  strokeWidth={2}
                />
              ))
            : null}
        </Svg>
        {centerValue ? (
          <View style={styles.donutCenter} pointerEvents="none">
            <Text style={[styles.donutValue, { color: c.text }]}>{centerValue}</Text>
            {centerLabel ? <Text style={[styles.donutLabel, { color: c.mutedText }]}>{centerLabel}</Text> : null}
          </View>
        ) : null}
      </View>
      <View
        style={styles.donutLegend}
        onLayout={(e) => {
          const l = e.nativeEvent.layout;
          legendAt.current = { x: l.x, y: l.y, w: l.width };
        }}
      >
        {slices.map((s, i) => (
          <View
            key={s.key}
            style={[styles.legendRow, { opacity: hover && hover.index !== i ? DIM : 1 }]}
            onLayout={(e) => {
              legendRows.current[i] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
            }}
          >
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text numberOfLines={1} style={[styles.legendName, { color: c.text }]}>
              {s.label}
            </Text>
            <Text style={[styles.legendPct, { color: c.mutedText }]}>
              {Math.round((s.value / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
      <HoverLayer
        onMove={(p) => {
          const i = sliceAt(p);
          setHover(i < 0 ? null : { index: i, at: p });
        }}
        onLeave={() => setHover(null)}
      />
      {shown && hover ? (
        <Tooltip
          tip={{
            title: shown.label,
            lines: [
              [shown.display, `${Math.round((shown.value / total) * 100)}% of total`].filter(Boolean).join(' · '),
              ...(shown.tip ?? []),
            ],
          }}
          at={hover.at}
          under={hover.under}
          width={box.w}
          height={box.h}
        />
      ) : null}
    </View>
  );
}

export interface LinePoint {
  x: number;
  y: number;
}

/**
 * Line chart with a filled area under the line and a zero line.
 * `marker` highlights one x position (e.g. the payback month).
 */
export function LineChart({
  points,
  height = 190,
  xTicks,
  formatY,
  marker,
  describe,
}: {
  points: LinePoint[];
  height?: number;
  xTicks: { x: number; label: string }[];
  formatY: (v: number) => string;
  marker?: { x: number; label: string };
  /** Hover tip for one point (defaults to the x value and formatted y). */
  describe?: (p: LinePoint) => Tip;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const colors = useChartColors();
  const clipId = `line${useId().replace(/[^a-z0-9]/gi, '')}`;
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const padL = 52;
  const padR = 8;
  const padT = 10;
  const padB = 6;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const spanY = maxY - minY || 1;
  const plotW = Math.max(1, width - padL - padR);
  const plotH = height - padT - padB;
  const sx = (x: number) => padL + ((x - minX) / (maxX - minX || 1)) * plotW;
  const sy = (y: number) => padT + (1 - (y - minY) / spanY) * plotH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)} ${sy(p.y)}`).join(' ');
  const zeroY = sy(0);
  const area = `${line} L${sx(maxX)} ${zeroY} L${sx(minX)} ${zeroY} Z`;
  const yTicks = [maxY, 0, minY].filter((v, i, a) => a.indexOf(v) === i);
  const hp = hover !== null ? points[hover] : undefined;
  const nearest = (x: number): number => {
    const t = (x - padL) / plotW;
    const target = minX + Math.max(0, Math.min(1, t)) * (maxX - minX);
    return points.reduce((best, p, i) => (Math.abs(p.x - target) < Math.abs(points[best].x - target) ? i : best), 0);
  };

  return (
    <View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <>
            <Svg width={width} height={height}>
              <Defs>
                <ClipPath id={clipId}>
                  <Path d={area} />
                </ClipPath>
              </Defs>
              {yTicks.map((v) => (
                <Line
                  key={v}
                  x1={padL}
                  x2={width - padR}
                  y1={sy(v)}
                  y2={sy(v)}
                  stroke={v === 0 ? c.mutedText : colors.grid}
                  strokeWidth={1}
                  strokeDasharray={v === 0 ? undefined : '3 4'}
                  opacity={v === 0 ? 0.5 : 1}
                />
              ))}
              <Path d={area} fill={colors.primary} opacity={colors.twinkle ? 1 : 0.14} />
              {colors.twinkle ? <SvgStarDust width={width} height={height} clipId={clipId} seed={11} density={110} /> : null}
              <Path d={line} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
              {marker ? (
                <>
                  <Line x1={sx(marker.x)} x2={sx(marker.x)} y1={padT} y2={height - padB} stroke={c.accent} strokeDasharray="2 3" />
                  <Circle cx={sx(marker.x)} cy={zeroY} r={4.5} fill={c.panel} stroke={c.accent} strokeWidth={2} />
                </>
              ) : null}
              {hp ? (
                <>
                  <Line x1={sx(hp.x)} x2={sx(hp.x)} y1={padT} y2={height - padB} stroke={c.mutedText} strokeWidth={1} opacity={0.6} />
                  <Circle cx={sx(hp.x)} cy={sy(hp.y)} r={5} fill={c.panel} stroke={colors.primary} strokeWidth={2.5} />
                </>
              ) : null}
            </Svg>
            {yTicks.map((v) => (
              <Text key={v} style={[styles.yTick, { top: sy(v) - 8, color: c.mutedText }]}>
                {formatY(v)}
              </Text>
            ))}
            {marker ? (
              <Text
                style={[
                  styles.markerLabel,
                  { color: c.accent, borderColor: c.glassBorder, backgroundColor: c.panel },
                  sx(marker.x) > width - 130 ? { right: width - sx(marker.x) + 6 } : { left: sx(marker.x) + 6 },
                  { top: zeroY > height / 2 ? padT : height - padB - 24 },
                ]}
              >
                {marker.label}
              </Text>
            ) : null}
            <HoverLayer onMove={(p) => setHover(nearest(p.x))} onLeave={() => setHover(null)} />
            {hp ? (
              <Tooltip
                tip={describe ? describe(hp) : { title: String(hp.x), lines: [formatY(hp.y)] }}
                at={{ x: sx(hp.x), y: sy(hp.y) }}
                width={width}
                height={height}
              />
            ) : null}
          </>
        ) : null}
      </View>
      <View style={[styles.xTicks, { marginLeft: padL, marginRight: padR }]}>
        {xTicks.map((t, i) => (
          <Text
            key={t.x}
            numberOfLines={1}
            style={[
              styles.xTick,
              { color: c.mutedText, left: `${((t.x - minX) / (maxX - minX || 1)) * 100}%` },
              // Keep the first and last labels inside the chart.
              i === 0 ? styles.xTickFirst : i === xTicks.length - 1 ? styles.xTickLast : null,
            ]}
          >
            {t.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 5 },
  rowLabel: { flex: 1, fontFamily: fonts.body, fontSize: 13, fontWeight: '600' },
  rowValue: { fontFamily: fonts.body, fontSize: 12 },
  track: { overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: fonts.body, fontSize: 12 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pairBar: { flex: 1 },
  pairValue: { fontFamily: fonts.body, fontSize: 12, width: 62, textAlign: 'right' },
  donutWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20 },
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  donutValue: { fontFamily: fonts.display, fontSize: 24 },
  donutLabel: { fontFamily: fonts.body, fontSize: 11, marginTop: 1 },
  donutLegend: { flex: 1, minWidth: 150, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendName: { flex: 1, fontFamily: fonts.body, fontSize: 13 },
  legendPct: { fontFamily: fonts.body, fontSize: 12 },
  yTick: { position: 'absolute', left: 0, width: 46, textAlign: 'right', fontFamily: fonts.body, fontSize: 11 },
  xTicks: { height: 18, marginTop: 4 },
  xTick: { position: 'absolute', width: 48, marginLeft: -24, textAlign: 'center', fontFamily: fonts.body, fontSize: 11 },
  xTickFirst: { marginLeft: 0, textAlign: 'left' },
  xTickLast: { marginLeft: -48, textAlign: 'right' },
  markerLabel: {
    position: 'absolute',
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
  },
});
