import { useState, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  TILING_DASHBOARD_PRESET,
  resolveInteractionCapabilities,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
  type TilingInteractionCapabilities,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// Every interaction (drag, resize, keyboard, grouping, maximize) is ON by
// default. Narrow behavior through the single `interaction` prop: pass a partial
// TilingInteractionCapabilities, or start from a preset and override. Here we
// take TILING_DASHBOARD_PRESET but disable grouping and lock resizing to the
// horizontal axis. resolveInteractionCapabilities() materializes the fully
// resolved shape if you need to read effective values yourself.

const interaction: TilingInteractionCapabilities = {
  ...TILING_DASHBOARD_PRESET,
  grouping: false,
  resize: "horizontal",
};

// Effective, fully-defaulted capabilities — handy for driving your own UI.
const resolved = resolveInteractionCapabilities(interaction);
export const isGroupingEnabled: boolean = resolved.grouping;

const tiles: TilingTile[] = [
  { id: "a", title: "Board" },
  { id: "b", title: "Detail" },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.6,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

export function CapabilitiesExample(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      interaction={interaction}
      onLayoutChange={setLayout}
      renderTile={({ tile }: TilingRenderTileProps): ReactNode => (
        <div style={{ padding: 12, fontSize: 13 }}>{tile.title}</div>
      )}
    />
  );
}
