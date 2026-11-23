import { useState, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  createPersistedTilingLayout,
  type TilingLayoutNode,
  type TilingTile,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// You own the tree and it's plain JSON. createPersistedTilingLayout saves it on
// every change and loads it on mount, and it heals a saved tree that no longer
// matches your tiles (one added or removed since it was saved) instead of
// trusting it: load() returns a repaired copy, or the default when it can't.

const tiles: TilingTile[] = [
  { id: "a", title: "Nav" },
  { id: "b", title: "Content" },
];

const defaultLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.3,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

// localStorage by default; pass `storage` for any key/value store.
const persisted = createPersistedTilingLayout({
  storageKey: "my-app.layout",
  expectedTileIds: tiles.map((tile: TilingTile): string => tile.id),
  fallbackLayout: defaultLayout,
  config: DEFAULT_TILING_LAYOUT_CONFIG,
});

export function SaveRestoreExample(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(() => persisted.load());

  // commit() repairs, saves and returns the tree to keep.
  const persist = (next: TilingLayoutNode): void => {
    setLayout(persisted.commit(next));
  };

  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      onLayoutChange={persist}
      renderTile={({ tile }: TilingRenderTileProps): ReactNode => (
        <div style={{ padding: 12, fontSize: 13 }}>{tile.title}</div>
      )}
    />
  );
}
