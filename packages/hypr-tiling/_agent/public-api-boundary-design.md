# Public-API-boundary revamp — `@n-uf/hypr-tiling` staged design

Durable reference for inverting the `@n-uf/hypr-tiling` package from an
"export-everything" barrel into a small **hand-authored public API facade**
(the `.` entry) backed by a physically layered, `@beta` **engine** escape hatch
(the `./engine` entry). Folds into the unpublished `26.7.0` — no version bump,
no npm publish.

Terminology (fixed across code, docs, and reports):

- **public API** — the consumer surface on the `.` entry (never "SDK").
- **engine / internal** — implementation logic, reachable only via `./engine`.
- **API reference** — the consumer docs lane generated from the `.` entry.

Baseline: `main` at `~395fb53`; pre-revamp green gate = 840 tests + typecheck
(pkg/showcase/web) + build + prerender + `api:check` (single `.` report).

---

## 1. Entry-point model

Three labeled entry points, each with its own stability contract and its own
API Extractor report:

| Entry (`package.json#exports`) | File | Release tag / contract | API Extractor report | Consumer docs |
|---|---|---|---|---|
| `.` (public API) | `index.ts` | `@public` — semver-tracked, curated, hand-authored | `etc/hypr-tiling.api.md` (strict: `ae-forgotten-export=error`, `ae-undocumented=error`) | Fast track + **API reference** on `/docs` |
| `./devtools` (opt-in) | `devtools.ts` | `@public` opt-in observability surface | `etc/hypr-tiling.devtools.api.md` | Advanced/opt-in section |
| `./engine` (escape hatch) | `engine.ts` | `@beta` — **no stability guarantees**, power-user only | `etc/hypr-tiling.engine.api.md` (lenient) | **OFF** the consumer site; contributor reference only |

`"sideEffects": false` stays. `main`/`module`/`types` continue to point at the
`.` entry.

### 1a. `core/` → `engine/` rename — DECISION: RENAME

The directory `core/` is renamed to `engine/`. The rename is **mechanical and
fully verified** by the green gate: every reference to the layer is a relative
import specifier (`./core/x`, `../core/x`, `../../core/x` across `index.ts`,
`devtools.ts`, `react/*`, and `__tests__/*`) plus a handful of doc-comment
mentions inside the layer. No build tool couples to the dir name (jest uses a
`**/__tests__/**` glob; `tsconfig` uses `**/*.ts`; api-extractor points at
`dist/*.d.ts`, not source). `apps/web` references to "core" are prose about the
future vanilla-core roadmap, not import paths — left untouched.

Rationale: the whole revamp establishes an **engine** layer; naming the
directory `engine/` makes the layering self-documenting and maps 1:1 onto the
`./engine` entry. The `@internal`-to-the-`.`-contract property is enforced
structurally (facade omission) + by the Stage-6 layering lint + by
`ae-forgotten-export=error` on the `.` report — NOT by the dir name. The rename
is the low-churn, high-clarity option, so we take it.

### 1b. Release-tag reconciliation (`@internal` vs `@beta`)

The engine layer is **internal with respect to the `.` public contract** but is
deliberately exposed through `./engine`. API Extractor assigns release tags
per-symbol; the literal `@internal` tag would (a) trip
`ae-internal-missing-underscore` and (b) mark the symbol as trimmed/non-API,
which is wrong for a symbol we *intend* to expose on `./engine`. Therefore:

- Engine symbols surfaced on `./engine` carry `@beta` (AE's native
  "released but unstable, no guarantees" tag) — this IS the "no stability
  guarantees" contract the escape hatch promises.
- "`@internal` by default / not on `.`" is realized as: **the `.` facade never
  re-exports them**, the layering lint forbids deep engine imports, and the
  `.` report fails on any forgotten (leaked) export.
- Symbols that were already `@internal` pre-revamp (deep-engine internals never
  meant for any entry — ghost-transit math, leaf-geometry, drop-validity,
  projected-layout, the FSM controller/ports) stay `@internal` and are simply
  not re-exported by `engine.ts` either.

---

## 2. Target structure

```
packages/hypr-tiling/
├── index.ts        # THE hand-authored public API facade — the ONLY consumer entry
│                   #   explicit `export { … }` / `export type { … }` = curated keep-list; full TSDoc
├── devtools.ts     # /devtools opt-in observability entry (unchanged surface)
├── engine.ts       # NEW: /engine @beta escape hatch — re-exports engine-grade symbols
├── engine/         # (renamed from core/) engine-grade logic, @beta on ./engine, NOT on `.`
│   ├── state.ts, types.ts, commands.ts, keybindings.ts, focus-history.ts,
│   ├── multi-selection.ts, pane-sizing.ts, pane-switching.ts, drag-easing.ts,
│   ├── drag-cursor.ts, interaction-capabilities.ts, drop-intent-resolver.ts,
│   ├── drag-machine.ts, drag-recovery.ts, survivor-reflow.ts, ghost-transit.ts,
│   ├── leaf-geometry.ts, drop-validity.ts, projected-layout.ts, drag-presentation.ts,
│   └── controller.ts + *-port.ts (FSM driver + host ports — stay @internal)
├── react/          # renderer + host adapters (the React host layer)
│   ├── tiling-renderer.tsx  (TilingRenderer, "use client")
│   ├── theme.tsx            (TilingThemeProvider, "use client")
│   ├── tiling-observability-panel.tsx ("use client", /devtools only)
│   └── dom-*-port.ts, window-scheduler-port.ts, cn.ts
├── api-extractor.index.json / api-extractor.devtools.json / api-extractor.engine.json
└── etc/hypr-tiling.api.md / hypr-tiling.devtools.api.md / hypr-tiling.engine.api.md
```

Dependency direction (enforced by the Stage-6 lint): `react/` → `engine/`;
`index.ts`/`devtools.ts`/`engine.ts` → both; **`engine/` never imports
`react/`**. The facade reaches React symbols only through `react/` (never a
direct engine→react hop).

---

## 3. Symbol triage (against the pre-revamp `.` surface, ~178 report items)

Classification axis: **consumer-public** (stays/promoted on `.`), **engine**
(demoted to `./engine`, `@beta`), **devtools** (already on `/devtools`).

### 3a. Keep on `.` — runtime (value) symbols

| Symbol | Source | Why consumer-grade |
|---|---|---|
| `TilingRenderer` | react/tiling-renderer | the renderer component |
| `TilingThemeProvider`, `useTilingTheme`, `resolveTilingTheme`, `accentHue` | react/theme | theming API |
| `DEFAULT_TILING_THEME_ID`, `TILING_THEMES`, `TILING_THEME_REGISTRY` | react/theme | theme catalog |
| `DEFAULT_TILE_ACCENT`, `TILING_TILE_ACCENTS`, `TILING_TILE_ACCENT_SWATCHES`, `TILING_ACCENT_HUES` | react/theme | accent catalog |
| `DEFAULT_TILING_LAYOUT_CONFIG` | react/tiling-renderer | config default (dogfooded) |
| `TILING_DASHBOARD_PRESET`, `TILING_INTERACTION_CAPABILITY_DEFAULTS` | engine/interaction-capabilities | interaction presets/defaults |
| `resolveInteractionCapabilities` | engine/interaction-capabilities | **PROMOTE** — resolve caps to read keymap/gates (dogfooded ×2) |
| `DEFAULT_DRAG_HOP_EASING`, `DEFAULT_DRAG_REFLOW_EASING` | engine/drag-easing | drag-prop easing defaults (dogfooded) |
| `DEFAULT_DRAG_ANIMATION_SPEED_PERCENT`, `DRAG_ANIMATION_SPEED_MIN_PERCENT`, `DRAG_ANIMATION_SPEED_MAX_PERCENT`, `BASELINE_DRAG_HOP_DURATION_MS`, `INSTANT_DRAG_DURATION_MS` | react/tiling-renderer | drag-prop tuning bounds/defaults |
| `isCommandEnabled` | engine/commands | **PROMOTE** — gate a command against caps (dogfooded) |
| `resolveJumpedPaneId` | engine/pane-switching | **PROMOTE** — pane-number → leaf id (dogfooded) |
| `isMultiSelectModifierActive` | engine/multi-selection | **PROMOTE** — Alt/Opt multi-select modifier test (dogfooded) |
| `queryTilingLayout` | engine/state (NEW facade fn) | **PROMOTE (NEW)** — higher-level layout read (see §4) |

### 3b. Demote to `./engine` (@beta) — the export-everything overhang

Raw tree-walkers → folded behind `queryTilingLayout`, raw fns sent to `./engine`:
`collectGroups`, `collectSplitNodes`, `findLeafByDirection`, `readLeafNodeIds`,
`tileOrderByLeafId`, `findLeafById`, `siblingSubtreeForLeaf`.

Layout mutators (reducers): `insertLeafAdjacent`, `removeLeafTile`,
`swapLeafTiles`, `updateSplitRatio`, `groupLeaves`, `ungroupNode`,
`toggleSplitAxis`, `moveLeafToRoot`, `moveLeafToSplitContainer`, `setLeafSizing`,
`isStructurallyValidLayout`.

Keymap/command/keybinding engine helpers: `commandRequiredCapability`,
`keyboardActionToCommand`, `defaultKeyBindings`, `matchKeyBinding`,
`chordRequiresModifier`, `matchKeyChord`, `matchKeymapAction`, `hasAnyModifier`,
`resolveKeymap`, `resolveMaximizeToggle`, `TILING_KEYMAP_DEFAULTS`.

Multi-selection engine: `MULTI_SELECT_GROUP_MIN_MEMBERS`,
`canGroupMultiSelection`, `pruneMultiSelection`, `resolveMultiSelectGroupCommand`,
`resolveMultiSelectGroupHost`, `toggleLeafMultiSelection`.

Focus-history: `EMPTY_FOCUS_HISTORY`, `FOCUS_HISTORY_DEFAULT_LIMIT`,
`pruneFocusHistory`, `pushFocusHistory`, `resolveFocusCurrentOrLast`.

Sizing math: `isStaticAlongSplitAxis`, `isStaticInDimension`,
`isStaticOnCrossAxis`, `layoutContainsStaticPane`, `renormalizeFlexibleRatios`,
`resolveSizingMode`, `shouldRenderSplitDivider`, `isResizeAxisEnabled`.

Drag internals: `dragSpeedsAtParity`, `resolveDragAnimationDurationMs`,
`isCssEasing`, `resolveDragEasing`, `clampCursorPointToViewport`,
`resolveDragCursorPresentation`, `TILING_DROP_INTENT_CONFIG`.

### 3c. Type surface — the type-closure approach

The renderer props (`TilingRendererProps` + `TilingRenderTileProps`) plus the
ref (`TilingCommandHandle`) plus the theming/query/capability helpers form the
public **type closure**. Because the renderer props reference nearly the entire
`Tiling*` type set, the public *type* surface stays large even though the
*runtime* surface shrinks sharply — this is expected and honest.

Method: author the facade's `export type { … }` block with the computed closure,
set **`ae-forgotten-export=error`** on the `.` config, run `api:check`, and add
back any type the extractor flags as forgotten. This mechanically converges the
`.` report to *exactly* the closure — zero forgotten exports, zero `@internal`
leaks. Types demoted (not in the closure, only referenced by demoted runtime):
`DragResolvedTarget`, `TilingDropIntentState`, `TilingDropIntentBaseConfig`,
`TilingEdgeZone`, `FocusHistory`, `DragCursorKind`/`DragCursorPoint`/
`DragCursorPresentation`/`DragCursorTone`/`DragCursorViewportBounds`,
`FlexibleRatioChild`, `SplitBoundaryStaticFlags`, `TilingKeymapActionGuards`,
`GroupLeavesOptions`, `TilingKeyboardAction`, `TilingKeyboardEventLike`,
`TilingKeyboardModifierState`, `TilingMoveModeState`, `TilingPaneSwitcherState`.
(Any of these the extractor proves in-closure is re-promoted automatically.)

Kept public types (partial, driven by the closure): all layout node types
(`TilingLayoutNode`/`TilingLeafNode`/`TilingSplitNode`/`TilingGroupNode`,
`TilingPaneSizing*`, `TilingSplitAxis`, `TilingLayoutMode`,
`TilingMasterOrientation`), the full capability tree
(`TilingInteractionCapabilities` + every `Resolved*` + sub-capability),
keymap/chord types referenced by capabilities, `TilingCommand` + `TilingCommandGates`,
theme token types, tile/accent types, the debug/observability types referenced by
public renderer props (`TilingDropIntentDebugState`, `TilingLiveHitLogState`, …),
`MultiSelectModifierState`, `TilingPaneCycleDirection`, `TilingFocusDirection`,
and the NEW `TilingLayoutQuery`.

---

## 4. New public DTO — `queryTilingLayout` / `TilingLayoutQuery`

The dogfood consumers (`shortcuts.tsx`, `showcase.tsx`) reach into the layout
tree for read-only structure: leaf ids, tile order, groups, splits, master-mode
detection, and directional neighbors. Rather than expose five raw recursive
walkers (`readLeafNodeIds`, `tileOrderByLeafId`, `collectGroups`,
`collectSplitNodes`, `findLeafByDirection`) — which leak the tree-shape and are
engine-grade — we lift ONE higher-level, read-only query facade:

```ts
export interface TilingLayoutQuery {
  readonly leafIds: ReadonlyArray<string>;
  readonly tileOrder: ReadonlyArray<string>;
  readonly groups: ReadonlyArray<TilingGroupNode>;
  readonly splits: ReadonlyArray<TilingSplitNode>;
  readonly hasMasterSplit: boolean;
  readonly neighborLeafId: (
    fromLeafId: string,
    direction: TilingFocusDirection,
  ) => string | null;
}
export function queryTilingLayout(layout: TilingLayoutNode): TilingLayoutQuery;
```

It composes the raw walkers internally (which stay `@beta`/engine). The
`neighborLeafId` is a function-typed property (matching the existing
`TilingCommandHandle.dispatch` / `TilingTheme.resolve*` convention), not a
method signature. This is the single dogfooding-forced promotion; the raw
walkers go to `./engine`.

---

## 5. Dogfooding gate (the honesty test)

`apps/web` + `packages/showcase` must build/typecheck consuming ONLY the `.`
public API (plus a documented, deliberate `./engine` import where genuinely
power-user). Migration map:

- `apps/web/src/shortcuts.tsx`: `readLeafNodeIds`/`collectGroups`/
  `collectSplitNodes`/`findLeafByDirection` → `queryTilingLayout(...)`;
  `isCommandEnabled`, `resolveJumpedPaneId`, `resolveInteractionCapabilities`
  stay (promoted).
- `apps/web/src/tile.tsx`: `isMultiSelectModifierActive` stays (promoted).
- `apps/web/src/page.tsx`: `collectSplitNodes`/`findLeafByDirection`/
  `readLeafNodeIds`/`tileOrderByLeafId`/`resolveInteractionCapabilities` →
  `queryTilingLayout(...)` + promoted `resolveInteractionCapabilities`.
- `packages/showcase/src/showcase.tsx`: same query-facade migration;
  `DEFAULT_DRAG_HOP_EASING`/`DEFAULT_TILING_LAYOUT_CONFIG`/`TilingRenderer`
  stay.

Outcome target: **zero `./engine` imports needed** by the dogfood consumers —
the promoted set + `queryTilingLayout` fully covers them. If any raw walker
proves irreplaceable, it is imported from `./engine` and annotated as a
deliberate power-user escape.

---

## 6. Multi-entry build & reports

- **tsup**: 3 entries (`index`, `devtools`, `engine`), `format: [esm, cjs]`,
  `dts: true`, `external: [react, react-dom]`. `"use client"` preserved on the
  `.` and `/devtools` outputs (both re-export React host modules); `./engine`
  stays server-safe (pure logic, no directive).
- **`package.json#exports`**: `.` / `./devtools` / `./engine`, each with
  `types` + `import` + `require`.
- **API Extractor is single-entry** → 3 configs
  (`api-extractor.{index,devtools,engine}.json`), each pointed at the matching
  `dist/*.d.ts`, each writing its own `etc/*.api.md`. `api:check` runs all 3;
  the `.` config is strict (`ae-forgotten-export=error`, `ae-undocumented=error`),
  the `engine` config is lenient (report-drift only — no doc/leak gate on the
  unstable escape hatch).
- **`api:docs`**: builds the consumer reference from the `.` doc model only
  (engine/devtools excluded from the consumer site).

---

## 7. Docs remap (Stage 5)

- `/docs` = Fast track + **API reference**, documenting ONLY the `.` surface.
- `/devtools` = advanced opt-in section.
- Engine = a **contributor** reference generated from `./engine`, kept OFF the
  consumer site, linked from `CONTRIBUTING.md` / `_agent/`.
- `apps/web/src/llms.ts` framing updated to the public-API/engine split.
- Prerender still writes `dist/index.html`, `dist/docs/index.html`,
  `dist/llms.txt`; `/docs` no longer lists engine helpers.

---

## 8. Guardrails (Stage 6)

- **Layering lint** (`no-restricted-imports` / `import/no-restricted-paths`):
  forbid `engine/`→`react/`; forbid app/deep imports of `engine/…` (must use an
  entry point); forbid the facade importing engine except via `react/`.
- **`'use client'` preservation**: the directive survives the facade re-export
  to `dist/index.*` (esbuild directive-preserving), asserted by a build-time
  check script (the pre-revamp build did NOT preserve it — this is a real fix).
- **CI** (`.github/workflows/ci.yml`, extended not duplicated): 3× `api:check`
  + `api:docs` drift gate + the new lint + the `'use client'` assertion.

---

## 9. Staged gate

Every stage gates on: 840 tests + typecheck (pkg/showcase/web) + build +
prerender + `api:check` (all reports) all green, then commit + progressive
rebase-loop push to `main`. Stages: 0 doc · 1 layering/rename · 2 facade ·
3 tiered entries + multi-entry build · 4 dogfooding · 5 docs · 6 guardrails ·
7 changelog + final sweep.

---

## 10. Borderline classifications (flagged for operator review)

1. **`groupLeaves` demoted to `./engine`.** The pre-revamp `26.7.0` changelog
   explicitly named `groupLeaves` a public helper. It is an engine-grade layout
   mutator (reducer over the tree); grouping is driven interactively through the
   renderer, so consumers rarely need the raw reducer. Demoted; changelog
   updated. Reopen if a headless/controlled-grouping use case appears.
2. **Drag-animation tuning constants kept public.** `BASELINE_DRAG_HOP_DURATION_MS`,
   `INSTANT_DRAG_DURATION_MS`, the speed min/max/default percents, and the two
   easing defaults are kept on `.` as prop-tuning references, while the compute
   fns (`resolveDragAnimationDurationMs`, `dragSpeedsAtParity`,
   `resolveDragEasing`, `isCssEasing`) are demoted. Borderline: the bare
   constants could also be demoted if we consider the renderer's own defaults
   sufficient.
3. **`queryTilingLayout` as a new DTO vs. promoting the raw walkers.** Chosen to
   lift a single read facade rather than promote 5 raw walkers. Borderline: some
   consumers may prefer the granular walkers; they remain available on `./engine`.
