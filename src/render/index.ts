/**
 * Output: dots → SVG, a canvas, or pixels.
 */
import { buildCells, buildDots, REACH, type Dots } from "../method";
import { inside, outline } from "../shape";
import type { Size } from "../spec/position";
import { resolve } from "../spec/resolve";
import type { Shade, ShadeInput } from "../spec/types";
import { parseColor } from "./color";

/** One shade, or several drawn in order (later ones on top). */
export type ShadesInput = ShadeInput | Shade | readonly (ShadeInput | Shade)[];

const list = (input: ShadesInput): Shade[] => (Array.isArray(input) ? input : [input as ShadeInput]).map((s) => resolve(s));

/** The dots of every shade, in drawing order. */
export function dots(input: ShadesInput, size: Size): Dots[] {
  checkSize(size);
  return list(input).map((shade) => buildDots(shade, size));
}

function checkSize(size: Size) {
  if (!(size.width > 0 && size.height > 0 && Number.isFinite(size.width) && Number.isFinite(size.height))) {
    throw new Error(`ditherscape: the size must be positive, not ${size.width} × ${size.height}`);
  }
}

/** Rounds to two decimals, without trailing zeros or "-0". */
export function formatNumber(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) || r === 0 ? "0" : String(r);
}

/** Path data for a layer's dots: relative moves between dots keep the numbers short. */
export function dotPath(layer: Dots): string {
  const { shade, x, y, r, count } = layer;
  const rad = (layer.turn * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const parts: string[] = [];
  // Where the pen is, in rounded coordinates, so relative steps add up exactly.
  let penX = 0;
  let penY = 0;
  const q = (n: number) => Math.round(n * 100) / 100;
  const step = (cmd: string, ax: number, ay: number) => {
    const rx = q(ax);
    const ry = q(ay);
    const s = `${cmd}${formatNumber(rx - penX)} ${formatNumber(ry - penY)}`;
    penX = rx;
    penY = ry;
    return s;
  };
  for (let k = 0; k < count; k++) {
    const cx = x[k]!;
    const cy = y[k]!;
    const radius = r[k]!;
    if (shade.shape === "circle") {
      const rr = formatNumber(radius);
      const d = formatNumber(2 * q(radius));
      // Two half-circles from the left point to the right one and back; the pen ends where it started.
      parts.push(`${step(k === 0 ? "M" : "m", cx - radius, cy)}a${rr} ${rr} 0 1 0 ${d} 0a${rr} ${rr} 0 1 0 -${d} 0`);
    } else {
      const pts = outline(shade.shape, cx, cy, radius, cos, sin);
      let s = step(k === 0 ? "M" : "m", pts[0]!, pts[1]!);
      const startX = penX;
      const startY = penY;
      for (let p = 2; p < pts.length; p += 2) s += step("l", pts[p]!, pts[p + 1]!);
      // z returns the pen to the subpath's start.
      parts.push(s + "z");
      penX = startX;
      penY = startY;
    }
  }
  return parts.join("");
}

export interface SvgOptions {
  /** Adds width and height attributes; otherwise the SVG scales to its container (viewBox only). Default true. */
  dimensions?: boolean;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The shades as one standalone <svg>. The same input and size always give the same bytes.
 * Images in the tone must be pixels (see loadImage()).
 */
export function toSvg(input: ShadesInput, size: Size, options: SvgOptions = {}): string {
  const layers = dots(input, size);
  const { width, height } = size;
  const dims = options.dimensions === false ? "" : ` width="${formatNumber(width)}" height="${formatNumber(height)}"`;
  let body = "";
  for (const layer of layers) {
    const { shade } = layer;
    if (shade.paper) body += `<rect width="100%" height="100%" fill="${escape(shade.paper)}"/>`;
    if (layer.count === 0) continue;
    const attrs = [`fill="${escape(shade.ink)}"`];
    if (shade.opacity !== 1) attrs.push(`opacity="${formatNumber(shade.opacity)}"`);
    if (shade.blend && shade.blend !== "normal") attrs.push(`style="mix-blend-mode:${escape(shade.blend)}"`);
    body += `<path ${attrs.join(" ")} d="${dotPath(layer)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg"${dims} viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}">${body}</svg>`;
}

/** A data: URL of toSvg(), for CSS background-image or mask-image. */
export function toDataUrl(input: ShadesInput, size: Size): string {
  return `url("data:image/svg+xml,${encodeURIComponent(toSvg(input, size))}")`;
}

/** The parts of CanvasRenderingContext2D that draw() uses. */
export interface Canvas2D {
  fillStyle: unknown;
  globalAlpha: number;
  globalCompositeOperation: string;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  closePath(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export interface DrawOptions {
  /** Device pixels per px (devicePixelRatio). Default 1. */
  scale?: number;
  /** What currentColor means: canvases don't inherit it. Default black. */
  color?: string;
}

/** Draws the shades onto a canvas, scaled by `scale`. Doesn't clear it first. */
export function draw(ctx: Canvas2D, input: ShadesInput, size: Size, options: DrawOptions = {}): void {
  const layers = dots(input, size);
  const scale = options.scale ?? 1;
  const color = options.color ?? "#000";
  const paint = (c: string) => (c.trim().toLowerCase() === "currentcolor" ? color : c);
  ctx.save();
  ctx.scale(scale, scale);
  for (const layer of layers) {
    const { shade, x, y, r, count } = layer;
    if (shade.paper) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = paint(shade.paper);
      ctx.fillRect(0, 0, size.width, size.height);
    }
    if (count === 0) continue;
    ctx.globalAlpha = shade.opacity;
    ctx.globalCompositeOperation = shade.blend && shade.blend !== "normal" ? shade.blend : "source-over";
    ctx.fillStyle = paint(shade.ink);
    ctx.beginPath();
    const rad = (layer.turn * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (let k = 0; k < count; k++) {
      if (shade.shape === "circle") {
        ctx.moveTo(x[k]! + r[k]!, y[k]!);
        ctx.arc(x[k]!, y[k]!, r[k]!, 0, Math.PI * 2);
      } else {
        const pts = outline(shade.shape, x[k]!, y[k]!, r[k]!, cos, sin);
        ctx.moveTo(pts[0]!, pts[1]!);
        for (let p = 2; p < pts.length; p += 2) ctx.lineTo(pts[p]!, pts[p + 1]!);
        ctx.closePath();
      }
    }
    ctx.fill();
  }
  ctx.restore();
}

/** RGBA pixels, 4 bytes each, row by row: the same layout as ImageData. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface RasterizeOptions {
  /** Pixels per px. Default 1. */
  scale?: number;
  /** What currentColor means. Default black. */
  color?: string;
}

/**
 * The shades as crisp pixels: every pixel is ink or paper, with no antialiasing, which is what a
 * dither should look like up close. Runs anywhere (no canvas needed); `blend` is ignored.
 */
export function rasterize(input: ShadesInput, size: Size, options: RasterizeOptions = {}): Pixels {
  checkSize(size);
  const scale = options.scale ?? 1;
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const over = (k: number, c: readonly [number, number, number, number], alpha: number) => {
    const a = c[3] * alpha;
    if (a <= 0) return;
    const da = data[k + 3]! / 255;
    const oa = a + da * (1 - a);
    for (let ch = 0; ch < 3; ch++) data[k + ch] = (c[ch]! * a + data[k + ch]! * da * (1 - a)) / (oa || 1);
    data[k + 3] = oa * 255;
  };

  for (const shade of list(input)) {
    if (shade.paper) {
      const paper = parseColor(shade.paper, options.color);
      for (let k = 0; k < data.length; k += 4) over(k, paper, 1);
    }
    const ink = parseColor(shade.ink, options.color);
    const cells = buildCells(shade, size);
    const { grid, radii, x: cx, y: cy } = cells;
    if (cells.maxRadius <= 0) continue;
    const turn = ((shade.angle + shade.rotate) * Math.PI) / 180;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    // How many cells either side of the nearest one a dot can reach this pixel from.
    const reach = cells.maxRadius * REACH + (shade.jitter * shade.cell) / 2;
    const span = Math.ceil(reach / grid.cell + 0.5);
    for (let py = 0; py < height; py++) {
      const Y = (py + 0.5) / scale;
      for (let px = 0; px < width; px++) {
        const X = (px + 0.5) / scale;
        const ic = Math.round((X * grid.ux + Y * grid.uy) / grid.cell - 0.5) - grid.i0;
        const jc = Math.round((X * grid.vx + Y * grid.vy) / grid.cell - 0.5) - grid.j0;
        let hit = false;
        for (let j = Math.max(0, jc - span); j <= Math.min(grid.rows - 1, jc + span) && !hit; j++) {
          for (let i = Math.max(0, ic - span); i <= Math.min(grid.cols - 1, ic + span) && !hit; i++) {
            const k = j * grid.cols + i;
            const rad = radii[k]!;
            if (!(rad > 0.01)) continue;
            const dx = X - cx[k]!;
            const dy = Y - cy[k]!;
            if (dx * dx + dy * dy > rad * rad * 2.25) continue;
            hit = inside(shade.shape, dx * cos + dy * sin, -dx * sin + dy * cos, rad);
          }
        }
        if (hit) over((py * width + px) * 4, ink, shade.opacity);
      }
    }
  }
  return { width, height, data };
}
