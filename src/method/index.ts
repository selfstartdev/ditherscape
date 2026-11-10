/**
 * Methods: tones per cell → a dot radius per cell (0 = no dot).
 */
import { buildGrid, cellCenter, type Grid } from "../grid";
import { cellHash, hashString } from "../random";
import { ON_RADIUS, radiusForTone } from "../shape";
import type { Size } from "../spec/position";
import type { Shade } from "../spec/types";
import { applyLevels, createToneField } from "../tone";
import { BLUE_NOISE_SIZE, blueNoise } from "./blue-noise";

/** The dots of one shade, ready to draw. Coordinates and radii are px. */
export interface Dots {
  shade: Shade;
  count: number;
  x: Float64Array;
  y: Float64Array;
  r: Float64Array;
  /** Every dot's rotation, degrees: the grid's angle plus the shade's `rotate`. */
  turn: number;
}

/** Bayer matrices, built by recursion: M(2n) = [[4M, 4M+2], [4M+3, 4M+1]]. */
function bayer(n: 2 | 4 | 8): Float32Array {
  let m = [0];
  let size = 1;
  while (size < n) {
    const next = new Array<number>(size * 2 * size * 2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = 4 * m[y * size + x]!;
        next[y * 2 * size + x] = v;
        next[y * 2 * size + x + size] = v + 2;
        next[(y + size) * 2 * size + x] = v + 3;
        next[(y + size) * 2 * size + x + size] = v + 1;
      }
    }
    m = next;
    size *= 2;
  }
  return Float32Array.from(m, (v) => (v + 0.5) / (n * n));
}

const BAYER = { 2: bayer(2), 4: bayer(4), 8: bayer(8) } as const;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Error diffusion kernels: [dx, dy, weight], dx flipped on right-to-left rows. */
const DIFFUSION = {
  "floyd-steinberg": [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]],
  // Atkinson spreads only 6/8 of the error, which keeps highlights and shadows clean.
  atkinson: [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]],
} as const;

/**
 * The tone of every cell of the grid, row by row. The tone is averaged over the cell where the
 * tone source has detail (images).
 */
export function cellTones(shade: Shade, grid: Grid, size: Size): Float32Array {
  const field = createToneField(shade.tone, size, shade.seed);
  const tones = new Float32Array(grid.cols * grid.rows);
  const half = grid.cell / 2;
  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.cols; i++) {
      const c = cellCenter(grid, i, j);
      tones[j * grid.cols + i] = applyLevels(field.at(c.x, c.y, half), shade.levels);
    }
  }
  return tones;
}

/** Dot radius per cell, px, row by row. */
export function cellRadii(shade: Shade, grid: Grid, tones: Float32Array): Float32Array {
  const { cols, rows, cell } = grid;
  const radii = new Float32Array(cols * rows);
  const on = ON_RADIUS * cell * shade.size;
  const seed = hashString(`threshold\u0000${shade.seed}`) >>> 0;

  switch (shade.method) {
    case "halftone": {
      const scale = cell * shade.size;
      // Tones repeat a lot (flat areas, gradients across a row): look each one up once.
      const memo = new Map<number, number>();
      for (let k = 0; k < tones.length; k++) {
        const t = Math.round(tones[k]! * 4096);
        let r = memo.get(t);
        if (r === undefined) {
          r = radiusForTone(shade.shape, shade.rotate, t / 4096) * scale;
          memo.set(t, r);
        }
        radii[k] = r;
      }
      break;
    }
    case "bayer":
    case "random":
    case "blue-noise": {
      const n = shade.method === "bayer" ? shade.matrix : BLUE_NOISE_SIZE;
      const map = shade.method === "bayer" ? BAYER[shade.matrix] : shade.method === "blue-noise" ? blueNoise() : null;
      for (let j = 0; j < rows; j++) {
        const gj = grid.j0 + j;
        for (let i = 0; i < cols; i++) {
          const gi = grid.i0 + i;
          const threshold = map ? map[mod(gj, n) * n + mod(gi, n)]! : cellHash(gi, gj, seed);
          const k = j * cols + i;
          radii[k] = tones[k]! > threshold ? on : 0;
        }
      }
      break;
    }
    case "floyd-steinberg":
    case "atkinson": {
      const kernel = DIFFUSION[shade.method];
      const work = Float32Array.from(tones);
      // A little seeded noise on the threshold breaks up the rows and worms plain error diffusion
      // draws in near-flat areas (and the line it starts with).
      const wobble = (i: number, j: number) => 0.5 + (cellHash(grid.i0 + i, grid.j0 + j, seed) - 0.5) * 0.2;
      // Starting the first rows with random error, as if the dither had been running above them,
      // stops a light area's first dots all landing on one row.
      for (let j = 0; j < Math.min(rows, 2); j++) {
        for (let i = 0; i < cols; i++) work[j * cols + i]! += cellHash(grid.i0 + i, grid.j0 + j, seed ^ 0x51ed) - 0.5;
      }
      for (let j = 0; j < rows; j++) {
        // Serpentine: alternate rows run right to left, which breaks up the worms.
        const reverse = j % 2 === 1;
        for (let step = 0; step < cols; step++) {
          const i = reverse ? cols - 1 - step : step;
          const k = j * cols + i;
          const value = work[k]!;
          const set = value >= wobble(i, j);
          radii[k] = set ? on : 0;
          const error = value - (set ? 1 : 0);
          if (error === 0) continue;
          for (const [dx, dy, w] of kernel) {
            const x = i + (reverse ? -dx : dx);
            const y = j + dy;
            if (x < 0 || x >= cols || y >= rows) continue;
            work[y * cols + x]! += error * w;
          }
        }
      }
      break;
    }
  }
  return radii;
}

/** Every cell of a shade's grid: its dot radius and where the dot sits (jitter moves it off centre). */
export interface Cells {
  grid: Grid;
  /** px, row by row; 0 = no dot. */
  radii: Float32Array;
  /** Dot centres, px, row by row. */
  x: Float64Array;
  y: Float64Array;
  /** The largest radius, px. */
  maxRadius: number;
}

export function buildCells(shade: Shade, size: Size): Cells {
  const grid = buildGrid(size, shade.cell, shade.angle, shade.cell * (1 + shade.jitter));
  const tones = cellTones(shade, grid, size);
  const radii = cellRadii(shade, grid, tones);
  const jitter = shade.jitter * shade.cell;
  const jx = hashString(`jitter-x\u0000${shade.seed}`) >>> 0;
  const jy = hashString(`jitter-y\u0000${shade.seed}`) >>> 0;
  const x = new Float64Array(radii.length);
  const y = new Float64Array(radii.length);
  let maxRadius = 0;
  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.cols; i++) {
      const k = j * grid.cols + i;
      const c = cellCenter(grid, i, j);
      if (jitter > 0) {
        c.x += (cellHash(grid.i0 + i, grid.j0 + j, jx) - 0.5) * jitter;
        c.y += (cellHash(grid.i0 + i, grid.j0 + j, jy) - 0.5) * jitter;
      }
      x[k] = c.x;
      y[k] = c.y;
      if (radii[k]! > maxRadius) maxRadius = radii[k]!;
    }
  }
  return { grid, radii, x, y, maxRadius };
}

/** Radii below this (px) aren't drawn. */
const MIN_RADIUS = 0.01;
/** A dot's farthest point is under 1.5 r (a square's corner is r√2); past that it can't reach the element. */
export const REACH = 1.5;

/**
 * The dots for one resolved shade at an element size: every dot that can touch the element.
 * The shade's tone must be pixels, not a URL.
 */
export function buildDots(shade: Shade, size: Size): Dots {
  const { radii, x: cx, y: cy } = buildCells(shade, size);
  const x: number[] = [];
  const y: number[] = [];
  const r: number[] = [];
  for (let k = 0; k < radii.length; k++) {
    const rad = radii[k]!;
    if (!(rad > MIN_RADIUS)) continue;
    const m = rad * REACH;
    const px = cx[k]!;
    const py = cy[k]!;
    if (px + m < 0 || py + m < 0 || px - m > size.width || py - m > size.height) continue;
    x.push(px);
    y.push(py);
    r.push(rad);
  }
  return { shade, count: r.length, x: Float64Array.from(x), y: Float64Array.from(y), r: Float64Array.from(r), turn: shade.angle + shade.rotate };
}
