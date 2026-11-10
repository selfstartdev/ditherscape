/**
 * Loading images for image tones, in the browser. The rest of the core never touches the DOM.
 */
import { resolve } from "./spec/resolve";
import type { ImageDataLike, Shade, ShadeInput } from "./spec/types";

export interface LoadImageOptions {
  /**
   * Images are scaled down to at most this many px on their longer side: a dither never needs
   * more pixels than it has cells, and big photos are slow to read. Default 1600.
   */
  maxSize?: number;
}

const cache = new Map<string, Promise<ImageDataLike>>();

/**
 * Fetches an image and reads its pixels. Cross-origin images need CORS headers (it's loaded with
 * crossOrigin="anonymous"); without them the browser won't hand over the pixels. Cached per URL and size.
 */
export function loadImage(src: string, options: LoadImageOptions = {}): Promise<ImageDataLike> {
  const maxSize = options.maxSize ?? 1600;
  const key = `${maxSize}\u0000${src}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const promise = new Promise<ImageDataLike>((done, fail) => {
    if (typeof Image === "undefined" || typeof document === "undefined") {
      fail(new Error("ditherscape: loadImage() runs in the browser. Elsewhere, decode the image yourself and pass its pixels."));
      return;
    }
    const img = new Image();
    if (!/^(data|blob):/.test(src)) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const w0 = img.naturalWidth || img.width;
        const h0 = img.naturalHeight || img.height;
        if (!(w0 > 0 && h0 > 0)) throw new Error(`ditherscape: "${src}" has no size`);
        const s = Math.min(1, maxSize / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * s));
        const h = Math.max(1, Math.round(h0 * s));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("ditherscape: no 2D canvas to read the image with");
        ctx.drawImage(img, 0, 0, w, h);
        done(ctx.getImageData(0, 0, w, h));
      } catch (e) {
        fail(e instanceof Error && e.name === "SecurityError" ? new Error(`ditherscape: "${src}" is cross-origin without CORS headers, so its pixels can't be read`) : e);
      }
    };
    img.onerror = () => fail(new Error(`ditherscape: couldn't load "${src}"`));
    img.src = src;
  });
  cache.set(key, promise);
  // A failure isn't cached: the next call tries again.
  promise.catch(() => cache.delete(key));
  return promise;
}

/** The URLs of the image tones in some shades, in order, without repeats. */
export function imageUrls(input: ShadeInput | Shade | readonly (ShadeInput | Shade)[]): string[] {
  const shades = Array.isArray(input) ? input : [input];
  const urls: string[] = [];
  for (const s of shades as (ShadeInput | Shade)[]) {
    const tone = s.tone;
    if (tone && typeof tone === "object" && "image" in tone && typeof tone.image === "string" && !urls.includes(tone.image)) urls.push(tone.image);
  }
  return urls;
}

/** Resolves shades with every image URL swapped for its pixels. */
export async function loadShades(input: ShadeInput | Shade | readonly (ShadeInput | Shade)[], options: LoadImageOptions = {}): Promise<Shade[]> {
  const shades = (Array.isArray(input) ? input : [input]).map((s) => resolve(s as ShadeInput));
  return Promise.all(shades.map(async (s) => (typeof s.tone === "object" && "image" in s.tone && typeof s.tone.image === "string" ? { ...s, tone: { ...s.tone, image: await loadImage(s.tone.image, options) } } : s)));
}
