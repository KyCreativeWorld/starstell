/**
 * A small 3D model of the report: teams are star clusters sitting on a tilted
 * orbit ring, and each bottleneck is a star inside the clusters it affects.
 * Pure and deterministic (the same report always builds the same sky); the
 * component projects it through a slowly swaying perspective camera.
 */
import type { Report } from './types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Star3 extends Vec3 {
  bottleneckId: string;
  teamId: string;
  /** Radius in px before depth scaling. */
  baseR: number;
  /** Analyzed in detail in the report (has solutions): drawn with spikes. */
  detailed: boolean;
}

export interface Dust3 extends Vec3 {
  baseR: number;
  opacity: number;
}

export interface Cluster3 {
  teamId: string;
  name: string;
  center: Vec3;
  /** World-space radius. */
  rho: number;
  /** Angle around the ring, used to order shared-bottleneck links. */
  ringAngle: number;
  stars: Star3[];
  dust: Dust3[];
  figure: [Vec3, Vec3][];
}

export interface SkyModel {
  clusters: Cluster3[];
  links: { bottleneckId: string; a: Star3; b: Star3 }[];
  /** Radii of the faint orbit rings to draw. */
  rings: number[];
}

export interface Camera {
  pitch: number;
  /** Rolled 90° so the orbit runs top-to-bottom (tall, phone-shaped views). */
  roll: boolean;
  /** Camera distance from the ring center, in world units. */
  dist: number;
  /** World units → px, horizontally. */
  k: number;
  /** World units → px, vertically (may stretch a little to fill the view). */
  ky: number;
  ox: number;
  oy: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Perspective scale (≈1 at the ring center, bigger when nearer). */
  scale: number;
  /** Larger = farther away. */
  depth: number;
}

/** Max camera sway either side, in radians. */
export const YAW_MAX = 0.2;
/** Px reserved under each cluster for its label. */
export const LABEL_SPACE = 40;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Small seeded PRNG (mulberry32). */
function rng(seedText: string) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

/**
 * @param rhoLimit Upper bound on a cluster's world radius (ring radius = 1), so
 *   clusters keep a consistent on-screen size as the ring grows.
 */
export function buildSky(report: Report, rhoLimit = Infinity): SkyModel {
  const teams = report.teams;
  const n = teams.length;
  const byId = new Map(report.bottlenecks.map((b) => [b.id, b]));
  if (n === 0) return { clusters: [], links: [], rings: [] };

  const outer = n <= 7 ? n : Math.ceil(n * 0.62);
  const inner = n - outer;
  const rand = rng(teams.map((t) => t.id).join('|'));

  // Biggest cluster radius that keeps neighbours on the ring apart.
  const chord = n === 1 ? 2 : 2 * Math.sin(Math.PI / outer);
  const rhoMax = Math.min(0.5, chord * 0.46, inner ? 0.32 : 1, rhoLimit);

  const weight = (t: (typeof teams)[number]) =>
    t.hoursLost ?? t.bottleneckIds.reduce((s, id) => s + (byId.get(id)?.totalHours ?? 0), 0);
  const maxWeight = Math.max(1, ...teams.map(weight));
  const maxCost = Math.max(1, ...report.bottlenecks.map((b) => b.annualCost ?? b.totalHours ?? 0));

  // Front of the ring (nearest the camera) is +π/2 → z = -1.
  const start = -Math.PI / 2;
  const clusters: Cluster3[] = teams.map((team, i) => {
    const r = rng(team.id);
    let angle = 0;
    let ringR = 0;
    if (n > 1) {
      if (i < outer) {
        angle = start + (i / outer) * Math.PI * 2 + (rand() - 0.5) * 0.15;
        ringR = 1;
      } else {
        const j = i - outer;
        angle = start + Math.PI / outer + (j / Math.max(1, inner)) * Math.PI * 2;
        ringR = inner === 1 ? 0 : 0.45;
      }
    }
    const center: Vec3 = {
      x: Math.cos(angle) * ringR,
      y: (rand() - 0.5) * 0.16,
      z: -Math.sin(angle) * ringR,
    };
    const rho = rhoMax * (0.55 + 0.45 * Math.sqrt(Math.max(0, weight(team)) / maxWeight));

    const ids = [...team.bottleneckIds].sort((a, b) => (byId.get(a)?.rank ?? 99) - (byId.get(b)?.rank ?? 99));
    const k = ids.length;
    const rot = r() * Math.PI * 2;
    const stars: Star3[] = ids.map((id, j) => {
      let off: Vec3;
      if (k === 1) off = { x: rho * 0.1, y: -rho * 0.05, z: 0 };
      else {
        const yy = 1 - (2 * (j + 0.5)) / k;
        const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
        const phi = rot + j * GOLDEN_ANGLE;
        const d = rho * (0.38 + 0.32 * Math.sqrt((j + 0.5) / k));
        off = { x: Math.cos(phi) * rr * d, y: yy * 0.75 * d, z: Math.sin(phi) * rr * d };
      }
      const b = byId.get(id);
      const v = b?.annualCost ?? b?.totalHours;
      return {
        ...add(center, off),
        bottleneckId: id,
        teamId: team.id,
        baseR: v === undefined ? 4.5 : 3.5 + 7 * Math.sqrt(Math.max(0, v) / maxCost),
        detailed: !!b && (b.options.length > 0 || !!b.whatHappensToday || b.rootCauses.length > 0),
      };
    });

    // Faint member stars: more people affected → denser, denser toward the middle.
    const people = team.employeesAffected ?? team.headcount ?? 10;
    const dustCount = Math.round(Math.min(48, Math.max(16, people * 1.2)));
    const dust: Dust3[] = Array.from({ length: dustCount }, () => {
      const u = r() * 2 - 1;
      const phi = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const d = rho * Math.pow(r(), 0.8) * 0.95;
      return {
        ...add(center, { x: s * Math.cos(phi) * d, y: u * d * 0.8, z: s * Math.sin(phi) * d }),
        baseR: 0.6 + r() * 1.1,
        opacity: 0.25 + r() * 0.45,
      };
    });

    // Constellation figure: stars joined around the cluster; a lone star borrows dust.
    const around = (p: Vec3) => Math.atan2(p.z - center.z, p.x - center.x);
    const anchors: Vec3[] = [...stars].sort((a, b) => around(a) - around(b));
    if (anchors.length < 3) {
      const extra = dust
        .filter((d) => Math.hypot(d.x - center.x, d.y - center.y, d.z - center.z) > rho * 0.45)
        .slice(0, 3 - anchors.length);
      extra.forEach((d) => {
        d.opacity = 0.85;
        d.baseR = Math.max(1.3, d.baseR);
      });
      anchors.push(...extra);
    }
    const figure: [Vec3, Vec3][] = [];
    for (let j = 0; j + 1 < anchors.length; j++) figure.push([anchors[j], anchors[j + 1]]);
    if (anchors.length >= 4) figure.push([anchors[anchors.length - 1], anchors[0]]);

    return { teamId: team.id, name: team.name, center, rho, ringAngle: angle, stars, dust, figure };
  });

  // Shared bottlenecks: chain each bottleneck's stars around the ring.
  const links: SkyModel['links'] = [];
  const instances = new Map<string, { star: Star3; angle: number }[]>();
  for (const cl of clusters) {
    for (const s of cl.stars) {
      const list = instances.get(s.bottleneckId) ?? [];
      list.push({ star: s, angle: cl.ringAngle });
      instances.set(s.bottleneckId, list);
    }
  }
  for (const [id, list] of instances) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((p, q) => p.angle - q.angle);
    for (let j = 0; j + 1 < sorted.length; j++) links.push({ bottleneckId: id, a: sorted[j].star, b: sorted[j + 1].star });
  }

  return { clusters, links, rings: n === 1 ? [] : inner > 1 ? [1, 0.45] : [1] };
}

export function project(p: Vec3, cam: Camera, yaw: number): Projected {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const x1 = p.x * c - p.z * s;
  const z1 = p.x * s + p.z * c;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  // Far side of the ring (z > 0) rises up the screen.
  const y2 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  const scale = cam.dist / (cam.dist + z2);
  let u = x1 * scale;
  let v = y2 * scale;
  if (cam.roll) {
    const t = u;
    u = -v;
    v = t;
  }
  return { x: cam.ox + cam.k * u, y: cam.oy + cam.ky * v, scale, depth: z2 };
}

/** Largest on-screen cluster radius, in px. */
export function clusterRadiusPx(narrow: boolean): number {
  return narrow ? 62 : 88;
}

/** Orbit ring radius in px: grows with every department. */
export function ringRadiusPx(teamCount: number, narrow: boolean): number {
  if (teamCount <= 1) return 200;
  return narrow ? 70 + 34 * teamCount : 100 + 44 * teamCount;
}

export interface SkyLayout {
  cam: Camera;
  /** Size of the whole constellation; larger than the view when it needs panning. */
  canvasW: number;
  canvasH: number;
}

/**
 * Lays the constellation out at a fixed scale (set by the number of teams) and
 * returns a canvas big enough to hold it through the whole sway range — at least
 * the size of the view, centered when it fits.
 */
export function layoutSky(
  model: SkyModel,
  teamCount: number,
  viewW: number,
  viewH: number,
  insetTop = 0,
): SkyLayout {
  const pad = 28;
  const narrow = viewW < 700;
  const availW = Math.max(1, viewW - pad * 2);
  const availH = Math.max(1, viewH - pad * 2 - insetTop);
  // Tall views turn the ring on its side; squarer views look down on it more steeply.
  const roll = availH > availW * 1.2;
  const ratio = roll ? availW / availH : availH / availW;
  const pitch = Math.asin(Math.min(0.92, Math.max(0.42, ratio * 0.85)));
  const k = ringRadiusPx(teamCount, narrow);
  const base: Camera = { pitch, roll, dist: 4, k: 1, ky: 1, ox: 0, oy: 0 };

  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const yaw of [-YAW_MAX, -YAW_MAX / 2, 0, YAW_MAX / 2, YAW_MAX]) {
    for (const cl of model.clusters) {
      const p = project(cl.center, base, yaw);
      // Stars sit inside ~85% of the cluster radius.
      const r = cl.rho * p.scale * 0.85;
      umin = Math.min(umin, p.x - r);
      umax = Math.max(umax, p.x + r);
      vmin = Math.min(vmin, p.y - r);
      vmax = Math.max(vmax, p.y + r);
    }
  }
  if (!Number.isFinite(umin)) {
    return { cam: { ...base, k, ky: k, ox: viewW / 2, oy: viewH / 2 }, canvasW: viewW, canvasH: viewH };
  }
  const contentW = (umax - umin) * k;
  const contentH = (vmax - vmin) * k + LABEL_SPACE;
  const canvasW = Math.max(viewW, Math.ceil(contentW + pad * 2));
  const canvasH = Math.max(viewH, Math.ceil(contentH + pad * 2 + insetTop));
  const ox = canvasW / 2 - (k * (umin + umax)) / 2;
  const oy = insetTop + (canvasH - insetTop - contentH) / 2 - k * vmin;
  return { cam: { ...base, k, ky: k, ox, oy }, canvasW, canvasH };
}
