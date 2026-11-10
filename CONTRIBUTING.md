# Contributing

```sh
npm install
npm test           # Vitest, including golden fixtures in test/golden/
npm run lint
npm run typecheck
npm run build      # tsup → dist/
npm run dev        # rebuild dist/ on change
```

- `src/` is the pipeline: spec → `resolve()` → tone field → grid → method (a dot radius per cell) → shapes → output (canvas, SVG or pixels). `src/react/` is the only React code; a lint rule and a test keep React out of the core.
- **Golden fixtures** (`test/golden/`) pin the exact output for known inputs: every preset, one of every method and shape, noise, an image, levels, jitter, layered paint, and `suggest()` for fixed seeds. If one fails, generated output changed, which the stability promise treats as a breaking change. Don't update fixtures just to make a test pass; if the change is intended, say so in the changeset.
- Changes that affect the published package need a changeset: `npm run changeset`.
