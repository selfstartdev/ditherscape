// Main API
export { dots, draw, rasterize, toDataUrl, toSvg, type Canvas2D, type DrawOptions, type Pixels, type RasterizeOptions, type ShadesInput, type SvgOptions } from "./render";
export { resolve, DEFAULT_TONE, LEVELS_DEFAULTS, METHODS, NOISE_DEFAULTS, SHADE_DEFAULTS, SHAPES } from "./spec/resolve";
export { imageUrls, loadImage, loadShades, type LoadImageOptions } from "./image";
export { ditherscapeParentStyle } from "./parent";
export { presets, type PresetName } from "./presets";
export { PALETTES, suggest, SUGGESTION_KINDS, type SuggestionKind, type SuggestOptions } from "./suggest";
export type {
  ImageDataLike,
  ImageFit,
  ImageTone,
  ImageToneInput,
  Length,
  Levels,
  LinearTone,
  Method,
  NoiseTone,
  Point,
  RadialTone,
  Shade,
  ShadeInput,
  Shape,
  Stop,
  StopInput,
  Tone,
  ToneInput,
} from "./spec/types";

// Building blocks, for advanced use
export { resolveLength, resolvePoint, type Size, type Vec } from "./spec/position";
export { resolveStops, resolveTone } from "./spec/resolve";
export { applyLevels, createToneField, stopsAt, type ToneField } from "./tone";
export { buildGrid, cellCenter, MAX_CELLS, type Grid } from "./grid";
export { buildCells, buildDots, cellRadii, cellTones, type Cells, type Dots } from "./method";
export { blueNoise, BLUE_NOISE_SIZE } from "./method/blue-noise";
export { inside, maxCoverage, ON_RADIUS, outline, radiusForTone } from "./shape";
export { dotPath, formatNumber } from "./render";
export { parseColor, type Rgba } from "./render/color";
export { cellHash, createRandom, hashString, type KeyPart, type Random } from "./random";
