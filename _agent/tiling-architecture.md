# hypr-tiling architecture

## Subfolders Structure

```text
packages/hypr-tiling/
├── _agent/
│   ├── tiling-architecture.md   # Module architecture and integration contract
│   ├── license-policy.md        # License reference for this package
│   └── versioning-policy.md     # Package versioning reference
├── index.ts                     # Public API exports
├── types.ts                     # Layout, tile, and interaction type contracts
├── state.ts                     # Pure layout reducers and tree traversal helpers
├── pane-sizing.ts               # Static/flexible pane sizing math and split distribution
├── drop-intent-resolver.ts      # Drop-zone geometry and drop intent classification
├── projected-layout.ts          # Projected post-drop layout computation
├── interaction-capabilities.ts  # Interaction capability defaults and presets
├── pane-switching.ts            # Focus/maximize/switching pure logic
├── dynamic-tiling-renderer.tsx  # React renderer and pointer/drag interaction wiring
├── showcase.tsx                 # Optional demo surface for manual behavior checks
└── __tests__/                   # Unit tests for pure modules
```

## Components Diagram

### Component hierarchy

```text
Consumer App
└── TilingRenderer
    ├── recursive split branch renderer
    │   ├── first child branch
    │   ├── divider handle
    │   └── second child branch
    └── leaf renderer
        └── custom renderTile(...) or default tile view
```

### Data flow

```text
[Pointer/Keyboard Input]
  -> [TilingRenderer handlers]
  -> [drop-intent-resolver / pane-sizing / pane-switching]
  -> [state reducers produce next layout]
  -> [onLayoutChange(nextLayout)]
  -> [consumer-controlled layout state]
  -> [re-render]
```

## Component Interactions

`TilingRenderer` is a controlled component. It receives `layout`, `tiles`, and interaction config from the host, computes interaction intent, and emits immutable layout updates through `onLayoutChange`.

Pure modules own all deterministic behavior:

- `state.ts` applies structural mutations (`updateSplitRatio`, `swapLeafTiles`, insert/move helpers) without side effects.
- `drop-intent-resolver.ts` converts pointer coordinates into stable drop intent (`center`, `left`, `right`, `top`, `bottom`) using pane-local geometry.
- `pane-sizing.ts` resolves split distribution and min-size clamping for resize and static sizing behavior.
- `pane-switching.ts` provides focus and navigation helpers independent of React rendering.
- `projected-layout.ts` computes previewable post-drop topology using the same reducers used at commit.

The renderer composes these pure functions and keeps transient UI state (hover, active drag, focused pane) local to rendering concerns.

## Usage/Integration

### Minimal integration

```tsx
import { TilingRenderer, type TilingLayoutNode, type TilingTile } from "@n-uf/hypr-tiling";
import { useMemo, useState } from "react";

export function ExampleTilingHost(): JSX.Element {
  const [layout, setLayout] = useState<TilingLayoutNode>(INITIAL_LAYOUT);
  const tileMap: ReadonlyMap<string, TilingTile> = useMemo(() => new Map(TILES.map((tile) => [tile.id, tile])), []);

  return (
    <TilingRenderer
      layout={layout}
      tiles={tileMap}
      config={{ gapPx: 8, minPaneSizePx: 120, handleSizePx: 8 }}
      onLayoutChange={setLayout}
    />
  );
}
```

### Integration contract

- Keep `layout` in host state; the renderer does not own persistent layout state.
- Treat reducer outputs as immutable values and replace host state wholesale on `onLayoutChange`.
- Use typed tile IDs consistently between `layout` leaf nodes and the `tiles` map.
- Keep drag/resize/focus feature flags in one capability object so interaction behavior is explicit and testable.
