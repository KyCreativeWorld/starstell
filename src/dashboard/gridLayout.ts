/**
 * Places dashboard cards on a fixed grid, keeping the user's order.
 *
 * Each card goes in the first free spot at or after the previous card's spot
 * (reading left to right, top to bottom). So small cards that follow a big card
 * stack up in the space beside it, but a card never jumps ahead of one that
 * comes before it — if a big card doesn't fit in the space left, it moves to
 * the next row and the space stays empty.
 */
import { spanOf, type CardSize } from './cards';

export interface Placement {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

export function placeCards<K>(
  items: { key: K; size: CardSize }[],
  columns: number,
): { placements: Map<K, Placement>; rows: number } {
  const taken: boolean[][] = [];
  const isFree = (row: number, col: number, cols: number, rows: number) => {
    for (let r = row; r < row + rows; r++)
      for (let c = col; c < col + cols; c++) if (taken[r]?.[c]) return false;
    return true;
  };
  const take = (p: Placement) => {
    for (let r = p.row; r < p.row + p.rows; r++) {
      taken[r] ??= [];
      for (let c = p.col; c < p.col + p.cols; c++) taken[r][c] = true;
    }
  };

  const placements = new Map<K, Placement>();
  let cursor = 0; // row * columns + col of the previous card
  let totalRows = 0;

  for (const { key, size } of items) {
    const span = spanOf(size);
    const cols = Math.min(span.cols, columns);
    const rows = span.rows;
    for (let i = cursor; ; i++) {
      const row = Math.floor(i / columns);
      const col = i % columns;
      if (col + cols > columns) continue;
      if (!isFree(row, col, cols, rows)) continue;
      const p = { col, row, cols, rows };
      take(p);
      placements.set(key, p);
      cursor = i;
      totalRows = Math.max(totalRows, row + rows);
      break;
    }
  }
  return { placements, rows: totalRows };
}
