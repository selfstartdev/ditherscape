import type { ImageTone, Levels, LinearTone, Method, NoiseTone, RadialTone, Shade, ShadeInput, Shape, Stop, StopInput, Tone, ToneInput } from "./types";

export const METHODS: readonly Method[] = ["halftone", "bayer", "random", "blue-noise", "floyd-steinberg", "atkinson"];
export const SHAPES: readonly Shape[] = ["circle", "square", "diamond", "cross", "star"];

export const LEVELS_DEFAULTS: Levels = { contrast: 1, brightness: 0, invert: false };

/** Everything but the tone, which defaults to DEFAULT_TONE. */
export const SHADE_DEFAULTS: Omit<Shade, "tone"> = {
  method: "halftone",
  cell: 8,
  angle: 0,
  shape: "circle",
  size: 1,
  rotate: 0,
  matrix: 4,
  jitter: 0,
  seed: 0,
  levels: LEVELS_DEFAULTS,
  ink: "currentColor",
  paper: null,
  opacity: 1,
  blend: null,
};

/** Top to bottom, from no ink to full ink. */
export const DEFAULT_TONE: LinearTone = { linear: { angle: 90, stops: [{ offset: 0, tone: 0 }, { offset: 1, tone: 1 }] } };

export const NOISE_DEFAULTS: NoiseTone["noise"] = { scale: 240, detail: 3, range: [0, 1] };

/** The smallest cell resolve() accepts, px. Smaller grids get very large for little gain. */
export const MIN_CELL = 1;

const fail = (msg: string): never => {
  throw new Error(`ditherscape: ${msg}`);
};

const finite = (v: unknown, name: string): number => (typeof v === "number" && Number.isFinite(v) ? v : fail(`${name} must be a number`));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Plain numbers become evenly spread stops; stops are sorted by offset. */
export function resolveStops(stops: readonly StopInput[] | undefined): Stop[] {
  const list = stops ?? [0, 1];
  if (!Array.isArray(list) || list.length === 0) fail("a gradient needs at least one stop");
  const out = list.map((s, i): Stop => {
    if (typeof s === "number") return { offset: list.length === 1 ? 0 : i / (list.length - 1), tone: clamp01(finite(s, "a stop")) };
    if (typeof s !== "object" || s === null) return fail("a stop is a tone (0–1) or { offset, tone }");
    return { offset: clamp01(finite(s.offset, "a stop's offset")), tone: clamp01(finite(s.tone, "a stop's tone")) };
  });
  return out.map((s, i) => ({ s, i })).sort((a, b) => a.s.offset - b.s.offset || a.i - b.i).map(({ s }) => s);
}

export function resolveTone(tone: ToneInput | undefined): Tone {
  if (tone === undefined) return DEFAULT_TONE;
  if (typeof tone === "number") return clamp01(finite(tone, "tone"));
  if (typeof tone !== "object" || tone === null) return fail("tone is a number, a gradient, noise or an image");
  if ("linear" in tone) {
    return { linear: { angle: tone.linear.angle === undefined ? 90 : finite(tone.linear.angle, "the gradient's angle"), stops: resolveStops(tone.linear.stops) } };
  }
  if ("radial" in tone) {
    const r = tone.radial;
    return { radial: { center: r.center ?? "center", radius: r.radius ?? "farthest-corner", stops: resolveStops(r.stops) } } satisfies RadialTone;
  }
  if ("noise" in tone) {
    const n = { ...NOISE_DEFAULTS, ...definedOnly(tone.noise) };
    if (!(finite(n.scale, "noise scale") > 0)) fail("noise scale must be above 0");
    const detail = Math.round(finite(n.detail, "noise detail"));
    if (detail < 1 || detail > 6) fail("noise detail runs from 1 to 6");
    const range = Array.isArray(n.range) && n.range.length === 2 ? [clamp01(finite(n.range[0], "noise range")), clamp01(finite(n.range[1], "noise range"))] as const : fail("noise range is [low, high]");
    return { noise: { scale: n.scale, detail, range } };
  }
  if ("image" in tone) {
    const fit = tone.fit ?? "cover";
    if (fit !== "cover" && fit !== "contain" && fit !== "fill") fail(`fit "${fit}" isn't cover, contain or fill`);
    if (typeof tone.image !== "string" && !(tone.image && typeof tone.image === "object" && "data" in tone.image)) fail("an image tone needs pixels (ImageData) or a URL");
    return { image: tone.image, fit, position: tone.position ?? "center" } satisfies ImageTone;
  }
  return fail("tone is a number, { linear }, { radial }, { noise } or { image }");
}

/** Copies an object without its undefined values, so spreading it over defaults keeps them. */
function definedOnly<T extends object>(value: T | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (!value) return out;
  for (const key of Object.keys(value) as (keyof T)[]) if (value[key] !== undefined) out[key] = value[key];
  return out;
}

/** Fills in every default and checks every value. Resolving a resolved shade returns an equal one. */
export function resolve(input: ShadeInput | Shade): Shade {
  if (typeof input !== "object" || input === null) fail("a shade is an object");
  const given = definedOnly(input as ShadeInput);
  const s = { ...SHADE_DEFAULTS, ...given } as Omit<Shade, "tone" | "levels"> & { levels?: Partial<Levels> };

  if (!METHODS.includes(s.method)) fail(`method "${s.method}" isn't one of ${METHODS.join(", ")}`);
  if (!SHAPES.includes(s.shape)) fail(`shape "${s.shape}" isn't one of ${SHAPES.join(", ")}`);
  if (!(finite(s.cell, "cell") >= MIN_CELL)) fail(`cell must be at least ${MIN_CELL}px`);
  finite(s.angle, "angle");
  if (!(finite(s.size, "size") >= 0)) fail("size can't be negative");
  finite(s.rotate, "rotate");
  if (s.matrix !== 2 && s.matrix !== 4 && s.matrix !== 8) fail("matrix is 2, 4 or 8");
  if (!(finite(s.jitter, "jitter") >= 0 && s.jitter <= 1)) fail("jitter runs from 0 to 1");
  if (typeof s.seed !== "string" && typeof s.seed !== "number") fail("seed is a string or a number");
  if (typeof s.ink !== "string" || s.ink.trim() === "") fail("ink is a CSS colour");
  if (s.paper !== null && typeof s.paper !== "string") fail("paper is a CSS colour or null");
  if (!(finite(s.opacity, "opacity") >= 0 && s.opacity <= 1)) fail("opacity runs from 0 to 1");
  if (s.blend !== null && typeof s.blend !== "string") fail("blend is a CSS mix-blend-mode");

  const levels = { ...LEVELS_DEFAULTS, ...definedOnly(s.levels) };
  if (!(finite(levels.contrast, "contrast") >= 0)) fail("contrast can't be negative");
  if (!(finite(levels.brightness, "brightness") >= -1 && levels.brightness <= 1)) fail("brightness runs from -1 to 1");
  if (typeof levels.invert !== "boolean") fail("invert is true or false");

  return {
    tone: resolveTone((input as ShadeInput).tone),
    method: s.method,
    cell: s.cell,
    angle: s.angle,
    shape: s.shape,
    size: s.size,
    rotate: s.rotate,
    matrix: s.matrix,
    jitter: s.jitter,
    seed: s.seed,
    levels,
    ink: s.ink,
    paper: s.paper,
    opacity: s.opacity,
    blend: s.blend,
  };
}
