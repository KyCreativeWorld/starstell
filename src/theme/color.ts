/** Adds alpha to a #rrggbb color (other formats are returned unchanged). */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Mixes a #rrggbb color toward black (amount 0–1). */
export function shade(color: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** Mixes a #rrggbb color toward white (amount 0–1). */
export function tint(color: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/**
 * Star tints for departments, chosen to stay distinct and readable on the dark sky.
 * Teams take colors in report order; past ten the palette repeats.
 */
export const TEAM_COLORS = [
  '#7fd3e6', // cyan
  '#f2b880', // amber
  '#c7a6ef', // violet
  '#9be3a5', // green
  '#f59bb0', // rose
  '#f3e08a', // yellow
  '#8fb3ff', // blue
  '#e8a4e0', // orchid
  '#a8e6cf', // mint
  '#ffb48f', // peach
];

export function teamColor(index: number): string {
  return TEAM_COLORS[((index % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length];
}
