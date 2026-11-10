import type { Length, Point } from "./types";

export interface Size {
  width: number;
  height: number;
}

export interface Vec {
  x: number;
  y: number;
}

const LENGTH = /^(-?\d*\.?\d+)(px|%)?$/;

/** A length in px: numbers are px, "30%" is a share of `total`. */
export function resolveLength(length: Length | string, total: number): number {
  if (typeof length === "number") {
    if (!Number.isFinite(length)) throw new Error(`ditherscape: ${length} is not a length`);
    return length;
  }
  const m = LENGTH.exec(length.trim());
  if (!m) throw new Error(`ditherscape: "${length}" is not a length (use px, or a percentage like "30%")`);
  const n = Number(m[1]);
  return m[2] === "%" ? (n / 100) * total : n;
}

const KEYWORDS: Record<string, { axis: "x" | "y" | "both"; at: number }> = {
  left: { axis: "x", at: 0 },
  right: { axis: "x", at: 1 },
  top: { axis: "y", at: 0 },
  bottom: { axis: "y", at: 1 },
  center: { axis: "both", at: 0.5 },
};

const keyword = (t: string | undefined) => (t !== undefined && Object.prototype.hasOwnProperty.call(KEYWORDS, t) ? KEYWORDS[t]! : null);

/** A point in px, from CSS background-position syntax or an [x, y] pair. */
export function resolvePoint(point: Point, size: Size): Vec {
  if (typeof point !== "string") {
    if (!Array.isArray(point) || point.length !== 2) throw new Error("ditherscape: a point is a string or an [x, y] pair");
    return { x: resolveLength(point[0], size.width), y: resolveLength(point[1], size.height) };
  }
  const tokens = point.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const bad = () => new Error(`ditherscape: "${point}" is not a position`);
  const len = (t: string, total: number) => {
    if (!LENGTH.test(t)) throw bad();
    return resolveLength(t, total);
  };

  if (tokens.length === 1 || tokens.length === 2) {
    let [a, b = "center"] = tokens as [string, string?];
    // "top left" and "center left" read as x y once swapped.
    if (keyword(a)?.axis === "y" || keyword(b)?.axis === "x") [a, b] = [b, a];
    const ka = keyword(a);
    const kb = keyword(b);
    if (ka?.axis === "y" || kb?.axis === "x") throw bad();
    const x = ka ? ka.at * size.width : len(a, size.width);
    const y = kb ? kb.at * size.height : len(b, size.height);
    return { x, y };
  }

  // Three or four values: keywords with offsets, e.g. "right 40px top 10%".
  let x: number | null = null;
  let y: number | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const k = keyword(tokens[i]);
    if (!k) throw bad();
    const next = tokens[i + 1];
    const offset = next !== undefined && !keyword(next) ? next : null;
    if (offset !== null) i++;
    const axis: "x" | "y" = k.axis === "both" ? (x === null ? "x" : "y") : k.axis;
    const total: number = axis === "x" ? size.width : size.height;
    const d = offset === null ? 0 : len(offset, total);
    const value: number = k.at === 1 ? total - d : k.at * total + d;
    if (axis === "x") {
      if (x !== null) throw bad();
      x = value;
    } else {
      if (y !== null) throw bad();
      y = value;
    }
  }
  return { x: x ?? size.width / 2, y: y ?? size.height / 2 };
}
