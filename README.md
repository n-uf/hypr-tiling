# hypr-tiling project

`hypr-tiling` is a React dynamic-tiling layout toolkit for building IDE-like products, trading/operator consoles, and analytics dashboards with resizable panes and programmable split trees.

Use it when you need users to rearrange dense, multi-panel screens at runtime while your app keeps strict control over layout state and rendering behavior.

## Attribution

This project is inspired by [Hyprland](https://hypr.land) and its tiling-first UX philosophy.  
Kudos to the Hyprland maintainers and contributors for advancing modern Linux compositor and tiling workflow design.

## Workspace layout

- `packages/hypr-tiling` — core React tiling renderer package (`hypr-tiling`)
- `packages/showcase` — showcase UI package (`hypr-tiling-showcase`)
- `apps/web` — flat homepage app that consumes the showcase package

## Package install

```bash
pnpm add hypr-tiling react react-dom
```

## Minimal renderer usage

```tsx
import { DynamicTilingRenderer, type DynamicLayoutConfig, type DynamicLayoutNode, type DynamicTile } from "hypr-tiling";

const layout: DynamicLayoutNode = {
  kind: "split",
  id: "root",
  axis: "vertical",
  ratio: 0.5,
  first: { kind: "leaf", id: "left", tileId: "a" },
  second: { kind: "leaf", id: "right", tileId: "b" },
};

const config: DynamicLayoutConfig = { gapPx: 8, minPaneSizePx: 120, handleSizePx: 6 };

const tiles: ReadonlyArray<DynamicTile> = [
  { id: "a", title: "A", content: <div>A</div> },
  { id: "b", title: "B", content: <div>B</div> },
];

export function Example(): JSX.Element {
  return (
    <DynamicTilingRenderer
      layout={layout}
      tiles={tiles}
      config={config}
      onLayoutChange={() => {
        // Controlled component callback.
      }}
    />
  );
}
```

## Versioning policy

Clause mapping:

- First clause (`26`) exposes the release year (`2026`)
- Second clause (`6`) exposes the release month (`June`)
- Third clause (`1`) is the major release sequence for that year/month window

Semver caveat:

- Semver numeric identifiers cannot use leading zeroes (`26.06.1` is invalid)
- This workspace therefore uses `YY.M.R` (e.g. `26.6.1`) instead of `YY.MM.R`

Release commands (package `packages/hypr-tiling`):

- `npm run release`:
  - Auto-aligns `YY.M` to the current calendar year/month
  - If the current version already matches the current month, bumps patch (`26.6.2` -> `26.6.3`)
  - If the month changed, resets to `.0` for the new month (`26.6.2` in July 2026 -> `26.7.0`)
  - Publishes with `npm publish --access public`
- `npm run release --nobump=true`:
  - Publishes without changing the current version
- `npm run release:next-version`:
  - Prints the computed next calendar-aligned version without publishing

See `_agent/versioning-policy.md` for deeper guidance.

## License policy

This repository uses the source-available `PolyForm-Perimeter-1.0.0` license.

The model is "business use allowed, but no competing product built from this software":

- Internal and commercial use is allowed under PolyForm Perimeter
- Providing a product that competes with this software is not allowed
- This is source-available licensing, not OSI open-source licensing

See `_agent/license-policy.md` for rationale and source links.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```
