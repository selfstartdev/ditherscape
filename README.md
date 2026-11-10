# ditherscape

Dithered shading for the web: halftone dots, ordered and diffused dithering, behind elements, across pages and over images.

Shade a card so it looks lit from one corner, fade a hero into newsprint dots, put a grain of blue noise behind a page, or turn a photo into a one-bit print. ditherscape takes a short description of the shading and draws it for the element's real size: tones are relative to the element, while cells and dots stay in pixels, so the texture keeps its grain at any size.

**[Docs and playground →](https://ditherscape.selfstartdev.com)**

```sh
npm install ditherscape
```

- `ditherscape`: the core. No dependencies; draws to a canvas, writes SVG strings or plain pixels. Runs in the browser, Node, build scripts and edge runtimes.
- `ditherscape/react`: `<Ditherscape>` and `<DitherImage>`. React 18 or 19, an optional peer dependency.

## React

`<Ditherscape>` is a layer, not a wrapper. Put it inside the element it should shade, and give that element `ditherscapeParentStyle`:

```tsx
import { ditherscapeParentStyle } from "ditherscape";
import { Ditherscape } from "ditherscape/react";

<section style={ditherscapeParentStyle}>
  <Ditherscape shade={{ tone: { radial: { center: "35% 35%", stops: [0, 0.9] } }, cell: 7, angle: 45, ink: "#1d2640" }} />
  {children}
</section>
```

`ditherscapeParentStyle` is `{ position: "relative", isolation: "isolate" }`: the layer covers this element and can't slip behind its background. In development, `<Ditherscape>` warns if either is missing. Import it from `ditherscape`, not `ditherscape/react`: a React Server Component importing a plain value from a client module gets an empty reference.

For a whole-page background, use `attach="fixed"`; the layer is pinned to the viewport. Several shades share one layer: `<Ditherscape shades={[cyan, magenta]} />`, drawn in order.

The layer is a `<canvas>` at the device's pixel ratio, redrawn whenever the element changes size. The canvas has nothing to show until it's measured in the browser, so it fades in after mounting. `renderer="svg"` draws inline SVG instead, which also renders on the server, but it gets heavy with many dots.

| Prop | Default | Meaning |
|---|---|---|
| `shade` / `shades` | | One shade, or several. |
| `attach` | `"scroll"` | `"fixed"` pins the layer to the viewport. |
| `fullBleed` | `false` | Break out of the parent's width to the full viewport width. |
| `renderer` | `"canvas"` | `"svg"` for inline SVG. |
| `initialSize` | `{ width: 1440, height: 900 }` | Size rendered on the server and before measuring. |
| `reveal` | `"fade"` | `"none"` shows the layer without waiting. |
| `maxImageSize` | `1600` | Image tones are scaled down to this many px on their longer side. |
| `className`, `style` | | On the layer. |

### Images

```tsx
import { DitherImage } from "ditherscape/react";

<DitherImage src="/portrait.jpg" alt="A portrait" shade={{ method: "atkinson", cell: 3, ink: "#222", paper: "#f4ecd8" }} />
```

A block the width of its container that keeps the image's aspect ratio, announced to screen readers as an image with `alt`. Cross-origin images need CORS headers: the browser won't hand over the pixels of an image from another site without them.

Any shade can use an image as its tone, too: `tone: { image: "/photo.jpg", fit: "cover" }`.

## Without React

```ts
import { draw, rasterize, toDataUrl, toSvg } from "ditherscape";

draw(canvas.getContext("2d"), shade, { width: 800, height: 400 }, { scale: devicePixelRatio, color: "#222" });
const svg = toSvg(shade, { width: 800, height: 400 });
element.style.backgroundImage = toDataUrl(shade, { width: 800, height: 400 });   // or mask-image
const pixels = rasterize(shade, { width: 800, height: 400 });                      // RGBA, like ImageData
```

`rasterize()` is crisp: every pixel is ink or paper, which is what a dither should look like up close, and it needs no canvas, so it works in Node too. To dither an image there, decode it into `{ width, height, data }` (RGBA) with any image library and pass that as the tone.

In the browser, `loadImage(url)` fetches an image's pixels, and `loadShades(shades)` swaps every image URL in some shades for its pixels.

## A shade

```ts
{
  tone: { linear: { angle: 90, stops: [0, 1] } },  // where the ink goes: 0 none, 1 full
  method: "halftone",                               // how tones become dots
  cell: 8,                                          // grid spacing, px
  angle: 45,                                        // grid angle, degrees
  shape: "circle",                                  // the dot
  ink: "#1d2640",                                   // dot colour; default currentColor
  paper: "#fbf6ea",                                 // fills behind the dots; default none
}
```

### Tone

| Tone | |
|---|---|
| `0.4` | Flat. |
| `{ linear: { angle?, stops } }` | A gradient across the element, corner to corner like CSS. 0° runs left to right, 90° (default) top to bottom. |
| `{ radial: { center?, radius?, stops } }` | From a point outwards. `radius` is px, a percentage of the shorter side, `[x, y]` for an ellipse, or the farthest corner (default). |
| `{ noise: { scale?, detail?, range? } }` | Smooth seeded noise: clouds, mottling. `scale` (240) is the feature size in px, `detail` (3) adds finer layers, `range` ([0, 1]) the tones it runs between. |
| `{ image, fit?, position? }` | Dark parts of the image get ink. `fit` is `cover` (default), `contain` or `fill`; `position` works like `object-position`. |

`stops` are tones spread evenly (`[0, 0.2, 1]`) or `{ offset, tone }` pairs.

Positions are CSS `background-position` syntax or `[x, y]` pairs of px and percentages: `"center"`, `"left 30%"`, `"75% 20%"`, `"right 40px top 10%"`, `[120, "50%"]`.

`levels: { contrast, brightness, invert }` adjust any tone: `contrast` (1) stretches it away from mid grey, `brightness` (0, −1 to 1) takes ink away, and `invert` swaps light and dark.

### Method

| Method | |
|---|---|
| `halftone` | A dot in every cell, sized so the ink matches the tone. Print and comics. |
| `bayer` | Ordered dithering: dots on or off by a Bayer matrix (`matrix`: 2, 4 or 8, default 4). A regular crosshatch. |
| `random` | On or off by a seeded random threshold. Grainy, like stipple. |
| `blue-noise` | On or off by a blue-noise threshold. Even and organic, with no pattern. |
| `floyd-steinberg` | Error diffusion: the classic photo dither. |
| `atkinson` | Error diffusion as on early Macs: crisper, with lighter highlights and darker shadows. |

### Dots

| Option | Default | |
|---|---|---|
| `cell` | `8` | Grid spacing, px. |
| `angle` | `0` | Grid angle, degrees. Classic halftone is 45. |
| `shape` | `"circle"` | `circle`, `square`, `diamond`, `cross` or `star` (four-pointed). |
| `size` | `1` | Halftone: a scale on the tone-matched size. Others: dot size relative to the cell (1 = touching). |
| `rotate` | `0` | Turns each dot, on top of the grid angle. |
| `jitter` | `0` | Moves each dot up to this fraction of a cell, at random (0–1). |
| `seed` | `0` | For `random`, jitter and noise. |

Crosses grow until their arms join up; stars stop growing when their points meet, so they stay stars. Both top out below full cover.

### Colour

| Option | Default | |
|---|---|---|
| `ink` | `"currentColor"` | Any CSS colour. On a canvas, currentColor is read from the layer. |
| `paper` | none | Fills the element behind this shade's dots. |
| `opacity` | `1` | The dots' opacity. |
| `blend` | | A CSS `mix-blend-mode` for the dots: layer cyan, magenta and yellow shades with `multiply` for a print look. |

`rasterize()` reads hex, `rgb()`, `hsl()` and basic named colours.

## Presets and suggestions

```tsx
import { presets, suggest } from "ditherscape";

<Ditherscape shade={{ ...presets.sphere, ink: "#e0577f" }} />
```

Presets: `newsprint`, `sphere`, `vignette`, `crosshatch`, `clouds`, `stipple`, `sparkle`, `plus`, `diamonds`, `pixels`, `retro`, `diffusion`.

`suggest({ seed, kind?, keep? })` generates a complete shade from a seed (`kind`: `halftone`, `dither`, `shapes` or `grain`). The output is a plain spec: print it, paste it and change it. `keep` holds the parts you've settled on. The playground's Shuffle button is built on it.

## Performance

A shade is one dot per cell, so the cost is the element's area over the cell size squared. A full 1440 × 900 screen at an 8px cell is about 20,000 dots: a few milliseconds on a canvas. At a 2px cell it's 320,000, which is still fine on a canvas, but an SVG that size is several megabytes. Use the canvas for big areas and small cells, and SVG for exports and small elements. Grids over four million cells are refused.

## Accessibility

The layer is decorative: `aria-hidden="true"` and `pointer-events: none`. `<DitherImage>` is `role="img"` with your `alt`. Check contrast where shading runs behind text; a dither is busier than a flat colour of the same tone.

## Stability

The same shade and element size always produce the same dots, on the server and in the browser. The grid is anchored to the element's top-left corner, so when the element grows, the dots already there stay where they are (error diffusion is the exception: every dot depends on the ones before it).

From 1.0, the same spec, size and major version produce byte-identical SVG: any change to generated output, presets and `suggest()` included, is a major release. Before 1.0, a minor version (0.x → 0.y) may still change output; patch versions never do.

## License

MIT © SelfStartDev
