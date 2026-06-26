# hypr-tiling versioning reference

## Version format

Use `YY.M.R` as the default release version shape.

- `YY`: two-digit year (`26` for 2026)
- `M`: month without leading zero (`6` for June)
- `R`: release counter within that year/month

Example: `26.6.1`.

## SemVer compatibility

Do not zero-pad numeric segments (for example `26.06.1`), because SemVer core numeric identifiers cannot contain leading zeroes.

This keeps versions compatible with package managers such as npm and pnpm.

## Optional patch segment

When patch cadence is needed inside the same release counter, extend to `YY.M.R.P`.

- `P`: patch counter under the same `YY.M.R`
