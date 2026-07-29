import * as React from "react";
import type { TilingRenderTileProps, TilingTile } from "@n-uf/hypr-tiling";
import type { HomeSkin } from "../page";
import { FullscreenSwipeMobile } from "./fullscreen-swipe";
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
  if (mode === "swipe") {
    return <FullscreenSwipeMobile tiles={tiles} renderTile={renderTile} skin={skin} />;
  }
  if (mode === "grid") {
    return (
      <PocketGridMobile
        tiles={tiles}
        tilesById={tilesById}
        renderTile={renderTile}
        skin={skin}
      />
    );
  }
  return (
    <MasterRailMobile tiles={tiles} renderMasterTile={renderTile} skin={skin} />
  );
}
