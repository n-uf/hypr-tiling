import * as React from "react";
import {
  TilingRenderer,
  queryTilingLayout,
  type TilingCommand,
  type TilingCommandHandle,
  type TilingInteractionCapabilities,
  type TilingLayoutConfig,
  type TilingLayoutNode,
  type TilingLayoutQuery,
  type TilingRenderTileProps,
  type TilingTile,
} from "@n-uf/hypr-tiling";
import type { HomeSkin } from "../page";
import { buildMobileMasterLayout, MOBILE_INITIAL_LEAF_ID } from "./layout-tree";
import { MOBILE_HOME_SKIN_TOKENS, type MobileHomeSkinTokens } from "./skin-tokens";

// Concept 1 — Master + Rail (the mobile home default). One real
// `TilingRenderer` instance in `layoutMode: "master"` / `masterOrientation:
// "top"` (see `buildMobileMasterLayout`): the engine's own master resolver
// lays out a big master band on top plus a horizontal stack rail below,
// exactly the sketch's shape. A custom `renderTile` paints the master slot
// with the normal rich pane chrome (`renderMasterTile`, the active skin's
// tile) and every stack slot as a compact chip; tapping a chip "promotes" it
// by swapping tile content between the tapped stack leaf and the master leaf
// (`swap-panes`) — the tree shape/geometry never changes, only which tile
// occupies which slot.

const MASTER_LAYOUT_CONFIG: TilingLayoutConfig = {
  gapPx: 6,
  // Floors the stack rail's rendered height on tall viewports so it stays a
  // thin chip strip (~40px), never a second half-height band.
  minPaneSizePx: 40,
  handleSizePx: 6,
};

const MASTER_INTERACTION: TilingInteractionCapabilities = {
  resize: "none",
  resizeHandlesVisible: false,
  rearrange: false,
  paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
  paneTitleBarControls: { sizing: false, acquireSpace: false },
  grouping: false,
  masterLayout: true,
  maximize: { enable: true },
};

export function MasterRailMobile({
  tiles,
  renderMasterTile,
  skin,
}: {
  tiles: ReadonlyArray<TilingTile>;
  renderMasterTile: (args: TilingRenderTileProps) => React.ReactNode;
  skin: HomeSkin;
}): React.ReactElement {
  const tokens: MobileHomeSkinTokens = MOBILE_HOME_SKIN_TOKENS[skin];
  const [layout, setLayout] = React.useState<TilingLayoutNode>(
    buildMobileMasterLayout,
  );
  const [focusedLeafId, setFocusedLeafId] = React.useState<string | null>(
    MOBILE_INITIAL_LEAF_ID,
  );
  const commandHandleRef = React.useRef<TilingCommandHandle | null>(null);

  const dispatch = React.useCallback((command: TilingCommand): void => {
    commandHandleRef.current?.dispatch(command);
  }, []);

  const query: TilingLayoutQuery = queryTilingLayout(layout);
  const masterCount: number =
    layout.kind === "split" ? layout.masterCount ?? 1 : 1;
  const masterLeafId: string | undefined = query.leafIds[0];

  const promote = React.useCallback(
    (leafId: string): void => {
      if (masterLeafId == null || leafId === masterLeafId) {
        return;
      }
      dispatch({
        kind: "swap-panes",
        sourceLeafId: masterLeafId,
        targetLeafId: leafId,
      });
      dispatch({ kind: "focus-pane", leafId: masterLeafId });
    },
    [dispatch, masterLeafId],
  );

  return (
    // `h-full`, not `flex-1`: this div's parent (`page.tsx`'s content slot) is
    // a plain block, not a flex container, so `flex-1` has nothing to grow
    // against and the box collapses to its own content height. Master's
    // TilingRenderer paints every slot `position: absolute` off a measured
    // container size, so a collapsed ancestor means every slot resolves to
    // 0×0 — an entirely blank canvas, not just a cramped one (dwindle-based
    // Swipe/Grid still show *something* because their slots are normal-flow
    // flex children that keep the container sized to fit their content).
    //
    // No eyebrow/hint line: the master pane fills the whole area and the
    // engine's own thin stack rail (single-row chips) sits at the bottom;
    // tapping a chip promotes it. Chrome is only the rail the engine draws.
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="min-h-0 min-w-0 flex-1">
        <TilingRenderer
          ref={commandHandleRef}
          layout={layout}
          tiles={tiles}
          config={MASTER_LAYOUT_CONFIG}
          interaction={MASTER_INTERACTION}
          onLayoutChange={setLayout}
          themeId="mosaic"
          focusedLeafId={focusedLeafId}
          onFocusedLeafChange={setFocusedLeafId}
          renderTile={(args: TilingRenderTileProps): React.ReactNode => {
            const index: number = query.leafIds.indexOf(args.leafId);
            const isMaster: boolean = index >= 0 && index < masterCount;
            if (isMaster) {
              return renderMasterTile(args);
            }
            return (
              <button
                type="button"
                data-leaf-id={args.leafId}
                onClick={(): void => promote(args.leafId)}
                aria-label={`promote ${args.tile.title} to master`}
                title={`promote ${args.tile.title} to master`}
                className={args.isFocused ? tokens.chipFocused : tokens.chip}
              >
                <span aria-hidden className="shrink-0 font-semibold tabular-nums opacity-70">
                  {String(args.paneOrdinal).padStart(2, "0")}
                </span>
                <span className="min-w-0 truncate">{args.tile.title}</span>
              </button>
            );
          }}
        />
      </div>
    </div>
  );
}
