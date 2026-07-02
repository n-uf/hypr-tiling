import { useState, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// Because YOU own the tree and it's plain JSON, persistence is just save/load.
// onLayoutChange fires on every user edit — write it to storage there. On mount,
// read it back (falling back to a default). No library-specific serializer.

const STORAGE_KEY = "my-app.layout";

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

function loadLayout(): TilingLayoutNode {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (raw == null) {
    return defaultLayout;
  }
  // In real code, validate the parsed shape before trusting it.
  return JSON.parse(raw) as TilingLayoutNode;
}

export function SaveRestoreExample(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(loadLayout);

  const persist = (next: TilingLayoutNode): void => {
    setLayout(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
