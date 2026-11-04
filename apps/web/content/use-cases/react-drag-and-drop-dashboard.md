---
title: "React drag and drop dashboard with tiled panels"
description: "Build a React drag and drop dashboard where users move, resize and tab panels and keep their layout, and see when a grid library fits better."
h1: "Build a drag-and-drop dashboard in React with tiled panels"
mainKeyword: "react drag and drop dashboard"
kind: use-case
published: 2026-11-04
updated: 2026-11-04
author: n-uf
takeaways:
  - "A drag-and-drop dashboard in React needs three parts: the layout as data in your state, a component that renders and edits it, and a way to save it per user."
  - "hypr-tiling renders a tree of leaf, split and group nodes as tiled panes that always fill the screen; your app owns the tree and receives every change through onLayoutChange."
  - "The tree is plain JSON, so you can store it per user; createPersistedTilingLayout covers localStorage and repairs a damaged tree on load."
  - "react-grid-layout and gridstack fit better when widgets have fixed sizes on a grid, when you want empty space, or when you need breakpoint layouts."
  - "hypr-tiling needs React 19 and Tailwind in the host app, and it is source-available under PolyForm Perimeter 1.0.1, not open source."
faq:
  - q: "How do I save a dashboard layout in React?"
    a: "Write the layout tree to storage inside onLayoutChange and read it back when the page loads. The tree is plain JSON, so it fits localStorage, a database column or an API payload. createPersistedTilingLayout does the localStorage version and repairs a damaged tree when it loads."
  - q: "Can users add and remove widgets?"
    a: "Yes, through buttons you write. Add a tile to your tiles array and seat a leaf for it with insertLeafInto, or take a pane out with removeLeafTile. Both come from @n-uf/hypr-tiling/engine, which the package README marks beta, so pin the version."
  - q: "Does a hypr-tiling dashboard work on phones?"
    a: "The docs make no promise for phones. What they state: on a touch screen a pane drag starts with a long press (interaction.touchDrag, on by default, 220 ms), and swiping between workspaces is opt-in. hypr-tiling needs React 19 and the browser DOM, with no React Native and no breakpoint layouts, so test on your own devices before you rely on it."
  - q: "Do I need Tailwind?"
    a: "Yes. The package ships no CSS: the renderer emits Tailwind utility classes, so your Tailwind build has to scan the package's dist folder (a content glob in v3, an @source line in v4). Without that the panes render unstyled."
  - q: "Can I use hypr-tiling in a commercial dashboard?"
    a: "Yes, within the licence. hypr-tiling is source-available under PolyForm Perimeter 1.0.1, which allows internal and commercial use but not a product that competes with hypr-tiling. It is not open source in the OSI sense, and no price is published, so read the licence text for your case."
sources:
  - title: "hypr-tiling README (repository root, origin/main)"
    url: "https://github.com/n-uf/hypr-tiling/blob/main/README.md"
    checked: 2026-11-03
  - title: "@n-uf/hypr-tiling package README (install, Tailwind, versioning, entry points, persisted layout, workspaces)"
    url: "https://github.com/n-uf/hypr-tiling/blob/main/packages/hypr-tiling/README.md"
    checked: 2026-11-03
  - title: "hypr-tiling docs examples: dashboard-app, save-restore, capabilities, commands"
    url: "https://github.com/n-uf/hypr-tiling/tree/main/apps/web/src/docs-examples"
    checked: 2026-11-03
  - title: "hypr-tiling API reports (public entry and engine entry)"
    url: "https://github.com/n-uf/hypr-tiling/tree/main/packages/hypr-tiling/etc"
    checked: 2026-11-03
  - title: "hypr-tiling documentation (live)"
    url: "https://hypr-tiling.n-uf.com/docs"
    checked: 2026-11-03
  - title: "@n-uf/hypr-tiling on npm (latest 26.9.9, peers, licence field)"
    url: "https://www.npmjs.com/package/@n-uf/hypr-tiling"
    checked: 2026-11-03
  - title: "PolyForm Perimeter License 1.0.1"
    url: "https://polyformproject.org/licenses/perimeter/1.0.1"
    checked: 2026-11-03
  - title: "react-grid-layout README"
    url: "https://github.com/react-grid-layout/react-grid-layout#readme"
    checked: 2026-11-03
  - title: "react-grid-layout LICENSE (MIT)"
    url: "https://github.com/react-grid-layout/react-grid-layout/blob/master/LICENSE"
    checked: 2026-11-03
  - title: "gridstack.js README"
    url: "https://github.com/gridstack/gridstack.js#readme"
    checked: 2026-11-03
  - title: "Gridstack.js home page"
    url: "https://gridstackjs.com/"
    checked: 2026-11-03
  - title: "gridstack.js LICENSE (MIT)"
    url: "https://github.com/gridstack/gridstack.js/blob/master/LICENSE"
    checked: 2026-11-03
  - title: "Hyprland"
    url: "https://hypr.land/"
    checked: 2026-11-03
related:
  - /
  - /blog/react-mosaic-alternatives
  - /docs
---

To build a React drag and drop dashboard, keep the dashboard's layout as data in your state, render it with a component that lets users drag and resize the panels, and save that data for each user. This page does it with hypr-tiling, where panels are tiled and always fill the screen. The other approach is a grid of widgets with empty cells and free placement; the comparison near the end says when that's the better pick.

## What users can do in a drag-and-drop dashboard

In a tiled dashboard every panel is a pane in one tree. Users can:

- drag a panel's header onto another panel to swap the two, or onto one of its edges to drop it beside that panel;
- drag a divider to resize, or pin a pane to a pixel size while the others share the rest by ratio;
- put rarely used panels behind tabs: Alt/Opt+click several headers and group them, or drop a header on a tab strip;
- maximize one chart with Alt+Enter, and press Escape to put it back;
- stay on the keyboard, with directional focus, a pane switcher and a keyboard move mode, all on a remappable keymap.

hypr-tiling is a [react tiling window manager](/) for the browser. Its interaction model is inspired by [Hyprland](https://hypr.land/), the tiling Wayland compositor.

## Install it and build the dashboard

Install the package with its React 19 peers:

```bash
pnpm add @n-uf/hypr-tiling react react-dom
```

On 2026-11-03 the latest version on npm is 26.9.9. Versions follow the calendar (`YY.M.R`), so the number can't warn you about a breaking change, and the README says the library is in active development. Pin an exact version and read the changelog before you upgrade.

The package ships no CSS, and this is the step people miss. The renderer emits Tailwind utility classes, so your Tailwind build has to scan the package. In v4 that's one `@source` line; in v3 the same path goes in the `content` array:

```css
@import "tailwindcss";
@source "../node_modules/@n-uf/hypr-tiling/dist/**/*.{js,mjs}";
```

Skip it and the panes render unstyled. The [quickstart](/docs#quickstart) covers the install in three steps.

Now the dashboard. Each panel is a tile: an `id`, a `title` and the `content` it shows. The layout is a tree of plain objects. A `split` divides its space between two children along an `axis` by a `ratio`, and a `leaf` seats one tile. This one has four metric panes, in a horizontal split whose halves are each split vertically.

```tsx
import { useState, type ReactElement } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
} from "@n-uf/hypr-tiling";

// MetricCard is your own component.
const tiles: TilingTile[] = [
  { id: "revenue", title: "Revenue", accent: "emerald", content: <MetricCard metric={{ label: "MRR", value: "$48.2k" }} /> },
  { id: "users", title: "Active users", accent: "sky", content: <MetricCard metric={{ label: "DAU", value: "12,904" }} /> },
  { id: "errors", title: "Error rate", accent: "rose", content: <MetricCard metric={{ label: "5xx / min", value: "0.03%" }} /> },
  { id: "latency", title: "Latency", accent: "amber", content: <MetricCard metric={{ label: "p95", value: "142 ms" }} /> },
];

const initialLayout: TilingLayoutNode = {
  kind: "split", id: "root", axis: "horizontal", ratio: 0.5,
  first: {
    kind: "split", id: "left", axis: "vertical", ratio: 0.5,
    first: { kind: "leaf", id: "revenue-pane", tileId: "revenue" },
    second: { kind: "leaf", id: "users-pane", tileId: "users" },
  },
  second: {
    kind: "split", id: "right", axis: "vertical", ratio: 0.5,
    first: { kind: "leaf", id: "errors-pane", tileId: "errors" },
    second: { kind: "leaf", id: "latency-pane", tileId: "latency" },
  },
};

export function DashboardApp(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      themeId="clean-flat"
      onLayoutChange={setLayout}
    />
  );
}
```

That's a working drag-and-drop dashboard in React, trimmed from the metrics dashboard example in the docs. It passes no `renderTile`, so the renderer draws its default pane frame and header, and dragging, resizing and grouping work as they are.

`TilingRenderer` is a controlled component. It never changes the layout behind your back: every drag, resize or grouping comes out through `onLayoutChange`, and you pass the new tree back in. On a client-rendered page a pane's React state also survives a move, so a chart doesn't remount when a user drags it. When the page hydrates server markup, the default switches to remounting moved panes; `paneIdentity="stable"` keeps them mounted there too, at the cost of empty pane slots in the server HTML.

## Save each user's layout

You own the tree and it's plain JSON, so saving means writing it somewhere in `onLayoutChange` and reading it back on load. This is the shape of the docs' save-and-restore example, with `localStorage`:

```tsx
const STORAGE_KEY = "my-app.layout";

function loadLayout(): TilingLayoutNode {
  const raw = localStorage.getItem(STORAGE_KEY);
  // In real code, validate the parsed shape before trusting it.
  return raw == null ? initialLayout : (JSON.parse(raw) as TilingLayoutNode);
}

// inside the component:
const [layout, setLayout] = useState<TilingLayoutNode>(loadLayout);
const persist = (next: TilingLayoutNode): void => {
  setLayout(next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};
// <TilingRenderer onLayoutChange={persist} ... />
```

For a layout that follows a user across devices, send the same JSON to your own API, keyed by user and dashboard, and render `initialLayout` until it arrives. hypr-tiling has no server-side persistence, accounts or sync. That part is yours.

If `localStorage` is enough, `createPersistedTilingLayout` does the work and repairs a damaged tree:

```tsx
const persisted = createPersistedTilingLayout({
  storageKey: `dashboard.layout.${userId}`,
  expectedTileIds: ["revenue", "users", "errors", "latency"],
  fallbackLayout: initialLayout,
  config: DEFAULT_TILING_LAYOUT_CONFIG,
});
const [layout, setLayout] = useState<TilingLayoutNode>(() => persisted.load());
// <TilingRenderer onLayoutChange={(next) => setLayout(persisted.commit(next))} ... />
```

`load()` validates the saved tree and returns a repaired copy, or your fallback when nothing is stored or the tree can't be repaired. `commit()` repairs before it saves. `reset()` saves and returns the fallback, which is all a "Reset layout" button needs. The optional `storage` option takes any object with `getItem`, `setItem` and `removeItem`. The [save and restore recipe](/docs#howto-save-restore) has the full example.

## Keep users from breaking it

Every interaction is on by default. You narrow them with one `interaction` prop. Here edit mode turns off grouping and lets only the side-by-side dividers resize, and view mode uses the dashboard preset:

```tsx
import { TILING_DASHBOARD_PRESET, type TilingInteractionCapabilities } from "@n-uf/hypr-tiling";

const interaction: TilingInteractionCapabilities = editing
  ? { grouping: false, resize: "horizontal" }
  : TILING_DASHBOARD_PRESET;
// <TilingRenderer interaction={interaction} ... />
```

Know what the preset does before you use it. `TILING_DASHBOARD_PRESET` is meant for a fixed, config-driven dashboard: only height dividers resize, and drag-to-rearrange, pane focus, maximize and pane switching are off, along with the per-pane title-bar sizing controls. It makes a good read-only view mode and the wrong default for a dashboard users rearrange. The "Choose which interactions are allowed" guide in the docs lists the other switches, such as `rearrange` and `maximize`.

## Let users add and remove panels

This is the dashboard-builder part, and it runs from your own buttons. Adding or removing a panel takes two changes, one to the `tiles` list and one to the tree, so `tiles` moves into state too.

The pure layout reducers handle the tree. They live on `@n-uf/hypr-tiling/engine`, the React-free entry the README marks beta, so pin your version. `insertLeafAdjacent` moves a pane that's already in the tree; to add a new one, use `insertLeafInto`:

```tsx
import { insertLeafInto, removeLeafTile } from "@n-uf/hypr-tiling/engine";

const addPanel = (tile: TilingTile): void => {
  setTiles((current) => [...current, tile]);
  setLayout((current) =>
    insertLeafInto(
      current,
      { kind: "leaf", id: `${tile.id}-pane`, tileId: tile.id },
      { kind: "adjacent", targetLeafId: "errors-pane", placement: "right" },
    ),
  );
};

const removePanel = (leafId: string, tileId: string): void => {
  setLayout((current) => removeLeafTile(current, leafId));
  setTiles((current) => current.filter((tile) => tile.id !== tileId));
};
```

`placement` is `"left"`, `"right"`, `"top"` or `"bottom"` of the target pane. Leave the placement out and the new pane goes into a new split at the root, on the second side. Leaf ids must be unique in the tree. `removeLeafTile` gives the freed space to the sibling subtree. It leaves the tree unchanged when the pane is the only one left, so disable your Remove button for the last pane.

For other actions, such as maximize, setting a split ratio or grouping two panes, take a ref to the renderer and call `dispatch` with a typed command. The docs' "Trigger actions from your own buttons" recipe shows the pattern.

## Should your dashboard be tiled or a grid?

On a grid, each widget has a position and a size in cells, and cells between widgets can stay empty. A tiled layout has no empty cells: the panels split whatever space the screen has. Here's how hypr-tiling compares with react-grid-layout and gridstack, the last two as their own READMEs and home page describe them on 2026-11-03.

| | hypr-tiling | react-grid-layout | gridstack |
|---|---|---|---|
| Layout model | Tree of splits and tab groups | Grid of draggable, resizable widgets | Column grid of draggable, resizable widgets (12 columns by default) |
| Empty space and free placement | No: panes fill the area | Yes: packing is horizontal, vertical or off | Yes: widgets take x, y, w and h cell positions |
| Breakpoint layouts | No | Yes, with separate layouts per breakpoint | Yes: `columnOpts` takes breakpoint and column pairs |
| Tabs | Built-in tab groups | Not stated in the README | Not stated in the README |
| Keyboard | Directional focus, pane switcher, move mode, remappable keymap | Not stated in the README | Not stated in the README |
| Touch | Long press starts a pane drag | Not stated in the README | Native touch events for drag and resize (v6+) |
| Frameworks | React 19 only | React only (v2 lists React 18+) | Framework-agnostic; Angular, React and Vue wrappers included |
| Licence | PolyForm Perimeter 1.0.1 (source-available) | MIT | MIT |

### Where a grid fits better

A grid library is the better choice when your widgets have fixed sizes that sit on a grid, such as a 4×2 chart card, or when users should be able to leave space empty. It's also the one to pick if you need a different layout per screen width: react-grid-layout's README lists separate layouts per responsive breakpoint, and gridstack's `columnOpts` changes the column count by width. On React 18, without Tailwind, or when you need an MIT licence, hypr-tiling is out and both of these are in. gridstack also works outside React. If you want a grid-style React dashboard layout library, start with those two.

### Where tiling fits better

Tiling suits a screen where every pixel should go to panels and users resize them freely, like an operations view with a log panel they enlarge during an incident. It also fits when panels need tab groups and keyboard control, or when users keep several layouts as workspaces. They switch with tabs or with the opt-in Alt+1..9 keys, and drag a pane onto a workspace tab to move it there. Other tiling libraries are compared in the [react-mosaic alternatives](/blog/react-mosaic-alternatives) article, and the [hypr-tiling home page](/) shows the library running.

### What hypr-tiling does not do

There are no floating or pop-out windows, no empty grid cells and no breakpoint layouts. It needs React 19 and the browser DOM: no React 18 or React Native, and no Vue, Svelte or Angular yet (the README's roadmap lists those adapters as planned, not shipped). Your app needs Tailwind. It's in active development, and releases may break compatibility.

hypr-tiling is made by n-uf and is independent of react-grid-layout, gridstack and Hyprland; none of them is affiliated with it or endorses it.
