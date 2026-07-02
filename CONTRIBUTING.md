# Contributing to hypr-tiling

This guide is for **contributors** — developers working *on* the
`@n-uf/hypr-tiling` library itself (architecture, internals, maintenance).

If you are a **consumer** — a developer *using* `@n-uf/hypr-tiling` in your app —
you want the consumer documentation instead: <https://hypr-tiling.n-uf.com/docs>
(fast track, the public API grouped by capability, and the generated per-symbol
reference). The consumer docs describe only the public API (`.`) facade;
internals and the `@beta` `./engine` escape hatch are intentionally kept off that
site and documented here.

## Repository layout

```
packages/hypr-tiling/   The published package (source, tests, tsup build, API Extractor configs)
apps/web/               The homepage + /docs site (Vite SPA, static prerender)
_agent/                 Contributor architecture notes (repo-wide)
```

## Architecture notes (`_agent/`)

Design records and subsystem deep-dives live in `_agent/` folders, next to the
module they describe. Start here before changing internals:

- `_agent/tiling-architecture.md` — the overall layout/interaction model.
- `_agent/versioning-policy.md` — the calendar-versioning (`YY.M.R`) policy.
- `packages/hypr-tiling/_agent/theme-engine.md` — the theming engine internals.
- `packages/hypr-tiling/_agent/drag-subsystem-audit.md` — the drag / FLIP / ghost
  state machine.
- `packages/hypr-tiling/_agent/drag-recovery-cdp-throttle.md` — self-healing drag
  recovery.
- `packages/hypr-tiling/_agent/core-extraction-design.md` — the framework-agnostic
  engine extraction plan (historical; `core/` is now `engine/`).
- `packages/hypr-tiling/_agent/public-api-boundary-design.md` — the public-API
  boundary: the `.` facade, the `@internal` engine layer, the tiered entry-point
  model, and the type-closure / dogfooding approach.
- `apps/web/_agent/docs-ia.md` — the consumer/contributor split and the `/docs`
  two-lane information architecture.

## Dev / test / build workflow

Run from the repository root (pnpm workspace):

```bash
pnpm install          # install workspace deps
pnpm dev              # run the homepage + /docs dev server (apps/web)
pnpm typecheck        # typecheck every package + the web app
pnpm test             # run the package Jest suite
pnpm check            # typecheck + test
pnpm build            # build the packages, then the web app (incl. static prerender)
```

## Public API boundary (`api:check` / `api:docs`)

The package ships **three entry points**, wired through `package.json#exports`
and built as three tsup entries (`index` / `devtools` / `engine`):

| Entry | Import path | Contract |
|---|---|---|
| Public API | `@n-uf/hypr-tiling` | The hand-authored `.` facade — the ONLY consumer surface. Explicit named exports, semver-tracked, fully TSDoc'd. |
| Devtools | `@n-uf/hypr-tiling/devtools` | Opt-in observability overlays. Documented, on its own entry so a renderer-only consumer never bundles it. |
| Engine | `@n-uf/hypr-tiling/engine` | `@beta` escape hatch. Re-exports engine-grade reducers / tree walkers / keymap / drag math for power users. **No stability guarantees**; kept off the consumer docs site. |

The `index.ts` facade never `export *`s; it re-exports only the curated
keep-list. Engine modules live under `engine/` and reach consumers only through
the `.` facade (via `react/`) or the explicit `./engine` entry. API Extractor
runs once per entry (`api-extractor.{index,devtools,engine}.json`), producing
three reports under `etc/`. The strict gate (forgotten-export = error,
undocumented = error) applies to the `.` report only; the `/docs` reference and
`llms.txt` are generated from the `.` doc model alone. Run from
`packages/hypr-tiling/`:

```bash
pnpm api:check        # 3 reports; fails if the . surface drifts or leaks an unexported type (CI gate)
pnpm api:update       # refresh etc/hypr-tiling*.api.md after an intentional surface change
pnpm api:docs         # regenerate apps/web/src/api-reference/generated.ts from the . TSDoc
```

`api:docs` is idempotent — a CI docs-drift gate fails on any diff, so regenerate
and commit whenever you change the public surface or its TSDoc. Every `.` public
symbol must carry TSDoc (coverage is enforced in CI).

### Engine (`./engine`) contributor reference

The `@beta` engine surface is machine-documented in
`packages/hypr-tiling/etc/hypr-tiling.engine.api.md` (the API Extractor report
for the `./engine` entry). It is deliberately **not** on the consumer docs site.
When you add or change an engine-grade symbol re-exported from `engine.ts`, run
`pnpm api:update` and commit the refreshed report alongside the change.

## Delivery

Contributions land through the standard branch flow (`dev/<name>` → `develop` →
`main`). Keep commits lowercase, concise, scope + intent. `main` requires the
`opengrep/ci` SAST check to pass.
