# Changelog

All notable changes to `@n-uf/hypr-tiling` are documented here.

This package uses calendar-aligned versioning (`YY.M.R`), which cannot signal a
SemVer "major" bump. **Read the per-release notes below for breaking changes** —
the version number alone does not flag them.

## Unreleased

- **Layout reconciliation (`normalizeLayout`).** Commit-time normalization on
  every resize/rearrange `pointerup` / `pointercancel` / `lostpointercapture`
  demotes unfit static pins, clamps ratios against min-pane + full gutters, and
  enforces the both-static filler invariant so panes+gutters fill the container.
  Live resize ratio updates are rAF-coalesced; an idle settle (~150ms) and a dev
  fill-slack invariant (`measureLayoutFillSlackPx`) are belt-and-suspenders.
  Exported from `@n-uf/hypr-tiling/engine` as `normalizeLayout`,
  `measureLayoutFillSlackPx`, `LAYOUT_RECONCILE_IDLE_MS`,
  `LAYOUT_FILL_SLACK_TOLERANCE_PX`.
- **Pane titlebar middle slot.** `TilingTile.titleBarContent` renders custom
  chrome between the title (left) and native window controls (right). The
  default tile wires the slot; custom `renderTile` panes can wrap
  `tile.titleBarContent` with the new `TilingPaneTitleBarContent` primitive
  (stops pointer-down so toolbar interactions do not start a rearrange drag).
  Drag ghosts carry the same slot. Existing title-only headers are unchanged.

## 26.7.1 — npm README absolute URLs + tsconfig cleanup

A docs/tooling patch — no runtime or public-API changes. (Calendar-aligned
versioning `YY.M.R`; the trailing `.1` is the release counter within `26.7`.)

- **npm README now uses absolute URLs.** The README rendered on
  [npmjs.org](https://www.npmjs.com/package/@n-uf/hypr-tiling) resolves asset
  and doc references against npm's own CDN, not the GitHub repo, so the
  previous repo-relative paths broke: the logo image 404'd and the
  `etc/hypr-tiling.api.md` API-report links went nowhere. Asset references now
  point at absolute `raw.githubusercontent.com` URLs and doc links at
  `github.com/n-uf/hypr-tiling/blob/main/...`, so the logo renders and the
  API-report links resolve on the npm package page.
- **Removed an invalid `ignoreDeprecations: "6.0"` value** from the
  `apps/web` and `packages/showcase` tsconfigs. That value is not a legal
  `ignoreDeprecations` target under TypeScript 6.0.3 and was rejected by the
  compiler; dropping it lets those workspaces typecheck cleanly.

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

### Consumer theming & chrome contract

Every painted pixel is reachable from a consumer-authored `TilingTheme` or
routed through the consumer `renderTile` — no renderer state paints chrome the
consumer didn't choose. Defaults stay zero-config (built-in themes,
`DefaultTilingTile`, the built-in group strip). Concretely:

- **`theme` prop on `TilingRendererProps`** — a full consumer-authored
  `TilingTheme`; takes precedence over `themeId`. `TilingTheme.id` is open
  (`TilingThemeId | (string & {})`) so a consumer mints its own theme id;
  `TILING_THEME_REGISTRY` stays keyed by the closed built-in union, and the
  built-in theme switcher (`onThemeChange`, typed `TilingThemeId`) remains
  built-ins-only — consumers running a custom theme simply don't wire it.
- **`grouping` capability object form** — `boolean | TilingGroupingCapability`
  (`{ enable?, showGroupTabStrip? }`; bare boolean = `{ enable }`,
  `showGroupTabStrip` default `true`). `showGroupTabStrip: false` suppresses
  the built-in per-group tab strip so a consumer paints its own group chrome;
  keyboard group commands stay live. `paneSwitching.showTabStrip` governs the
  TOP-LEVEL tab strip only.
- **`surface` discriminator on `TilingRenderTileProps`**
  (`TilingRenderSurface`: `"pane" | "drag-ghost" | "drag-cancel"`). The two
  drag surfaces carry the REAL resolved capability display flags (no mid-drag
  silhouette pop) with inert no-op handlers; a custom pane that wants different
  drag chrome branches on `surface`.
- **`group` context on `TilingRenderTileProps`** —
  `TilingRenderTileGroupContext | null`, populated for a tabbed group's ACTIVE
  member: the `TilingGroupMemberView` member list (leaf/tile ids, resolved
  tile, 1-based `memberNumber`, `isActive`) plus `activateMember` /
  `removeMember` / `ungroup` callbacks that route through the same internal
  command router as the built-in strip and the keyboard layer. `null` for
  loose leaves and drag surfaces.
- **Cancel fly-back fidelity** — the drag-cancel overlay renders through the
  consumer `renderTile` (`surface: "drag-cancel"`) when one is supplied, so a
  custom skin keeps its own chrome for the whole cancel glide; the built-in
  shell remains the no-`renderTile` fallback.
- **Hand-authored facade** — 104 public API items. Engine-grade internals are
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
