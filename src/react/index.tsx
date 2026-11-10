"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ditherscapeParentStyle,
  draw,
  imageUrls,
  loadImage,
  resolve,
  toSvg,
  type ImageDataLike,
  type ImageFit,
  type Point,
  type Shade,
  type ShadeInput,
} from "ditherscape";

// Everything in the core is also available from "ditherscape/react", including ditherscapeParentStyle
// (though server components should import that from "ditherscape"; see src/parent.ts).
export * from "ditherscape";

type ShadeLike = ShadeInput | Shade;

export interface DitherscapeProps {
  /** One shade. */
  shade?: ShadeLike;
  /** Several shades, drawn in order on one layer (later ones on top). */
  shades?: readonly ShadeLike[];
  /**
   * "scroll" (default): the layer covers its parent and scrolls with the page.
   * "fixed": the layer is pinned to the viewport, behind the whole page.
   */
  attach?: "scroll" | "fixed";
  /** Break out of the parent's width to the full viewport width (the parent's height is kept). */
  fullBleed?: boolean;
  /**
   * "canvas" (default): fast, for big areas and small cells. "svg": inline SVG, rendered on the
   * server too and crisp at any zoom, but heavy with many dots.
   */
  renderer?: "canvas" | "svg";
  /** Size rendered on the server (svg renderer) and before the layer is measured. Default 1440 × 900. */
  initialSize?: { width: number; height: number };
  /**
   * "fade" (default): hidden until drawn at the measured size, then faded in.
   * "none": shown straight away.
   */
  reveal?: "fade" | "none";
  /** Image tones are scaled down to at most this many px on their longer side. Default 1600. */
  maxImageSize?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_INITIAL_SIZE = { width: 1440, height: 900 };

interface Size {
  width: number;
  height: number;
}

// ImageData can't go through JSON.stringify (it's huge); give each one an id for change detection.
const imageIds = new WeakMap<object, number>();
let nextImageId = 1;
function shadesKey(list: readonly ShadeLike[]): string {
  return JSON.stringify(list, (_k, v: unknown) => {
    if (v && typeof v === "object" && "data" in v && "width" in v && "height" in v) {
      let id = imageIds.get(v);
      if (!id) imageIds.set(v, (id = nextImageId++));
      return `[image ${id}]`;
    }
    return v;
  });
}

/** Loads the image URLs in some shades. `images` holds those that are ready. */
function useImages(urls: readonly string[], maxSize: number) {
  const [images, setImages] = useState<ReadonlyMap<string, ImageDataLike>>(new Map());
  const [error, setError] = useState<Error | null>(null);
  const key = urls.join("\n");
  useEffect(() => {
    let live = true;
    setError(null);
    for (const url of urls) {
      loadImage(url, { maxSize }).then(
        (data) => live && setImages((m) => (m.get(url) === data ? m : new Map(m).set(url, data))),
        (e: unknown) => live && setError(e instanceof Error ? e : new Error(String(e))),
      );
    }
    return () => {
      live = false;
    };
  }, [key, maxSize]); // key stands in for urls
  return { images, error, ready: urls.every((u) => images.has(u)) };
}

/** Resolved shades with image URLs swapped for loaded pixels. Null until every image is in. */
function withImages(list: readonly ShadeLike[], images: ReadonlyMap<string, ImageDataLike>): Shade[] | null {
  const out: Shade[] = [];
  for (const s of list) {
    const shade = resolve(s);
    if (typeof shade.tone === "object" && "image" in shade.tone && typeof shade.tone.image === "string") {
      const data = images.get(shade.tone.image);
      if (!data) return null;
      out.push({ ...shade, tone: { ...shade.tone, image: data } });
    } else out.push(shade);
  }
  return out;
}

/**
 * Dithered shading behind its parent's content.
 *
 * Place it inside the element it should shade; give that element `ditherscapeParentStyle`
 * (position: relative; isolation: isolate).
 */
export function Ditherscape({
  shade,
  shades,
  attach = "scroll",
  fullBleed = false,
  renderer = "canvas",
  initialSize = DEFAULT_INITIAL_SIZE,
  reveal = "fade",
  maxImageSize = 1600,
  className,
  style,
}: DitherscapeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [measured, setMeasured] = useState<Size | null>(null);
  const [bleedWidth, setBleedWidth] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      if (next.width === 0 || next.height === 0) return;
      setMeasured((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
      // 100vw includes the vertical scrollbar; the document's client width does not.
      if (fullBleed) setBleedWidth(document.documentElement.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (fullBleed) observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [fullBleed]);

  useEffect(() => {
    if (isDev() && attach === "scroll") warnAboutParent(ref.current);
  }, [attach]);

  const list = shades ?? (shade ? [shade] : []);
  const key = shadesKey(list);
  // Resolving here (not in an effect) makes invalid options throw during render, for error boundaries.
  const resolved = useMemo(() => list.map((s) => resolve(s)), [key]); // key stands in for list
  const urls = useMemo(() => imageUrls(resolved), [resolved]);
  const { images, error, ready } = useImages(urls, maxImageSize);
  const final = useMemo(() => (ready ? withImages(resolved, images) : null), [ready, resolved, images]);
  const size = measured ?? initialSize;

  // Canvas: drawn after layout, at the device's pixel ratio. A frame's delay batches resizes.
  useEffect(() => {
    if (renderer !== "canvas") return;
    const canvas = canvasRef.current;
    const el = ref.current;
    if (!canvas || !el || !final || !measured) return;
    const frame = requestAnimationFrame(() => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.round(measured.width * dpr);
      const h = Math.round(measured.height * dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, final, measured, { scale: dpr, color: getComputedStyle(el).color });
      setDrawn(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [renderer, final, measured]);

  const svg = useMemo(() => (renderer === "svg" && final ? toSvg(final, size, { dimensions: true }) : null), [renderer, final, size.width, size.height]);
  useEffect(() => {
    if (svg && measured) setDrawn(true);
  }, [svg, measured]);

  // Thrown after every hook, so the hook order never changes.
  if (error) throw error;

  const hidden = reveal === "fade" && !drawn;
  const layerStyle: CSSProperties = {
    position: attach === "fixed" ? "fixed" : "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    zIndex: -1,
    pointerEvents: "none",
    ...(reveal === "fade" ? { opacity: hidden ? 0 : 1, transition: "opacity 150ms ease-out" } : {}),
    ...(fullBleed && attach === "scroll" ? { left: "50%", right: "auto", width: bleedWidth ?? "100vw", transform: "translateX(-50%)" } : {}),
    ...style,
  };

  return (
    <div ref={ref} aria-hidden="true" className={className} style={layerStyle} data-ditherscape="">
      {renderer === "canvas" ? (
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", top: 0, left: 0, display: "block", width: measured ? measured.width : "100%", height: measured ? measured.height : "100%" }}
        />
      ) : (
        svg && <div style={{ position: "absolute", top: 0, left: 0, lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
}

export interface DitherImageProps {
  src: string;
  /** Describes the image, as an <img> alt. */
  alt: string;
  /** How to dither it. Default: Atkinson, 3px square pixels, in the text colour. */
  shade?: Omit<ShadeInput, "tone">;
  /** How the image fills the box. Default "cover". */
  fit?: ImageFit;
  position?: Point;
  /** Any CSS width. Default 100%. The height follows the image's aspect ratio unless given. */
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  renderer?: DitherscapeProps["renderer"];
  maxImageSize?: number;
  className?: string;
  style?: CSSProperties;
}

export const DITHER_IMAGE_DEFAULTS = { method: "atkinson", cell: 3, shape: "square" } as const satisfies Omit<ShadeInput, "tone">;

/** An image, dithered. A block that keeps the image's aspect ratio, announced as an image with `alt`. */
export function DitherImage({ src, alt, shade, fit = "cover", position = "center", width = "100%", height, renderer, maxImageSize = 1600, className, style }: DitherImageProps) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    loadImage(src, { maxSize: maxImageSize }).then(
      (img) => live && setRatio(img.width / img.height),
      () => {}, // <Ditherscape> reports the error.
    );
    return () => {
      live = false;
    };
  }, [src, maxImageSize]);
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{ ...ditherscapeParentStyle, display: "block", width, height, aspectRatio: height === undefined ? (ratio ?? undefined) : undefined, ...style }}
    >
      <Ditherscape shade={{ ...DITHER_IMAGE_DEFAULTS, ...shade, tone: { image: src, fit, position } }} renderer={renderer} maxImageSize={maxImageSize} />
    </div>
  );
}

function isDev(): boolean {
  // Bundlers replace process.env.NODE_ENV; guard for environments without `process`.
  return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
}

const warned = new WeakSet<Element>();

function warnAboutParent(el: HTMLElement | null) {
  const parent = el?.parentElement;
  if (!parent || warned.has(parent)) return;
  const cs = getComputedStyle(parent);
  const problems: string[] = [];
  if (cs.position === "static") problems.push("is not positioned (the layer will cover the wrong element)");
  const stacking = cs.isolation === "isolate" || (cs.position !== "static" && cs.zIndex !== "auto");
  if (!stacking) problems.push("has no stacking context (the layer can disappear behind backgrounds)");
  if (problems.length === 0) return;
  warned.add(parent);
  console.warn(
    `ditherscape: the parent of <Ditherscape> ${problems.join(" and ")}. Give it ditherscapeParentStyle ` +
      `({ position: "relative", isolation: "isolate" }).`,
    parent,
  );
}
