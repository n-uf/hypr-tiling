# `/docs` information architecture — task-first consumer docs

Architecture record for the `apps/web` `/docs` route: the consumer/contributor
split, the TASK-FIRST consumer IA, the compiled-examples anti-rot mechanism, the
TSDoc-is-reference-only rule, and where each doc class lives. Structure +
rationale only.

## Governing principle — task-first, not symbol-first

Consumer docs are TASK-FIRST. A consumer must be able to understand and run
things immediately, without reverse-engineering intent from a bare signature.
Code is the primary medium; prose frames it; the generated per-symbol API
reference is a DEMOTED fallback below the guides. Every guide is framed as an
OUTCOME the reader wants ("How do I render my own content in a pane?"), never as
API enumeration. If a page makes a consumer work out what something is FOR, it
has failed.

## Consumer vs contributor split

- **Consumer** = a developer who *uses* `@n-uf/hypr-tiling` in their app.
  Consumer docs describe **only** the public API surface (the `.` facade).
- **Contributor** = a developer who works *on* the library (architecture,
  internals, maintenance).

The public `/docs` site (and its `llms.txt` / SEO mirrors) contains **only
consumer material**. No architecture/internals, no `_agent/*` prose. Contributor
material is discoverable in-repo but **off** the public site:
- `CONTRIBUTING.md` (repo root) — contributor entry point; points to `_agent/*`
  and the dev/test/build/`api:check`/`api:docs` workflow.
- `_agent/*` and `packages/hypr-tiling/_agent/*` — architecture notes and
  subsystem deep-dives.

## Task-first consumer IA (`/docs`)

Rendered by `apps/web/src/docs-page.tsx`. Reading order leads with the graceful
path and demotes the reference to last:

```
1. Overview      one value sentence + a LIVE minimal layout + its copy-paste source
   │
2. Quickstart    the golden path, numbered + runnable:
   │             install → Tailwind content glob → minimal controlled
   │             <TilingRenderer> → the live result above
   │
3. How do I…      the heart — outcome-framed recipes, each:
   │             goal sentence → complete compiled snippet → the 2–3 knobs →
   │             related reference links (+ a live demo where it helps):
   │   ├─ Define the initial layout            (leaf / split / group tree)
   │   ├─ Render your own content in a pane    (renderTile — body)
   │   ├─ Render your own pane frame & header  (renderTile — FULL pane chrome + theme tokens)
   │   ├─ Theme & color panes                  (themeId / accent / useTilingTheme)
   │   ├─ Choose which interactions are allowed(interaction caps / presets)
   │   ├─ Save & restore a layout              (onLayoutChange persistence)
   │   ├─ Trigger actions from your own buttons(commands via TilingCommandHandle)
   │   ├─ Build a command bar / shortcuts      (ADVANCED — isCommandEnabled)
   │   └─ Group, split & maximize panes        (group-leaves / insert-adjacent / maximize)
   │
4. Concepts      minimal mental model — only what unblocks the recipes:
   │             the layout tree; the renderer runs interactions, you own the tree;
   │             capabilities are on-by-default and narrowed through one prop
   │
5. Examples      whole runnable apps to copy wholesale (dashboard, terminal grid)
   │
6. API reference DEMOTED, last. "For when you already know the name." Grouped by
                 category — Core (Renderer & tiles · Layout & query · Theming ·
                 Commands) then Advanced helpers (isCommandEnabled, the
                 interaction-capability shapes, query/keymap/debug utilities).
                 Every public symbol lands in exactly one group (Core is
                 name-set-matched; everything else falls through to Advanced), so
                 the grouping covers the whole generated surface with none dropped.
```

`DOCS_GUIDE_TOPICS` (in `docs.tsx`) carries a `section` field
(`quickstart | howto | concepts | examples | reference`) that drives the sidebar
grouping, the `llms.txt` topic index, and the JSON-LD `hasPart`. The prose bodies
+ compiled snippets live in `docs-page.tsx` keyed by the same anchor ids.

Each recipe's related-links row uses `ReferenceLinks`, which resolves each symbol
name against `API_REFERENCE_SECTIONS` and emits a link only when the symbol is
actually on the public barrel — so broken anchors and accidental `@internal`
references are structurally impossible.

## Navigation model — sidebar spine + scroll-spy + on-this-page rail

The left sidebar is the BACKBONE of the page, not a flat section list. It mirrors
the entire content tree and is driven by a single scroll-spy so the menu follows
the reader. Built from one `NAV_SECTIONS` model in `docs-page.tsx` (which the
sidebar, the right rail, and the scroll-spy all read), so the three stay in sync:

- **Sections**: Get started (Overview · Quickstart) · Guides (the "How do I…"
  recipes, derived from `DOCS_GUIDE_TOPICS` where `section === "howto"`) ·
  Concepts (Layout tree · Interactions · Capabilities) · Examples (Metrics
  dashboard · Terminal grid) · **API reference** — a COLLAPSIBLE tree (collapsed
  by default so it doesn't drown the guides) with a per-category group
  (Renderer & tiles · Layout & query · Theming · Commands · Advanced helpers),
  **each symbol a navigable leaf** under its category.
- **Scroll-spy** (`useScrollSpy`): one `IntersectionObserver` over every
  section / category / symbol anchor (document-ordered `ANCHOR_INDEX.order`). The
  active band sits just below the sticky header down to ~45% of the viewport; the
  first anchor intersecting it wins. The active nav item highlights AND
  auto-scrolls into view WITHIN the sidebar (`scrollIntoView({block:"nearest"})`);
  scrolling into the reference auto-expands the tree + the active symbol's
  category. Clicking any leaf smooth-scrolls to its anchor (`scrollToAnchor`), a
  hydration enhancement over the plain `#id` link.
- **Right rail** (`OnThisPage`): an "on this page" mini-TOC listing the leaves of
  the current section; inside the reference it narrows to the active category's
  symbols so it never balloons to the full generated surface.
- SSR + first client render both start at the first anchor, so there is **no
  hydration mismatch**; the observer refines the active id after mount. Every
  anchor is a plain `#id`, so the single prerendered page stays SEO / LLM-
  crawlable with JS disabled; the spine and spy are progressive enhancement.

## Live demos + default pane chrome + the content-toggle default

Every embedded "live result" is a real, controlled `TilingRenderer` (the same
compiled module whose source is shown), interactive on the prerendered page after
hydration. The generic rule that keeps them interactive: an example that does NOT
need custom chrome passes **no `renderTile`**, so the renderer supplies its
default pane frame + header — fully wired for drag / resize / group / maximize out
of the box (the Examples-gallery apps and the quickstart do this). A `renderTile`
callback is reached for ONLY to own the pane frame yourself, in which case the
custom pane must re-wire the handles it wants (`article[data-leaf-id]` root +
`onHandlePointerDown` etc.) — see the two `renderTile` recipes. Returning bare
`tile.content` from `renderTile` (no `article[data-leaf-id]`, no handlers) is the
footgun that silently strips drag/focus/group; the docs never model it.

The tab strip's "show pane body" checkbox (`paneSwitching.showContentToggle`) is a
dev/demo affordance, so the LIBRARY default is `false` (opt-in) — a consumer app
renders its own pane content and never wants an end-user control that blanks it.
Suppressed, the initial pane-content-visible flag pins ON, so panes paint content
at rest with no wiring, and the prerendered docs body carries the content (SEO
intact). The interactive showcase (`packages/showcase`) opts back in explicitly
with `paneSwitching: { showContentToggle: true }`; the homepage relies on the
default and passes no `interaction` prop. No docs example surfaces the checkbox.

The homepage carries a live **"SKIN" segmented switch** hosted in the top chrome
bar (`page.tsx`, `HomeTopBar`, right-aligned) that flips a whole bundled look —
theme + pane chrome + content presentation — across THREE skins:

- **Mosaic** — the default dark technical-atlas: graphite canvas, amber accent,
  `DocTile` chrome (`apps/web/src/tile.tsx`), dense uppercase-mono content
  (`apps/web/src/docs.tsx`).
- **Editorial** — light paper & ink: warm-paper canvas, serif headlines,
  `EditorialTile` folio chrome (`apps/web/src/editorial-tile.tsx`), a numbered
  reading index (`apps/web/src/content-editorial.tsx`).
- **Canvas** — greyish workspace: soft grey desk, hairline white cards, quiet
  neutral type, keycap chips + colored accent ticks (`CanvasTile` chrome
  `apps/web/src/canvas-tile.tsx`, content `apps/web/src/content-canvas.tsx`,
  theme `apps/web/src/canvas-theme.tsx`, plus a Canvas-only bottom status bar).

Every skin drives the SAME renderer, layout tree, and shared content model
(`docs.tsx` `DocInline`/`DocParagraph`), and is built with ONLY the public `.`
API + the four helper primitives, staying fully interactive (drag / resize /
maximize / group / focus / multi-select). The library's own tab strip is kept
OFF (`paneSwitching.showTabStrip: false`); the top bar rebuilds the pane tabs on
the public query + command API. It defaults to `Mosaic`, so the prerendered HTML
(and thus SEO/LLM content) is unchanged; the switch is a client-side toggle.

## Compiled examples — the anti-rot mechanism

Guide/quickstart snippets are NOT prose strings that can silently rot. They are
the RAW SOURCE of real, type-checked modules under
`apps/web/src/docs-examples/*.tsx`, each using ONLY the public `@n-uf/hypr-tiling`
(`.`) API. The source is embedded via Vite's `?raw` loader
(`apps/web/src/docs-examples/sources.ts` → `EXAMPLE_SOURCES`), which inlines the
file text at BUILD time for both the client bundle and the SSR/prerender bundle —
so the `<pre>` a reader sees, and the prerendered HTML, contain the exact file
text (no client fetch). Where a live demo is shown, `docs-page.tsx` also imports
and renders the module's exported component, so the LIVE demo and the SHOWN
snippet are the same file.

Because those `.tsx` files sit under the web app's `tsconfig` `include`, they are
covered by `pnpm typecheck` (and thus CI). A snippet therefore cannot drift from
the current public API without breaking the build: rename or demote a public
symbol and the example stops compiling.

Adding a snippet: create `docs-examples/<name>.tsx` (public `.` API only), add its
`?raw` import to `sources.ts`, and reference `EXAMPLE_SOURCES[<name>]` (and the
exported component for a live demo) from `docs-page.tsx`.

## TSDoc is for the reference + IDE hovers ONLY

The hand-authored guides are NOT generated from TSDoc. TSDoc on the public API
surface feeds two things only: (1) the generated per-symbol reference
(`api:docs` → `generated.ts`) and (2) editor hover-docs. Consumer-usage
`@example` blocks are added to the retained Advanced helpers (esp.
`isCommandEnabled`, plus `queryTilingLayout`, `isMultiSelectModifierActive`,
`resolveJumpedPaneId`) so even the reference card and the IDE hover are graceful —
but the guide prose is authored by hand in `docs-page.tsx`, never lifted from
TSDoc.

## Scope boundary + surface demotions

Consumer docs document **only the `.` public API facade** — the hand-authored
curated surface, rendered as generated reference cards (99 after the demotions
and the debug/observability split below). The boundary is enforced by **API
Extractor** (`api-extractor.index.json`, forgotten-export = error): engine-grade
symbols are NOT re-exported from the facade and never reach the `.` report or the
generated reference. Power users reach them through the `@beta`
`@n-uf/hypr-tiling/engine` entry, documented for contributors and kept off this
site.

### Consumer-first surface hardening (debug/observability off `.`)

The `.` render contract is kept free of internal/debug/observability/showcase
cruft. Two ground-up splits enforce this generically at the source:

- **`renderTile` args** — `TilingRenderTileProps` is the clean consumer subset
  (tile payload + pane state flags + interaction handlers). The debug /
  observability fields (`dropIntentDebug*`, `showDropIntent*`,
  `dropHitZoneCenterRatio*`, `paneHitZone*`, `observabilityColors` /
  `observabilityColorEnables`) moved to an INTERNAL superset
  (`TilingDefaultTileProps`) that only the built-in `DefaultTilingTile` consumes.
  A custom `renderTile` never receives them.
- **Renderer props** — `TilingRendererProps` is the clean consumer surface. The
  observability inputs (overlay colors, hit-zone / drop-intent debug flags, and
  the `onDropIntentChange` / `onLiveHitLogChange` / `onProjectedOverlayCountChange`
  telemetry hooks) moved to `TilingRendererObservabilityProps` on
  `@n-uf/hypr-tiling/devtools`, which also exports the observability-typed view of
  the SAME `TilingRenderer` (used by the showcase panel) and the debug/observability
  snapshot types (`TilingDropIntentDebugState`, `TilingLiveHitLogState`,
  `TilingObservabilityColorConfig`, `TilingPaneHitZone*`, …). The `.` report shrank
  accordingly; the `/devtools` report gained them.

### Optional helper primitives (the easy custom-pane path)

`TilingPaneRoot`, `TilingDragHandle`, `TilingPaneAction`, and `TilingPaneBody`
are unstyled public primitives on `.` that encode the four otherwise prose-only
pane wiring rules so a custom `renderTile` cannot get them wrong (data-leaf-id
root + focus/hover handlers; drag handle + `touch-action: none` + Alt/Opt group
toggle; action buttons that stop propagation; body render-mode gate). They are a
convenience layered over the render-prop; the raw `renderTile` args stay the full
escape hatch. The "Render your own pane frame & header" recipe + its compiled
example (`docs-examples/custom-chrome.tsx`) show BOTH the primitives path and the
raw path side by side.

Reference-legibility demotions (moved from `.` to `./engine`): the `accentHue`
custom-chrome helper and the two prop-less internal drag-duration reference
constants `BASELINE_DRAG_HOP_DURATION_MS` / `INSTANT_DRAG_DURATION_MS`. Demoting
`accentHue` does NOT weaken the custom-chrome story: a fully custom pane frame is
already a first-class PUBLIC capability via the generic `renderTile` full-pane
render prop (`TilingRenderTileProps` carries every handle + state flag) combined
with theme tokens from `useTilingTheme()` (`resolveAccentText`, `resolveFocusFrame`,
`resolvePaneAccentSurface`, the `paneShell` / `paneHeader` token groups). The
"Render your own pane frame & header" recipe + its compiled example
(`docs-examples/custom-chrome.tsx`) document exactly this — no showcase-only or
engine-only prop is involved. Kept on
`.`: `isCommandEnabled` (dogfood-proven in `shortcuts.tsx`) and the
drag-animation defaults/bounds that back real `TilingRendererProps` knobs
(`DEFAULT_DRAG_HOP_EASING`, `DEFAULT_DRAG_REFLOW_EASING`,
`DEFAULT_DRAG_ANIMATION_SPEED_PERCENT`, `DRAG_ANIMATION_SPEED_MIN/MAX_PERCENT`).

## Where each doc class lives

| Doc class | Location | On public `/docs` site? |
|---|---|---|
| Task-first guides (Overview, Quickstart, How-do-I, Concepts, Examples) + sidebar-spine nav / scroll-spy / on-this-page rail | `apps/web/src/docs-page.tsx` | Yes |
| Compiled example modules (guide snippets + live demos) | `apps/web/src/docs-examples/*.tsx` (+ `sources.ts`) | Yes |
| Consumer topic index (sidebar / llms.txt / JSON-LD) | `apps/web/src/docs.tsx` (`DOCS_GUIDE_TOPICS`) | Yes |
| Generated per-symbol reference (demoted, tiered) | `apps/web/src/api-reference/generated.ts` (via `pnpm api:docs`) | Yes |
| `llms.txt` mirror | `apps/web/src/llms.ts` (`buildLlmsTxt`) | Yes |
| Contributor entry point | `CONTRIBUTING.md` (repo root) | No |
| Architecture / internals notes | `_agent/*`, `packages/hypr-tiling/_agent/*` | No |

## Generation & prerender chain

`DOCS_GUIDE_TOPICS` (in `docs.tsx`) is the single source for the docs sidebar
sections, the `llms.txt` topic index, and the JSON-LD `hasPart`. The compiled
example sources are inlined via `?raw` at build. `apps/web/prerender.mjs` writes
the route to static HTML at `dist/docs/index.html` (alongside `dist/index.html`
and `dist/llms.txt`), so consumers, crawlers, and LLM fetchers read the content —
guides AND the exact snippet text — without executing JavaScript. The reference
bundle stays code-split.
