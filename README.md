# hypr-tiling workspace

Monorepo with a publishable core tiling package, a publishable showcase package, and a flat homepage app.

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

Active version: `26.6.1`.

Clause mapping:

- First clause (`26`) exposes the release year (`2026`)
- Second clause (`6`) exposes the release month (`June`)
- Third clause (`1`) is the major release sequence for that year/month window

Semver caveat:

- Semver numeric identifiers cannot use leading zeroes (`26.06.1` is invalid)
- This workspace therefore uses `YY.M.R` (e.g. `26.6.1`) instead of `YY.MM.R`

See `_agent/versioning-policy.md` for deeper guidance, including optional fourth-segment patterns.

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
