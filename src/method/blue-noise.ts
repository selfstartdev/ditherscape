/**
 * A 64 × 64 blue-noise threshold map, made with Ulichney's void-and-cluster method from a fixed
 * seed, so it's the same everywhere. Built once, on first use (a few tens of milliseconds).
 */
import { mulberry32 } from "../random";

export const BLUE_NOISE_SIZE = 64;

const SIGMA = 1.9;
const RADIUS = 8;

let cached: Float32Array | null = null;

/** Thresholds in (0, 1), row by row: rank + 0.5 over the cell count. */
export function blueNoise(): Float32Array {
  if (cached) return cached;
  const n = BLUE_NOISE_SIZE;
  const total = n * n;
  const kernel: number[] = [];
  for (let dy = -RADIUS; dy <= RADIUS; dy++) {
    for (let dx = -RADIUS; dx <= RADIUS; dx++) kernel.push(Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA)));
  }

  /** Adds (sign 1) or removes (−1) a point's energy, wrapping round the tile. */
  const splat = (energy: Float64Array, index: number, sign: number) => {
    const x = index % n;
    const y = (index - x) / n;
    let k = 0;
    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      const row = ((y + dy + n) % n) * n;
      for (let dx = -RADIUS; dx <= RADIUS; dx++) energy[row + ((x + dx + n) % n)]! += sign * kernel[k++]!;
    }
  };

  /** The tightest cluster (most energy among 1s) or the largest void (least energy among 0s). */
  const find = (bits: Uint8Array, energy: Float64Array, want: 0 | 1) => {
    let best = -1;
    let bestE = want === 1 ? -Infinity : Infinity;
    for (let i = 0; i < total; i++) {
      if (bits[i] !== want) continue;
      const e = energy[i]!;
      if (want === 1 ? e > bestE : e < bestE) {
        bestE = e;
        best = i;
      }
    }
    return best;
  };

  // The initial pattern: a tenth of the cells at random, then relaxed by moving the tightest
  // cluster's point into the largest void until that's where it already was.
  const random = mulberry32(0x5eed);
  const initial = new Uint8Array(total);
  const energy = new Float64Array(total);
  let ones = 0;
  while (ones < total / 10) {
    const i = Math.floor(random() * total);
    if (initial[i]) continue;
    initial[i] = 1;
    splat(energy, i, 1);
    ones++;
  }
  for (let guard = 0; guard < total; guard++) {
    const cluster = find(initial, energy, 1);
    initial[cluster] = 0;
    splat(energy, cluster, -1);
    const voidAt = find(initial, energy, 0);
    initial[voidAt] = 1;
    splat(energy, voidAt, 1);
    if (voidAt === cluster) break;
  }

  const rank = new Int32Array(total);
  // Phase 1: take the initial points away, tightest cluster first, ranking them downwards.
  {
    const bits = initial.slice();
    const e = energy.slice();
    for (let r = ones - 1; r >= 0; r--) {
      const i = find(bits, e, 1);
      bits[i] = 0;
      splat(e, i, -1);
      rank[i] = r;
    }
  }
  // Phase 2: from the initial pattern, fill the largest void each time, ranking upwards.
  {
    const bits = initial.slice();
    const e = energy.slice();
    for (let r = ones; r < total; r++) {
      const i = find(bits, e, 0);
      bits[i] = 1;
      splat(e, i, 1);
      rank[i] = r;
    }
  }

  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) out[i] = (rank[i]! + 0.5) / total;
  cached = out;
  return out;
}
