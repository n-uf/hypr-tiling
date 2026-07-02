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
1. Hero          one value sentence + a LIVE minimal layout + its copy-paste source
   │
2. Quickstart    the golden path, numbered + runnable:
   │             install → Tailwind content glob → minimal controlled
   │             <TilingRenderer> + renderTile → the live result above
   │
3. How do I…      the heart — outcome-framed recipes, each:
   │             goal sentence → complete compiled snippet → the 2–3 knobs →
   │             related reference links (+ a live demo where it helps):
   │   ├─ Define the initial layout            (leaf / split / group tree)
   │   ├─ Render your own content in a pane    (renderTile)
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
6. API reference DEMOTED, last. "For when you already know the name." Tiered:
                 Core (TilingRenderer, layout + queryTilingLayout, theming,
                 commands/dispatch) vs Advanced helpers (isCommandEnabled,
                 capability/query utilities).
```

`DOCS_GUIDE_TOPICS` (in `docs.tsx`) carries a `section` field
(`quickstart | howto | concepts | examples | reference`) that drives the sidebar
grouping, the `llms.txt` topic index, and the JSON-LD `hasPart`. The prose bodies
+ compiled snippets live in `docs-page.tsx` keyed by the same anchor ids.

Each recipe's related-links row uses `ReferenceLinks`, which resolves each symbol
name against `API_REFERENCE_SECTIONS` and emits a link only when the symbol is
actually on the public barrel — so broken anchors and accidental `@internal`
references are structurally impossible.

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
curated surface, rendered as generated reference cards (101 after the demotions
below). The boundary is enforced by **API Extractor**
(`api-extractor.index.json`, forgotten-export = error): engine-grade symbols are
NOT re-exported from the facade and never reach the `.` report or the generated
reference. Power users reach them through the `@beta` `@n-uf/hypr-tiling/engine`
entry, documented for contributors and kept off this site.

Reference-legibility demotions (moved from `.` to `./engine`): the `accentHue`
custom-chrome helper and the two prop-less internal drag-duration reference
constants `BASELINE_DRAG_HOP_DURATION_MS` / `INSTANT_DRAG_DURATION_MS`. Kept on
`.`: `isCommandEnabled` (dogfood-proven in `shortcuts.tsx`) and the
drag-animation defaults/bounds that back real `TilingRendererProps` knobs
(`DEFAULT_DRAG_HOP_EASING`, `DEFAULT_DRAG_REFLOW_EASING`,
`DEFAULT_DRAG_ANIMATION_SPEED_PERCENT`, `DRAG_ANIMATION_SPEED_MIN/MAX_PERCENT`).

## Where each doc class lives

| Doc class | Location | On public `/docs` site? |
|---|---|---|
| Task-first guides (Hero, Quickstart, How-do-I, Concepts, Examples) | `apps/web/src/docs-page.tsx` | Yes |
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
