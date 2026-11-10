/**
 * CSS colours → [r, g, b, a] (0–255, alpha 0–1), for rasterize(), which writes pixels itself.
 * Hex, rgb(), hsl(), transparent and the basic named colours.
 */
export type Rgba = readonly [number, number, number, number];

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00",
  cyan: "#00ffff", aqua: "#00ffff", magenta: "#ff00ff", fuchsia: "#ff00ff", gray: "#808080", grey: "#808080",
  silver: "#c0c0c0", maroon: "#800000", olive: "#808000", lime: "#00ff00", navy: "#000080", purple: "#800080",
  teal: "#008080", orange: "#ffa500", pink: "#ffc0cb", brown: "#a52a2a", gold: "#ffd700", indigo: "#4b0082",
  violet: "#ee82ee", crimson: "#dc143c", coral: "#ff7f50", salmon: "#fa8072", beige: "#f5f5dc", ivory: "#fffff0",
  khaki: "#f0e68c", lavender: "#e6e6fa", plum: "#dda0dd", tan: "#d2b48c", turquoise: "#40e0d0", wheat: "#f5deb3",
};

const num = (s: string, max: number) => (s.endsWith("%") ? (Number(s.slice(0, -1)) / 100) * max : Number(s));

export function parseColor(input: string, currentColor = "#000000"): Rgba {
  const c = input.trim().toLowerCase();
  if (c === "transparent") return [0, 0, 0, 0];
  if (c === "currentcolor") return parseColor(currentColor);
  if (Object.prototype.hasOwnProperty.call(NAMED, c)) return parseColor(NAMED[c]!);

  const hex = /^#([0-9a-f]{3,8})$/.exec(c);
  if (hex && [3, 4, 6, 8].includes(hex[1]!.length)) {
    let h = hex[1]!;
    if (h.length <= 4) h = [...h].map((ch) => ch + ch).join("");
    const v = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [v(0), v(2), v(4), h.length === 8 ? v(6) / 255 : 1];
  }

  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(c);
  if (fn) {
    const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean);
    if (parts.length === 3 || parts.length === 4) {
      const alpha = parts[3] === undefined ? 1 : num(parts[3], 1);
      let rgb: [number, number, number];
      if (fn[1]!.startsWith("rgb")) {
        rgb = [num(parts[0]!, 255), num(parts[1]!, 255), num(parts[2]!, 255)];
      } else {
        const h = ((Number(parts[0]!.replace(/deg$/, "")) % 360) + 360) % 360;
        const s = num(parts[1]!, 1);
        const l = num(parts[2]!, 1);
        const k = (n: number) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n: number) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
        rgb = [f(0), f(8), f(4)];
      }
      const out = [...rgb.map((v) => Math.round(Math.min(255, Math.max(0, v)))), Math.min(1, Math.max(0, alpha))] as const;
      if (out.every((v) => Number.isFinite(v))) return out as unknown as Rgba;
    }
  }
  throw new Error(`ditherscape: can't read the colour "${input}" (rasterize() takes hex, rgb(), hsl() and basic names)`);
}
