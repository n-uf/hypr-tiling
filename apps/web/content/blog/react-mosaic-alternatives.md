---
title: "React mosaic alternatives: tiling, docking, split panes"
description: "Seven react-mosaic alternatives compared by layout model, tabs, pop-out windows, React support and licence, with a pick for each need."
h1: "Alternatives to react-mosaic, compared by what they do"
mainKeyword: "react mosaic alternative"
kind: comparison
published: 2026-11-03
updated: 2026-11-03
author: n-uf
takeaways:
  - "react-mosaic 7 already has tab groups, touch drag and drop and React 16 to 19 support, so tabs alone are no longer a reason to leave it."
  - "dockview, FlexLayout, Golden Layout and rc-dock each name pop-out windows on their own pages; react-mosaic's pages don't mention them and hypr-tiling has none."
  - "react-resizable-panels added a Workspace component for draggable tabsets in 4.16.0 (31 October 2026) and whole-tabset dragging in 4.17.0 (3 November 2026); Allotment's pages describe resizable splits only."
  - "hypr-tiling keeps a tiling tree and adds keyboard control and workspaces, but it needs React 19 and Tailwind, has no floating windows, and is source-available, not open source."
  - "react-mosaic, dockview, FlexLayout, rc-dock, react-resizable-panels and Allotment all accept React 18 in their peer ranges; hypr-tiling's is React 19 only."
faq:
  - q: "Is react-mosaic still maintained?"
    a: "Its GitHub page shows v7.2.1 as the latest release, published on 28 September 2026, with the release commit made the same day (checked 3 November 2026). The release before it, v7.2.0, came out earlier that day. That is the repository's record; its releases page has the details."
  - q: "What's the difference between a tiling and a docking layout?"
    a: "In a tiling layout every pane sits in one tree of splits, fills the space and never overlaps another pane. A docking layout adds dock zones around panels and the frame's edges, and usually floating or pop-out windows. react-mosaic and hypr-tiling are tiling; dockview, FlexLayout, Golden Layout and rc-dock are docking."
  - q: "Which React layout libraries support pop-out windows?"
    a: "dockview, FlexLayout, Golden Layout and rc-dock each name pop-out or popup windows on their own pages. react-mosaic's README, intro and API pages don't mention them, and hypr-tiling has no floating or pop-out windows. FlexLayout's docs add that a pop-out needs a separate popout.html page hosted next to your main page, and that if the browser blocks the pop-up it opens as a floating panel instead."
  - q: "Can I use react-mosaic without Blueprint?"
    a: "Yes. Its README says it works with or without Blueprint, ships a default CSS theme and exposes CSS variables you can override. You still import its stylesheet once in your app's entry point."
  - q: "Is hypr-tiling open source?"
    a: "No. It's source-available under PolyForm Perimeter 1.0.1: internal and commercial use is allowed, but providing a product that competes with hypr-tiling is not. Its README says this is not OSI open-source licensing, so if you need an OSI-approved licence, pick one of the MIT or Apache-2.0 libraries in this article."
sources:
  - title: "react-mosaic README (GitHub)"
    url: "https://github.com/nomcopter/react-mosaic"
    checked: 2026-11-03
  - title: "react-mosaic documentation home"
    url: "https://nomcopter.github.io/react-mosaic/"
    checked: 2026-11-03
  - title: "react-mosaic docs: tree structure"
    url: "https://nomcopter.github.io/react-mosaic/docs/concepts/tree-structure"
    checked: 2026-11-03
  - title: "react-mosaic docs: migration from v6"
    url: "https://nomcopter.github.io/react-mosaic/docs/migration/from-v6"
    checked: 2026-11-03
  - title: "react-mosaic docs: persisting layout"
    url: "https://nomcopter.github.io/react-mosaic/docs/guides/persisting-layout"
    checked: 2026-11-03
  - title: "react-mosaic docs: custom toolbars (actions from your own shortcut handlers)"
    url: "https://nomcopter.github.io/react-mosaic/docs/guides/custom-toolbar"
    checked: 2026-11-03
  - title: "react-mosaic docs: recipes (maximize a panel)"
    url: "https://nomcopter.github.io/react-mosaic/docs/guides/recipes"
    checked: 2026-11-03
  - title: "react-mosaic docs: API reference"
    url: "https://nomcopter.github.io/react-mosaic/docs/api"
    checked: 2026-11-03
  - title: "react-mosaic releases (GitHub)"
    url: "https://github.com/nomcopter/react-mosaic/releases"
    checked: 2026-11-03
  - title: "react-mosaic package.json (React peer range, licence field)"
    url: "https://github.com/nomcopter/react-mosaic/blob/master/package.json"
    checked: 2026-11-03
  - title: "react-mosaic LICENSE"
    url: "https://github.com/nomcopter/react-mosaic/blob/master/LICENSE"
    checked: 2026-11-03
  - title: "dockview home page"
    url: "https://dockview.dev/"
    checked: 2026-11-03
  - title: "dockview README (GitHub)"
    url: "https://github.com/dockview/dockview"
    checked: 2026-11-03
  - title: "dockview licensing (LICENCE.md)"
    url: "https://github.com/dockview/dockview/blob/master/LICENCE.md"
    checked: 2026-11-03
  - title: "FlexLayout README (GitHub)"
    url: "https://github.com/caplin/FlexLayout"
    checked: 2026-11-03
  - title: "FlexLayout docs: popout windows"
    url: "https://github.com/caplin/FlexLayout/blob/master/docs/popout-windows.md"
    checked: 2026-11-03
  - title: "FlexLayout package.json (React peer range) and LICENSE"
    url: "https://github.com/caplin/FlexLayout/blob/master/package.json"
    checked: 2026-11-03
  - title: "Golden Layout website (main, current)"
    url: "https://golden-layout.github.io/golden-layout/"
    checked: 2026-11-03
  - title: "Golden Layout version 1 website"
    url: "https://golden-layout.com/"
    checked: 2026-11-03
  - title: "Golden Layout README (GitHub)"
    url: "https://github.com/golden-layout/golden-layout"
    checked: 2026-11-03
  - title: "Golden Layout docs: installation and usage"
    url: "https://github.com/golden-layout/golden-layout/blob/master/docs/index.md"
    checked: 2026-11-03
  - title: "Golden Layout version 1 tutorial: getting started with React"
    url: "https://golden-layout.com/tutorials/getting-started-react.html"
    checked: 2026-11-03
  - title: "Golden Layout LICENSE"
    url: "https://github.com/golden-layout/golden-layout/blob/master/LICENSE"
    checked: 2026-11-03
  - title: "rc-dock README (GitHub)"
    url: "https://github.com/ticlo/rc-dock"
    checked: 2026-11-03
  - title: "rc-dock documentation"
    url: "https://ticlo.github.io/rc-dock/"
    checked: 2026-11-03
  - title: "rc-dock package.json (React peer range) and LICENSE"
    url: "https://github.com/ticlo/rc-dock/blob/master/package.json"
    checked: 2026-11-03
  - title: "react-resizable-panels README (GitHub)"
    url: "https://github.com/bvaughn/react-resizable-panels"
    checked: 2026-11-03
  - title: "react-resizable-panels CHANGELOG (Workspace in 4.16.0, tabset dragging in 4.17.0)"
    url: "https://github.com/bvaughn/react-resizable-panels/blob/main/CHANGELOG.md"
    checked: 2026-11-03
  - title: "react-resizable-panels package.json (React peer range) and LICENSE.md"
    url: "https://github.com/bvaughn/react-resizable-panels/blob/main/package.json"
    checked: 2026-11-03
  - title: "Allotment README (GitHub)"
    url: "https://github.com/johnwalley/allotment"
    checked: 2026-11-03
  - title: "Allotment documentation: getting started"
    url: "https://allotment.mulberryhousesoftware.com/docs/getting-started"
    checked: 2026-11-03
  - title: "Allotment LICENSE"
    url: "https://github.com/johnwalley/allotment/blob/main/LICENSE"
    checked: 2026-11-03
  - title: "hypr-tiling README (GitHub, main)"
    url: "https://github.com/n-uf/hypr-tiling/blob/main/packages/hypr-tiling/README.md"
    checked: 2026-11-03
  - title: "hypr-tiling documentation"
    url: "https://hypr-tiling.n-uf.com/docs"
    checked: 2026-11-03
  - title: "@n-uf/hypr-tiling on npm (peer dependencies, latest 26.9.9)"
    url: "https://www.npmjs.com/package/@n-uf/hypr-tiling"
    checked: 2026-11-03
  - title: "Hyprland"
    url: "https://hypr.land/"
    checked: 2026-11-03
related:
  - /
  - /use-cases/react-drag-and-drop-dashboard
  - /docs
---

The closest react-mosaic alternatives fall into three groups. If users need floating or pop-out windows, look at the docking managers: dockview, FlexLayout, Golden Layout or rc-dock. If you want to stay with a tiling tree like react-mosaic's and add keyboard control and workspaces, hypr-tiling is one option, with limits covered below. If users only need to resize panels, react-resizable-panels or Allotment will do.

The question that decides it: must every pane stay inside one tree that fills the screen, or do you also need windows that float, detach or open in their own browser window? Answer that and most of the list drops out.

Facts about the other libraries come from their own README, docs or home page, read on 3 November 2026. Some move fast: react-resizable-panels shipped a new component on 31 October and extended it on 3 November, so check the pages before you commit.

## What react-mosaic does well

react-mosaic describes itself as a React tiling window manager. Users drag panels by their title bars, resize splits, and split or remove a panel from its default toolbar. The docs call the tree "JSON-serialisable by design", so saving a layout is `JSON.stringify` and your storage of choice. Kevin Verdieck first built it at Palantir, its README says; the code now lives at nomcopter/react-mosaic.

Older write-ups describe a binary tree and a Blueprint dependency; both have changed. Version 7 uses an n-ary tree: a split can hold any number of children, and tab groups are a node type of their own. In the docs' tree-structure page, a node is a bare key (a leaf), a `split` with `direction`, `children` and optional `splitPercentages`, or a `tabs` node with `tabs` and `activeTabIndex`. That tree is what people mean by a react mosaic layout. You can run it uncontrolled with `initialValue`, or controlled with `value` and `onChange`. Old v6 binary trees still render: the component converts them, and `convertLegacyToNary` does it explicitly.

The README now says it works with or without Blueprint, ships a default CSS theme and exposes CSS variables. Drag and drop is built on react-dnd with HTML5 and touch backends, and the README lists desktop and mobile browsers, with touch drag and drop built in. The React peer range is 16 to 19. The licence is Apache-2.0.

The docs don't describe built-in keyboard shortcuts. They show tree actions you can call from your own shortcut handlers, and maximizing a panel is a recipe you build with your own state. Nothing on its pages mentions floating or pop-out windows.

Stay with react-mosaic when a tiling tree with tabs is enough, when you're on React 18 or older, when you don't use Tailwind, or when you want Apache-2.0. If it already does the job, there's no reason to move.

## Tiling, docking or split panes: which do you need?

Look for a react window management library, a react tiling manager or a react multi window layout and you'll get three kinds of tool mixed together.

**Tiling.** Every pane sits in a tree of splits, fills the available space and never overlaps another. Users rearrange by dragging. It suits dashboards, operator consoles and log views. react-mosaic and hypr-tiling work this way.

**Docking.** Panels become tabs in tab groups, can be dropped around other panels or the frame's edges, and usually can float or open in a separate browser window. It suits IDE-like tools and multi-monitor setups. dockview, FlexLayout, Golden Layout and rc-dock are docking managers.

**Split panes.** Resizable dividers between regions you define. Users resize but don't rearrange. It suits a fixed shell: sidebar, editor, console. Allotment and the panel groups of react-resizable-panels are this.

The lines blur. react-mosaic has tabs, and react-resizable-panels now has a component for draggable tabsets. Judge each library by its features, not its category.

## The alternatives, one by one

### dockview

dockview's home page calls it a docking layout manager for building IDE-like interfaces with tabs, groups, drag and drop, floating panels and popout windows, with zero dependencies and touch and mobile support. Its README adds grids, splitviews, layout serialization and separate packages: `dockview` for plain JavaScript, `dockview-react` (React 16.8 to 19), `dockview-vue` and `dockview-angular`.

Everything in the repository is MIT except `dockview-enterprise`, a separate package under a commercial licence, per its licensing page.

It's the one to try first if you need floating groups or pop-out windows, want one docking model across React, Vue and Angular, or are on React older than 19.

### FlexLayout

FlexLayout's README calls it a layout manager for React that arranges components in multiple tabsets. The feature list is long: Chrome-style tab groups, border tabsets, docking to tabsets or the edges of the frame, maximizing a tabset, popping tabs out into floating panels or new browser windows, mobile support, and component state kept when a tab moves. It also lists accessibility: ARIA roles and keyboard operation with a configurable keymap.

The layout is a JSON model (`Model.fromJson`, `model.toJson()`). React is its only dependency, and package.json asks for React 18 or 19. The package is ESM-only. Its pop-out docs say a pop-out needs a separate `popout.html` page hosted next to the main page. MIT licence.

FlexLayout fits a React-only codebase that wants pop-outs and documented keyboard operation.

### Golden Layout

On GitHub, Golden Layout describes itself as a JavaScript layout manager for placing components in a page and rearranging them with drag and drop. Its feature list includes native popup windows, touch support, saved and loaded layouts, and support for frameworks such as Angular and Vue through what it calls virtual components. MIT licence.

React is less clear-cut. Its main website, golden-layout.github.io, names Angular and Vue and doesn't mention React. It also says golden-layout.com describes version 1 and is out of date. That older site is where the React getting-started guide lives: you register React components with `registerComponent()` and load jQuery, React and ReactDOM yourself. The current docs recommend building from source, because the npm modules haven't been updated in a long time, and the README says the `dev` branch will become version 3.0.

Golden Layout suits you if you already know it, or want a framework-agnostic multi-window manager and don't mind building from source.

### rc-dock

rc-dock is a dock layout for React components. Its layout object holds a `dockbox` for docked panels and a `floatbox` for floating ones, and its README shows a panel popped out as a new browser window. You can run it uncontrolled with `defaultLayout` or controlled with `layout`. The peer range is React 18 or later. Apache-2.0 licence.

Pick it for docking with floating panels in React under the Apache licence.

### react-resizable-panels and Allotment

Allotment is a split-pane component for React, derived from the same codebase as VS Code's split view. It can snap panes closed, nest split views, show and hide panes and persist sizes, and it supports React 17, 18 and 19. Its pages describe resizing by dragging dividers; they don't describe rearranging panes. The README itself points to react-resizable-panels for people who want different behaviour. MIT licence.

react-resizable-panels has horizontal or vertical panel groups and a Grid. Version 4.16.0, released on 31 October 2026, added a `Workspace` component: tabsets that users rearrange by dragging tabs between tabsets, within a tab list or onto a tabset's edge to split it. Tabsets can be resized and maximized, the layout is a serializable model, and tab content isn't remounted when a tab moves. Its changelog says it supports mouse, touch and keyboard. Version 4.17.0, out on 3 November, added dragging whole tabsets and collapsible tabsets. A Workspace is uncontrolled: you pass `defaultModel` and save from `onModelChanged`. The peer range is React 18 or 19, and the licence is MIT.

Pick Allotment or a `Group` for a fixed layout whose regions only need resizing. Pick the `Workspace` if you want draggable tabsets without floating windows and prefer an MIT licence.

### hypr-tiling

hypr-tiling is a tiling layout engine for React, made by n-uf. Like react-mosaic, it lays panes out as a tree that fills the space. Its interaction model is inspired by [Hyprland](https://hypr.land/), the tiling Wayland compositor. The project is independent of Hyprland, and Hyprland's authors are not involved. If you want a [react tiling window manager](/) in that style, this is n-uf's, aimed at dashboards, IDE-like tools and operator consoles.

One component, `TilingRenderer`, takes a layout tree and a list of tiles. Users drag a pane to swap it, insert it beside another or stack it into a tab group. They resize by dragging dividers, or you pin a pane to a pixel size. Maximize makes the focused pane fill the viewport without rewriting the tree, and Escape restores it. Keyboard control covers directional focus, a pane switcher and a move mode, all behind a remappable keymap. On a touch screen, a pane drag starts with a long press (`interaction.touchDrag`, on by default). Workspaces hold several layout trees over one pool of tiles, switched with tabs, Alt+1 to 9, Alt+Arrow, or a trackpad or touch swipe. The [dockable panels in React](/use-cases/react-dockable-panels) page builds an IDE-style layout with that drag-beside and drag-into-tabs behaviour, and says when a docking manager with floating windows fits better.

The tree is plain JSON with three node kinds: `leaf`, `split` and `group`. The renderer is a controlled component: you keep the tree in state and every change arrives through `onLayoutChange`. `createPersistedTilingLayout` saves the tree to `localStorage` by default and repairs a damaged one on load. On a client-only mount, a pane's React content isn't remounted when it's dragged; a server-rendered host opts in with `paneIdentity="stable"`.

Know the limits before you pick it:

- It needs React 19; the peer range is `^19`.
- It ships no CSS. The renderer emits Tailwind utility classes, so your app needs Tailwind with the package's dist folder in the `content` glob (v3) or an `@source` line (v4). Without it the panes render unstyled.
- There are no floating, free-positioned or pop-out windows, and no docking to the screen's edges.
- It's source-available under PolyForm Perimeter 1.0.1, not open source. Internal and commercial use is allowed; a product that competes with hypr-tiling is not.
- Versions are calendar-based (`YY.M.R`, latest on npm today: 26.9.9). The README says it's in active development, releases may break compatibility, and you should pin an exact version and read the changelog before upgrading.

It makes sense when you want a Hyprland-style tiled screen with keyboard control and workspaces, you're on React 19 with Tailwind, and the licence suits you. The [quickstart](/docs#quickstart) is a single component you can paste in, and the [hypr-tiling site](/) is itself built from the library's panes.

## Comparison table

| Library | Layout model | Tabs | Floating / pop-out | Drag to rearrange | Frameworks | Licence |
|---|---|---|---|---|---|---|
| react-mosaic | Tiling tree: n-ary splits, tab nodes | Yes, tab groups are a node type | Not stated | Yes, mouse and touch (react-dnd) | React 16 to 19 | Apache-2.0 |
| dockview | Docking: tabs, groups, grids, splitviews | Yes | Floating groups and popout windows | Yes, tabs and groups | React (16.8 to 19), Vue, Angular, plain JavaScript | MIT (`dockview-enterprise` is commercial) |
| FlexLayout | Docking: tabsets, border tabsets | Yes | Popout to floating panels or new browser windows | Yes, tabs and tabsets; dock to tabsets or frame edges | React 18, 19 | MIT |
| Golden Layout | Layout manager, rearranged by drag and drop | Not stated (v1 site: stacks shown as tabs) | Native popup windows | Yes | Plain JavaScript; Angular and Vue named; React guide on the v1 site | MIT |
| rc-dock | Docking: dock box and float box | Yes | Float box; popup as new browser window | Yes | React 18 or later | Apache-2.0 |
| react-resizable-panels | Resizable groups and grids; `Workspace` of tabsets (4.16.0 on) | Yes, in `Workspace` | Not stated | `Workspace`: tabs, and whole tabsets from 4.17.0; panels resize only | React 18, 19 | MIT |
| Allotment | Split panes, derived from VS Code's split view | Not stated | Not stated | Not stated (resizing described) | React 17 to 19 | MIT |
| hypr-tiling | Tiling tree: two-child splits, tab groups | Yes, tab groups | No | Yes: swap, insert beside, stack into a group; long press on touch | React 19 only | PolyForm Perimeter 1.0.1 (source-available) |

"Not stated" means we found nothing on the project's own pages, not that the feature is missing.

## Which react-mosaic alternative should you pick?

- **Windows that float or pop out into a browser window:** dockview, FlexLayout, Golden Layout or rc-dock. Choose dockview if you also want Vue or Angular, and FlexLayout if documented keyboard operation matters.
- **On React 18 or older, or no Tailwind:** react-mosaic, dockview, FlexLayout, rc-dock, react-resizable-panels and Allotment all list React 18 in their peer ranges, and their READMEs don't ask for Tailwind.
- **An open-source licence (MIT or Apache-2.0):** everything here except hypr-tiling. dockview's enterprise package is the one commercial piece.
- **A fixed shell where users only resize:** Allotment, or a `Group` from react-resizable-panels.
- **Draggable tabsets, floating windows not needed:** react-mosaic (tab nodes), the react-resizable-panels `Workspace`, FlexLayout or dockview.
- **A tiled screen with keyboard focus, a move mode and several workspaces:** hypr-tiling, if React 19 and Tailwind are fine for you.
- **Touch:** react-mosaic, dockview, FlexLayout, Golden Layout and the `Workspace` each name touch or mobile support on their pages. In hypr-tiling a pane drag on touch starts with a long press. Whichever you pick, test on your own devices.

## Moving a react-mosaic layout to hypr-tiling

Both libraries keep the layout as a tree you can serialize. This is the version 7 tree from react-mosaic's migration page:

```ts
const tree: MosaicNode<string> = {
  type: "split",
  direction: "row",
  splitPercentages: [40, 60],
  children: [
    "panel1",
    {
      type: "split",
      direction: "column",
      splitPercentages: [60, 40],
      children: ["panel2", "panel3"],
    },
  ],
};
```

And the same shape as a hypr-tiling layout:

```tsx
import type { TilingLayoutNode, TilingTile } from "@n-uf/hypr-tiling";

const tiles: TilingTile[] = [
  { id: "panel1", title: "Panel 1" },
  { id: "panel2", title: "Panel 2" },
  { id: "panel3", title: "Panel 3" },
];

const layout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.4,
  first: { kind: "leaf", id: "panel1-pane", tileId: "panel1" },
  second: {
    kind: "split",
    id: "right",
    axis: "vertical",
    ratio: 0.6,
    first: { kind: "leaf", id: "panel2-pane", tileId: "panel2" },
    second: { kind: "leaf", id: "panel3-pane", tileId: "panel3" },
  },
};
```

There's no converter, so you map it by hand. In react-mosaic, `direction: "row"` lays children out horizontally and `splitPercentages` is an array summing to 100. In hypr-tiling's API reference, a `horizontal` split is side by side, `first` is the top or left child, and `ratio` is the fraction (0 to 1) given to `first`, so `[40, 60]` becomes `0.4`. If you still have react-mosaic v6 trees, their `first`, `second` and single `splitPercentage` are closer still. Every hypr-tiling node needs a stable `id`, and each leaf points to a tile by `tileId`. Panel content moves into the tiles or `renderTile`.

Two shapes don't map one to one. A hypr-tiling split has exactly two children, so a react-mosaic split with three children becomes two nested splits. A react-mosaic `tabs` node becomes a `group` node holding leaves, with an `activeMemberId` instead of an index.

Layouts users already saved need the same conversion once. After that, [saving and restoring a layout](/docs#howto-save-restore) works through `onLayoutChange` or `createPersistedTilingLayout`, and the docs have the full API reference. If your react-mosaic screen is a dashboard, the [drag-and-drop dashboard](/use-cases/react-drag-and-drop-dashboard) page covers that case.

hypr-tiling is made by n-uf. It isn't affiliated with react-mosaic, Palantir, dockview (Dockview Ltd), Caplin (FlexLayout), Golden Layout, ticlo (rc-dock), react-resizable-panels, Allotment or Hyprland, and none of them endorse it.
