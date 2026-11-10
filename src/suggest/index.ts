/**
 * suggest(): a complete shade from a seed, as a starting point. The output is a plain, static spec.
 */
import { createRandom, type KeyPart, type Random } from "../random";
import type { Method, Shape, ShadeInput, ToneInput } from "../spec/types";

/** Ink and paper pairs that read well together. */
export const PALETTES: readonly { ink: string; paper: string }[] = [
  { ink: "#1d2640", paper: "#fbf6ea" },
  { ink: "#e0577f", paper: "#fffdf9" },
  { ink: "#33b894", paper: "#1d2640" },
  { ink: "#f0a646", paper: "#1d2640" },
  { ink: "#3db8d9", paper: "#fbf6ea" },
  { ink: "#2b2118", paper: "#f2e6cf" },
  { ink: "#f6d79a", paper: "#2d1e2f" },
  { ink: "#0b3d2e", paper: "#e9f2e4" },
  { ink: "#5b3cc4", paper: "#f3efff" },
  { ink: "#111111", paper: "#ffffff" },
];

export const SUGGESTION_KINDS = ["halftone", "dither", "shapes", "grain"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export interface SuggestOptions {
  seed: KeyPart;
  kind?: SuggestionKind;
  /** Parts of a shade to keep as they are: only the rest is generated. */
  keep?: Partial<ShadeInput>;
}

const pick = <T>(random: Random, list: readonly T[]): T => list[random.int(0, list.length - 1)]!;
const round = (n: number, step = 1) => Math.round(n / step) * step;

function tone(random: Random): ToneInput {
  const kind = pick(random, ["linear", "linear", "radial", "radial", "noise"] as const);
  const lo = round(random.range(0, 0.15), 0.05);
  const hi = round(random.range(0.7, 1), 0.05);
  const ends = random.next() < 0.5 ? [lo, hi] : [hi, lo];
  if (kind === "linear") return { linear: { angle: round(random.range(0, 360), 15), stops: ends } };
  if (kind === "radial") {
    const center = `${round(random.range(20, 80), 5)}% ${round(random.range(20, 80), 5)}%`;
    return { radial: { center, stops: ends } };
  }
  return { noise: { scale: round(random.range(120, 480), 20), detail: random.int(2, 5), range: [lo, hi] } };
}

/** A complete shade for a seed. The same seed (and kind and keep) always gives the same shade. */
export function suggest({ seed, kind, keep = {} }: SuggestOptions): ShadeInput {
  const random = createRandom(seed);
  const k: SuggestionKind = kind ?? pick(random.fork("kind"), SUGGESTION_KINDS);
  const r = random.fork(k);
  const palette = pick(r.fork("palette"), PALETTES);
  const out: ShadeInput = { tone: tone(r.fork("tone")), ink: palette.ink, paper: palette.paper };

  if (k === "halftone") {
    Object.assign(out, { method: "halftone", shape: "circle", cell: r.int(5, 12), angle: pick(r, [0, 15, 45, 45, 75]) });
  } else if (k === "dither") {
    const method = pick(r, ["bayer", "blue-noise", "floyd-steinberg", "atkinson"] as const satisfies readonly Method[]);
    Object.assign(out, { method, shape: "square", cell: r.int(2, 5), ...(method === "bayer" ? { matrix: pick(r, [4, 8] as const) } : {}) });
  } else if (k === "shapes") {
    const shape = pick(r, ["square", "diamond", "cross", "star"] as const satisfies readonly Shape[]);
    Object.assign(out, { method: "halftone", shape, cell: r.int(12, 28), angle: pick(r, [0, 0, 45]) });
  } else {
    Object.assign(out, { method: pick(r, ["random", "blue-noise"] as const), shape: "circle", cell: r.int(3, 6), size: round(r.range(0.6, 1), 0.05), jitter: round(r.range(0.2, 0.8), 0.05), seed: r.int(1, 999) });
  }
  // Kept parts win, including ones set to undefined (kept absent).
  return { ...out, ...keep };
}
