/** Display helpers for report numbers. */

export function formatHours(n: number | undefined): string | undefined {
  if (n === undefined) return undefined;
  return `${trim(n)} h/wk`;
}

export function formatMoney(n: number | undefined, compact = false): string | undefined {
  if (n === undefined) return undefined;
  if (compact) {
    if (Math.abs(n) >= 1e6) return `$${trim(n / 1e6, 1)}M`;
    if (Math.abs(n) >= 1e4) return `$${Math.round(n / 1e3)}K`;
  }
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function formatCount(n: number | undefined): string | undefined {
  return n === undefined ? undefined : trim(n);
}

function trim(n: number, digits = 1): string {
  const v = Number(n.toFixed(digits));
  return v.toLocaleString('en-US', { maximumFractionDigits: digits });
}
