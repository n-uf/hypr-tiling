import { useState, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// renderTile paints the BODY and chrome of every pane — it's how you render your
// own content. The renderer still owns layout, splits, resize and drag; your job
// is to draw one pane and forward its interaction handles:
//   • root must be `article[data-leaf-id]` (the renderer resolves the drag source
//     from it) and wire onFocus / onPointerMove / onPointerLeave
//   • the header wires onHandlePointerDown (this is the drag-pickup handle)
// Everything else in TilingRenderTileProps (isFocused, isMaximized, the tile
// payload, …) is presentation state you style from.

const tiles: TilingTile[] = [
  { id: "chart", title: "Revenue", content: <strong>$1.2M</strong> },
  { id: "log", title: "Activity", content: <span>3 new events</span> },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "a", tileId: "chart" },
  second: { kind: "leaf", id: "b", tileId: "log" },
};

function Pane(args: TilingRenderTileProps): ReactElement {
  return (
    <article
      data-leaf-id={args.leafId}
      tabIndex={-1}
      onFocus={args.onFocus}
      onPointerMove={args.onPointerMove}
      onPointerLeave={args.onPointerLeave}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        border: args.isFocused ? "1px solid #fbbf24" : "1px solid #ffffff1a",
        borderRadius: 8,
        background: "#121316",
        overflow: "hidden",
      }}
    >
      <header
        onPointerDown={args.onHandlePointerDown}
        style={{ cursor: "grab", padding: "6px 10px", fontSize: 11, color: "#d6d3d1" }}
      >
        {args.tile.title}
      </header>
      <div style={{ padding: 10, fontSize: 13, color: "#e7e5e4" }}>
        {args.tile.content}
      </div>
    </article>
  );
}

export function RenderTileExample(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      onLayoutChange={setLayout}
      renderTile={(args: TilingRenderTileProps): ReactNode => <Pane {...args} />}
    />
  );
}
