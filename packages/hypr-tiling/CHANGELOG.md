# Changelog

All notable changes to `@n-uf/hypr-tiling` are documented here.

This package uses calendar-aligned versioning (`YY.M.R`), which cannot signal a
SemVer "major" bump. **Read the per-release notes below for breaking changes** —
the version number alone does not flag them.

## 26.7.0 — initial public release

First published release of `@n-uf/hypr-tiling`, a dynamic tiling layout engine
for React. This entry is the baseline: earlier working versions were never
published, so the changelog tracks the package from this release forward.

### Public API surface

- **`TilingRenderer`** — the layout renderer: programmatic layout tree, focus and
  maximize, drag-and-drop with FLIP animation and self-healing recovery,
  multi-select grouping (Alt/Opt+G), pane switching, and per-tile accents.
- **Theming** — `TilingThemeProvider` / `TilingTheme` for token-driven styling.
- **Layout & interaction API** — the `Tiling*` / `TILING_*` namespace: layout-tree
  types and helpers (including `groupLeaves`), interaction capabilities and presets
  (`TILING_DASHBOARD_PRESET`), keymap/chord resolution, and drop-intent config.
- **Curated public barrel** — 171 public API items. Deep-engine internals
  (ghost-transit math, leaf geometry, drop-validity, projected-layout, low-level
  pane-switching index helpers) are tagged `@internal` and excluded from the public
  surface. An [API Extractor](https://api-extractor.com/) report
  (`etc/hypr-tiling.api.md`) is checked in, and `pnpm api:check` fails CI if an
  `@internal` symbol ever leaks onto the public entry.

### Developer / observability tooling — `@n-uf/hypr-tiling/devtools`

The observability panel and its seed defaults live on a separate `/devtools`
subpath, so a renderer-only consumer never pulls the panel into its bundle:

```ts
import { TilingObservabilityPanel, ANIMATION_CONTROL_DEFAULTS } from "@n-uf/hypr-tiling/devtools";
```

The observability/debug **types** referenced by public renderer props
(`onDropIntentChange`, `onLiveHitLogChange`, and `renderTile`'s `paneHitZoneDebug`
/ `observabilityColors`) remain on the main `.` entry.

### Documentation

Guides and a generated API reference are published at
[hypr-tiling.n-uf.com/docs](https://hypr-tiling.n-uf.com/docs). Every public symbol
carries TSDoc (coverage enforced in CI), so summaries and examples surface in
editor hover-docs.

### Tailwind requirement

The package ships no CSS — it emits Tailwind utility classes. Add
`@n-uf/hypr-tiling` to your Tailwind `content` glob or the renderer is unstyled.
See the README "Tailwind content requirement" section.
