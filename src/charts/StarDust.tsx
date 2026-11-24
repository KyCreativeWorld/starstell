/**
 * Chart colors, and the tiny twinkling stars painted inside chart marks when the
 * theme has `twinkle` on (marks turn night-sky black and fill with stars).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue } from 'react-native';
import { Circle, G } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { shade, tint } from '../theme/color';

/** Night-sky fill for chart marks in the twinkle theme. */
export const NIGHT = '#0b111e';
const NIGHT_SHADES = ['#0b111e', '#22314a', '#111b2c', '#33445e', '#18243a', '#3f5170'];
const STAR = '#ffffff';
const GROUPS = 3;

export interface ChartColors {
  twinkle: boolean;
  /** Main mark color. */
  primary: string;
  /** Second series (e.g. costs next to savings). */
  secondary: string;
  /** Categorical colors for pie slices and legends. */
  palette: string[];
  /** Empty part of a bar. */
  track: string;
  grid: string;
}

export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  const c = theme.colors;
  return useMemo(() => {
    if (theme.twinkle) {
      return { twinkle: true, primary: NIGHT, secondary: '#7d8796', palette: NIGHT_SHADES, track: c.inputBg, grid: c.glassBorder };
    }
    return {
      twinkle: false,
      primary: c.primary,
      secondary: tint(c.accent, 0.55),
      palette: [c.primary, c.accent, tint(c.primary, 0.45), shade(c.accent, 0.35), tint(c.accent, 0.6), shade(c.primary, 0.5)],
      track: c.inputBg,
      grid: c.glassBorder,
    };
  }, [theme, c]);
}

/** Small seeded random, so a chart's stars stay put between renders. */
export function seeded(seed: number) {
  let s = Math.abs(Math.floor(seed * 9973)) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

interface Speck {
  x: number;
  y: number;
  r: number;
  group: number;
}

function makeSpecks(width: number, height: number, seed: number, density: number): Speck[] {
  const rnd = seeded(seed);
  const count = Math.max(1, Math.min(160, Math.round((width * height) / density)));
  return Array.from({ length: count }, () => {
    const r = Math.min(0.4 + rnd() * 0.45, height / 4);
    // Keep stars off the edges so a thin bar's rounded ends don't clip them into dashes.
    const inset = r + 1;
    return {
      x: inset + rnd() * Math.max(0, width - inset * 2),
      y: inset + rnd() * Math.max(0, height - inset * 2),
      r,
      group: Math.floor(rnd() * GROUPS),
    };
  });
}

/** Three opacity values that fade in and out out of step, so stars twinkle in waves. */
function useTwinkleGroups(seed: number, active: boolean, nativeDriver: boolean) {
  const [values] = useState(() => Array.from({ length: GROUPS }, () => new Animated.Value(1)));
  useEffect(() => {
    if (!active) return;
    const rnd = seeded(seed + 0.5);
    const ease = Easing.inOut(Easing.sin);
    const loops = values.map((v) => {
      const duration = 900 + rnd() * 1300;
      const low = 0.12 + rnd() * 0.2;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: low, duration, easing: ease, useNativeDriver: nativeDriver }),
          Animated.timing(v, { toValue: 1, duration, easing: ease, useNativeDriver: nativeDriver }),
        ]),
      );
    });
    const timers = loops.map((l, i) => setTimeout(() => l.start(), i * 450 + rnd() * 400));
    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
    };
  }, [values, seed, active, nativeDriver]);
  return values;
}

/** Tiny twinkling stars filling a View (put it inside a mark with overflow hidden). */
export function StarDust({ seed = 1, density = 90 }: { seed?: number; density?: number }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const specks = useMemo(() => makeSpecks(size.w, size.h, seed, density), [size, seed, density]);
  const groups = useTwinkleGroups(seed, size.w > 0, true);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.w > 0
        ? groups.map((opacity, g) => (
            <Animated.View key={g} style={[StyleSheet.absoluteFill, { opacity }]}>
              {specks
                .filter((s) => s.group === g)
                .map((s, i) => (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      left: s.x - s.r,
                      top: s.y - s.r,
                      width: s.r * 2,
                      height: s.r * 2,
                      borderRadius: s.r,
                      backgroundColor: STAR,
                    }}
                  />
                ))}
            </Animated.View>
          ))
        : null}
    </View>
  );
}

const AnimatedG = Animated.createAnimatedComponent(G);

/** The SVG version of StarDust, clipped to a <ClipPath id={clipId}> defined in the same <Svg>. */
export function SvgStarDust({
  width,
  height,
  clipId,
  seed = 1,
  density = 90,
}: {
  width: number;
  height: number;
  clipId: string;
  seed?: number;
  density?: number;
}) {
  const specks = useMemo(() => makeSpecks(width, height, seed, density), [width, height, seed, density]);
  // SVG props can't use the native driver.
  const groups = useTwinkleGroups(seed, width > 0, false);
  return (
    <G clipPath={`url(#${clipId})`}>
      {groups.map((opacity, g) => (
        <AnimatedG key={g} opacity={opacity}>
          {specks
            .filter((s) => s.group === g)
            .map((s, i) => (
              <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={STAR} />
            ))}
        </AnimatedG>
      ))}
    </G>
  );
}

/**
 * One horizontal bar. Black with twinkling stars in the twinkle theme,
 * otherwise a plain colored bar.
 */
export function ChartBar({
  width,
  height,
  color,
  seed = 1,
}: {
  width: DimensionValue;
  height: number;
  /** Fill outside the twinkle theme (and the base fill inside it). */
  color: string;
  seed?: number;
}) {
  const { twinkle } = useChartColors();
  return (
    <View style={{ width, height, borderRadius: Math.min(4, height / 2), backgroundColor: color, overflow: 'hidden' }}>
      {twinkle ? <StarDust seed={seed} density={height < 8 ? 110 : 150} /> : null}
    </View>
  );
}
