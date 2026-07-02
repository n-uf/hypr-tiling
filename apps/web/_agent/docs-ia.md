# `/docs` information architecture — consumer docs

Architecture record for the `apps/web` `/docs` route: the consumer/contributor
split, the two-lane consumer IA, the scope boundary, and where each doc class
lives. Structure + rationale only.

## Consumer vs contributor split

- **Consumer** = a developer who *uses* `@n-uf/hypr-tiling` in their app.
  Consumer docs describe **only** the public SDK surface.
- **Contributor** = a developer who works *on* the library (architecture,
  internals, maintenance).

The public `/docs` site (and its `llms.txt` / SEO mirrors) contains **only
consumer material**. No architecture/internals, no `_agent/*` prose, no
core-extraction or drag-subsystem-audit content. The Migration/CHANGELOG
pointer stays because it is consumer-relevant.

Contributor material is discoverable in-repo but **off** the public site:
- `CONTRIBUTING.md` (repo root) — entry point for contributors; points to the
  `_agent/*` notes and the dev/test/build/`api:check`/`api:docs` workflow.
- `_agent/*` and `packages/hypr-tiling/_agent/*` — architecture notes and
  subsystem deep-dives.

## Two-lane consumer IA (`/docs`)

Rendered by `apps/web/src/docs-page.tsx`. Reading order:

```
SDK map            routing landing: brand-new → Fast track;
                   know-what-you-need → capability; look-up → reference
  │
Lane A — Fast track                one copy-paste path, time-to-first-tile
  │   install → Tailwind content glob → minimal <TilingRenderer> + renderTile
  │   → "next steps" links into Lane B
  │
Lane B — Full SDK spectrum         the consumable surface, grouped by capability
  ├─ Renderer & props              TilingRenderer / TilingRendererProps / renderTile / TilingTile
  ├─ Layout tree & mutation        layout-node types + pure mutation helpers
  ├─ Interaction capabilities      TilingInteractionCapabilities + presets + Resolved variants
  ├─ Theming                       TilingThemeProvider / TilingTheme / useTilingTheme
  ├─ Multi-select & grouping       canGroupMultiSelection + groupLeaves (Alt/Opt+G)
  ├─ Drag / FLIP & recovery        consumer-visible props/callbacks only
  └─ Devtools (opt-in / advanced)  @n-uf/hypr-tiling/devtools — kept out of Fast track
  │
Migration & changelog              consumer-relevant release pointer
  │
API reference                      generated per-symbol cards + kind-grouped TOC
```

Each Lane B capability group links into the generated per-symbol reference via
`ReferenceLinks`, which resolves each symbol name against
`API_REFERENCE_SECTIONS` and emits a link only when the symbol is actually on
the public barrel — so broken anchors and accidental `@internal` references are
structurally impossible.

## Scope boundary

Consumer docs document **only the public barrel** — the ~171-item public API of
`@n-uf/hypr-tiling` (+ `/devtools`), rendered as 178 generated reference cards.
The boundary is enforced by **API Extractor**: `@internal`/deep-engine symbols
(ghost-transit math, leaf geometry, drop-validity, projected-layout, low-level
pane-switching helpers) are excluded from the public entry, and `pnpm api:check`
fails CI if one leaks. The generated reference already excludes them; hand-written
examples use only public API.

## Where each doc class lives

| Doc class | Location | On public `/docs` site? |
|---|---|---|
| Consumer guides (SDK map, Fast track, capability groups) | `apps/web/src/docs-page.tsx` | Yes |
| Consumer topic index (sidebar / llms.txt / JSON-LD) | `apps/web/src/docs.tsx` (`DOCS_GUIDE_TOPICS`) | Yes |
| Generated per-symbol reference | `apps/web/src/api-reference/generated.ts` (via `pnpm api:docs`) | Yes |
| `llms.txt` mirror | `apps/web/src/llms.ts` (`buildLlmsTxt`) | Yes |
| Contributor entry point | `CONTRIBUTING.md` (repo root) | No |
| Architecture / internals notes | `_agent/*`, `packages/hypr-tiling/_agent/*` | No |

## Generation & prerender chain

`DOCS_GUIDE_TOPICS` (in `docs.tsx`) is the single source for the docs sidebar
lanes, the `llms.txt` guide index, and the JSON-LD `hasPart`; the prose bodies
live in `docs-page.tsx` keyed by the same anchor ids. `apps/web/prerender.mjs`
writes the route to static HTML at `dist/docs/index.html` (alongside
`dist/index.html` and `dist/llms.txt`), so consumers, crawlers, and LLM fetchers
read the content without executing JavaScript. The reference bundle stays
code-split.
