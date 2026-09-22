# hypr-tiling versioning reference

## Version format

Use `YY.M.R` as the default release version shape.

- `YY`: two-digit year (`26` for 2026)
- `M`: the **calendar month of the release date**, without leading zero (`6`
  for June, `9` for September). It is never "the next number after the last
  release" — a release cut on 2026-09-22 is `26.9.x`, and `26.10.x` is only
  valid for a release dated in October 2026.
- `R`: release counter within that year/month

Example: `26.6.1`.

Incident (2026-09-22): the workspace-set release was published as `26.10.0`
although it shipped in September. `26.10` reads as October, and because
`26.10.0 > 26.9.3` under semver ordering, npm's `latest` dist-tag kept pointing
at the mis-numbered version until it was moved by hand
(`npm dist-tag add @n-uf/hypr-tiling@26.9.3 latest`). The release was
re-published as `26.9.3` (identical API plus the React-free `./engine` entry
fix) and `26.10.0` was **unpublished** (`npm unpublish --force`, within npm's
72-hour window) rather than deprecated.

**Consequence: npm permanently reserves an unpublished version number, so
`26.10.0` can never be used again. The first October 2026 release must be
`26.10.1`.** The unpublished number also disappears from
`npm view @n-uf/hypr-tiling versions`, so nothing on the registry side would
stop it from being proposed a second time.

## Burned versions

| Version | Why it is burned | Recorded |
|---|---|---|
| `26.10.0` | September 2026 release mis-numbered as October; unpublished 2026-09-22, re-released as `26.9.3` | `scripts/calendar-version-bump.mjs` `BURNED_VERSIONS` |

Rule for a mis-numbered version that lands on a *future* month: prefer
`npm deprecate` (the number stays visible on the registry and keeps ordering
honest) unless it can be unpublished quickly AND the burned number is recorded
in the table above and in `BURNED_VERSIONS`. Either way the month's `R`
counter starts after the burned value.

`pnpm release:next-version` (`scripts/calendar-version-bump.mjs`) computes
`YY.M` from the current date, continues `R` within the month, and skips every
`BURNED_VERSIONS` entry — from `26.9.x` it proposes `26.10.1` in October, not
`26.10.0`. Prefer it over a hand-typed version. Guarded by
`packages/hypr-tiling/__tests__/calendar-version-bump.test.ts`.

## SemVer compatibility

Do not zero-pad numeric segments (for example `26.06.1`), because SemVer core numeric identifiers cannot contain leading zeroes.

This keeps versions compatible with package managers such as npm and pnpm.

## Optional patch segment

When patch cadence is needed inside the same release counter, extend to `YY.M.R.P`.

- `P`: patch counter under the same `YY.M.R`
