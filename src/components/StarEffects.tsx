/**
 * Animated pieces for the star line-up: a twinkling backdrop and sun-like stars
 * whose churning surface and outgoing dust waves grow with the star's size.
 *
 * Web runs every loop as a CSS animation (no per-frame JavaScript, so dozens of
 * them stay cheap); iOS/Android use Animated loops on the native driver.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { shade, tint, withAlpha } from '../theme/color';

const isWeb = Platform.OS === 'web';

type LoopKind = 'twinkle' | 'spin' | 'breathe' | 'wave';

/** How far each loop moves (kept in sync between the CSS keyframes and the native interpolations). */
const TWINKLE_MIN = 0.22;
const BREATHE_SCALE = 1.07;
const WAVE_SCALE = 1.6;

// Web keyframes. RN-web only compiles `animationKeyframes` through StyleSheet.create.
const webLoops = (isWeb
  ? StyleSheet.create({
      twinkle: {
        animationKeyframes: [{ '0%': { opacity: 1 }, '50%': { opacity: TWINKLE_MIN }, '100%': { opacity: 1 } }],
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
      },
      spin: {
        animationKeyframes: [{ '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } }],
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
      },
      breathe: {
        animationKeyframes: [
          { '0%': { transform: 'scale(1)' }, '50%': { transform: `scale(${BREATHE_SCALE})` }, '100%': { transform: 'scale(1)' } },
        ],
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
      },
      wave: {
        animationKeyframes: [
          { '0%': { transform: 'scale(1)', opacity: 0.9 }, '100%': { transform: `scale(${WAVE_SCALE})`, opacity: 0 } },
        ],
        animationTimingFunction: 'ease-out',
        animationIterationCount: 'infinite',
      },
    } as unknown as Record<LoopKind, ViewStyle>)
  : null) as Record<LoopKind, ViewStyle> | null;

interface LoopProps {
  kind: LoopKind;
  /** One full cycle, in ms. */
  duration: number;
  /** Where in the cycle to start, 0–1 (desyncs neighbours). */
  phase?: number;
  reverse?: boolean;
  paused: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** A view that loops one simple animation forever. Keep positioning transforms off `style`. */
function Loop(props: LoopProps) {
  return isWeb ? <WebLoop {...props} /> : <NativeLoop {...props} />;
}

function WebLoop({ kind, duration, phase = 0, reverse, paused, style, children }: LoopProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        style,
        webLoops?.[kind],
        {
          animationDuration: `${Math.round(duration)}ms`,
          // A negative delay starts part-way through the cycle.
          animationDelay: `${-Math.round(phase * duration)}ms`,
          animationDirection: reverse ? 'reverse' : 'normal',
          animationPlayState: paused ? 'paused' : 'running',
        } as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}

function NativeLoop({ kind, duration, phase = 0, reverse, paused, style, children }: LoopProps) {
  const [t] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (paused) return;
    const there = (toValue: number, ms: number) =>
      Animated.timing(t, { toValue, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const anim =
      kind === 'twinkle' || kind === 'breathe'
        ? Animated.loop(Animated.sequence([there(1, duration / 2), there(0, duration / 2)]))
        : Animated.loop(
            Animated.timing(t, {
              toValue: 1,
              duration,
              easing: kind === 'spin' ? Easing.linear : Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            { iterations: -1, resetBeforeIteration: true },
          );
    const timer = setTimeout(() => anim.start(), phase * duration);
    return () => {
      clearTimeout(timer);
      anim.stop();
    };
  }, [t, kind, duration, phase, paused]);

  const range = (out: number[] | string[]) => t.interpolate({ inputRange: [0, 1], outputRange: out as number[] });
  const animated =
    kind === 'twinkle'
      ? { opacity: range([1, TWINKLE_MIN]) }
      : kind === 'spin'
        ? { transform: [{ rotate: range(['0deg', reverse ? '-360deg' : '360deg']) }] }
        : kind === 'breathe'
          ? { transform: [{ scale: range([1, BREATHE_SCALE]) }] }
          : { opacity: range([0.9, 0]), transform: [{ scale: range([1, WAVE_SCALE]) }] };

  return (
    <Animated.View pointerEvents="none" style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

/** Small seeded PRNG (mulberry32), so a star always gets the same surface. */
function rng(seedText: string) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Twinkling backdrop

/** Faint white stars scattered over the whole view, each fading in and out on its own beat. */
export function SkyTwinkles({ width, height, paused }: { width: number; height: number; paused: boolean }) {
  const stars = useMemo(() => {
    if (!width || !height) return [];
    const r = rng(`sky:${Math.round(width / 50)}x${Math.round(height / 50)}`);
    const count = Math.round(Math.min(170, Math.max(40, (width * height) / 3800)));
    return Array.from({ length: count }, () => {
      const depth = r();
      return {
        x: r() * width,
        y: r() * height,
        size: 0.7 + depth * 1.8,
        opacity: 0.25 + depth * 0.6,
        duration: 1800 + r() * 3600,
        phase: r(),
        // A few brighter ones get a soft halo.
        halo: depth > 0.92,
      };
    });
  }, [width, height]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((s, i) => (
        <Loop
          key={i}
          kind="twinkle"
          duration={s.duration}
          phase={s.phase}
          paused={paused}
          style={[styles.abs, { left: s.x - s.size * 2, top: s.y - s.size * 2, width: s.size * 4, height: s.size * 4, opacity: s.opacity }]}
        >
          <View style={styles.centerFill}>
            {s.halo ? (
              <View
                style={[
                  styles.abs,
                  {
                    width: s.size * 4,
                    height: s.size * 4,
                    borderRadius: s.size * 2,
                    ...(isWeb
                      ? { backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 70%)' }
                      : { backgroundColor: 'rgba(255,255,255,0.08)' }),
                  },
                ]}
              />
            ) : null}
            <View style={{ width: s.size, height: s.size, borderRadius: s.size / 2, backgroundColor: '#ffffff' }} />
          </View>
        </Loop>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sun-like star

interface SunStarProps {
  /** Disc diameter in px. */
  d: number;
  color: string;
  /** Seeds the surface pattern (e.g. the bottleneck id). */
  seed: string;
  selected: boolean;
  faded: boolean;
  paused: boolean;
}

/** Surface activity from star size: 0 for the smallest stars, 1 for the giants. */
function activity(d: number) {
  return Math.max(0, Math.min(1, (d - 26) / 170));
}

/**
 * A glowing sphere in its department's color. Bigger stars get a churning,
 * granulated surface with drifting plasma bands, and dust waves that roll off
 * the edge — more of them, stronger and further-reaching the bigger the star.
 */
export function SunStar({ d, color, seed, selected, faded, paused }: SunStarProps) {
  const a = activity(d);

  const surface = useMemo(() => {
    const r = rng(seed);
    // The rotating layers are bigger than the disc so their corners never show.
    const L = d * 1.45;
    // Fine, soft mottling (granulation) rather than big crater-like spots.
    const spot = (light: boolean) => {
      const size = d * (light ? 0.06 + r() * 0.09 : 0.05 + r() * 0.08);
      return {
        x: r() * L - size / 2,
        y: r() * L - size / 2,
        size,
        alpha: light ? 0.2 + r() * 0.25 : 0.1 + r() * 0.14,
      };
    };
    const granules = a > 0 ? Math.round(10 + 55 * a) : 0;
    const bands = a > 0.12 ? Math.round(1 + 4 * a) : 0;
    return {
      L,
      light: Array.from({ length: granules }, () => spot(true)),
      dark: Array.from({ length: granules }, () => spot(false)),
      bands: Array.from({ length: bands }, () => {
        const size = d * (0.8 + r() * 0.8);
        return { x: r() * L - size / 2, y: r() * L - size / 2, size, alpha: 0.1 + r() * (0.08 + 0.12 * a) };
      }),
      spinA: 60_000 + r() * 40_000,
      spinB: 80_000 + r() * 50_000,
      spinC: 40_000 + r() * 30_000,
      phase: r(),
    };
  }, [d, seed, a]);

  // Dust waves: 0 for small stars, up to 3 staggered rings for the biggest.
  const waves = a < 0.1 ? 0 : 1 + Math.round(2 * a);
  const waveMs = 4200 + 1800 * a;
  const waveAlpha = 0.18 + 0.34 * a;
  const waveWidth = 1 + 3 * a;

  const glow = d * 1.7 + 14;
  const ring = d + 12;
  const dark = shade(color, 0.45);
  const waveColor = tint(color, 0.35);
  /** The disc's edge as a % of the glow's radius. */
  const edge = Math.round((d / glow) * 100);
  const off = (d - surface.L) / 2;

  return (
    <View style={[styles.anchor, { opacity: faded ? 0.5 : 1 }]} pointerEvents="none">
      {/* Outer glow, breathing slightly on active stars */}
      <Loop
        kind="breathe"
        duration={6000 + 2000 * surface.phase}
        phase={surface.phase}
        paused={paused || a === 0}
        style={[
          styles.abs,
          {
            width: glow,
            height: glow,
            borderRadius: glow / 2,
            ...(isWeb
              ? {
                  // Brightest right at the disc's edge (the corona), fading outward.
                  // `closest-side` makes the % stops relative to the glow's own radius.
                  backgroundImage: `radial-gradient(circle closest-side, ${withAlpha(color, 0.6)} 0%, ${withAlpha(color, 0.5)} ${edge}%, ${withAlpha(color, 0.16)} ${edge + (100 - edge) * 0.4}%, ${withAlpha(color, 0)} 100%)`,
                }
              : { backgroundColor: withAlpha(color, 0.14) }),
          },
        ]}
      />

      {/* Dust waves rolling off the surface */}
      {Array.from({ length: waves }, (_, i) => (
        <Loop
          key={`w${i}`}
          kind="wave"
          duration={waveMs}
          phase={(i / waves + surface.phase) % 1}
          paused={paused}
          style={[
            styles.abs,
            {
              width: d + 2,
              height: d + 2,
              borderRadius: (d + 2) / 2,
              ...(isWeb
                ? {
                    // A soft, dusty band rather than a hard line.
                    backgroundImage: `radial-gradient(circle, ${withAlpha(waveColor, 0)} 60%, ${withAlpha(waveColor, waveAlpha)} ${69 - 4 * a}%, ${withAlpha(waveColor, waveAlpha * 0.4)} 75%, ${withAlpha(waveColor, 0)} 79%)`,
                  }
                : { borderWidth: waveWidth, borderColor: withAlpha(waveColor, waveAlpha) }),
            },
          ]}
        />
      ))}

      {/* The disc */}
      <View
        style={[
          styles.abs,
          styles.disc,
          {
            width: d,
            height: d,
            borderRadius: d / 2,
            backgroundColor: color,
            ...(isWeb
              ? // Emissive: white-hot core fading to the department color.
                { backgroundImage: `radial-gradient(circle at 50% 50%, ${tint(color, 0.7)} 0%, ${tint(color, 0.25)} 35%, ${color} 70%, ${shade(color, 0.15)} 100%)` }
              : {}),
          },
        ]}
      >
        {surface.light.length ? (
          <>
            {/* Bright granules drifting one way… */}
            <Loop
              kind="spin"
              duration={surface.spinA}
              phase={surface.phase}
              paused={paused}
              style={[styles.abs, { left: off, top: off, width: surface.L, height: surface.L }]}
            >
              {surface.light.map((s, i) => (
                <View
                  key={i}
                  style={[
                    styles.abs,
                    {
                      left: s.x,
                      top: s.y,
                      width: s.size,
                      height: s.size,
                      borderRadius: s.size / 2,
                      ...(isWeb
                        ? { backgroundImage: `radial-gradient(circle, rgba(255,255,255,${s.alpha}) 0%, rgba(255,255,255,0) 70%)` }
                        : { backgroundColor: `rgba(255,255,255,${s.alpha * 0.45})` }),
                    },
                  ]}
                />
              ))}
            </Loop>
            {/* …and darker lanes between them drifting the other way */}
            <Loop
              kind="spin"
              duration={surface.spinB}
              phase={1 - surface.phase}
              reverse
              paused={paused}
              style={[styles.abs, { left: off, top: off, width: surface.L, height: surface.L }]}
            >
              {surface.dark.map((s, i) => (
                <View
                  key={i}
                  style={[
                    styles.abs,
                    {
                      left: s.x,
                      top: s.y,
                      width: s.size,
                      height: s.size,
                      borderRadius: s.size / 2,
                      ...(isWeb
                        ? { backgroundImage: `radial-gradient(circle, ${withAlpha(dark, s.alpha)} 0%, ${withAlpha(dark, 0)} 70%)` }
                        : { backgroundColor: withAlpha(dark, s.alpha * 0.4) }),
                    },
                  ]}
                />
              ))}
            </Loop>
          </>
        ) : null}

        {/* Plasma bands: faint arcs sweeping across the surface */}
        {surface.bands.length ? (
          <Loop
            kind="spin"
            duration={surface.spinC}
            phase={surface.phase}
            paused={paused}
            style={[styles.abs, { left: off, top: off, width: surface.L, height: surface.L }]}
          >
            {surface.bands.map((b, i) => (
              <View
                key={i}
                style={[
                  styles.abs,
                  {
                    left: b.x,
                    top: b.y,
                    width: b.size,
                    height: b.size,
                    borderRadius: b.size / 2,
                    ...(isWeb
                      ? // A soft glowing filament, not a crisp line.
                        { backgroundImage: `radial-gradient(circle, rgba(255,255,255,0) 60%, rgba(255,255,255,${b.alpha}) 67%, rgba(255,255,255,0) 74%)` }
                      : { borderWidth: 1, borderColor: `rgba(255,255,255,${b.alpha * 0.8})` }),
                  },
                ]}
              />
            ))}
          </Loop>
        ) : null}

        {/* Glowing core and gentle limb darkening: it shines, rather than being lit */}
        {isWeb ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundImage:
                  `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 40%), ` +
                  `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 62%, ${withAlpha(shade(color, 0.35), 0.5)} 100%)`,
              },
            ]}
          />
        ) : (
          <View
            style={[
              styles.abs,
              {
                left: d * 0.25,
                top: d * 0.25,
                width: d * 0.5,
                height: d * 0.5,
                borderRadius: d * 0.25,
                backgroundColor: 'rgba(255,255,255,0.3)',
              },
            ]}
          />
        )}
      </View>

      {selected ? (
        <View style={[styles.abs, { width: ring, height: ring, borderRadius: ring / 2, borderWidth: 1.5, borderColor: '#ffffff' }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // A 1×1 point everything centers on, so the star can overflow its box.
  anchor: { width: 1, height: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  disc: { overflow: 'hidden' },
});
