# Contributing to hypr-tiling

This guide is for **contributors** — developers working *on* the
`@n-uf/hypr-tiling` library itself (architecture, internals, maintenance).

If you are a **consumer** — a developer *using* `@n-uf/hypr-tiling` in your app —
you want the consumer documentation instead: <https://hypr-tiling.n-uf.com/docs>
(fast track, the SDK surface grouped by capability, and the generated per-symbol
reference). The consumer docs describe only the public SDK barrel; internals are
intentionally kept off that site and documented here.

## Repository layout

```
packages/hypr-tiling/   The published SDK (source, tests, tsup build, API Extractor config)
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
  core extraction plan.
- `apps/web/_agent/docs-ia.md` — the consumer/contributor split and the `/docs`
  two-lane information architecture.

## Dev / test / build workflow

Run from the repository root (pnpm workspace):

```bash
pnpm install          # install workspace deps
pnpm dev              # run the homepage + /docs dev server (apps/web)
pnpm typecheck        # typecheck every package + the web app
pnpm test             # run the SDK Jest suite
pnpm check            # typecheck + test
pnpm build            # build the packages, then the web app (incl. static prerender)
```

## Public API boundary (`api:check` / `api:docs`)

The public API surface is the **curated barrel** of `@n-uf/hypr-tiling`
(+ `/devtools`). Deep-engine internals are tagged `@internal` and excluded.
API Extractor enforces the boundary; the generated `/docs` reference and
`llms.txt` are derived from it. Run from `packages/hypr-tiling/`:

```bash
pnpm api:check        # fail if an @internal symbol leaks onto the public entry (CI gate)
pnpm api:update       # refresh etc/hypr-tiling.api.md after an intentional surface change
pnpm api:docs         # regenerate apps/web/src/api-reference/generated.ts from TSDoc
```

`api:docs` is idempotent — a CI docs-drift gate fails on any diff, so regenerate
and commit whenever you change the public surface or its TSDoc. Every public
symbol must carry TSDoc (coverage is enforced in CI).

## Delivery

Contributions land through the standard branch flow (`dev/<name>` → `develop` →
`main`). Keep commits lowercase, concise, scope + intent. `main` requires the
`opengrep/ci` SAST check to pass.
