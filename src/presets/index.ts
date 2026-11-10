/**
 * Hand-made starting points. Spread one and change what you like: { ...presets.sphere, ink: "#e0577f" }.
 * No ink colour, so they take the text colour (currentColor).
 */
import type { ShadeInput } from "../spec/types";

export const presets = {
  /** Classic newspaper halftone, fading in down the element. */
  newsprint: { method: "halftone", cell: 9, angle: 45, tone: { linear: { angle: 90, stops: [0, 0.85] } } },
  /** A ball lit from the top left. */
  sphere: { method: "halftone", cell: 7, angle: 45, tone: { radial: { center: "38% 36%", radius: "62%", stops: [0.02, 0.95] } } },
  /** Ink gathering at the edges. */
  vignette: { method: "blue-noise", cell: 3, shape: "square", tone: { radial: { center: "center", stops: [{ offset: 0.35, tone: 0 }, { offset: 1, tone: 0.75 }] } } },
  /** A Bayer crosshatch, left to right. */
  crosshatch: { method: "bayer", matrix: 8, cell: 4, shape: "square", tone: { linear: { angle: 0, stops: [0, 1] } } },
  /** Soft, cloudy noise in even blue-noise dots. */
  clouds: { method: "blue-noise", cell: 5, size: 0.9, tone: { noise: { scale: 320, detail: 4, range: [0, 0.8] } } },
  /** Hand-stippled grain, a little loose. */
  stipple: { method: "random", cell: 4, size: 0.8, jitter: 0.6, tone: { linear: { angle: 120, stops: [0, 0.2, 0.9] } } },
  /** Four-pointed stars that grow towards the bottom. */
  sparkle: { method: "halftone", cell: 26, shape: "star", tone: { linear: { angle: 90, stops: [0.03, 0.4] } } },
  /** Crosses on a grid, heavier on the right. */
  plus: { method: "halftone", cell: 18, shape: "cross", tone: { linear: { angle: 0, stops: [0.05, 0.85] } } },
  /** Diamonds, darker towards the top-right corner. */
  diamonds: { method: "halftone", cell: 14, shape: "diamond", tone: { linear: { angle: 135, stops: [0.9, 0.05] } } },
  /** Squares in a grid: the halftone of a pixel display. */
  pixels: { method: "halftone", cell: 12, shape: "square", tone: { radial: { center: "70% 30%", stops: [0, 0.9] } } },
  /** Old-computer dithering: Atkinson's, in chunky pixels. */
  retro: { method: "atkinson", cell: 4, shape: "square", tone: { radial: { center: "30% 30%", radius: "90%", stops: [0, 0.2, 0.95] } } },
  /** Floyd–Steinberg across a sunset of tones. */
  diffusion: { method: "floyd-steinberg", cell: 3, shape: "square", tone: { linear: { angle: 90, stops: [0, 0.15, 0.5, 1] } } },
} as const satisfies Record<string, ShadeInput>;

export type PresetName = keyof typeof presets;
