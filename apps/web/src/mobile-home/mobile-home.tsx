import * as React from "react";
import type { TilingRenderTileProps, TilingTile } from "@n-uf/hypr-tiling";
import type { HomeSkin } from "../page";
import { FullscreenSwipeMobile } from "./fullscreen-swipe";
import { MOBILE_HOME_TILE_IDS } from "./layout-tree";
import { MasterRailMobile } from "./master-rail";
import { PocketGridMobile } from "./pocket-grid";
import type { MobileHomeMode } from "./types";

// Dispatches to the active mobile home concept. Each concept owns its own
// independent `TilingRenderer` instance/state (see the per-concept modules) —
// switching modes remounts the target concept fresh rather than threading one
// shared layout through three very different presentations. `key={mode}`
// isn't needed: each branch is already a structurally distinct element type,
// so React unmounts/remounts across a mode switch on its own.
export function MobileHome({
  mode,
  tiles,
  tilesById,
  skin,
  renderTile,
}: {
  mode: MobileHomeMode;
  tiles: ReadonlyArray<TilingTile>;
  tilesById: ReadonlyMap<string, TilingTile>;
  skin: HomeSkin;
  renderTile: (args: TilingRenderTileProps) => React.ReactNode;
}): React.ReactElement {
  const seatedTiles: ReadonlyArray<TilingTile> = React.useMemo(
    (): ReadonlyArray<TilingTile> =>
      tiles.filter((tile: TilingTile): boolean => MOBILE_HOME_TILE_IDS.has(tile.id)),
    [tiles],
  );
  if (mode === "swipe") {
    return <FullscreenSwipeMobile tiles={seatedTiles} renderTile={renderTile} skin={skin} />;
  }
  if (mode === "grid") {
    return (
      <PocketGridMobile
        tiles={seatedTiles}
        tilesById={tilesById}
        renderTile={renderTile}
        skin={skin}
      />
    );
  }
  return (
    <MasterRailMobile tiles={seatedTiles} renderMasterTile={renderTile} skin={skin} />
  );
}
