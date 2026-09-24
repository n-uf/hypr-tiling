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
- `drop-intent-resolver.ts` converts pointer coordinates into stable drop intent (`center`, `left`, `right`, `top`, `bottom`) using pane-local geometry. A host may also register `groupDropTargetRef` on `TilingRenderTileProps`: while `grouping.enable` is on, a pointer over that element resolves `group-merge` (the same intent the built-in group tab strip produces) before body zones are classified. The built-in strip is checked first, then the host element — which wins over the centre swap and over any edge band the element covers — then uncovered edge bands (`edge-insert`), then the pane centre (`swap`). A loose target leaf becomes a new group with the dragged source active; a group appends the source. The source's own target, and a group that already contains the source, fall through to the body partition.
- `pane-sizing.ts` resolves split distribution and min-size clamping for resize and static sizing behavior.
- `pane-switching.ts` provides focus and navigation helpers independent of React rendering.
- `projected-layout.ts` computes previewable post-drop topology using the same reducers used at commit.

The renderer composes these pure functions and keeps transient UI state (hover, active drag, focused pane) local to rendering concerns.

### Workspace set mode (shipped 26.9.3–26.9.6)

`TilingRenderer` accepts either `layout` + `onLayoutChange` (single tree) or
`workspaces` + `onWorkspacesChange` (`TilingWorkspaceSet`: ordered
`{ id, name, layout }[]` plus `activeId`). Set ops, integrity, and repair
live in `engine/workspace-set.ts`. Navigation (tile-keyed movers, commands,
keymap, swipe, transition, spring-load, tab-drop follow) lives in
`engine/workspace-navigation.ts`, `engine/workspace-spring-load.ts`,
`engine/workspace-set-controller.ts`, and the set-mode wrapper in
`react/tiling-renderer.tsx`. Host chrome: `useTilingWorkspaceTabs` (tab
strip + native drop), `useTilingWorkspaceSetController` (debounced persisted
set), `useWorkspaceSwipe` / `TilingWorkspaceSwipeScope`.

```text
[Host chrome]
  tabs / keymap / swipe / tab-drop
  -> [TilingCommand | set op]
  -> [onWorkspacesChange(nextSet) + onWorkspaceSwitch({ via })]
  -> [consumer-controlled TilingWorkspaceSet]
  -> [re-render active tree]
```

`via` is `TilingWorkspaceSwitchVia`: `"key"` | `"command"` | `"swipe"` |
`"spring-load"` | `"reveal"` | `"tab-drop"` (`"tab"` reserved). With
`followMovedLeaf: true`, tab drop moves and switches in one
`onWorkspacesChange`; hosts must not switch again from `onMoveLeaf`.

Directory tree above is historical (pre-`engine/` rename). Current layout:
`engine/` (framework-free) + `react/` (renderer + hooks) + `index.ts` (`.`
facade). Workspace-set symbols are on `.` and `./engine`.

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
