import { useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
  type TilingCommandHandle,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// Drive the layout from YOUR OWN buttons. Take the renderer's imperative handle
// with a ref, then dispatch typed TilingCommands — the same command set the
// keyboard and drag layers use. Great for toolbars, context menus, or a
// "reset layout" button. A command targeting a disabled capability is a safe
// no-op, so you never have to guard the happy path.

const tiles: TilingTile[] = [
  { id: "a", title: "Left" },
  { id: "b", title: "Right" },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "left", tileId: "a" },
  second: { kind: "leaf", id: "right", tileId: "b" },
};

export function CommandsExample(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  const handle = useRef<TilingCommandHandle>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={(): void =>
            handle.current?.dispatch({ kind: "set-split-ratio", splitId: "root", ratio: 0.7 })
          }
        >
          Widen left
        </button>
        <button
          type="button"
          onClick={(): void => handle.current?.dispatch({ kind: "toggle-split-axis", splitId: "root" })}
        >
          Flip axis
        </button>
        <button
          type="button"
          onClick={(): void =>
            handle.current?.dispatch({ kind: "group-leaves", leafIds: ["left", "right"] })
          }
        >
          Group both
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TilingRenderer
          ref={handle}
          layout={layout}
          tiles={tiles}
          config={DEFAULT_TILING_LAYOUT_CONFIG}
          onLayoutChange={setLayout}
          renderTile={({ tile }: TilingRenderTileProps): ReactNode => (
            <div style={{ padding: 12, fontSize: 13 }}>{tile.title}</div>
          )}
        />
      </div>
    </div>
  );
}
