import type { TilingLayoutNode, TilingTile } from "@n-uf/hypr-tiling";

// A layout is a plain, serialisable tree you own in state. Three node kinds:
//   • leaf  — holds one tile (by tileId)
//   • split — divides space along an axis (horizontal | vertical) by a ratio
//   • group — stacks several leaves behind a tab strip (one active at a time)
// Every node needs a stable `id`. A leaf's `tileId` points into your tiles.

export const tiles: TilingTile[] = [
  { id: "files", title: "Files" },
  { id: "editor", title: "Editor" },
  { id: "terminal", title: "Terminal" },
  { id: "problems", title: "Problems" },
];

// Files on the left; a stacked editor over a tabbed group (terminal + problems)
// on the right. This whole object is JSON-serialisable — persist and restore it.
export const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.25,
  first: { kind: "leaf", id: "files-pane", tileId: "files" },
  second: {
    kind: "split",
    id: "main",
    axis: "vertical",
    ratio: 0.7,
    first: { kind: "leaf", id: "editor-pane", tileId: "editor" },
    second: {
      kind: "group",
      id: "bottom-group",
      activeMemberId: "terminal-pane",
      members: [
        { kind: "leaf", id: "terminal-pane", tileId: "terminal" },
        { kind: "leaf", id: "problems-pane", tileId: "problems" },
      ],
    },
  },
};
