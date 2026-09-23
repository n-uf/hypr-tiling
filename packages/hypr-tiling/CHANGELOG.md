# Changelog

All notable changes to `@n-uf/hypr-tiling` are documented here.

This package uses calendar-aligned versioning (`YY.M.R`), which cannot signal a
SemVer "major" bump. **Read the per-release notes below for breaking changes** —
the version number alone does not flag them.

## Unreleased

### Workspace set

- **`TilingWorkspacePlacement` `region`** — `{ kind: "region"; region: "start" | "end" }` seats the leaf `left` of the reading-order first leaf / `right` of the last, via `insertLeafInto`'s `adjacent` path. A group-member neighbour seats beside the group node, not inside it. A `null` destination becomes the bare leaf. `TILING_DEFAULT_WORKSPACE_PLACEMENT` stays root-second.
- **`moveTileToWorkspace(set, tileId, to, placement?, options?)`** — tile-keyed `moveLeafToWorkspace`. A tile seated nowhere is seated only when `options.leaf.id` is given (the engine never invents leaf ids); otherwise the set is unchanged.
- **`MoveTileToWorkspaceOptions`** — `{ leaf?: { id } }` mint id for `moveTileToWorkspace` when the tile has no seat.
- **`showTileInWorkspace(set, tileId, to, placement?)`** — tile-keyed `showInWorkspace`. Unchanged when the tile is unknown, already shown in `to`, or `to` is unknown.
- **`hideTileFromWorkspace(set, tileId, from)`** — tile-keyed hide; returns `{ set, orphaned }`. `orphaned` is `true` when the tile now has no seat anywhere.
- **`TilingHideTileResult`** — `{ set, orphaned }` return of `hideTileFromWorkspace`.
- **`removeTile(set, tileId)`** — drop every seat of the tile. Unchanged when the tile is seated nowhere.
- **`revealTile(set, tileId, prefer?)`** — pick `prefer` when it shows the tile, else the first workspace in tab order that does; switch `activeId` and activate a group member tab as needed. Returns `null` when the tile is seated nowhere; same set reference when `changed` is `"none"`.
- **`TilingRevealTileResult`** / **`TilingRevealTileChanged`** — `{ set, workspaceId, leafId, changed: "none" | "tab" | "workspace" | "both" }` return of `revealTile`.

## 26.9.3 — 2026-09-22

Engine-native workspace set (`_agent/workspace-set-concept.md`, library half
H1–H4), plus the titlebar-only pane collapse that was pending as
"Unreleased", plus the React-free `./engine` entry fix. Additive minor for the
workspace set; the collapse work carries **two default-only breakages** — read
its first two bullets.

### Note

26.10.0 was published under a mis-numbered calendar version (month 10 ≠
September) and was unpublished from npm; 26.9.3 supersedes it with identical
workspace-set API plus the React-free `./engine` entry. (`YY.M.R`: `M` is the
calendar month of the release — September is `9`.)

### Workspace set

- **`TilingWorkspaceSet`** — `{ workspaces: [{ id, name, layout }], activeId }`
  over one tile pool. Pure `set → set` ops: `createWorkspace`,
  `renameWorkspace`, `deleteWorkspace` (refuses the last; returns
  `removedTileIds` shown only there), `switchWorkspace`, `cycleWorkspace`,
  `setWorkspaceLayout`, `moveLeafToWorkspace(set, leafId, to, placement?)`,
  `showInWorkspace`, `hideFromWorkspace`, `workspaceSetOfLayout`,
  `activeWorkspace`, `findWorkspaceById`, `queryWorkspaceSet`,
  `normalizeWorkspaceName`. Limits `TILING_WORKSPACES_MAX` (12) and
  `TILING_WORKSPACE_NAME_MAX_CHARS` (40) are enforced at create / rename.
- **Integrity** — `workspaceSetIssues(set, { expectedTileIds? })` walks the
  invariants (unique non-empty workspace ids, valid names, `activeId`
  exists, every tree structurally valid, one leaf id ↔ one tile id across
  the set, no orphan / unknown tile against `expectedTileIds`);
  `repairWorkspaceSet` fixes deterministically and returns the reasons.
- **`TilingWorkspacePlacement`** + `insertLeafInto` / `extractLeafNode`
  (engine) — the seat-and-extract halves the movers share, now public so the
  set ops reuse them instead of duplicating tree code.
- **`TilingRenderer` workspace-set mode** — `workspaces` +
  `onWorkspacesChange` (`TilingRendererWorkspaceSetProps`) as the alternative
  to `layout` + `onLayoutChange`; `TilingRendererProps` is unchanged and the
  mode-independent surface is `TilingRendererCommonProps`. The active tree is
  painted; a switch does not remount a pane whose leaf exists in both
  workspaces. Uncontrolled focus and maximize are remembered per workspace;
  a drag in flight is cancelled when its source leaf leaves the controlled
  tree (workspace switch). `renderEmptyWorkspace(workspace)` fills a `null`
  layout. `onMoveLeaf(leafId, from, to)` reports a tab drop.
- **Native workspace-tab drop target** — `TilingExternalDragHover` is now the
  union `TilingExternalDropHover | TilingWorkspaceTabDragHover` (a bare
  `{ targetId, point }` literal is still the former). A
  `kind: "workspace-tab"` hover settles in set mode by
  `moveLeafToWorkspace` through the 26.9.2 claim-before-settle path — no
  host hit-test, no host claim. `resolveWorkspaceTabHover(targets, point)`
  is the pure hit-test; `TilingGhostChipContext.workspaceId` names the
  destination for the chip.
- **`resolveExternalDragHover` / `onExternalDragHoverChange`** renderer
  props — engine-driven hover resolution (called per processed drag frame
  and synchronously at release) as the alternative to feeding
  `externalDragHover` from host state.
- **`onExternalDrop`** now receives the full hover as a 4th argument and may
  return `false` to decline the claim (the release then cancels with the
  fly-back). Existing 3-argument `void` hosts are unaffected.
- **Headless `useTilingWorkspaceTabs` / `TilingWorkspaceTabs`** — `tablist`
  / `tab` / `tabpanel` props, roving focus, Arrow / Home / End / Enter /
  Space / F2 / Delete (`resolveWorkspaceTabKey` is the pure model),
  `onRenameRequest` / `onCloseRequest` affordances with `tab.rename` /
  `tab.close` / `create` committing through the engine ops, and
  `rendererProps` that make every tab a native drop target. Renders
  nothing; classes come only from the new theme tokens.
- **Theme tokens** `TilingTheme.workspaceTabs`, `workspaceTab`,
  `workspaceTabActive`, `workspaceTabDropTarget` (all optional strings).

### Pane collapse (previously "Unreleased")

- **BREAKING (default only): `resizeFloor` now defaults to `"chrome"`.** An
  interactive resize can size a pane out to its collapsed titlebar/chrome
  extent with no opt-in. The old content floor remains as `resizeFloor:
  "body"` on `TilingLeafNode` (per-leaf) or `TilingLayoutConfig` (library-wide).
- **BREAKING (default only): a collapsed pane's body stays mounted.**
  `TilingLayoutConfig.collapseBodyMode` is `"keep-mounted"` | `"unmount"`
  (default `"keep-mounted"`). The prior unmount-on-collapse behavior is
  `collapseBodyMode: "unmount"`.
- **Titlebar-only pane collapse (`paneTitleBarControls.collapse`, opt-in).**
  Collapse pins the pane to its chrome extent on the split axis; the body is
  hidden (`display: none`). Collapsed panes stay draggable. Axis is recorded
  so a drag re-parent reasserts the pin on the new split. Both-collapsed
  siblings stay collapsed; leftover axis space is an intentional split slack
  void (drag or nudge the divider to expand both).
- **`onPaneCollapsedChange`** — `{ leafId, collapsed }` after the layout
  edit, so a host can retitle or react without parsing the tree.
- **`minBBoxPx`** — leaf-scoped resize floor that travels with the pane.
- **`TilingCommandGates.collapseEnabled`** gates `toggle-collapse` /
  `set-collapsed`. Non-interactive `titleBarContent` no longer swallows
  titlebar drag.

### Fixed

- **`./engine` entry no longer pulls the React renderer chunk; safe to import
  from server / react-server layers (Next route handlers).** In 26.10.0 (the
  mis-numbered first publish of this release) `dist/engine.mjs` re-exported from the code-split chunk that also backs `.`
  (the whole renderer — `createContext`, hooks, theme), and `engine.ts` itself
  re-exported `accentHue`, `BASELINE_DRAG_HOP_DURATION_MS`, and
  `INSTANT_DRAG_DURATION_MS` from `react/`. Importing
  `@n-uf/hypr-tiling/engine` from a Next.js route handler therefore evaluated
  React's `react-server` build and failed with
  `TypeError: createContext is not a function`. The three demoted symbols now
  live in the engine layer (`engine/accent-hues.ts`, `engine/drag-timing.ts`;
  same names, same values, `.` exports unchanged), and `engine.ts` is built as
  its own tsup configuration with code splitting off, so
  `dist/engine.{mjs,cjs}` is a standalone bundle with no `react` /
  `react-dom` import and no chunk shared with `.` / `./devtools`. Guarded by
  `__tests__/engine-entry-react-free.test.ts` (`pnpm test:dist`, run in CI and
  `prepublishOnly`) and by the `engine ↛ react` layering guardrail, which now
  also scans the `engine.ts` entry file. No public API change (all three API
  reports identical).

## 26.9.2 — 2026-09-21

Compact drag ghost + external-drop claim (26.9.x standalone subset of the
WorkspaceSet drag scope). Additive; default drag behaviour is unchanged.

- **`TilingRendererProps.dragGhostMode`** — `"footprint"` (default, today's
  tile-sized ghost) | `"compact"` (always the cursor-anchored chip) |
  `"auto"` (chip while `externalDragHover` is set, footprint otherwise).
  Footprint ↔ compact transitions over ~140 ms scale/opacity;
  `prefers-reduced-motion` is instant. Same `overlayPortalContainer` as
  the footprint ghost.
- **`TilingRendererProps.externalDragHover`** — host-reported
  `{ targetId, point }` while the pointer is over chrome outside the
  tiling tree. The engine does not hit-test host chrome.
- **`TilingRendererProps.onExternalDrop`** — `(leafId, targetId, point)`
  fired on release while hover is set, **before** the FSM settles. Marks
  the drag `claimed` and skips `DragCancelOverlay`. Absent → existing
  cancel + fly-back.
- **Theme slot `TilingTheme.ghostChip`** — `(ctx: { leafId, title?,
  point, targetId? }) => ReactNode`. Host paints the chip contents;
  default is a minimal neutral chip (title / leaf id).

## 26.9.1 — overlay portal container (theme scoping)

Patch release. The drag overlays (ghost, custom cursor, cancel fly-back) still
default to a `document.body` portal so `position: fixed` stays window-relative,
but a host can now redirect that portal:

- **`TilingRendererProps.overlayPortalContainer`** — `HTMLElement | null |
  (() => HTMLElement | null)`. The thunk is evaluated every render so a
  late-mounted container (ref / callback) is picked up without remounting the
  renderer. `null` / omitted falls back to `document.body`. Both
  `DragPaneOverlay` and `DragCursorOverlay` (and the cancel fly-back) use the
  same resolved container.
- **Containing-block caveat:** the container must not sit under an ancestor
  with `transform` / `filter` / `backdrop-filter` / `perspective` /
  `contain: paint` (or `layout` / `strict` / `content`) / `will-change` of
  those. The overlays still use window-relative client coordinates; a
  containing-block ancestor reintroduces ghost↔seat drift.
- Use this when host theme tokens (CSS variables on a scoped root) must
  inherit into the ghost. Do not add a second scoping mechanism. Overlay
  z-indexes (ghost 220, cursor 230, cancel 219) are relative to the
  container's stacking context, not the document.
- The body default exists for two independent reasons: containing-block
  immunity (`position: fixed` stays window-relative) AND the ghost staying
  outside the React root's event-delegation scope. Redirecting the DOM
  mount does not change the delegation invariant — React still walks
  fibers, and measurement selectors stay root/viewport-scoped.

## 26.9.0 — themeable drag chrome + stable pane identity

Feature release (calendar-aligned `YY.M.R`; `26.9` = September, `.0` = first
release of the month). **One breaking theme-shape change** — read the first
bullet.

- **BREAKING (theme shape): `paneShell.dragSourceOpacity` removed.** The
  picked-up source pane's dim is now `dragChrome.sourcePane` (see below) and
  is applied by the RENDERER to the whole leaf wrapper — title AND content,
  one opacity — for the default tile and a custom `renderTile` alike. Custom
  panes that applied their own `isDragSource` fade should drop it (it now
  double-dims). A consumer theme object that still spells
  `paneShell.dragSourceOpacity` fails typecheck (excess property); delete the
  line or move the value to `dragChrome: { sourcePane }`.
- **New theme slot `dragChrome` (`TilingThemeDragChromeTokens`, optional +
  partial).** Every renderer-painted drag surface reads theme tokens, so a host
  can make the drag state look exactly like its at-rest pane. Tokens:
  `ghostLifted` / `ghostSeated` / `ghostTransition` (ghost WRAPPER elevation /
  scale / opacity / tint delta — outside the `ghost.surface` shell),
  `cancelFlyBack`, `sourceReservation` (the content-less seat's full surface —
  radius / border / background / shadow), `sourcePane` (whole-pane source
  dim), `dropTarget` (drop-target leaf highlight, default none),
  `dropIntentLayer` (default tile's edge/center hint frame radius + border
  width), `cursorBadge` + `cursorBadgeValid` / `cursorBadgeInvalid` /
  `cursorBadgeNeutral` (the pointer-pinned drop-validity badge shape + tones),
  and `resolveSeatFrame(accent)` (the seat's hop-in frame; default =
  `resolveFocusFrame`). `resolveDragChrome(theme)` fills omitted tokens with a
  PANE-SHELL-INHERITING default: the seat wears `paneShell.surface`, the ghost
  wrapper carries a small neutral elevation + `opacity-95`, no drop-target
  highlight. A theme that passes nothing never shows a look it did not author.
- **Default drag look changed for `clean-flat` / `mosaic` / consumer themes.**
  The renderer no longer hardcodes the neon look in the drag path: no
  `rounded-xl` seat, no `scale-[1.01]` + slate-950 drop shadow on the ghost
  wrapper, no cyan/rose/slate cursor badge unless the theme asks. The built-in
  `neon-terminal` theme now carries that exact look in its own `dragChrome`, so
  the showcase is unchanged.
- **Live-drag observability layers default OFF.** `TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS.dragSourceBorderEnabled` /
  `dragTargetBorderEnabled` are now `false`: the pink seat tint + source border
  and the cyan drop-target border / fill / inset shadow were inline-style debug
  overlays painting over every consumer's drag. Toggle them in the observability
  panel (or pass `observabilityColorEnables`) when diagnosing drop resolution.
  Preview-mode projected-landing layers are unchanged.
- **Stable pane identity across drag → drop → settle (`paneIdentity` prop,
  `TilingPaneIdentityMode = "auto" | "stable" | "slot"`).** The split tree is
  reconciled positionally, so an insert drop (leaf moves to another branch)
  used to unmount + remount the pane and a swap handed each instance the other
  tile's props — host content re-initialized after every drop. In `"stable"`
  mode panes render ONCE each in a hidden tile-keyed pool and their DOM node is
  relocated (layout-effect `appendChild`) into whichever slot shows their tile;
  the React instance (hooks, state, refs, iframes, scroll) is the same object
  through drag → drop → settle and every other tree edit. `"auto"` (default)
  is `"stable"` on a client-only mount and `"slot"` (the legacy in-place render,
  SSR-faithful) when hydrating server markup; pass `"stable"` explicitly to
  opt an SSR host in (server HTML then carries empty slots; content is placed
  on the client). DOM shape in stable mode: the leaf wrapper carries
  `data-hpt-pane-slot="<tileId>"`, the pane sits in a `display: contents`
  wrapper `[data-hpt-pane]`, and a `[data-hpt-pane-pool]` (`display: none`)
  sits after the viewport inside the root. The drag ghost is still a transient
  second render of the tile through `renderTile` (the overlay portal
  container, default `document.body`, see `overlayPortalContainer` / 26.9.1)
  so `position: fixed` stays window-relative AND the ghost stays outside the
  React root's event-delegation scope — see `_agent/drag-subsystem-audit.md`
  §11.
- **Leaf wrapper drag attributes.** `data-drag-source-pane` (preview-mode
  dimmed source) and `data-drop-target-pane` (resolved drop target) on the leaf
  wrapper for host CSS hooks; the ghost wrapper carries `data-drag-ghost-wrapper`.

## Unreleased (pre-26.9.0 notes, shipped in 26.9.0)

- **Layout reconciliation (`normalizeLayout`).** Commit-time normalization on
  every resize/rearrange `pointerup` / `pointercancel` / `lostpointercapture`
  demotes unfit static pins, clamps ratios against min-pane + full gutters, and
  enforces the both-static filler invariant so panes+gutters fill the container.
  Live resize ratio updates are rAF-coalesced; an idle settle (~150ms) and a dev
  fill-slack invariant (`measureLayoutFillSlackPx`) are belt-and-suspenders.
  Exported from `@n-uf/hypr-tiling/engine` as `normalizeLayout`,
  `measureLayoutFillSlackPx`, `LAYOUT_RECONCILE_IDLE_MS`,
  `LAYOUT_FILL_SLACK_TOLERANCE_PX`.
- **Tile-slot integrity on reconcile.** `normalizeLayout` accepts optional
  `expectedTileIds` / `fallbackLayout`. When the host declares expected tiles,
  reconcile detects duplicate/missing/unknown/empty `tileId`s and rebuilds a
  sane default dwindle (or the host fallback) instead of leaving void slots.
  Collapsed ratios near 0/1 are clamped in place. New helpers:
  `assessLayoutTileIntegrity`, `buildDefaultDwindleLayout`,
  `LAYOUT_COLLAPSED_RATIO_EPS`. `isStructurallyValidLayout` also rejects
  duplicate `tileId`s (at most one tile per slot).
- **Hard layout integrity (empty / overlap / gone).** Reconcile now auto-derives
  `expectedTileIds` from the host `tiles` registry on every resize/rearrange
  commit and idle settle. Gap-closed rearrange candidates that drop a host tile
  are refused (cancel fly-back). Geometry assessment flags zero-area leaves,
  overlapping footprints, and fill-slack voids; unhealable cases rebuild.
  Clear API: `assertLayoutIntegrity`, `repairLayout`,
  `expectedTileIdsFromHostTiles`, `layoutCoversExpectedTiles`.
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
