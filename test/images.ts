import type { ImageDataLike } from "../src";

/** A black-and-white checkerboard of 4px squares, for image tests. */
export function checker(width: number, height: number): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 255 : 0;
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** One flat grey. */
export function flat(width: number, height: number, grey: number, alpha = 255): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([grey, grey, grey, alpha], i);
  return { width, height, data };
}
