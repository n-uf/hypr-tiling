# Changelog

All notable changes to `@n-uf/hypr-tiling` are documented here.

This package uses calendar-aligned versioning (`YY.M.R`), which cannot signal a
SemVer "major" bump. **Read the per-release notes below for breaking changes** —
the version number alone does not flag them.

## 26.7.0 — initial public release

First published release of `@n-uf/hypr-tiling`, a dynamic tiling layout engine
for React. This entry is the baseline: earlier working versions were never
published, so the changelog tracks the package from this release forward.

### Entry points

The package exposes three import paths through `package.json#exports`
(`"sideEffects": false`):

- **`@n-uf/hypr-tiling`** (`.`) — the **public API**. A small, hand-authored
  facade of explicit named exports (never `export *`); this is the ONLY
  consumer surface and the one tracked for compatibility.
- **`@n-uf/hypr-tiling/devtools`** — opt-in observability overlays, on their own
  entry so a renderer-only consumer never bundles them.
- **`@n-uf/hypr-tiling/engine`** — a `@beta` escape hatch that re-exports the
  engine-grade, framework-free internals (layout-tree reducers, low-level tree
  walkers, keymap and drag-adjacent math) for power users driving the tree
  headlessly. **No stability guarantees** — it may change or disappear in any
  release and is kept off the consumer documentation site.

### Public API surface (`.`)

- **`TilingRenderer`** — the layout renderer: controlled layout tree, focus and
  maximize, drag-and-drop with FLIP animation and self-healing recovery,
  multi-select grouping (Alt/Opt+G), pane switching, and per-tile accents. A
  custom `renderTile` receives the clean, debug-free `TilingRenderTileProps`
  contract (tile payload + pane state flags + interaction handlers) — the
  drag/drop observability + debug fields are OFF this surface (they route through
  the internal default pane and `/devtools`).
- **Custom-pane helper primitives** — optional, unstyled conveniences layered
  over `renderTile` that encode the pane wiring rules so a custom pane can't get
  them wrong: `TilingPaneRoot` (`data-leaf-id` root + focus/hover handlers),
  `TilingDragHandle` (drag pickup + `touch-action: none` + Alt/Opt group toggle),
  `TilingPaneAction` (action button that stops propagation), and `TilingPaneBody`
  (renders children only in `render-content` mode). The raw `renderTile` args
  stay the full escape hatch.
- **Theming** — `TilingThemeProvider` / `TilingTheme` for token-driven styling.
- **Layout inspection & mutation** — the layout is a recursive tree of
  `TilingLayoutNode` (`TilingLeafNode` / `TilingSplitNode` / `TilingGroupNode`).
  Read it with `queryTilingLayout` (a `TilingLayoutQuery` view: leaf ids, splits,
  groups, tile order, directional-neighbor lookup). Mutate it declaratively via
  `onLayoutChange` or imperatively by dispatching a typed `TilingCommand` through
  the renderer's `TilingCommandHandle` (gated by `isCommandEnabled`). The raw pure
  reducers (`groupLeaves`, `insertLeafAdjacent`, `updateSplitRatio`, …) are NOT on
  the public entry — they live on `@n-uf/hypr-tiling/engine`.
- **Interaction & presets** — `TilingInteractionCapabilities`,
  `resolveInteractionCapabilities`, `TILING_DASHBOARD_PRESET`, and the theming
  registry constants. Every interaction is **on by default** and narrowed by
  passing a partial `interaction` prop; the single opt-IN exception is the group
  tab strip's dev/demo "show pane body" checkbox
  (`paneSwitching.showContentToggle`, default `false`), so a consumer that
  renders its own pane content never surfaces an end-user control that blanks it
  and panes paint content at rest with no wiring.
- **Hand-authored facade** — 99 public API items. Engine-grade internals are
  physically layered under `engine/` and reached only through the `.` facade (via
  `react/`) or the explicit `./engine` entry. An
  [API Extractor](https://api-extractor.com/) report per entry is checked in
  (`etc/hypr-tiling{,.devtools,.engine}.api.md`); `pnpm api:check` fails CI if the
  `.` surface drifts or an unexported type leaks onto it, and an architectural
  guardrail keeps the `engine/` layer framework-free and blocks deep consumer
  imports.

### Developer / observability tooling — `@n-uf/hypr-tiling/devtools`

The observability panel, its seed defaults, and the whole debug/observability
input surface live on a separate `/devtools` subpath, so a renderer-only consumer
never pulls them into its bundle:

```ts
import {
  TilingObservabilityPanel,
  ANIMATION_CONTROL_DEFAULTS,
  TilingRenderer, // the observability-instrumented view of the same renderer
} from "@n-uf/hypr-tiling/devtools";
```

The renderer's observability inputs — overlay colors
(`observabilityColors` / `observabilityColorEnables`), the hit-zone / drop-intent
debug flags, and the `onDropIntentChange` / `onLiveHitLogChange` /
`onProjectedOverlayCountChange` telemetry hooks — are collected into
`TilingRendererObservabilityProps` and kept OFF the consumer `TilingRendererProps`
contract. `/devtools` exports both those props and the observability-typed view of
the SAME `TilingRenderer` component that accepts them, plus the debug/observability
snapshot **types** they reference (`TilingDropIntentDebugState`,
`TilingLiveHitLogState`, `TilingObservabilityColorConfig`, `TilingPaneHitZone*`,
…). The consumer `.` surface carries none of them.

### Documentation

Guides and a generated API reference are published at
[hypr-tiling.n-uf.com/docs](https://hypr-tiling.n-uf.com/docs). Every public symbol
carries TSDoc (coverage enforced in CI), so summaries and examples surface in
editor hover-docs.

### Tailwind requirement

The package ships no CSS — it emits Tailwind utility classes. Add
`@n-uf/hypr-tiling` to your Tailwind `content` glob or the renderer is unstyled.
See the README "Tailwind content requirement" section.
