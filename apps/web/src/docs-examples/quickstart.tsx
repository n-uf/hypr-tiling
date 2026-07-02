import { useState, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// The golden path: a controlled TilingRenderer. You own the layout tree in
// state; the renderer reports every user edit (drag, resize, group…) through
// onLayoutChange, and you apply it straight back. renderTile paints each pane.

const tiles: TilingTile[] = [
  { id: "editor", title: "Editor" },
  { id: "preview", title: "Preview" },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "left", tileId: "editor" },
  second: { kind: "leaf", id: "right", tileId: "preview" },
};

export function Quickstart(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);

  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      onLayoutChange={setLayout}
      renderTile={({ tile }: TilingRenderTileProps): ReactNode => (
        <div style={{ padding: 12, fontFamily: "system-ui", fontSize: 13 }}>
          {tile.title}
        </div>
      )}
    />
  );
}
