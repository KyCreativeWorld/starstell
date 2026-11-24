import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, frosted } from '../theme/themes';
import { withAlpha } from '../theme/color';
import {
  buildSky,
  clusterRadiusPx,
  layoutSky,
  project,
  ringRadiusPx,
  YAW_MAX,
  type Projected,
  type Vec3,
} from '../report/sky3d';
import { formatHours } from '../report/format';
import type { Report } from '../report/types';

const useNativeDriver = Platform.OS !== 'web';
const SKY_TEXT = '#eef1fb';
const SKY_MUTED = 'rgba(238, 241, 251, 0.62)';
/** One full sway of the camera, in ms. */
const DRIFT_PERIOD = 70_000;
const FRAME_MS = Platform.OS === 'web' ? 33 : 50;

interface Props {
  report: Report;
  /** False while the Report tab is hidden: stops the drift animation. */
  active: boolean;
  selectedTeamId: string | null;
  hiddenTeamIds: string[];
  isVisible: (bottleneckId: string) => boolean;
  /** Px kept clear at the top (for overlaid controls). */
  insetTop?: number;
  onSelectTeam: (teamId: string, bottleneckId?: string) => void;
  onClose: () => void;
  /** Shown beside the selected cluster once the camera has zoomed in. */
  menu: React.ReactNode;
}

interface Zoom {
  s: number;
  tx: number;
  ty: number;
  /** Translation that puts the cluster at (tx, ty) after scaling by s. */
  Tx: number;
  Ty: number;
  /** Cluster radius on screen after zooming. */
  rs: number;
  wide: boolean;
  menuLeft: number;
  menuW: number;
  menuTop: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Largest view scale (relative to the constellation's natural size). */
const MAX_SCALE = 3;
/** How much one +/− press zooms. */
const ZOOM_STEP = 1.4;
/** Px at the bottom kept clear for the zoom buttons when the map fits the view. */
const CONTROLS_SPACE = 56;

interface ViewState {
  /** Zoom relative to "fit the whole constellation"; 1 = fit. */
  zoom: number;
  /** Canvas offset in view px; null = centered. */
  pan: { x: number; y: number } | null;
  /** Animation length for this change (0 = jump). */
  ms: number;
}

/** Keeps the scaled canvas covering the view, or centered when it's smaller. */
function clampPan(
  pan: { x: number; y: number } | null,
  scale: number,
  viewW: number,
  viewH: number,
  canvasW: number,
  canvasH: number,
) {
  const w = canvasW * scale;
  const h = canvasH * scale;
  const fitH = viewH - CONTROLS_SPACE;
  const x = w <= viewW ? (viewW - w) / 2 : clamp(pan ? pan.x : (viewW - w) / 2, viewW - w, 0);
  // Centered above the zoom buttons when it fits.
  const y = h <= fitH ? (fitH - h) / 2 : h <= viewH ? (viewH - h) / 2 : clamp(pan ? pan.y : (viewH - h) / 2, viewH - h, 0);
  return { x, y, canPan: w > viewW + 1 || h > viewH + 1 };
}

/** Faux-3D night sky: teams are clusters on a tilted orbit; the camera drifts slowly. */
export function Constellation({
  report,
  active,
  selectedTeamId,
  hiddenTeamIds,
  isVisible,
  insetTop = 0,
  onSelectTeam,
  onClose,
  menu,
}: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const accent = c.primary;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  // --- slow drift clock ---
  const [clock, setClock] = useState(DRIFT_PERIOD * 0.15);
  const clockRef = useRef(DRIFT_PERIOD * 0.15);
  const running = active && !selectedTeamId && !reduceMotion && size.w > 0;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = Date.now();
    let lastPaint = 0;
    const step = () => {
      const now = Date.now();
      clockRef.current += Math.min(100, now - last);
      last = now;
      if (now - lastPaint >= FRAME_MS) {
        lastPaint = now;
        setClock(clockRef.current);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const yaw = reduceMotion ? 0 : YAW_MAX * Math.sin((2 * Math.PI * clock) / DRIFT_PERIOD);

  // --- model & projection ---
  // The ring grows with every department while clusters keep a steady size.
  const teamCount = report.teams.length;
  const narrow = size.w < 700;
  const rhoLimit = clusterRadiusPx(narrow) / ringRadiusPx(teamCount, narrow);
  const model = useMemo(() => buildSky(report, rhoLimit), [report, rhoLimit]);
  const layout = useMemo(
    () => layoutSky(model, teamCount, size.w, size.h, insetTop),
    [model, teamCount, size.w, size.h, insetTop],
  );
  const cam = layout.cam;
  const hidden = useMemo(() => new Set(hiddenTeamIds), [hiddenTeamIds]);
  const teamsById = useMemo(() => new Map(report.teams.map((t) => [t.id, t])), [report]);
  const bottlenecksById = useMemo(() => new Map(report.bottlenecks.map((b) => [b.id, b])), [report]);

  const frame = useMemo(() => {
    const P = (p: Vec3) => project(p, cam, yaw);
    const clusters = model.clusters
      .filter((cl) => !hidden.has(cl.teamId))
      .map((cl) => {
        const center = P(cl.center);
        return {
          cl,
          center,
          rpx: cl.rho * center.scale * ((cam.k + cam.ky) / 2),
          stars: cl.stars.map((s) => ({ s, p: P(s) })),
          dust: cl.dust.map((d) => ({ d, p: P(d) })),
          figure: cl.figure.map(([a, b]) => [P(a), P(b)] as [Projected, Projected]),
        };
      })
      .sort((a, b) => b.center.depth - a.center.depth); // far first
    const starPos = new Map<string, Projected>();
    for (const f of clusters) for (const { s, p } of f.stars) starPos.set(`${s.teamId}:${s.bottleneckId}`, p);
    return { clusters, starPos };
  }, [model, cam, yaw, hidden]);

  // Orbit rings don't change under yaw, so they're computed once per camera.
  const rings = useMemo(
    () =>
      model.rings.map((radius) =>
        Array.from({ length: 72 }, (_, i) => {
          const a = (i / 72) * Math.PI * 2;
          return project({ x: Math.cos(a) * radius, y: 0, z: Math.sin(a) * radius }, cam, 0);
        }),
      ),
    [model, cam],
  );
  const backdrop = useMemo(() => makeBackdrop(size.w, size.h), [size.w, size.h]);

  // --- view scale & pan ---
  // By default the whole constellation fits the view (never enlarged past 1×).
  // People can zoom in with the +/− buttons, the mouse wheel / trackpad, or a pinch,
  // and drag to pan once it's bigger than the view.
  const fit =
    size.w && size.h ? Math.min(1, size.w / layout.canvasW, Math.max(1, size.h - CONTROLS_SPACE) / layout.canvasH) : 1;
  const maxZoom = Math.max(1, MAX_SCALE / fit);
  const [view, setView] = useState<ViewState>({ zoom: 1, pan: null, ms: 0 });
  const userZoom = clamp(view.zoom, 1, maxZoom);
  const scale = fit * userZoom;
  const { x: panX, y: panY, canPan } = clampPan(view.pan, scale, size.w, size.h, layout.canvasW, layout.canvasH);
  const [viewScale] = useState(() => new Animated.Value(1));
  const [panXY] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));

  // Live values the gesture handlers read (kept outside React state; updated after render).
  const [live] = useState(() => ({
    zoom: 1, maxZoom: 1, fit: 1, panX: 0, panY: 0, canPan: false, selected: false, gesturing: false,
    w: 0, h: 0, canvasW: 0, canvasH: 0, pending: null as ViewState | null,
  }));
  useEffect(() => {
    Object.assign(live, {
      zoom: userZoom, maxZoom, fit, panX, panY, canPan, selected: !!selectedTeamId,
      w: size.w, h: size.h, canvasW: layout.canvasW, canvasH: layout.canvasH,
    });
  }, [live, userZoom, maxZoom, fit, panX, panY, canPan, selectedTeamId, size, layout]);

  useEffect(() => {
    if (live.gesturing) return;
    const timing = (v: Animated.Value | Animated.ValueXY, toValue: number | { x: number; y: number }) =>
      Animated.timing(v, { toValue, duration: view.ms, easing: Easing.out(Easing.cubic), useNativeDriver });
    if (view.ms === 0) {
      viewScale.setValue(scale);
      panXY.setValue({ x: panX, y: panY });
    } else {
      Animated.parallel([timing(viewScale, scale), timing(panXY, { x: panX, y: panY })]).start();
    }
  }, [scale, panX, panY, view.ms, viewScale, panXY, live]);

  const [actions] = useState(() => {
    /** Zoom by `factor`, keeping the point `focal` (view px) still. */
    const zoomAt = (factor: number, focal: { x: number; y: number }, ms: number) => {
      if (live.selected) return;
      const s1 = live.fit * live.zoom;
      const zoom = clamp(live.zoom * factor, 1, live.maxZoom);
      const s2 = live.fit * zoom;
      setView({
        zoom,
        pan: { x: focal.x - (focal.x - live.panX) * (s2 / s1), y: focal.y - (focal.y - live.panY) * (s2 / s1) },
        ms,
      });
    };
    const center = () => ({ x: live.w / 2, y: live.h / 2 });
    return {
      zoomAt,
      zoomIn: () => zoomAt(ZOOM_STEP, center(), 260),
      zoomOut: () => zoomAt(1 / ZOOM_STEP, center(), 260),
      reset: () => setView({ zoom: 1, pan: null, ms: 400 }),
      center,
    };
  });

  const [panResponder] = useState(() => {
    let start = { x: 0, y: 0, zoom: 1 };
    let pinch: { d: number; zoom: number; pan: { x: number; y: number } } | null = null;
    const touchDist = (e: GestureResponderEvent) => {
      const t = e.nativeEvent.touches;
      return t.length >= 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0;
    };
    const apply = (zoom: number, pan: { x: number; y: number }) => {
      const scaleNow = live.fit * zoom;
      const c = clampPan(pan, scaleNow, live.w, live.h, live.canvasW, live.canvasH);
      viewScale.setValue(scaleNow);
      panXY.setValue({ x: c.x, y: c.y });
      live.pending = { zoom, pan: { x: c.x, y: c.y }, ms: 0 };
    };
    const finish = () => {
      live.gesturing = false;
      pinch = null;
      if (live.pending) setView(live.pending);
      live.pending = null;
    };
    return PanResponder.create({
      // Claim only pinches and real drags, so taps still reach clusters and stars.
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        !live.selected && (g.numberActiveTouches >= 2 || (live.canPan && Math.abs(g.dx) + Math.abs(g.dy) > 8)),
      onMoveShouldSetPanResponder: (_e, g) =>
        !live.selected && (g.numberActiveTouches >= 2 || (live.canPan && Math.abs(g.dx) + Math.abs(g.dy) > 8)),
      onPanResponderGrant: () => {
        live.gesturing = true;
        viewScale.stopAnimation();
        panXY.stopAnimation();
        start = { x: live.panX, y: live.panY, zoom: live.zoom };
        pinch = null;
      },
      onPanResponderMove: (e, g) => {
        const d = touchDist(e);
        if (d > 0) {
          // Pinch: zoom about the middle of the view.
          if (!pinch) pinch = { d, zoom: live.pending?.zoom ?? start.zoom, pan: live.pending?.pan ?? start };
          const zoom = clamp((pinch.zoom * d) / pinch.d, 1, live.maxZoom);
          const k = zoom / pinch.zoom;
          const f = { x: live.w / 2, y: live.h / 2 };
          apply(zoom, { x: f.x - (f.x - pinch.pan.x) * k, y: f.y - (f.y - pinch.pan.y) * k });
        } else if (!pinch) {
          apply(start.zoom, { x: start.x + g.dx, y: start.y + g.dy });
        }
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    });
  });

  // Mouse wheel / trackpad zoom (web): zoom toward the pointer.
  const skyRef = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    const node = skyRef.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !node || typeof node.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => {
      if (live.selected) return;
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      // Trackpad pinches arrive as ctrl+wheel with small deltas.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      actions.zoomAt(factor, { x: e.clientX - rect.left, y: e.clientY - rect.top }, 90);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [live, actions]);

  // --- zoom camera ---
  const selectedFrame = frame.clusters.find((f) => f.cl.teamId === selectedTeamId);
  // Where the cluster is on screen right now (canvas position × view scale + pan).
  const selCenter = useMemo(
    () =>
      selectedFrame
        ? { x: panX + scale * selectedFrame.center.x, y: panY + scale * selectedFrame.center.y }
        : undefined,
    [selectedFrame, panX, panY, scale],
  );
  const selR = selectedFrame ? selectedFrame.rpx * scale : undefined;

  // After zooming out of a team, leave the map centered on it (when zoomed in).
  const [prevSelected, setPrevSelected] = useState(selectedTeamId);
  if (selectedTeamId !== prevSelected) {
    setPrevSelected(selectedTeamId);
    const was = frame.clusters.find((f) => f.cl.teamId === prevSelected);
    if (!selectedTeamId && was && canPan) {
      setView({ zoom: userZoom, pan: { x: size.w / 2 - scale * was.center.x, y: size.h / 2 - scale * was.center.y }, ms: 700 });
    }
  }
  const zoom = useMemo<Zoom | null>(() => {
    if (!selCenter || !selR || !size.w) return null;
    const { w, h } = size;
    const wide = w >= 700;
    if (wide) {
      const menuW = Math.min(420, w * 0.46);
      const areaW = w - menuW - 48;
      const s = clamp(Math.min((areaW / 2 - 40) / selR, (h * 0.32) / selR), 1, 3);
      const tx = 24 + areaW / 2;
      const ty = h / 2;
      const rs = selR * s;
      return {
        s, tx, ty, rs, wide, menuW,
        Tx: tx - w / 2 - s * (selCenter.x - w / 2),
        Ty: ty - h / 2 - s * (selCenter.y - h / 2),
        menuLeft: Math.min(w - menuW - 16, tx + rs + 44),
        menuTop: 16,
      };
    }
    const s = clamp(Math.min((w * 0.3) / selR, (h * 0.14) / selR), 1, 2.2);
    const rs = selR * s;
    const tx = w / 2;
    const ty = rs + 20;
    return {
      s, tx, ty, rs, wide, menuW: w - 20,
      Tx: tx - w / 2 - s * (selCenter.x - w / 2),
      Ty: ty - h / 2 - s * (selCenter.y - h / 2),
      menuLeft: 10,
      menuTop: ty + rs + 30,
    };
  }, [selCenter, selR, size]);

  const [zx] = useState(() => new Animated.Value(0));
  const [zy] = useState(() => new Animated.Value(0));
  const [zs] = useState(() => new Animated.Value(1));
  const [menuFade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const to = zoom ? { x: zoom.Tx, y: zoom.Ty, s: zoom.s } : { x: 0, y: 0, s: 1 };
    const t = (v: Animated.Value, toValue: number) =>
      Animated.timing(v, { toValue, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver });
    Animated.parallel([t(zx, to.x), t(zy, to.y), t(zs, to.s)]).start();
    if (zoom) {
      menuFade.setValue(0);
      Animated.timing(menuFade, { toValue: 1, delay: 420, duration: 280, useNativeDriver }).start();
    }
  }, [zoom, zx, zy, zs, menuFade]);

  const focus = selectedTeamId ?? hovered;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: Math.round(width), h: Math.round(height) });
  };
  const shift = -yaw * size.w * 0.35;

  return (
    <View
      ref={skyRef}
      onLayout={onLayout}
      style={[
        styles.sky,
        Platform.OS === 'web' && canPan ? ({ cursor: 'grab' } as object) : null,
        {
          borderColor: c.glassBorder,
          backgroundColor: theme.dark ? 'rgba(6, 7, 12, 0.78)' : '#0b111e',
          backgroundImage:
            `radial-gradient(ellipse at 50% 120%, ${withAlpha(accent, 0.28)} 0%, transparent 55%), ` +
            `radial-gradient(ellipse at 20% 10%, ${withAlpha(accent, 0.16)} 0%, transparent 45%), ` +
            `radial-gradient(ellipse at 85% 30%, ${withAlpha(accent, 0.1)} 0%, transparent 40%)`,
        },
      ]}
      accessibilityLabel={`Constellation of ${report.teams.length} teams`}
      {...panResponder.panHandlers}
    >
      {/* Tap empty sky to zoom back out */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={selectedTeamId ? onClose : undefined}
        accessible={false}
      />

      {/* Distant stars: slight parallax opposite the drift */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {backdrop.map((s, i) => {
          const x = (((s.x + shift * s.depth) % size.w) + size.w) % size.w;
          return (
            <View
              key={i}
              style={[styles.dot, { left: x - s.r, top: s.y - s.r, width: s.r * 2, height: s.r * 2, borderRadius: s.r, opacity: s.o }]}
            />
          );
        })}
      </View>

      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: zx }, { translateY: zy }, { scale: zs }] }]}
      >
       <Animated.View
        pointerEvents="box-none"
        style={[
          styles.canvas,
          {
            width: layout.canvasW,
            height: layout.canvasH,
            // Scale about the canvas center, then shift so that screen = pan + scale × canvas.
            transform: [
              { translateX: Animated.add(panXY.x, Animated.multiply(Animated.add(viewScale, -1), layout.canvasW / 2)) },
              { translateY: Animated.add(panXY.y, Animated.multiply(Animated.add(viewScale, -1), layout.canvasH / 2)) },
              { scale: viewScale },
            ],
          },
        ]}
       >
        {/* Orbit rings: brighter on the near side */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: selectedTeamId ? 0.35 : 1 }]}>
          {rings.map((pts, r) =>
            pts.map((p, i) => {
              const q = pts[(i + 1) % pts.length];
              const near = p.depth < 0;
              return (
                <Segment
                  key={`r${r}-${i}`}
                  a={p}
                  b={q}
                  color={accent}
                  opacity={near ? 0.28 : 0.1}
                  thickness={near ? 1.4 : 1}
                />
              );
            }),
          )}
        </View>

        {/* Shared bottlenecks linking clusters */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 1 }]}>
          {model.links.map((l, i) => {
            const a = frame.starPos.get(`${l.a.teamId}:${l.bottleneckId}`);
            const b = frame.starPos.get(`${l.b.teamId}:${l.bottleneckId}`);
            if (!a || !b || !isVisible(l.bottleneckId)) return null;
            const lit = !!focus && (l.a.teamId === focus || l.b.teamId === focus);
            return (
              <Segment
                key={i}
                a={a}
                b={b}
                color={accent}
                opacity={focus ? (lit ? 0.85 : 0.1) : 0.38}
                thickness={lit ? 1.6 : 1}
              />
            );
          })}
        </View>

        {frame.clusters.map((f, order) => {
          const { cl, center, rpx } = f;
          const team = teamsById.get(cl.teamId);
          const visibleCount = (team?.bottleneckIds ?? []).filter(isVisible).length;
          const total = team?.bottleneckIds.length ?? 0;
          const hours = formatHours(team?.hoursLost);
          const isSelected = cl.teamId === selectedTeamId;
          // Selection dims other clusters strongly; hover only a little.
          const dim = selectedTeamId ? !isSelected : !!hovered && cl.teamId !== hovered;
          // Farther clusters are dimmer.
          const fade = clamp((center.scale - 0.7) / 0.55, 0.5, 1);
          const g = rpx * 1.4;
          // Stars sit inside ~80% of the cluster radius; hug them.
          const haloR = rpx * 0.82 + 12;
          const labelW = 160;
          return (
            <View
              key={cl.teamId}
              pointerEvents="box-none"
              style={[StyleSheet.absoluteFill, { zIndex: 10 + order, opacity: dim ? (selectedTeamId ? 0.3 : 0.6) : 1 }]}
            >
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View
                  style={[
                    styles.abs,
                    {
                      left: center.x - g,
                      top: center.y - g,
                      width: g * 2,
                      height: g * 2,
                      borderRadius: g,
                      opacity: fade,
                      ...(Platform.OS === 'web'
                        ? { backgroundImage: `radial-gradient(circle, ${withAlpha(accent, 0.3)} 0%, ${withAlpha(accent, 0.09)} 45%, ${withAlpha(accent, 0)} 70%)` }
                        : { backgroundColor: withAlpha(accent, 0.08) }),
                    },
                  ]}
                />
                {f.figure.map(([a, b], i) => (
                  <Segment key={`f${i}`} a={a} b={b} color={SKY_TEXT} opacity={0.34 * fade} thickness={1} />
                ))}
                {f.dust.map(({ d, p }, i) => {
                  const r = d.baseR * p.scale;
                  return (
                    <View
                      key={`d${i}`}
                      style={[styles.dot, { left: p.x - r, top: p.y - r, width: r * 2, height: r * 2, borderRadius: r, opacity: d.opacity * fade }]}
                    />
                  );
                })}
                {isSelected || cl.teamId === hovered ? (
                  <View
                    style={[
                      styles.abs,
                      {
                        left: center.x - haloR,
                        top: center.y - haloR,
                        width: haloR * 2,
                        height: haloR * 2,
                        borderRadius: haloR,
                        borderWidth: 1,
                        borderColor: withAlpha(accent, isSelected ? 0.75 : 0.4),
                        backgroundColor: withAlpha(accent, isSelected ? 0.06 : 0.03),
                      },
                    ]}
                  />
                ) : null}
              </View>

              <Pressable
                onPress={() => onSelectTeam(cl.teamId)}
                onHoverIn={() => setHovered(cl.teamId)}
                onHoverOut={() => setHovered((h) => (h === cl.teamId ? null : h))}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${cl.name}: ${total} bottleneck${total === 1 ? '' : 's'}${hours ? `, ${hours} lost` : ''}`}
                style={[styles.abs, { left: center.x - haloR, top: center.y - haloR, width: haloR * 2, height: haloR * 2, borderRadius: haloR }]}
              />

              {!(isSelected && zoom) ? (
                <Pressable
                  onPress={() => onSelectTeam(cl.teamId)}
                  onHoverIn={() => setHovered(cl.teamId)}
                  onHoverOut={() => setHovered((h) => (h === cl.teamId ? null : h))}
                  accessible={false}
                  style={[
                    styles.label,
                    {
                      left: clamp(center.x - labelW / 2, 4, Math.max(4, layout.canvasW - labelW - 4)),
                      top: center.y + rpx * 0.8 + 6,
                      width: labelW,
                      opacity: 0.6 + 0.4 * fade,
                      // Keep names readable at any view scale.
                      transform: [{ scale: clamp(1 / scale, 0.45, 1.35) }],
                    },
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.labelName, { fontSize: 12 + 2 * fade }]}>{cl.name}</Text>
                  <Text numberOfLines={1} style={styles.labelMeta}>
                    {[hours, visibleCount === total ? `${total} bottleneck${total === 1 ? '' : 's'}` : `${visibleCount} of ${total} shown`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Pressable>
              ) : null}

              {f.stars.map(({ s, p }) => (
                <StarView
                  key={s.bottleneckId}
                  x={p.x}
                  y={p.y}
                  r={s.baseR * p.scale}
                  detailed={s.detailed}
                  accent={accent}
                  brightness={0.7 + 0.3 * fade}
                  hiddenByFilter={!isVisible(s.bottleneckId)}
                  label={`${bottlenecksById.get(s.bottleneckId)?.name ?? 'Bottleneck'}, ${cl.name}`}
                  onPress={() => onSelectTeam(cl.teamId, s.bottleneckId)}
                  onHover={(on) => setHovered((h) => (on ? cl.teamId : h === cl.teamId ? null : h))}
                />
              ))}
            </View>
          );
        })}
       </Animated.View>
      </Animated.View>

      {!selectedTeamId ? (
        <View style={[styles.controls, frosted, { backgroundColor: c.menu, borderColor: c.glassBorder }]}>
          <ZoomButton label="+" a11y="Zoom in" onPress={actions.zoomIn} disabled={userZoom >= maxZoom - 0.001} />
          <View style={[styles.controlDivider, { backgroundColor: c.glassBorder }]} />
          <ZoomButton label="−" a11y="Zoom out" onPress={actions.zoomOut} disabled={userZoom <= 1.001} />
          <View style={[styles.controlDivider, { backgroundColor: c.glassBorder }]} />
          <ZoomButton label="Reset" a11y="Reset zoom" onPress={actions.reset} disabled={userZoom <= 1.001 && !view.pan} />
        </View>
      ) : null}

      {menu && zoom ? (
        <>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: menuFade }]}>
            {zoom.wide ? (
              zoom.menuLeft - (zoom.tx + zoom.rs) > 14 ? (
                <Segment
                  a={{ x: zoom.tx + zoom.rs + 6, y: zoom.ty }}
                  b={{ x: zoom.menuLeft, y: zoom.ty }}
                  color={accent}
                  opacity={0.7}
                  thickness={1.5}
                />
              ) : null
            ) : (
              <Segment
                a={{ x: zoom.tx, y: zoom.ty + zoom.rs + 6 }}
                b={{ x: zoom.tx, y: zoom.menuTop }}
                color={accent}
                opacity={0.7}
                thickness={1.5}
              />
            )}
          </Animated.View>
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.menuWrap,
              zoom.wide
                ? { left: zoom.menuLeft, width: zoom.menuW, top: 16, bottom: 16, justifyContent: 'center' }
                : { left: 10, right: 10, top: zoom.menuTop, bottom: 10 },
              {
                opacity: menuFade,
                transform: [
                  zoom.wide
                    ? { translateX: menuFade.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }
                    : { translateY: menuFade.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                ],
              },
            ]}
          >
            <View
              style={[
                styles.menu,
                frosted,
                {
                  backgroundColor: c.menu,
                  borderColor: c.glassBorder,
                  borderTopColor: c.glassHighlight,
                  shadowColor: c.shadow,
                  backgroundImage: c.glassSheen,
                },
                !zoom.wide && styles.menuNarrow,
              ]}
            >
              <ScrollView contentContainerStyle={styles.menuContent} showsVerticalScrollIndicator={false}>
                {menu}
              </ScrollView>
            </View>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

function StarView({
  x, y, r, detailed, accent, brightness, hiddenByFilter, label, onPress, onHover,
}: {
  x: number;
  y: number;
  r: number;
  detailed: boolean;
  accent: string;
  brightness: number;
  hiddenByFilter: boolean;
  label: string;
  onPress: () => void;
  onHover: (on: boolean) => void;
}) {
  const [twinkle] = useState(() => new Animated.Value(1));
  const [timing] = useState(() => ({ duration: 1600 + Math.random() * 1800, delay: Math.random() * 1500 }));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 0.55, duration: timing.duration, easing: Easing.inOut(Easing.sin), useNativeDriver }),
        Animated.timing(twinkle, { toValue: 1, duration: timing.duration, easing: Easing.inOut(Easing.sin), useNativeDriver }),
      ]),
    );
    const t = setTimeout(() => loop.start(), timing.delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [twinkle, timing]);

  const glow = r * 2.8;
  const spike = r * 5.5;
  const hit = Math.max(22, r * 3);

  return (
    <Pressable
      onPress={onPress}
      disabled={hiddenByFilter}
      onHoverIn={() => onHover(true)}
      onHoverOut={() => onHover(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.starHit, { left: x - hit / 2, top: y - hit / 2, width: hit, height: hit, opacity: hiddenByFilter ? 0.12 : brightness }]}
    >
      <Animated.View pointerEvents="none" style={[styles.center, { opacity: twinkle }]}>
        <View
          style={[
            styles.abs,
            {
              width: glow * 2,
              height: glow * 2,
              borderRadius: glow,
              ...(Platform.OS === 'web'
                ? { backgroundImage: `radial-gradient(circle, ${withAlpha(accent, 0.6)} 0%, ${withAlpha(accent, 0)} 70%)` }
                : { backgroundColor: withAlpha(accent, 0.2) }),
            },
          ]}
        />
        {detailed ? (
          <>
            <View style={[styles.abs, { width: spike * 2, height: 1, backgroundColor: 'rgba(255,255,255,0.55)' }]} />
            <View style={[styles.abs, { width: 1, height: spike * 2, backgroundColor: 'rgba(255,255,255,0.55)' }]} />
          </>
        ) : null}
        <View style={[styles.abs, { width: r * 2, height: r * 2, borderRadius: r, backgroundColor: '#ffffff' }]} />
      </Animated.View>
    </Pressable>
  );
}

function ZoomButton({
  label, a11y, onPress, disabled,
}: { label: string; a11y: string; onPress: () => void; disabled: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.zoomButton,
        { backgroundColor: pressed || hovered ? c.inputBg : 'transparent', opacity: disabled ? 0.35 : 1 },
      ]}
    >
      <Text style={[styles.zoomButtonText, { color: c.text, fontSize: label.length > 1 ? 13 : 20 }]}>{label}</Text>
    </Pressable>
  );
}

/** A straight line drawn as a thin rotated View (works on web, iOS and Android). */
function Segment({
  a, b, color, opacity, thickness,
}: { a: { x: number; y: number }; b: { x: number; y: number }; color: string; opacity: number; thickness: number }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 0.5) return null;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (a.x + b.x) / 2 - len / 2,
        top: (a.y + b.y) / 2 - thickness / 2,
        width: len,
        height: thickness,
        backgroundColor: color,
        opacity,
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
}

function makeBackdrop(width: number, height: number) {
  if (!width || !height) return [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const count = Math.round(Math.min(140, (width * height) / 5000));
  return Array.from({ length: count }, () => {
    const depth = rand();
    return {
      x: rand() * width,
      y: rand() * height,
      depth,
      r: 0.35 + depth * 0.9,
      o: 0.12 + depth * 0.4,
    };
  });
}

const styles = StyleSheet.create({
  sky: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    // Web: no text selection while dragging, and let the map (not the browser) handle pinches.
    ...(Platform.OS === 'web' ? ({ userSelect: 'none', touchAction: 'none' } as object) : {}),
  },
  canvas: { position: 'absolute', left: 0, top: 0 },
  controls: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    zIndex: 60,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  controlDivider: { width: 1, alignSelf: 'stretch' },
  zoomButton: { minWidth: 42, height: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  zoomButtonText: { fontFamily: fonts.body, fontWeight: '700' },
  dot: { position: 'absolute', backgroundColor: '#ffffff' },
  abs: { position: 'absolute' },
  label: { position: 'absolute', alignItems: 'center' },
  labelName: { fontFamily: fonts.body, fontWeight: '700', textAlign: 'center', color: SKY_TEXT },
  labelMeta: { fontFamily: fonts.body, fontSize: 11, marginTop: 1, textAlign: 'center', color: SKY_MUTED },
  starHit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  menuWrap: { position: 'absolute', zIndex: 100 },
  menu: {
    maxHeight: '100%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 10,
  },
  menuNarrow: { flexShrink: 1 },
  menuContent: { padding: 16 },
});
