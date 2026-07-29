import * as React from "react";
import {
  TilingRenderer,
  queryTilingLayout,
  type TilingInteractionCapabilities,
  type TilingLayoutConfig,
  type TilingLayoutNode,
  type TilingLayoutQuery,
  type TilingRenderTileProps,
  type TilingTile,
} from "@n-uf/hypr-tiling";
import type { HomeSkin } from "../page";
import {
  buildMobileDwindleLayout,
  buildPocketSplitLayout,
  MOBILE_INITIAL_LEAF_ID,
  POCKET_CONTENT_TILE_ID,
  POCKET_MAP_TILE_ID,
} from "./layout-tree";
import { SchematicMap } from "./schematic-map";

// Concept 3 — Pocket Grid. The engine drives a real two-leaf VERTICAL SPLIT of
// `map` over `content` (see `buildPocketSplitLayout`): the schematic mini-map is
// the top leaf, the opened pane is the bottom leaf, and the divider between them
// is a genuine draggable resize handle (`resize: "vertical"`, handle visible) —
// the user drags the gap to trade map height for content height. The map
// defaults to ~24% of the area, never half. Tapping a rect in the schematic
// re-points the content leaf at that pane; it never reshapes the split. The
// schematic itself is drawn from a SEPARATE seven-pane dwindle tree (rects +
// ordinals) so the map still represents the full home even though the engine
// layout here is just two leaves.

const GRID_LAYOUT_CONFIG: TilingLayoutConfig = {
  // Tight gap so the split reads as a WM divider, not an airy gutter. A slightly
  // fatter handle keeps the divider comfortably touch-draggable.
  gapPx: 6,
  minPaneSizePx: 44,
  handleSizePx: 10,
};

const GRID_INTERACTION: TilingInteractionCapabilities = {
  // Only the height divider between map and content resizes — everything else
  // (rearrange, focus churn, pane switching, grouping, maximize) is off so the
  // sole interaction is "tap a rect to open · drag the gap to resize".
  resize: "vertical",
  resizeHandlesVisible: true,
  rearrange: false,
  focus: false,
  paneSwitching: { enable: false, showTabStrip: false, showSwitcherOverlay: false },
  paneTitleBarControls: { sizing: false, acquireSpace: false },
  grouping: false,
  masterLayout: false,
  maximize: { enable: false },
};

export function PocketGridMobile({
  tiles,
  tilesById,
  renderTile,
  skin,
}: {
  tiles: ReadonlyArray<TilingTile>;
  tilesById: ReadonlyMap<string, TilingTile>;
  renderTile: (args: TilingRenderTileProps) => React.ReactNode;
  skin: HomeSkin;
}): React.ReactElement {
  // The engine layout is JUST the map|content split; it changes only when the
  // user drags the divider.
  const [gridLayout, setGridLayout] = React.useState<TilingLayoutNode>(
    buildPocketSplitLayout,
  );
  // Which of the seven home panes the content leaf currently shows, tracked by
  // its dwindle leaf id (the schematic's identity space).
  const [selectedLeafId, setSelectedLeafId] = React.useState<string>(
    MOBILE_INITIAL_LEAF_ID,
  );

  // The seven-pane dwindle tree the schematic is drawn from — constant across
  // the session (resizing the split never touches it).
  const dwindle: TilingLayoutNode = React.useMemo(buildMobileDwindleLayout, []);
  const dwindleQuery: TilingLayoutQuery = React.useMemo(
    (): TilingLayoutQuery => queryTilingLayout(dwindle),
    [dwindle],
  );

  const selectedIndex: number = dwindleQuery.leafIds.indexOf(selectedLeafId);
  const selectedTileId: string | undefined =
    dwindleQuery.tileOrder[selectedIndex >= 0 ? selectedIndex : 0];
  const selectedTile: TilingTile | undefined =
    selectedTileId != null ? tilesById.get(selectedTileId) : undefined;
  const selectedOrdinal: number = (selectedIndex >= 0 ? selectedIndex : 0) + 1;

  // Two synthetic tiles back the split's two leaves. The content tile only needs
  // to satisfy the layout's `tileId` reference — the real doc pane (with its own
  // id, so content metrics resolve) is threaded through `renderTile` below.
  const engineTiles: ReadonlyArray<TilingTile> = React.useMemo(
    (): ReadonlyArray<TilingTile> => [
      { id: POCKET_MAP_TILE_ID, title: "map" },
      { id: POCKET_CONTENT_TILE_ID, title: selectedTile?.title ?? "pane" },
    ],
    [selectedTile],
  );

  return (
    // `h-full`, not `flex-1` — see the identical note in `master-rail.tsx`:
    // this div's parent is a plain block, not a flex container. No banner line;
    // the schematic map IS the affordance and the split divider is the only
    // other control.
    <div className="h-full min-h-0 min-w-0">
      <TilingRenderer
        layout={gridLayout}
        tiles={engineTiles}
        config={GRID_LAYOUT_CONFIG}
        interaction={GRID_INTERACTION}
        onLayoutChange={setGridLayout}
        themeId="mosaic"
        renderTile={(args: TilingRenderTileProps): React.ReactNode => {
          if (args.tile.id === POCKET_MAP_TILE_ID) {
            return (
              <SchematicMap
                layout={dwindle}
                tilesById={tilesById}
                activeLeafId={selectedLeafId}
                onTapLeaf={setSelectedLeafId}
                skin={skin}
              />
            );
          }
          if (selectedTile == null) {
            return null;
          }
          // The opened pane, painted with the skin's normal rich pane chrome.
          // Override `tile` with the real doc tile (correct id → content metrics
          // resolve) and `paneOrdinal` with its home ordinal, not the leaf's.
          return renderTile({
            ...args,
            tile: selectedTile,
            paneOrdinal: selectedOrdinal,
          });
        }}
      />
    </div>
  );
}
