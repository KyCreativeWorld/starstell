/**
 * Hover tooltips for charts. A chart lays a transparent `HoverLayer` over itself
 * and maps the pointer position to a data point; `Tooltip` shows that point's
 * details just above the pointer. The layer never takes touches, so tapping a
 * card still opens its page. On touch screens the tip shows while a finger is down.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts } from '../theme/themes';

export interface Tip {
  title: string;
  lines?: (string | undefined | false)[];
}

export interface HoverPoint {
  x: number;
  y: number;
}

type PointerLike = { nativeEvent: { offsetX: number; offsetY: number } };

/** Transparent layer on top of a chart that reports where the pointer is. */
export function HoverLayer({ onMove, onLeave }: { onMove: (p: HoverPoint) => void; onLeave: () => void }) {
  const move = (e: PointerLike) => onMove({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  return (
    <View
      style={styles.layer}
      onPointerEnter={move}
      onPointerMove={move}
      onPointerLeave={onLeave}
      onPointerCancel={onLeave}
    />
  );
}

const TIP_WIDTH = 210;
const OFFSET = 10;
/** How far a tip may rise above the chart (over the card's title). */
const OVERHANG = 40;

/**
 * The tip box inside a chart that is `width` × `height`. It sits above `at` when
 * there is room, otherwise below `under` (the bottom of the hovered item).
 */
export function Tooltip({
  tip,
  at,
  under = at.y + 6,
  width,
  height,
}: {
  tip: Tip;
  at: HoverPoint;
  under?: number;
  width: number;
  height: number;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [tipHeight, setTipHeight] = useState(0);
  const w = Math.min(TIP_WIDTH, width);
  const left = Math.max(0, Math.min(at.x - w / 2, width - w));
  const above = at.y - tipHeight - OFFSET >= -OVERHANG;
  const place = above ? { bottom: height - at.y + OFFSET } : { top: under + OFFSET };
  const lines = (tip.lines ?? []).filter((l): l is string => !!l);
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => setTipHeight(e.nativeEvent.layout.height)}
      // Hidden until measured, so it never flashes in the wrong place.
      style={[styles.tip, place, { left, width: w, backgroundColor: c.text, shadowColor: c.shadow, opacity: tipHeight ? 1 : 0 }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.title, { color: c.panel }]}>{tip.title}</Text>
      {lines.map((l, i) => (
        <Text key={i} style={[styles.line, { color: c.panel }]}>
          {l}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2 },
  tip: {
    position: 'absolute',
    zIndex: 3,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  title: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  line: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, opacity: 0.85 },
});
