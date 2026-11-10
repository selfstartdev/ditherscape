/**
 * Golden tests: the stability promise.
 *
 * Same spec + same element size + same major version = identical output. If a
 * golden file changes, the generated output changed, and from 1.0 that is a
 * MAJOR release. Never update these with `vitest -u` to make a failure go away;
 * treat it as a deliberate decision and record it in a changeset.
 */
import { describe, expect, it } from "vitest";
import { METHODS, presets, SHAPES, suggest, SUGGESTION_KINDS, toSvg, type ShadeInput } from "../src";
import { checker } from "./images";

const size = { width: 360, height: 240 };

describe("golden presets", () => {
  it.each(Object.entries(presets))("%s", async (name, shade) => {
    await expect(toSvg(shade, size) + "\n").toMatchFileSnapshot(`golden/presets/${name}.svg`);
  });
});

/** One of everything the presets don't cover. */
const extras: Record<string, ShadeInput | ShadeInput[]> = {
  ...Object.fromEntries(METHODS.map((method) => [`method-${method}`, { method, cell: 6, tone: { linear: { angle: 30, stops: [0, 1] } } }])),
  ...Object.fromEntries(SHAPES.map((shape) => [`shape-${shape}`, { shape, cell: 16, angle: 15, rotate: 10, tone: { radial: { stops: [0.9, 0.05] } } }])),
  noise: { method: "bayer", matrix: 2, cell: 4, tone: { noise: { scale: 80, detail: 2 } }, seed: "golden" },
  image: { method: "floyd-steinberg", cell: 4, shape: "square", tone: { image: checker(32, 24), fit: "contain", position: "left top" } },
  levels: { cell: 8, levels: { contrast: 2, brightness: 0.1, invert: true } },
  jitter: { method: "random", cell: 6, jitter: 1, seed: 7, tone: 0.4 },
  paint: [
    { cell: 10, angle: 15, ink: "#00aeef", paper: "#fff", opacity: 0.8, blend: "multiply" },
    { cell: 10, angle: 75, ink: "#ec008c", blend: "multiply", tone: { linear: { angle: 0, stops: [0, 1] } } },
  ],
};

describe("golden extras", () => {
  it.each(Object.entries(extras))("%s", async (name, shades) => {
    await expect(toSvg(shades, size) + "\n").toMatchFileSnapshot(`golden/extras/${name}.svg`);
  });
});

describe("golden suggestions", () => {
  it("suggest() for fixed seeds", async () => {
    const fixture = Object.fromEntries(SUGGESTION_KINDS.map((kind) => [kind, [0, 1, 2].map((i) => suggest({ seed: `golden-${i}`, kind }))]));
    fixture.any = [0, 1, 2, 3, 4].map((i) => suggest({ seed: i }));
    await expect(JSON.stringify(fixture, null, 2) + "\n").toMatchFileSnapshot("golden/suggest.json");
  });
});
