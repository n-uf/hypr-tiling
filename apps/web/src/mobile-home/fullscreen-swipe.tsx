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
import { buildMobileDwindleLayout, MOBILE_INITIAL_LEAF_ID } from "./layout-tree";
import { MOBILE_HOME_SKIN_TOKENS, type MobileHomeSkinTokens } from "./skin-tokens";

// Concept 2 — Fullscreen + Swipe. One leaf is always maximized (the engine's
// own `maximize` render-mode fills the `TilingRenderer`'s viewport, hiding
// siblings — no custom fullscreen chrome needed). A Pointer-Events swipe on
// the content area dispatches `focus-cycle`; because a pane is already
// maximized, the renderer's own `activateLeaf` behavior (see
// `tiling-renderer.tsx`) automatically re-maximizes whichever leaf becomes
// focused, so cycling and maximizing stay in lockstep for free. Dots mirror
// `focus-jump`-style direct access; "Overview" toggles `restore` / `maximize`
// to reveal the full tiled tree and back.

const SWIPE_LAYOUT_CONFIG: TilingLayoutConfig = {
  gapPx: 10,
  minPaneSizePx: 120,
  handleSizePx: 6,
};

const SWIPE_INTERACTION: TilingInteractionCapabilities = {
  resize: "none",
  resizeHandlesVisible: false,
  rearrange: false,
  paneSwitching: { showTabStrip: false, showSwitcherOverlay: false },
  paneTitleBarControls: { sizing: false, acquireSpace: false },
  grouping: false,
  masterLayout: false,
  maximize: { enable: true },
};

// Minimum horizontal travel (CSS px) for a pointer gesture to count as a
// swipe, and the dominance margin over vertical travel so a content scroll
// never gets mistaken for a pane-cycle swipe.
const SWIPE_DISTANCE_THRESHOLD_PX: number = 48;

interface SwipeGestureState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
}

export function FullscreenSwipeMobile({
  tiles,
  renderTile,
  skin,
}: {
  tiles: ReadonlyArray<TilingTile>;
  renderTile: (args: TilingRenderTileProps) => React.ReactNode;
  skin: HomeSkin;
}): React.ReactElement {
  const tokens: MobileHomeSkinTokens = MOBILE_HOME_SKIN_TOKENS[skin];
  const [layout, setLayout] = React.useState<TilingLayoutNode>(
    buildMobileDwindleLayout,
  );
  const [focusedLeafId, setFocusedLeafId] = React.useState<string | null>(
    MOBILE_INITIAL_LEAF_ID,
  );
  const [maximizedLeafId, setMaximizedLeafId] = React.useState<string | null>(
    MOBILE_INITIAL_LEAF_ID,
  );
  const commandHandleRef = React.useRef<TilingCommandHandle | null>(null);
  const gestureRef = React.useRef<SwipeGestureState | null>(null);

  const dispatch = React.useCallback((command: TilingCommand): void => {
    commandHandleRef.current?.dispatch(command);
  }, []);

  const query: TilingLayoutQuery = queryTilingLayout(layout);
  const isOverview: boolean = maximizedLeafId == null;
  const activeIndex: number =
    focusedLeafId == null ? -1 : query.leafIds.indexOf(focusedLeafId);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (isOverview) {
        // Nothing to swipe between while the full tiled tree is showing.
        return;
      }
      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [isOverview],
  );

  const onPointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const gesture: SwipeGestureState | null = gestureRef.current;
      gestureRef.current = null;
      if (gesture == null || gesture.pointerId !== event.pointerId) {
        return;
      }
      const deltaX: number = event.clientX - gesture.startX;
      const deltaY: number = event.clientY - gesture.startY;
      if (
        Math.abs(deltaX) < SWIPE_DISTANCE_THRESHOLD_PX ||
        Math.abs(deltaX) <= Math.abs(deltaY)
      ) {
        return;
      }
      dispatch({ kind: "focus-cycle", direction: deltaX < 0 ? "next" : "previous" });
    },
    [dispatch],
  );

  const onPointerCancel = React.useCallback((): void => {
    gestureRef.current = null;
  }, []);

  const toggleOverview = React.useCallback((): void => {
    if (isOverview) {
      dispatch({ kind: "maximize", leafId: focusedLeafId ?? query.leafIds[0] });
    } else {
      dispatch({ kind: "restore" });
    }
  }, [dispatch, focusedLeafId, isOverview, query.leafIds]);

  return (
    // `h-full`, not `flex-1` — see the identical note in `master-rail.tsx`:
    // this div's parent is a plain block, not a flex container, so `flex-1`
    // never resolves to a real height here. Content owns everything above a
    // single thin bottom strip; the helper "swipe ← →" banner is gone (the dots
    // + counter say it) so nothing but that ~36px strip is chrome here.
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-1.5">
      <div
        className="min-h-0 min-w-0 flex-1"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <TilingRenderer
          ref={commandHandleRef}
          layout={layout}
          tiles={tiles}
          config={SWIPE_LAYOUT_CONFIG}
          interaction={SWIPE_INTERACTION}
          onLayoutChange={setLayout}
          themeId="mosaic"
          focusedLeafId={focusedLeafId}
          onFocusedLeafChange={setFocusedLeafId}
          maximizedLeafId={maximizedLeafId}
          onMaximizedLeafChange={setMaximizedLeafId}
          renderTile={renderTile}
        />
      </div>
      <div className={tokens.bottomStrip}>
        <div
          role="tablist"
          aria-label="panes"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {query.leafIds.map((leafId: string, index: number): React.ReactElement => (
            <button
              key={leafId}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`pane ${index + 1}`}
              onClick={(): void => dispatch({ kind: "focus-pane", leafId })}
              className="flex h-7 w-5 shrink-0 items-center justify-center"
            >
              <span
                aria-hidden
                className={`rounded-full transition-all ${
                  index === activeIndex
                    ? `h-2 w-2.5 ${tokens.dotActive}`
                    : `h-1.5 w-1.5 ${tokens.dot}`
                }`}
              />
            </button>
          ))}
        </div>
        <span aria-hidden className={tokens.counterText}>
          {String(Math.max(activeIndex, 0) + 1).padStart(2, "0")}
          <span className="opacity-50">{" / "}</span>
          {String(query.leafIds.length).padStart(2, "0")}
        </span>
        <button type="button" onClick={toggleOverview} className={tokens.overviewButton}>
          {isOverview ? "Focus" : "Overview"}
        </button>
      </div>
    </div>
  );
}
