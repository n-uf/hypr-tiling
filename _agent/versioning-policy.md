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
at the mis-numbered version until it was moved by hand. `26.10.0` was
deprecated on npm and re-released as `26.9.3` with an identical API plus the
React-free `./engine` entry fix. `pnpm release:next-version`
(`scripts/calendar-version-bump.mjs`) computes `M` from the current date;
prefer it over a hand-typed version.

## SemVer compatibility

Do not zero-pad numeric segments (for example `26.06.1`), because SemVer core numeric identifiers cannot contain leading zeroes.

This keeps versions compatible with package managers such as npm and pnpm.

## Optional patch segment

When patch cadence is needed inside the same release counter, extend to `YY.M.R.P`.

- `P`: patch counter under the same `YY.M.R`
