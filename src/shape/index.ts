/**
 * Dot shapes. Every shape is described at a "radius" r: its half-extent along the grid's axes
 * (a circle's radius, half a square's side, a cross's or star's arm length).
 */
import type { Shape } from "../spec/types";

/** A cross's arms are this fraction of r thick, each side of the centre line. */
const CROSS_ARM = 1 / 3;
/** A star's inner corners sit at this fraction of r from the centre. */
const STAR_INNER = 0.35;

/** Dot area at r = 1. */
const AREA: Record<Shape, number> = {
  circle: Math.PI,
  square: 4,
  diamond: 2,
  cross: 8 * CROSS_ARM - 4 * CROSS_ARM * CROSS_ARM,
  star: (4 * STAR_INNER) / Math.SQRT2,
};

/** Distance from the centre to the farthest point, at r = 1. */
const REACH: Record<Shape, number> = {
  circle: 1,
  square: Math.SQRT2,
  diamond: 1,
  cross: Math.hypot(1, CROSS_ARM),
  star: 1,
};

/**
 * The radius, in cells, of an "on" dot at size 1 in the on/off methods: every shape then reaches
 * its neighbours (squares tile, diamonds and stars meet at their points, crosses join up).
 */
export const ON_RADIUS = 0.5;

/** The outline of a dot at the origin with r = 1, unrotated. Circles have none (they're arcs). */
const OUTLINES: Record<Exclude<Shape, "circle">, readonly (readonly [number, number])[]> = {
  square: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
  diamond: [[0, -1], [1, 0], [0, 1], [-1, 0]],
  cross: (() => {
    const w = CROSS_ARM;
    return [[-w, -1], [w, -1], [w, -w], [1, -w], [1, w], [w, w], [w, 1], [-w, 1], [-w, w], [-1, w], [-1, -w], [-w, -w]] as const;
  })(),
  star: (() => {
    const a = STAR_INNER / Math.SQRT2;
    return [[0, -1], [a, -a], [1, 0], [a, a], [0, 1], [-a, a], [-1, 0], [-a, -a]] as const;
  })(),
};

/** The corners of a dot centred on (x, y) with radius r, turned by `turn` degrees. */
export function outline(shape: Exclude<Shape, "circle">, x: number, y: number, r: number, cos: number, sin: number): number[] {
  const out: number[] = [];
  for (const [px, py] of OUTLINES[shape]) out.push(x + r * (px * cos - py * sin), y + r * (px * sin + py * cos));
  return out;
}

/** Whether (dx, dy), relative to the dot's centre and already turned into the dot's frame, is inside it. */
export function inside(shape: Shape, dx: number, dy: number, r: number): boolean {
  if (r <= 0) return false;
  let x = Math.abs(dx) / r;
  let y = Math.abs(dy) / r;
  switch (shape) {
    case "circle":
      return x * x + y * y <= 1;
    case "square":
      return x <= 1 && y <= 1;
    case "diamond":
      return x + y <= 1;
    case "cross":
      return (x <= 1 && y <= CROSS_ARM) || (y <= 1 && x <= CROSS_ARM);
    case "star": {
      if (y > x) [x, y] = [y, x];
      // The triangle (0, 0), (1, 0), (a, a): inside the edge from (1, 0) to (a, a).
      const a = STAR_INNER / Math.SQRT2;
      return (a - 1) * y - a * (x - 1) >= 0;
    }
  }
}

// ── Halftone sizing ─────────────────────────────────────────────────────

const STEPS = 160;
/**
 * Largest halftone radius, in cells. Crosses grow until their arms join their neighbours'; stars
 * stop when their points meet, so they stay stars (later, the gaps between them close into octagons).
 */
function maxRadius(shape: Shape, turn: number): number {
  if (shape !== "star") return 1;
  const rad = (turn * Math.PI) / 180;
  return 0.5 / Math.max(Math.abs(Math.cos(rad)), Math.abs(Math.sin(rad)));
}

interface Table {
  cov: Float64Array;
  maxR: number;
}
const SAMPLES = 40;

const tables = new Map<string, Table>();

/**
 * How much of the grid a shape covers at each radius (in cells), for dots turned `turn` degrees
 * against the grid. Below the radius where dots could reach a neighbour it's the exact area;
 * above it, it's measured on a sample of the tiled grid, so overlaps count once.
 */
function coverageTable(shape: Shape, turn: number): Table {
  const t = ((turn % 90) + 90) % 90;
  const key = `${shape}:${shape === "circle" ? 0 : Math.round(t * 10) / 10}`;
  const cached = tables.get(key);
  if (cached) return cached;
  const rad = (t * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const maxR = maxRadius(shape, t);
  const table = new Float64Array(STEPS + 1);
  for (let k = 1; k <= STEPS; k++) {
    const r = (k / STEPS) * maxR;
    let cov: number;
    if (r * REACH[shape] <= 0.5) {
      cov = AREA[shape] * r * r;
    } else {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = (sx + 0.5) / SAMPLES - 0.5;
          const py = (sy + 0.5) / SAMPLES - 0.5;
          let hit = false;
          for (let ny = -1; ny <= 1 && !hit; ny++) {
            for (let nx = -1; nx <= 1 && !hit; nx++) {
              const dx = px - nx;
              const dy = py - ny;
              // Into the dot's frame: turn back by the dot's rotation.
              hit = inside(shape, dx * cos + dy * sin, -dx * sin + dy * cos, r);
            }
          }
          if (hit) hits++;
        }
      }
      cov = hits / (SAMPLES * SAMPLES);
    }
    table[k] = Math.min(1, Math.max(cov, table[k - 1]!));
  }
  const out = { cov: table, maxR };
  tables.set(key, out);
  return out;
}

/**
 * The halftone radius, in cells, at which dots of a shape cover `tone` of the grid. Tones past
 * what the shape can cover (crosses and stars never fill a cell) get its largest dot.
 */
export function radiusForTone(shape: Shape, turn: number, tone: number): number {
  if (tone <= 0) return 0;
  const { cov: table, maxR } = coverageTable(shape, turn);
  if (tone >= table[STEPS]!) {
    // The first radius at the largest coverage: past it, dots only grow into each other.
    let k = STEPS;
    while (k > 1 && table[k - 1]! >= table[STEPS]! - 1e-9) k--;
    return (k / STEPS) * maxR;
  }
  let lo = 0;
  let hi = STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid]! < tone) lo = mid;
    else hi = mid;
  }
  const a = table[lo]!;
  const b = table[hi]!;
  // Area grows with r², so interpolate in r² between steps.
  const r0 = (lo / STEPS) * maxR;
  const r1 = (hi / STEPS) * maxR;
  const f = b > a ? (tone - a) / (b - a) : 1;
  return Math.sqrt(r0 * r0 + f * (r1 * r1 - r0 * r0));
}

/** The largest coverage a shape reaches, 0–1. */
export function maxCoverage(shape: Shape, turn = 0): number {
  return coverageTable(shape, turn).cov[STEPS]!;
}
