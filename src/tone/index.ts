/**
 * Tone fields: the amount of ink wanted at each point of the element, 0 (none) to 1 (full).
 */
import { cellHash, hashString } from "../random";
import { resolveLength, resolvePoint, type Size } from "../spec/position";
import type { ImageDataLike, ImageTone, Levels, Stop, Tone } from "../spec/types";

export interface ToneField {
  /** The tone around (x, y), averaged over a square of half-width `r` px where that matters (images). */
  at(x: number, y: number, r: number): number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The tone at `t` along a list of stops (sorted by offset). */
export function stopsAt(stops: readonly Stop[], t: number): number {
  const first = stops[0]!;
  if (t <= first.offset) return first.tone;
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i]!;
    if (t <= b.offset) {
      const a = stops[i - 1]!;
      const span = b.offset - a.offset;
      return span <= 0 ? b.tone : a.tone + ((t - a.offset) / span) * (b.tone - a.tone);
    }
  }
  return stops[stops.length - 1]!.tone;
}

/** Builds the field for a resolved tone at an element size. Images must already be pixels. */
export function createToneField(tone: Tone, size: Size, seed: string | number = 0): ToneField {
  if (typeof tone === "number") {
    const t = clamp01(tone);
    return { at: () => t };
  }

  if ("linear" in tone) {
    // Like CSS linear-gradient: the gradient line runs through the centre, long enough that the
    // corners land on its ends, so 0 and 1 are reached exactly at the element's corners.
    const a = (tone.linear.angle * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const length = Math.abs(size.width * dx) + Math.abs(size.height * dy) || 1;
    const cx = size.width / 2;
    const cy = size.height / 2;
    const stops = tone.linear.stops;
    return { at: (x, y) => stopsAt(stops, ((x - cx) * dx + (y - cy) * dy) / length + 0.5) };
  }

  if ("radial" in tone) {
    const { center, radius, stops } = tone.radial;
    const c = resolvePoint(center, size);
    let rx: number;
    let ry: number;
    if (radius === "farthest-corner") {
      rx = ry = Math.max(Math.hypot(c.x, c.y), Math.hypot(size.width - c.x, c.y), Math.hypot(c.x, size.height - c.y), Math.hypot(size.width - c.x, size.height - c.y));
    } else if (Array.isArray(radius)) {
      rx = resolveLength(radius[0], size.width);
      ry = resolveLength(radius[1], size.height);
    } else {
      // One length: a circle. Percentages are of the smaller side, so it stays round.
      rx = ry = resolveLength(radius as string | number, Math.min(size.width, size.height));
    }
    rx = Math.max(rx, 1e-6);
    ry = Math.max(ry, 1e-6);
    return { at: (x, y) => stopsAt(stops, Math.hypot((x - c.x) / rx, (y - c.y) / ry)) };
  }

  if ("noise" in tone) {
    const { scale, detail, range } = tone.noise;
    const base = hashString(`noise\u0000${seed}`) >>> 0;
    return {
      at: (x, y) => {
        let sum = 0;
        let amp = 1;
        let total = 0;
        let f = 1 / scale;
        for (let o = 0; o < detail; o++) {
          sum += amp * valueNoise(x * f, y * f, (base + o * 0x9e3779b1) >>> 0);
          total += amp;
          amp *= 0.5;
          f *= 2;
        }
        // Summed octaves crowd round 0.5; stretch them back out to use the range.
        const v = clamp01((sum / total - 0.5) * 1.8 + 0.5);
        return range[0] + v * (range[1] - range[0]);
      },
    };
  }

  return imageField(tone, size);
}

/** Applies contrast, brightness and invert. */
export function applyLevels(t: number, levels: Levels): number {
  let v = levels.invert ? 1 - t : t;
  if (levels.contrast !== 1) v = (v - 0.5) * levels.contrast + 0.5;
  v -= levels.brightness;
  return clamp01(v);
}

// ── Noise ───────────────────────────────────────────────────────────────

const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth value noise in [0, 1). */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = cellHash(ix, iy, seed);
  const b = cellHash(ix + 1, iy, seed);
  const c = cellHash(ix, iy + 1, seed);
  const d = cellHash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// ── Images ──────────────────────────────────────────────────────────────

const sats = new WeakMap<object, Float64Array>();

/**
 * A summed-area table of the image's ink (1 − luminance, over white where transparent), so any
 * box of pixels averages in constant time. Cached per image.
 */
function summedInk(image: ImageDataLike): Float64Array {
  const cached = sats.get(image);
  if (cached) return cached;
  const { width: w, height: h, data } = image;
  if (!(w > 0 && h > 0) || data.length < w * h * 4) throw new Error("ditherscape: the image has no pixels, or fewer than width × height × 4 bytes");
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = data[i + 3]! / 255;
      // Rec. 709 luma on the sRGB values, composited over white.
      const luma = (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255;
      row += (1 - luma) * alpha;
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1]! + row;
    }
  }
  sats.set(image, sat);
  return sat;
}

function imageField(tone: ImageTone, size: Size): ToneField {
  if (typeof tone.image === "string") {
    throw new Error(`ditherscape: the image "${tone.image}" hasn't been loaded. Pass ImageData (loadImage() fetches it in the browser), or use <Ditherscape>, which loads URLs itself.`);
  }
  const image = tone.image;
  const sat = summedInk(image);
  const iw = image.width;
  const ih = image.height;
  const stride = iw + 1;

  let sx: number;
  let sy: number;
  if (tone.fit === "fill") {
    sx = size.width / iw;
    sy = size.height / ih;
  } else {
    sx = sy = tone.fit === "cover" ? Math.max(size.width / iw, size.height / ih) : Math.min(size.width / iw, size.height / ih);
  }
  // object-position: percentages of the space left over (negative when the image overflows).
  const offset = resolvePoint(tone.position, { width: size.width - iw * sx, height: size.height - ih * sy });

  return {
    at(x, y, r) {
      // The box in image pixels, at least one pixel across.
      let x0 = Math.floor((x - r - offset.x) / sx);
      let x1 = Math.ceil((x + r - offset.x) / sx);
      let y0 = Math.floor((y - r - offset.y) / sy);
      let y1 = Math.ceil((y + r - offset.y) / sy);
      if (x1 <= x0) x1 = x0 + 1;
      if (y1 <= y0) y1 = y0 + 1;
      // Outside the image (fit: contain leaves margins): no ink. Partly outside: average what's inside.
      x0 = Math.max(0, x0);
      y0 = Math.max(0, y0);
      x1 = Math.min(iw, x1);
      y1 = Math.min(ih, y1);
      if (x1 <= x0 || y1 <= y0) return 0;
      const sum = sat[y1 * stride + x1]! - sat[y0 * stride + x1]! - sat[y1 * stride + x0]! + sat[y0 * stride + x0]!;
      return sum / ((x1 - x0) * (y1 - y0));
    },
  };
}
