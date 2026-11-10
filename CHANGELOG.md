# ditherscape

## 0.1.0

### Minor Changes

- First release: dithered shading for the web.
  - Tones: flat, linear and radial gradients, seeded noise, and images.
  - Methods: halftone, Bayer (2, 4, 8), random, blue noise, Floyd–Steinberg and Atkinson.
  - Dots: circles, squares, diamonds, crosses and four-pointed stars, on a grid at any angle, with jitter.
  - Output: canvas (`draw()`), SVG (`toSvg()`, `toDataUrl()`) and crisp pixels (`rasterize()`).
  - React: `<Ditherscape>`, a layer behind its parent or the page, and `<DitherImage>`.
  - Presets and seeded suggestions.
