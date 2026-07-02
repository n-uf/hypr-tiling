import { useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
  type TilingCommandHandle,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// Grouping, splitting and maximizing are built-in interactions (Alt/Opt+G to
// group a selection, Alt+Enter to maximize, drag a header to split), but you can
// also drive them from code with commands:
//   • group-leaves     — fold leaves into one tabbed group
//   • insert-adjacent   — split: drop one leaf beside another
//   • toggle-maximize   — maximize / restore a leaf

const tiles: TilingTile[] = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
  { id: "c", title: "C" },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.34,
  first: { kind: "leaf", id: "a", tileId: "a" },
  second: {
    kind: "split",
    id: "rest",
    axis: "horizontal",
    ratio: 0.5,
    first: { kind: "leaf", id: "b", tileId: "b" },
    second: { kind: "leaf", id: "c", tileId: "c" },
  },
};

export function GroupSplitMaximizeExample(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  const [maximizedLeafId, setMaximizedLeafId] = useState<string | null>(null);
  const handle = useRef<TilingCommandHandle>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={(): void =>
            handle.current?.dispatch({ kind: "group-leaves", leafIds: ["b", "c"] })
          }
        >
          Group B + C
        </button>
        <button
          type="button"
          onClick={(): void => handle.current?.dispatch({ kind: "toggle-maximize", leafId: "a" })}
        >
          Maximize A
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TilingRenderer
          ref={handle}
          layout={layout}
          tiles={tiles}
          config={DEFAULT_TILING_LAYOUT_CONFIG}
          onLayoutChange={setLayout}
          maximizedLeafId={maximizedLeafId}
          onMaximizedLeafChange={setMaximizedLeafId}
          renderTile={({ tile }: TilingRenderTileProps): ReactNode => (
            <div style={{ padding: 12, fontSize: 13 }}>{tile.title}</div>
          )}
        />
      </div>
    </div>
  );
}
