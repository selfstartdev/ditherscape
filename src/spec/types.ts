/**
 * The shade spec: what a user writes (…Input types, everything optional) and
 * what resolve() returns (every field filled in).
 */

/** px as a number, or a percentage of the element's width (x) or height (y) as "30%". */
export type Length = number | `${number}%`;

/**
 * A point in the element: CSS background-position syntax ("center", "left 30%",
 * "75% 20%", "right 40px top 10%") or an [x, y] pair of lengths.
 */
export type Point = string | readonly [Length, Length];

/** A tone stop: a tone (0 = no ink, 1 = full ink) at an offset (0–1) along a gradient. */
export interface Stop {
  offset: number;
  tone: number;
}

/** Plain tones are spread evenly: [0, 1] is the same as [{ offset: 0, tone: 0 }, { offset: 1, tone: 1 }]. */
export type StopInput = number | Stop;

/** Pixels to sample tones from: ImageData, or anything shaped like it (RGBA, 4 bytes a pixel). */
export interface ImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

/** How an image fills the element, as CSS object-fit. */
export type ImageFit = "cover" | "contain" | "fill";

export interface ImageTone {
  /**
   * The image. The core needs pixels (ImageData, or loadImage() in the browser).
   * <Ditherscape> and <DitherImage> also take a URL and load it themselves.
   */
  image: ImageDataLike | string;
  /** Default "cover". */
  fit: ImageFit;
  /** Where the image sits when it doesn't fill the element exactly. Default "center". */
  position: Point;
}

export type ImageToneInput = Pick<ImageTone, "image"> & Partial<Omit<ImageTone, "image">>;

export interface LinearTone {
  linear: {
    /** Direction the tone runs in, degrees: 0 left → right, 90 top → bottom. */
    angle: number;
    stops: Stop[];
  };
}

export interface RadialTone {
  radial: {
    center: Point;
    /** Distance to the last stop; [x, y] for an ellipse. Default: the farthest corner. */
    radius: Length | readonly [Length, Length] | "farthest-corner";
    stops: Stop[];
  };
}

export interface NoiseTone {
  noise: {
    /** Size of the features, px. Default 240. */
    scale: number;
    /** Layers of finer detail, 1–6. Default 3. */
    detail: number;
    /** Tones the noise runs between. Default [0, 1]. */
    range: readonly [number, number];
  };
}

/**
 * Where the ink goes. A number is a flat tone; gradients and noise are drawn by
 * ditherscape; an image is shaded by its brightness (dark = more ink).
 */
export type Tone = number | LinearTone | RadialTone | NoiseTone | ImageTone;

export type ToneInput =
  | number
  | { linear: { angle?: number; stops?: readonly StopInput[] } }
  | { radial: { center?: Point; radius?: RadialTone["radial"]["radius"]; stops?: readonly StopInput[] } }
  | { noise: Partial<NoiseTone["noise"]> }
  | ImageToneInput;

/**
 * How tones become dots.
 * - halftone: a dot in every cell, sized by the tone.
 * - bayer: ordered dithering with a Bayer matrix: on or off, in a crosshatch.
 * - random: on or off by a seeded random threshold: grainy, like stipple.
 * - blue-noise: on or off by a blue-noise threshold: even and organic.
 * - floyd-steinberg, atkinson: error diffusion: the classic photo dithers.
 */
export type Method = "halftone" | "bayer" | "random" | "blue-noise" | "floyd-steinberg" | "atkinson";

/** The dot. star is four-pointed. */
export type Shape = "circle" | "square" | "diamond" | "cross" | "star";

export interface Levels {
  /** Multiplies the tone's distance from mid grey. Default 1. */
  contrast: number;
  /** Takes ink away (positive) or adds it (negative), −1 to 1. Default 0. */
  brightness: number;
  /** Ink where it was light and vice versa. Default false. */
  invert: boolean;
}

export interface Shade {
  tone: Tone;
  method: Method;
  /** Grid spacing, px. Default 8. */
  cell: number;
  /** Grid angle, degrees. Default 0; classic halftone is 45. */
  angle: number;
  shape: Shape;
  /**
   * Dot size. For halftone, a scale on the tone-matched size (1 = the tone's coverage);
   * for the others, the dot's size relative to the cell (1 = touching its neighbours). Default 1.
   */
  size: number;
  /** Turns each dot, degrees, on top of the grid angle. Default 0. */
  rotate: number;
  /** Bayer matrix size: 2, 4 or 8. Default 4. */
  matrix: 2 | 4 | 8;
  /** Moves each dot by up to this fraction of a cell, at random. Default 0. */
  jitter: number;
  /** Seed for random, jitter and noise. Default 0. */
  seed: string | number;
  levels: Levels;
  /** Dot colour, any CSS colour. Default currentColor. */
  ink: string;
  /** Fills the element behind the dots. Default none (transparent). */
  paper: string | null;
  opacity: number;
  /** CSS mix-blend-mode for the layer. */
  blend: string | null;
}

export type ShadeInput = Partial<Omit<Shade, "tone" | "levels">> & {
  tone?: ToneInput;
  levels?: Partial<Levels>;
};
