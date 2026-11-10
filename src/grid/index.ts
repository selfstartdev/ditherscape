/**
 * The grid of cells: a square lattice turned by `angle`, anchored at the element's top-left
 * corner (so dots stay put when the element grows), covering the element plus a margin.
 */
import type { Size } from "../spec/position";

export interface Grid {
  /** Cells across and down, in the lattice's own (turned) directions. */
  cols: number;
  rows: number;
  /** Lattice index of the first column and row; indices are absolute, so patterns don't shift. */
  i0: number;
  j0: number;
  cell: number;
  /** Unit vectors along the lattice's columns (u) and rows (v). */
  ux: number;
  uy: number;
  vx: number;
  vy: number;
}

/** Most cells a grid may have. Past this, rendering stalls the page; raise the cell size instead. */
export const MAX_CELLS = 4_000_000;

export function buildGrid(size: Size, cell: number, angle: number, margin = cell): Grid {
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const vx = -uy;
  const vy = ux;
  const corners = [
    [-margin, -margin],
    [size.width + margin, -margin],
    [-margin, size.height + margin],
    [size.width + margin, size.height + margin],
  ] as const;
  let iMin = Infinity, iMax = -Infinity, jMin = Infinity, jMax = -Infinity;
  for (const [x, y] of corners) {
    const i = (x * ux + y * uy) / cell - 0.5;
    const j = (x * vx + y * vy) / cell - 0.5;
    iMin = Math.min(iMin, i);
    iMax = Math.max(iMax, i);
    jMin = Math.min(jMin, j);
    jMax = Math.max(jMax, j);
  }
  const i0 = Math.floor(iMin);
  const j0 = Math.floor(jMin);
  const cols = Math.ceil(iMax) - i0 + 1;
  const rows = Math.ceil(jMax) - j0 + 1;
  if (cols * rows > MAX_CELLS) {
    throw new Error(`ditherscape: ${cols * rows} cells is too many for ${size.width} × ${size.height} at a ${cell}px cell; use a larger cell`);
  }
  return { cols, rows, i0, j0, cell, ux, uy, vx, vy };
}

/** The centre of cell (i, j), counted from the grid's first column and row. */
export function cellCenter(g: Grid, i: number, j: number): { x: number; y: number } {
  const a = (g.i0 + i + 0.5) * g.cell;
  const b = (g.j0 + j + 0.5) * g.cell;
  return { x: a * g.ux + b * g.vx, y: a * g.uy + b * g.vy };
}
