---
title: "React dockable panels: drag, tab and undock panes"
description: "Build react dockable panels in one tiled layout: drop a pane beside another or into tabs, undock it, save the tree, and see when you need floating windows."
h1: "Dockable panels in React with a tiled layout"
mainKeyword: "react dockable panels"
kind: use-case
published: 2026-11-04
updated: 2026-11-04
author: n-uf
takeaways:
  - "Docking needs a layout tree that records where each panel sits, drop targets while a panel is dragged, and a way to save the result; hypr-tiling gives you the tree and the drag behaviour, and your app owns the state."
  - "A drop resolves to a swap, an edge insert beside a pane, a split-container insert or a group merge onto a tab strip; the strip's eject and ungroup controls undock panes again."
  - "Docking stays inside one tiled tree: hypr-tiling has no floating or pop-out windows and no docking to the screen's edges."
  - "The layout is plain JSON, group nodes included, so you save it from onLayoutChange like any other state."
  - "dockview, FlexLayout and rc-dock name floating or pop-out windows on their own pages; hypr-tiling needs React 19 and Tailwind and is source-available, not open source."
faq:
  - q: "Can users drag a panel out into a floating window?"
    a: "No. hypr-tiling has no floating, free-positioned or pop-out windows: every pane sits in the tiled tree and fills the space. If you need windows that float or open in their own browser window, dockview, FlexLayout and rc-dock each describe that on their own pages (read on 4 November 2026)."
  - q: "Can I dock panels into tabs?"
    a: "Yes. Dropping a pane on another pane's tab strip merges it into that group, at the hovered tab's position or at the end if you drop past the last tab. A loose pane has no strip yet, so users start a group with Alt/Opt+click on pane headers and the Group control, or with Alt+G, and your code can use the group-leaves command."
  - q: "How do I save where users docked their panels?"
    a: "Write the layout tree to storage inside onLayoutChange and read it back on load. The tree is plain JSON and keeps each group's members and active tab, so it fits localStorage, a database column or an API payload. createPersistedTilingLayout does the localStorage version and repairs a damaged tree on load."
  - q: "Does docking work with the keyboard?"
    a: "Partly. Alt+M starts keyboard move mode: the arrow keys pick a destination, Enter moves the pane beside it and Escape cancels. Alt+G groups the focused pane with its neighbour, and Alt+J and Alt+K step through a group's tabs. To drop a pane into a chosen group as a tab, use your own button and the add-to-group command."
  - q: "Does it work on touch screens?"
    a: "The docs make one promise: on a touch screen a pane drag starts with a long press (interaction.touchDrag, on by default; longPressMs defaults to 220). They say nothing wider about phones or tablets, and hypr-tiling is React 19 and the browser DOM only, so test on your own devices."
sources:
  - title: "hypr-tiling README (repository root, origin/main)"
    url: "https://github.com/n-uf/hypr-tiling/blob/main/README.md"
    checked: 2026-11-04
  - title: "@n-uf/hypr-tiling package README (install, Tailwind, versioning, programmatic layout API, persisted layout, Tab groups, Multi-select grouping, Maximize, Features)"
    url: "https://github.com/n-uf/hypr-tiling/blob/main/packages/hypr-tiling/README.md"
    checked: 2026-11-04
  - title: "hypr-tiling public entry points (index.ts, engine.ts) at origin/main"
    url: "https://github.com/n-uf/hypr-tiling/tree/main/packages/hypr-tiling"
    checked: 2026-11-04
  - title: "hypr-tiling API reports (public entry and engine entry)"
    url: "https://github.com/n-uf/hypr-tiling/tree/main/packages/hypr-tiling/etc"
    checked: 2026-11-04
  - title: "hypr-tiling docs examples: initial-layout, commands, group-split-maximize, dashboard-app, capabilities"
    url: "https://github.com/n-uf/hypr-tiling/tree/main/apps/web/src/docs-examples"
    checked: 2026-11-04
  - title: "hypr-tiling documentation (live: guides, API reference for keymap, touchDrag, grouping)"
    url: "https://hypr-tiling.n-uf.com/docs"
    checked: 2026-11-04
  - title: "@n-uf/hypr-tiling on npm (latest 26.9.9, peers, licence field)"
    url: "https://registry.npmjs.org/@n-uf/hypr-tiling"
    checked: 2026-11-04
  - title: "PolyForm Perimeter License 1.0.1"
    url: "https://polyformproject.org/licenses/perimeter/1.0.1"
    checked: 2026-11-04
  - title: "Hyprland"
    url: "https://hypr.land/"
    checked: 2026-11-04
  - title: "dockview home page"
    url: "https://dockview.dev/"
    checked: 2026-11-04
  - title: "dockview README (GitHub)"
    url: "https://github.com/dockview/dockview"
    checked: 2026-11-04
  - title: "dockview docs: floating groups"
    url: "https://dockview.dev/docs/core/groups/floatingGroups"
    checked: 2026-11-04
  - title: "dockview docs: popout windows"
    url: "https://dockview.dev/docs/core/groups/popoutGroups"
    checked: 2026-11-04
  - title: "dockview docs: licensing (MIT vs Enterprise feature table)"
    url: "https://dockview.dev/docs/overview/licence"
    checked: 2026-11-04
  - title: "FlexLayout README (GitHub)"
    url: "https://github.com/caplin/FlexLayout"
    checked: 2026-11-04
  - title: "FlexLayout docs: popout windows"
    url: "https://github.com/caplin/FlexLayout/blob/master/docs/popout-windows.md"
    checked: 2026-11-04
  - title: "rc-dock README (GitHub)"
    url: "https://github.com/ticlo/rc-dock"
    checked: 2026-11-04
  - title: "rc-dock documentation"
    url: "https://ticlo.org/rc-dock/"
    checked: 2026-11-04
related:
  - /use-cases/react-drag-and-drop-dashboard
  - /blog/react-mosaic-alternatives
  - /
---

React dockable panels, the kind users drag beside one another, stack into tabs and pull back out again, need a layout model that records where each panel sits (a tree of splits and tab groups), drop targets while a panel is being dragged, and a way to save the result. hypr-tiling gives you the tree and the drag behaviour; your app owns the state. Everything docks inside one tiled tree, so a panel never floats or opens in a window of its own. If your users need that, the last section names docking managers that do it.

hypr-tiling is a [react tiling window manager](/) made by n-uf. Its interaction model is inspired by [Hyprland](https://hypr.land/), the tiling Wayland compositor; Hyprland's authors aren't involved.

## What does docking mean in hypr-tiling?

A react docking layout built with hypr-tiling is one tree, and every panel is a pane in it. A drag commits when the user lets go and resolves to one of four outcomes:

- `swap`: the drop lands on the middle of another pane and the two exchange tiles.
- `edge-insert`: the drop lands in one of the four edge bands around a pane's centre, and the dragged pane docks beside it on that side.
- `split-container-insert`: the pane goes into an existing split container rather than beside a single pane.
- `group-merge`: the drop lands on a group's tab strip and the pane becomes a tab, at the hovered tab's position, or at the end if you drop past the last tab.

When zones compete, the built-in tab strip wins over the edge bands, and the edge bands win over the centre.

To undock, the strip has two controls at its right end. Eject moves the active tab out into a pane beside the group; ungroup breaks the whole group back into separate panes. Both are on by default.

A loose pane has no strip to drop on. Users start a group by Alt/Opt+clicking two or more pane headers and pressing the Group button that appears on them. Alt+G groups the focused pane with its reading-order neighbour, or ungroups it if it's already in a group.

Other gestures work on the same tree. Alt+Enter maximizes the focused pane without rewriting the layout, and Escape restores it; a maximized group member keeps its tab strip unless you set `maximize.keepGroupTabStrip` to `false`. Alt+M starts keyboard move mode: arrow keys pick a destination pane, Enter commits and Escape cancels. On a touch screen a pane drag starts with a long press (`interaction.touchDrag`, on by default). That's all the docs promise for touch.

A free grid of widgets with empty cells is a different model; the [alternatives to react-grid-layout](/blog/react-grid-layout-alternatives) article covers those libraries.

## Build dockable panels in React with a tiling tree

Install the package with its React 19 peers:

```bash
pnpm add @n-uf/hypr-tiling react react-dom
```

On 4 November 2026 the latest version on npm is 26.9.9. Versions follow the calendar (`YY.M.R`), and the README says releases may break compatibility, so pin an exact version. The package ships no CSS: the renderer emits Tailwind utility classes, so your Tailwind build has to scan the package's `dist` folder (an `@source` line in v4, the `content` array in v3) or the panes render unstyled. The [quickstart](/docs#quickstart) walks through it.

The layout below is the docs' initial-layout example with the tiles given some content. Files sit on the left; the editor sits above a group that holds Terminal and Problems behind a tab strip:

```tsx
import { useState, type ReactElement } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingInteractionCapabilities,
  type TilingLayoutNode,
  type TilingTile,
} from "@n-uf/hypr-tiling";

const tiles: TilingTile[] = [
  { id: "files", title: "Files", content: "File tree" },
  { id: "editor", title: "Editor", content: "Code goes here" },
  { id: "terminal", title: "Terminal", content: "$ pnpm dev" },
  { id: "problems", title: "Problems", content: "No problems found" },
];

const initialLayout: TilingLayoutNode = {
  kind: "split", id: "root", axis: "horizontal", ratio: 0.25,
  first: { kind: "leaf", id: "files-pane", tileId: "files" },
  second: {
    kind: "split", id: "main", axis: "vertical", ratio: 0.7,
    first: { kind: "leaf", id: "editor-pane", tileId: "editor" },
    second: {
      kind: "group", id: "bottom-group", activeMemberId: "terminal-pane",
      members: [
        { kind: "leaf", id: "terminal-pane", tileId: "terminal" },
        { kind: "leaf", id: "problems-pane", tileId: "problems" },
      ],
    },
  },
};

// Tabs under the pane body, and no "ungroup" button on the strip.
const interaction: TilingInteractionCapabilities = {
  grouping: {
    enable: true,
    showGroupTabStrip: true,
    groupTabStrip: { placement: "bottom", showEject: true, showUngroup: false },
  },
};

export function DockablePanels(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      interaction={interaction}
      onLayoutChange={setLayout}
    />
  );
}
```

`TilingRenderer` is controlled. Nothing changes behind your back: when a user drags Files onto the Terminal and Problems strip, the new tree comes out through `onLayoutChange` and you pass it back in.

Every interaction is on by default, so the `interaction` prop only narrows. In `grouping`, `groupTabStrip.placement` is `"top"` or `"bottom"`, `showEject` and `showUngroup` default to `true`, and `height` defaults to 28 pixels. `grouping: false` turns tab groups off and leaves swap and edge insert. `rearrange: false` makes panes undraggable, so no drop zones appear at all. If you hide the built-in strip with `showGroupTabStrip: false`, a custom `renderTile` can mark its own header as a drop target with `groupDropTargetRef`.

## How do you dock panels from your own buttons?

Take a ref to the renderer and dispatch typed commands, the same set the drag and keyboard layers use. This trims the docs' commands example:

```tsx
import { useRef } from "react";
import type { TilingCommandHandle } from "@n-uf/hypr-tiling";

// Inside your component; pass it as <TilingRenderer ref={handle} … />.
const handle = useRef<TilingCommandHandle>(null);

// Dock the editor into the bottom tabs.
const dockEditor = (): void =>
  handle.current?.dispatch({
    kind: "add-to-group", groupId: "bottom-group", sourceLeafId: "editor-pane",
  });

// Undock Problems: it becomes a pane of its own beside the group.
const undockProblems = (): void =>
  handle.current?.dispatch({
    kind: "remove-from-group", groupId: "bottom-group", memberId: "problems-pane",
  });

// Dock Files to the right of the editor.
const dockFilesRight = (): void =>
  handle.current?.dispatch({
    kind: "insert-adjacent",
    sourceLeafId: "files-pane", targetLeafId: "editor-pane", placement: "right",
  });
```

A command for a capability you've turned off is a safe no-op. The [buttons recipe](/docs#howto-commands) has the full component.

Because you own the tree, you can also change it with the pure reducers. Each takes a layout and returns a new one:

```ts
import { groupLeaves, insertLeafAdjacent, ungroupNode } from "@n-uf/hypr-tiling/engine";

setLayout((current) => groupLeaves(current, ["files-pane", "editor-pane"]));
setLayout((current) => insertLeafAdjacent(current, "files-pane", "editor-pane", "right"));
setLayout((current) => ungroupNode(current, "bottom-group"));
```

They come from `@n-uf/hypr-tiling/engine`, the React-free entry that the README marks beta, not from the package root, so pin your version. `insertLeafAdjacent` moves a pane that's already in the tree.

One more reducer, `moveLeafToRoot`, takes a pane out and makes it one side (`"first"` or `"second"`) of a new root-level split, with the rest of the tree on the other. It's the nearest thing to docking at the outer edge, and only from code: no drag drop zone does it, and hypr-tiling doesn't dock to the screen's edges.

## Keep the layout users docked

The tree is plain JSON, and group nodes carry their members and `activeMemberId`, so where users docked their panels is saved like any other layout: write it in `onLayoutChange`, read it on load. The [drag-and-drop dashboard](/use-cases/react-drag-and-drop-dashboard) page has the code for `localStorage`, for `createPersistedTilingLayout` (which repairs a damaged tree on load) and for a per-user API. hypr-tiling has no server-side persistence, accounts or sync; that part is yours.

## When do you need floating or pop-out windows?

If a react dock layout to you means IDE-style tabs and splits, hypr-tiling covers it. Most of what comes up for react docking panels or react dockable windows, though, is a docking manager that also lets a panel float over the layout or open in its own browser window. hypr-tiling can't do that, so if your users need it, pick one of these. Each line comes from the project's own pages, read on 4 November 2026.

- dockview's home page lists tabs, groups, drag and drop, floating panels and popout windows. Its README says it supports React, Vue, Angular and JavaScript, and that everything in the repository is MIT except `dockview-enterprise`, which has a commercial licence. Its licensing page puts floating groups, popout windows and edge groups in the MIT package; auto-hide edge groups, dock-to-edge groups and keyboard docking are enterprise-only. Popout windows need a blank HTML page on your site (`/popout.html` by default).
- FlexLayout's README describes a layout manager for React with tabsets, docking to tabsets or the edges of the frame, and popping tabs out into floating panels or new browser windows. Its popout docs say a popout needs a `popout.html` page hosted next to the main page.
- rc-dock's README describes a dock layout for React components with a `dockbox` for docked panels and a `floatbox` for floating ones, and shows a panel popped out as a new browser window.

The [react mosaic alternatives](/blog/react-mosaic-alternatives) article compares these and the other options by layout model, tabs, pop-outs, React support and licence.

hypr-tiling fits when every pane should stay inside one tiled screen and fill it: dashboards, IDE-like tools, operator consoles. The [hypr-tiling home page](/) is laid out in its own panes. Know the limits before you start. It needs React 19 and the browser DOM, and Tailwind in your app. It is source-available under PolyForm Perimeter 1.0.1, which allows internal and commercial use but not a product that competes with hypr-tiling, so it isn't open source. It is in active development and releases may break compatibility.

hypr-tiling is made by n-uf and is independent of dockview (Dockview Ltd), FlexLayout (Caplin), rc-dock (ticlo) and Hyprland; none of them is affiliated with it or endorses it.
