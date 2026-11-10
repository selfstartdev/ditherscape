import { describe, expect, it } from "vitest";
import {
  blueNoise,
  BLUE_NOISE_SIZE,
  createToneField,
  dots,
  maxCoverage,
  METHODS,
  parseColor,
  presets,
  radiusForTone,
  rasterize,
  resolve,
  resolvePoint,
  SHAPES,
  suggest,
  toDataUrl,
  toSvg,
  type Method,
  type ShadeInput,
} from "../src";
import { checker, flat } from "./images";

const size = { width: 200, height: 160 };

/** Share of pixels with ink. */
function inked(shade: ShadeInput, s = size, scale = 4) {
  const px = rasterize({ ink: "#000", ...shade }, s, { scale });
  let n = 0;
  for (let i = 3; i < px.data.length; i += 4) if (px.data[i]! > 0) n++;
  return n / (px.width * px.height);
}

describe("resolve", () => {
  it("fills in defaults", () => {
    const s = resolve({});
    expect(s).toMatchObject({ method: "halftone", cell: 8, angle: 0, shape: "circle", size: 1, ink: "currentColor", paper: null });
    expect(s.tone).toEqual({ linear: { angle: 90, stops: [{ offset: 0, tone: 0 }, { offset: 1, tone: 1 }] } });
  });

  it("is idempotent", () => {
    for (const p of Object.values(presets)) expect(resolve(resolve(p))).toEqual(resolve(p));
  });

  it("spreads plain stops evenly and sorts stops", () => {
    expect(resolve({ tone: { linear: { stops: [0, 0.5, 1] } } }).tone).toEqual({ linear: { angle: 90, stops: [{ offset: 0, tone: 0 }, { offset: 0.5, tone: 0.5 }, { offset: 1, tone: 1 }] } });
    const t = resolve({ tone: { radial: { stops: [{ offset: 1, tone: 0 }, { offset: 0, tone: 1 }] } } }).tone as { radial: { stops: { offset: number }[] } };
    expect(t.radial.stops.map((s) => s.offset)).toEqual([0, 1]);
  });

  it("keeps defaults for undefined values", () => {
    expect(resolve({ cell: undefined, levels: { contrast: undefined } }).cell).toBe(8);
  });

  it.each<[string, ShadeInput]>([
    ["unknown method", { method: "lines" as Method }],
    ["unknown shape", { shape: "heart" as never }],
    ["tiny cell", { cell: 0.5 }],
    ["bad matrix", { matrix: 3 as never }],
    ["jitter > 1", { jitter: 2 }],
    ["opacity > 1", { opacity: 2 }],
    ["empty stops", { tone: { linear: { stops: [] } } }],
    ["bad fit", { tone: { image: checker(4, 4), fit: "stretch" as never } }],
  ])("rejects %s", (_name, input) => {
    expect(() => resolve(input)).toThrow(/^ditherscape:/);
  });
});

describe("positions", () => {
  const s = { width: 400, height: 200 };
  it.each<[string, { x: number; y: number }]>([
    ["center", { x: 200, y: 100 }],
    ["left", { x: 0, y: 100 }],
    ["top", { x: 200, y: 0 }],
    ["top right", { x: 400, y: 0 }],
    ["25% 75%", { x: 100, y: 150 }],
    ["right 40px top 10%", { x: 360, y: 20 }],
    ["bottom 10px left", { x: 0, y: 190 }],
  ])("%s", (p, expected) => {
    expect(resolvePoint(p, s)).toEqual(expected);
  });

  it("rejects nonsense and prototype keys", () => {
    expect(() => resolvePoint("middle", s)).toThrow();
    expect(() => resolvePoint("constructor", s)).toThrow();
  });
});

describe("tones", () => {
  it("linear gradients reach their ends at the corners", () => {
    const f = createToneField(resolve({}).tone, size);
    expect(f.at(0, 0, 0)).toBeCloseTo(0);
    expect(f.at(100, size.height, 0)).toBeCloseTo(1);
    expect(f.at(50, 80, 0)).toBeCloseTo(0.5);
  });

  it("radial gradients run from the centre", () => {
    const f = createToneField(resolve({ tone: { radial: { radius: 50, stops: [1, 0] } } }).tone, size);
    expect(f.at(100, 80, 0)).toBeCloseTo(1);
    expect(f.at(150, 80, 0)).toBeCloseTo(0);
  });

  it("noise is seeded and stays in range", () => {
    const tone = resolve({ tone: { noise: { range: [0.2, 0.6] } } }).tone;
    const a = createToneField(tone, size, 1);
    const b = createToneField(tone, size, 1);
    const c = createToneField(tone, size, 2);
    let differs = false;
    for (let i = 0; i < 50; i++) {
      const v = a.at(i * 13, i * 7, 0);
      expect(v).toBeGreaterThanOrEqual(0.2);
      expect(v).toBeLessThanOrEqual(0.6);
      expect(b.at(i * 13, i * 7, 0)).toBe(v);
      if (c.at(i * 13, i * 7, 0) !== v) differs = true;
    }
    expect(differs).toBe(true);
  });

  it("images: dark is ink, transparent is none, cells average", () => {
    expect(createToneField(resolve({ tone: { image: flat(4, 4, 0) } }).tone, size).at(10, 10, 0)).toBeCloseTo(1);
    expect(createToneField(resolve({ tone: { image: flat(4, 4, 0, 0) } }).tone, size).at(10, 10, 0)).toBeCloseTo(0);
    // A checkerboard averaged over a big box is half ink.
    const f = createToneField(resolve({ tone: { image: checker(32, 32), fit: "fill" } }).tone, { width: 32, height: 32 });
    expect(f.at(16, 16, 8)).toBeCloseTo(0.5);
  });

  it("contain leaves the margins empty", () => {
    const f = createToneField(resolve({ tone: { image: flat(10, 10, 0), fit: "contain" } }).tone, { width: 200, height: 100 });
    expect(f.at(100, 50, 1)).toBeCloseTo(1);
    expect(f.at(10, 50, 1)).toBe(0);
  });

  it("asks for pixels when given a URL", () => {
    expect(() => toSvg({ tone: { image: "/cat.jpg" } }, size)).toThrow(/loadImage/);
  });
});

describe("methods", () => {
  it.each(METHODS)("%s puts down about as much ink as the tone asks for", (method) => {
    for (const tone of [0.25, 0.5]) {
      // Halftone dots are fractions of a cell, so give them room to be measured.
      const ink = inked({ method, tone, cell: method === "halftone" ? 16 : 4, shape: "square" });
      // Atkinson spreads only 3/4 of the error by design, so light tones come out lighter.
      if (method === "atkinson") expect(Math.abs(ink - tone)).toBeLessThan(0.08);
      else expect(ink).toBeCloseTo(tone, 1);
    }
  });

  it("no tone, no dots; full tone, full cover for square halftone", () => {
    expect(dots({ tone: 0 }, size)[0]!.count).toBe(0);
    expect(inked({ tone: 1, shape: "square", cell: 5 })).toBe(1);
  });

  it.each(SHAPES)("%s halftone coverage tracks the tone", (shape) => {
    const max = maxCoverage(shape);
    for (const tone of [0.1, 0.3]) {
      expect(inked({ tone, shape, cell: 20 }, { width: 400, height: 400 }, 2)).toBeCloseTo(Math.min(tone, max), 1);
    }
  });

  it("halftone radius grows with the tone", () => {
    let prev = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const r = radiusForTone("circle", 0, t);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    expect(radiusForTone("circle", 0, 0)).toBe(0);
  });

  it("blue noise uses every threshold once", () => {
    const map = blueNoise();
    expect(map).toHaveLength(BLUE_NOISE_SIZE * BLUE_NOISE_SIZE);
    expect(new Set(map).size).toBe(map.length);
  });

  it("the grid is anchored: growing the element keeps existing dots", () => {
    const shade: ShadeInput = { method: "bayer", tone: 0.5, cell: 10, angle: 30 };
    const small = dots(shade, { width: 100, height: 100 })[0]!;
    const big = dots(shade, { width: 300, height: 300 })[0]!;
    const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
    const bigSet = new Set(Array.from(big.x, (x, i) => key(x, big.y[i]!)));
    for (let i = 0; i < small.count; i++) if (small.x[i]! > 10 && small.y[i]! > 10 && small.x[i]! < 90 && small.y[i]! < 90) expect(bigSet.has(key(small.x[i]!, small.y[i]!))).toBe(true);
  });

  it("random and jitter follow the seed", () => {
    const a = toSvg({ method: "random", jitter: 0.5, seed: 1, tone: 0.5 }, size);
    expect(toSvg({ method: "random", jitter: 0.5, seed: 1, tone: 0.5 }, size)).toBe(a);
    expect(toSvg({ method: "random", jitter: 0.5, seed: 2, tone: 0.5 }, size)).not.toBe(a);
  });

  it("levels: invert flips the ink", () => {
    expect(inked({ tone: 0.2, levels: { invert: true }, shape: "square", cell: 4, method: "bayer" })).toBeCloseTo(0.8, 1);
    expect(inked({ tone: 0.5, levels: { brightness: 0.5 }, cell: 4 })).toBe(0);
  });
});

describe("output", () => {
  it("SVG is deterministic and well formed", () => {
    const svg = toSvg(presets.sphere, size);
    expect(toSvg(presets.sphere, size)).toBe(svg);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="200" height="160" viewBox="0 0 200 160"><path fill="currentColor" d="M[^"]+"\/><\/svg>$/);
  });

  it("SVG has paper, opacity and blend", () => {
    const svg = toSvg({ paper: "#fff", ink: "red", opacity: 0.5, blend: "multiply" }, size);
    expect(svg).toContain('<rect width="100%" height="100%" fill="#fff"/>');
    expect(svg).toContain('fill="red" opacity="0.5" style="mix-blend-mode:multiply"');
  });

  it("toDataUrl is a CSS url()", () => {
    expect(toDataUrl({ tone: 0.3 }, size)).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/);
  });

  it("rasterize paints paper and ink, at scale", () => {
    const px = rasterize({ tone: 1, shape: "square", ink: "#ff0000", paper: "#0000ff" }, { width: 10, height: 10 }, { scale: 2 });
    expect(px.width).toBe(20);
    expect(Array.from(px.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
    const empty = rasterize({ tone: 0, paper: "#0000ff" }, { width: 4, height: 4 });
    expect(Array.from(empty.data.slice(0, 4))).toEqual([0, 0, 255, 255]);
  });

  it("parses colours", () => {
    expect(parseColor("#abc")).toEqual([170, 187, 204, 1]);
    expect(parseColor("rgb(10 20 30 / 50%)")).toEqual([10, 20, 30, 0.5]);
    expect(parseColor("hsl(120, 100%, 50%)")).toEqual([0, 255, 0, 1]);
    expect(parseColor("currentColor", "#fff")).toEqual([255, 255, 255, 1]);
    expect(() => parseColor("rebeccapurplish")).toThrow();
  });

  it("refuses absurd grids", () => {
    expect(() => toSvg({ cell: 1 }, { width: 5000, height: 5000 })).toThrow(/too many/);
  });
});

describe("suggest", () => {
  it("is seeded and resolves", () => {
    for (let i = 0; i < 30; i++) {
      const s = suggest({ seed: i });
      expect(suggest({ seed: i })).toEqual(s);
      expect(() => resolve(s)).not.toThrow();
    }
  });

  it("keeps locked parts", () => {
    expect(suggest({ seed: 3, keep: { ink: "#123456", shape: "star" } })).toMatchObject({ ink: "#123456", shape: "star" });
  });
});
