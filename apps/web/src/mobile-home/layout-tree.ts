import type { TilingLayoutNode, TilingLeafNode } from "@n-uf/hypr-tiling";

// Both mobile trees carry the SAME seven documentation tiles as the desktop
// homepage (`page.tsx`'s `INITIAL_LAYOUT`) — the mobile concepts reorganize
// the identical content, they do not swap it out. Leaf ids are prefixed `m-`
// so they never collide with the desktop tree's leaf ids (each mobile concept
// owns its own independent `TilingRenderer` instance/state, decoupled from the
// desktop renderer — switching device width never mutates desktop state).

/**
 * A nested dwindle tree over the seven documentation panes, reshaped for a
 * single mobile column. Used by the Fullscreen + Swipe concept (where the
 * shape only matters as the underlying leaf order for `focus-cycle`) and the
 * Pocket Grid concept (where the nesting also drives the schematic mini-map).
 */
export function buildMobileDwindleLayout(): TilingLayoutNode {
  return {
    kind: "split",
    id: "m-root",
    axis: "vertical",
    ratio: 0.32,
    first: { kind: "leaf", id: "m-intro", tileId: "intro" },
    second: {
      kind: "split",
      id: "m-rest",
      axis: "vertical",
      ratio: 0.3,
      first: { kind: "leaf", id: "m-usecases", tileId: "usecases" },
      second: {
        kind: "split",
        id: "m-b",
        axis: "horizontal",
        ratio: 0.5,
        first: {
          kind: "split",
          id: "m-b1",
          axis: "vertical",
          ratio: 0.5,
          first: { kind: "leaf", id: "m-install", tileId: "install" },
          second: { kind: "leaf", id: "m-features", tileId: "features" },
        },
        second: {
          kind: "split",
          id: "m-b2",
          axis: "vertical",
          ratio: 0.34,
          first: { kind: "leaf", id: "m-model", tileId: "model" },
          second: {
            kind: "split",
            id: "m-b2b",
            axis: "vertical",
            ratio: 0.5,
            first: { kind: "leaf", id: "m-roadmap", tileId: "roadmap" },
            second: {
              kind: "leaf",
              id: "m-discoverability",
              tileId: "discoverability",
            },
          },
        },
      },
    },
  };
}

/**
 * A master + horizontal stack-rail tree over the same seven panes. Setting
 * `layoutMode: "master"` on the root split flattens its descendant slots (in
 * reading order) into a master area + stack for GEOMETRY — the binary shape
 * below still has to exist to carry the seven leaves, but the master resolver
 * ignores its nesting. `masterOrientation: "top"` puts the master area in a
 * band across the top and the stack in a horizontal row below it (per
 * `TilingMasterOrientation`'s doc comment): exactly the Master + Rail shape.
 */
export function buildMobileMasterLayout(): TilingLayoutNode {
  return {
    kind: "split",
    id: "m-master-root",
    axis: "vertical",
    // High ratio → a thin stack rail (short chips), not a second half-height
    // pane. The engine's `minPaneSizePx` (40, see `MASTER_LAYOUT_CONFIG`)
    // floors the rail's rendered height on short viewports so it stays ~40px.
    ratio: 0.94,
    layoutMode: "master",
    masterCount: 1,
    masterOrientation: "top",
    first: { kind: "leaf", id: "m-intro", tileId: "intro" },
    second: {
      kind: "split",
      id: "m-stack-a",
      axis: "horizontal",
      ratio: 0.34,
      first: { kind: "leaf", id: "m-usecases", tileId: "usecases" },
      second: {
        kind: "split",
        id: "m-stack-b",
        axis: "horizontal",
        ratio: 0.4,
        first: { kind: "leaf", id: "m-install", tileId: "install" },
        second: {
          kind: "split",
          id: "m-stack-c",
          axis: "horizontal",
          ratio: 0.5,
          first: { kind: "leaf", id: "m-features", tileId: "features" },
          second: {
            kind: "split",
            id: "m-stack-d",
            axis: "horizontal",
            ratio: 0.5,
            first: { kind: "leaf", id: "m-model", tileId: "model" },
            second: {
              kind: "split",
              id: "m-stack-e",
              axis: "horizontal",
              ratio: 0.5,
              first: { kind: "leaf", id: "m-roadmap", tileId: "roadmap" },
              second: {
                kind: "leaf",
                id: "m-discoverability",
                tileId: "discoverability",
              },
            },
          },
        },
      },
    },
  };
}

/** The initially-focused leaf for every mobile concept (the `intro` pane, matching the desktop default). */
export const MOBILE_INITIAL_LEAF_ID: string = "m-intro";

/** Synthetic tile id for the Pocket Grid's schematic map leaf (top of the split). */
export const POCKET_MAP_TILE_ID: string = "pg-map";
/** Synthetic tile id for the Pocket Grid's content leaf (the opened pane, bottom of the split). */
export const POCKET_CONTENT_TILE_ID: string = "pg-content";

/**
 * The Pocket Grid's OWN engine layout: a real two-leaf vertical split of
 * `map` over `content`, so the divider between them is a genuine draggable
 * resize handle (the engine owns the gap; the user drags it). The map defaults
 * to ~24% of the height (well under half) and the content pane owns the rest;
 * `minPaneSizePx` (see `GRID_LAYOUT_CONFIG`) lets the user shrink the map
 * further. This is separate from the seven-pane dwindle tree that the schematic
 * mini-map is DRAWN from — tapping a schematic rect just re-points the content
 * leaf, it never reshapes this split.
 */
export function buildPocketSplitLayout(): TilingLayoutNode {
  return {
    kind: "split",
    id: "pg-root",
    axis: "vertical",
    ratio: 0.24,
    first: { kind: "leaf", id: "pg-map", tileId: POCKET_MAP_TILE_ID },
    second: { kind: "leaf", id: "pg-content", tileId: POCKET_CONTENT_TILE_ID },
  };
}
