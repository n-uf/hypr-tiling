---
title: "react-grid-layout alternatives: grid, tiling, docking"
description: "react-grid-layout alternatives compared: gridstack.js, dnd-kit, and layouts that aren't grids (tiling, docking), with a table and a pick for each need."
h1: "react-grid-layout alternatives, compared by layout model"
mainKeyword: "react-grid-layout alternatives"
kind: comparison
published: 2026-11-03
updated: 2026-11-03
author: n-uf
takeaways:
  - "gridstack.js is the closest match to react-grid-layout: the same grid of draggable, resizable widgets with columns and breakpoints, for any framework, with a React wrapper and nested grids documented."
  - "dnd-kit is a drag-and-drop toolkit, not a layout: its pages describe sortable lists and grids as use cases, and leave resizing, columns and saving to you."
  - "A tiled layout has no empty cells and no breakpoint layouts: panes fill the screen and split it. hypr-tiling, react-mosaic and dockview work that way, not on a grid."
  - "hypr-tiling needs React 19 and Tailwind, has no free placement or breakpoints, and is source-available under PolyForm Perimeter 1.0.1, so react-grid-layout and gridstack beat it on several rows."
  - "react-grid-layout, gridstack.js and dnd-kit are MIT-licensed and react-mosaic is Apache-2.0; Syncfusion's Dashboard Layout needs a paid licence, and Telerik's page calls KendoReact TileLayout free to use."
faq:
  - q: "Is react-grid-layout still maintained?"
    a: "Its GitHub repository shows release 2.3.0, published on 5 October 2026, and a latest commit on the master branch dated 3 November 2026 (checked 4 November 2026). Before that came v2.2.4 and 1.5.4, both published on 29 July 2026, so the 1.x line also had a release in 2026."
  - q: "What's the difference between gridstack and react-grid-layout?"
    a: "Both place draggable, resizable widgets on a grid with breakpoints. react-grid-layout is React-only. gridstack.js is plain TypeScript that works with any framework and ships Angular, React and Vue wrappers. gridstack's pages also describe nested grids; react-grid-layout's README does not. Both are MIT-licensed."
  - q: "Can react-grid-layout do nested grids?"
    a: "Its README doesn't mention nested grids, so we can't say it does. gridstack's home page lists nested grids to any depth, and its React wrapper README shows them through a widget's subGridOpts.children option. If you need nesting, try it in react-grid-layout before you commit to it."
  - q: "Is there a react-grid-layout alternative without a grid?"
    a: "Yes: tiling and docking layouts. hypr-tiling and react-mosaic arrange panes as a tree of splits and tab groups that fills the space. dockview is a docking manager with tabs, groups, floating panels and popout windows. In hypr-tiling there are no empty cells and no breakpoint layouts."
  - q: "Is hypr-tiling a drop-in replacement for react-grid-layout?"
    a: "No. react-grid-layout positions widgets by x, y, w and h in grid cells and keeps a separate layout per breakpoint. hypr-tiling's layout is a tree of leaf, split and group nodes, with no empty cells and no breakpoints, and it needs React 19 and Tailwind. A grid layout can't be passed to it as it is, and the screen behaves differently."
sources:
  - title: "react-grid-layout README (GitHub)"
    url: "https://github.com/react-grid-layout/react-grid-layout#readme"
    checked: 2026-11-04
  - title: "react-grid-layout package.json (description, licence field)"
    url: "https://github.com/react-grid-layout/react-grid-layout/blob/master/package.json"
    checked: 2026-11-04
  - title: "react-grid-layout LICENSE (MIT)"
    url: "https://github.com/react-grid-layout/react-grid-layout/blob/master/LICENSE"
    checked: 2026-11-04
  - title: "react-grid-layout releases and latest commit (GitHub)"
    url: "https://github.com/react-grid-layout/react-grid-layout/releases"
    checked: 2026-11-04
  - title: "gridstack.js README (GitHub)"
    url: "https://github.com/gridstack/gridstack.js#readme"
    checked: 2026-11-04
  - title: "gridstack.js React wrapper README"
    url: "https://github.com/gridstack/gridstack.js/blob/master/react/README.md"
    checked: 2026-11-04
  - title: "Gridstack.js home page"
    url: "https://gridstackjs.com/"
    checked: 2026-11-04
  - title: "gridstack.js LICENSE (MIT)"
    url: "https://github.com/gridstack/gridstack.js/blob/master/LICENSE"
    checked: 2026-11-04
  - title: "gridstack.js releases and latest commit (GitHub)"
    url: "https://github.com/gridstack/gridstack.js/releases"
    checked: 2026-11-04
  - title: "dnd-kit README (GitHub)"
    url: "https://github.com/clauderic/dnd-kit#readme"
    checked: 2026-11-04
  - title: "dnd-kit home page"
    url: "https://dndkit.com/"
    checked: 2026-11-04
  - title: "dnd-kit React quickstart"
    url: "https://dndkit.com/react/quickstart"
    checked: 2026-11-04
  - title: "@dnd-kit/react package.json (React peer range, licence field)"
    url: "https://github.com/clauderic/dnd-kit/blob/main/packages/react/package.json"
    checked: 2026-11-04
  - title: "dnd-kit LICENSE (MIT)"
    url: "https://github.com/clauderic/dnd-kit/blob/main/LICENSE"
    checked: 2026-11-04
  - title: "dnd-kit releases (GitHub)"
    url: "https://github.com/clauderic/dnd-kit/releases"
    checked: 2026-11-04
  - title: "KendoReact TileLayout overview (Telerik)"
    url: "https://www.telerik.com/kendo-react-ui/components/layout/tilelayout"
    checked: 2026-11-04
  - title: "Syncfusion React Dashboard Layout"
    url: "https://www.syncfusion.com/react-components/react-dashboard-layout"
    checked: 2026-11-04
  - title: "react-mosaic README (GitHub)"
    url: "https://github.com/nomcopter/react-mosaic#readme"
    checked: 2026-11-04
  - title: "react-mosaic docs: tree structure"
    url: "https://nomcopter.github.io/react-mosaic/docs/concepts/tree-structure"
    checked: 2026-11-04
  - title: "react-mosaic package.json (React peer range, licence field)"
    url: "https://github.com/nomcopter/react-mosaic/blob/master/package.json"
    checked: 2026-11-04
  - title: "react-mosaic LICENSE (Apache-2.0)"
    url: "https://github.com/nomcopter/react-mosaic/blob/master/LICENSE"
    checked: 2026-11-04
  - title: "dockview home page"
    url: "https://dockview.dev/"
    checked: 2026-11-04
  - title: "dockview README (GitHub)"
    url: "https://github.com/dockview/dockview#readme"
    checked: 2026-11-04
  - title: "dockview licensing (LICENCE.md)"
    url: "https://github.com/dockview/dockview/blob/master/LICENCE.md"
    checked: 2026-11-04
  - title: "hypr-tiling README (GitHub, main)"
    url: "https://github.com/n-uf/hypr-tiling/blob/main/README.md"
    checked: 2026-11-04
  - title: "@n-uf/hypr-tiling package README (install, Tailwind, versioning, tab groups, workspaces)"
    url: "https://github.com/n-uf/hypr-tiling/blob/main/packages/hypr-tiling/README.md"
    checked: 2026-11-04
  - title: "hypr-tiling documentation"
    url: "https://hypr-tiling.n-uf.com/docs"
    checked: 2026-11-04
  - title: "@n-uf/hypr-tiling on npm (peer dependencies, latest 26.9.9)"
    url: "https://www.npmjs.com/package/@n-uf/hypr-tiling"
    checked: 2026-11-04
  - title: "Hyprland"
    url: "https://hypr.land/"
    checked: 2026-11-04
related:
  - /use-cases/react-drag-and-drop-dashboard
  - /blog/react-mosaic-alternatives
  - /
---

The closest react-grid-layout alternative is gridstack.js: the same model of draggable, resizable widgets on a column grid, with breakpoints, for any framework, and a React wrapper in the same package. If you'd rather build the grid yourself, dnd-kit supplies the drag and drop and leaves the layout to you. And if your panels should fill the screen with no empty cells, the alternative isn't a grid at all but a tiling layout (hypr-tiling, react-mosaic) or a docking manager (dockview).

One question decides it: do your widgets keep set sizes on a grid, with room left between them, or should the panels split the whole screen? Answer that and most of the list drops out.

hypr-tiling is n-uf's own library, so its limits are spelled out below, and the table and the picks say where the others do better. Facts about every other library come from its own README, docs or home page, read on 4 November 2026. Versions move, so check them before you commit.

## What react-grid-layout does well

react-grid-layout's README describes a grid layout system much like Packery or Gridster, for React. Unlike those, it's responsive and supports breakpoints, and the breakpoint layouts can be written by you or generated. It's React-only and doesn't need jQuery.

Its feature list: draggable, resizable and static widgets; packing set to horizontal, vertical or off; bounds checking for dragging and resizing; widgets added or removed without rebuilding the grid; layouts that serialize and restore; and a separate layout for each responsive breakpoint. It also lists compatibility with server-rendered apps and with `React.StrictMode`. Version 2 is a TypeScript rewrite with hooks such as `useContainerWidth`. The README's compatibility table says 2.0.0 and later need React 18 or newer, and 0.17.0 and later cover React 16 and 17.

A layout is a list of items, one per child:

```tsx
const layout = [
  { i: "a", x: 0, y: 0, w: 1, h: 2, static: true },
  { i: "b", x: 1, y: 0, w: 3, h: 2, minW: 2, maxW: 4 },
  { i: "c", x: 4, y: 0, w: 1, h: 2 },
];
```

Positions and sizes are in grid units, and the packing option (a `compactor` in v2) decides whether widgets slide to close gaps or stay where you put them. The README also links demos for dragging items in from outside the grid, allowing overlap, bounded layouts and saving to `localStorage`. The licence is MIT.

Two things to plan for: in v2 the `width` prop is required, so you measure the container yourself (the README recommends `useContainerWidth`), and you import two stylesheets, one from `react-grid-layout` and one from `react-resizable`.

On maintenance, the releases page shows 2.3.0, published on 5 October 2026, and the latest commit on `master` is dated 3 November 2026. The README doesn't describe nested grids or touch support.

## gridstack vs react-grid-layout

The two models are close, so gridstack.js vs react-grid-layout comes down to what surrounds the grid.

- **Frameworks.** gridstack's README calls it a pure TypeScript library with no external dependencies. It ships Angular, React and Vue wrappers; the React one is imported from `gridstack/dist/react` as a `<GridStack>` component. react-grid-layout is React-only. If you also have Angular or Vue screens, gridstack lets one grid model cover them.
- **Columns, breakpoints and layout modes.** gridstack's default is 12 columns, and the `column` option sets another number. Since v14 a `mode` option (`top` by default, or `float`, `list`, `compact`) chooses the layout behaviour. Its migration notes say `columnOpts` takes breakpoint width and column pairs, so the column count changes with the grid's width. react-grid-layout instead keeps a separate layout for each breakpoint.
- **Nested grids.** gridstack's home page lists nested grids, created and changed dynamically to any depth. Its React wrapper README shows them through `subGridOpts.children`, and dragging between several `<GridStack>` grids. react-grid-layout's README doesn't mention them.
- **Touch.** gridstack's README says v6 and later use native mouse and touch events for drag and resize. react-grid-layout's README doesn't describe touch support.
- **How you work with it.** gridstack's core API is calls on a grid object (`GridStack.init()`, `addWidget`, `load`), and the React component sits on top with a `useGridStack` hook for those calls. react-grid-layout is a component driven by a `layout` prop and an `onLayoutChange` callback, which suits layout state held in React. Both let you plug in your own logic: a custom `Compactor` in react-grid-layout, `GridStack.registerEngine` in gridstack.
- **Licence.** Both are MIT.

gridstack's latest GitHub release is v14.0.0, published on 21 September 2026, and its latest commit is dated 22 October 2026. If you're looking the other way, for a gridstack React alternative, react-grid-layout is it when you want to stay inside React's state model and don't need Angular, Vue or nesting.

## Building the grid yourself with dnd-kit

dnd-kit's home page calls it a toolkit for building drag and drop interfaces, and its README has getting-started guides for plain JavaScript, React, Vue, Svelte and Solid. The React package is `@dnd-kit/react`, with a peer range of React 18 or 19. The README names lists, grids, multiple containers, nested contexts and variable-sized items among the use cases it supports. It has pointer, mouse, touch and keyboard sensors, keyboard support and ARIA attributes built in, and a sortable layer (`@dnd-kit/dom/sortable`).

That makes it the pick for a React drag and drop grid layout you design yourself: a card board, a reorderable list of widgets, a drop rule of your own. Its pages cover dragging, dropping and sorting. They don't cover resizing, columns and rows, breakpoints or saving a layout, which react-grid-layout and gridstack give you ready-made. With dnd-kit you write those parts. It's MIT-licensed, and its repository shows package releases on 31 October 2026.

## Dashboard layouts from component suites

Two vendor UI suites have a component for this job.

- **KendoReact TileLayout.** Telerik's page says it's based on the two-dimensional CSS Grid and shows content in tiles that users can resize and reorder, with a configurable number of columns. The same page says TileLayout is free to use, including in production, with no sign-up or licence, and that it's part of a library of free and premium components.
- **Syncfusion React Dashboard Layout.** Syncfusion's page calls it a grid-structured layout component whose panels can be resized, dragged, added and removed, and says panels move up to fill empty space. Its FAQ says it's a commercial product that needs a paid licence, with a free community licence for organizations under stated revenue, developer and employee limits.

If you already use one of those suites, look at its component first. Read the licence terms before you build on either.

## When the answer isn't a grid

A grid suits widgets of set sizes. Tiling and docking libraries start from the other end: the panels fill the screen and users divide it between them. If what you need isn't a grid at all, this is where to look.

On a grid, you give a widget a size in cells and let packing close the gaps. In a tile tree, you give a split a ratio:

```tsx
const layout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};
```

### hypr-tiling

hypr-tiling is a tiling layout engine for React, made by n-uf, with an interaction model inspired by [Hyprland](https://hypr.land/), the tiling Wayland compositor. It works like a [react tiling window manager](/) inside your page: one component, `TilingRenderer`, renders the tree of panes. Users drag a pane to swap it with another, insert it beside a pane, or stack it into a tab group. They resize by dragging dividers, maximize a pane and restore it with Escape, and move around by keyboard: directional focus, a pane switcher and a move mode, on a remappable keymap. On a touch screen, a pane drag starts with a long press (`interaction.touchDrag`). Workspaces hold several layout trees over one pool of tiles; switching between them by shortcut or swipe is opt-in.

Your app owns the tree as plain JSON and gets every change through `onLayoutChange`, so saving a layout means writing that JSON somewhere. The [drag-and-drop dashboard](/use-cases/react-drag-and-drop-dashboard) walk-through builds one and saves it per user.

Several of its limits are good reasons to pick something else:

- **No grid.** Panes always fill the space, with a small gutter between them. There are no empty cells, no free placement and no breakpoint layouts.
- **No floating windows.** Every pane sits in the tiled tree. There are no pop-out windows and no docking to the screen's edges.
- **React 19 and the DOM only.** The peer range is `^19`. No React 18, React Native, Vue, Svelte or Angular yet.
- **Tailwind required.** The package ships no CSS. The renderer emits Tailwind utility classes, so your Tailwind build has to scan the package's dist folder, or the panes render unstyled.
- **Source-available, not open source.** PolyForm Perimeter 1.0.1 allows internal and commercial use, but not a product that competes with hypr-tiling.
- **Active development.** Versions are calendar-based (`YY.M.R`; the latest on npm on 4 November 2026 is 26.9.9) and can't signal a breaking change. The README says compatibility may break between releases, so pin an exact version and read the changelog before upgrading.

### react-mosaic and dockview

react-mosaic's README describes a tiling window manager for React, inspired by IDE window management and i3. Its layout is an n-ary tree of splits and tab nodes, controlled or uncontrolled, with drag and drop built on `react-dnd` (HTML5 and touch backends). Its peer range is React 16 to 19, and it's Apache-2.0.

dockview's home page calls it the docking layout manager for React, for IDE-like interfaces with tabs, groups, drag and drop, floating panels and popout windows. Its README lists packages for React, Vue, Angular and plain JavaScript. Every package in its repository is MIT except `dockview-enterprise`, which has a commercial licence.

For docking in the IDE sense, [dockable panels in React](/use-cases/react-dockable-panels) shows what hypr-tiling does and where a docking manager fits better. The [react-mosaic alternatives](/blog/react-mosaic-alternatives) article compares the tiling and docking libraries in detail.

## Comparison table

| Library | Layout model | Empty cells / free placement | Breakpoints | Frameworks | Licence |
|---|---|---|---|---|---|
| react-grid-layout | Grid of draggable, resizable widgets, placed by x, y, w, h | Yes: packing is horizontal, vertical or off | Yes, a separate layout per breakpoint | React only (v2: React 18+; 0.17: React 16 and 17) | MIT |
| gridstack.js | Column grid of draggable, resizable widgets (12 columns by default), nested grids | Widgets placed by x, y, w, h; `mode` (`top` by default, or `float`, `list`, `compact`) sets how they settle | Yes: `columnOpts` takes breakpoint and column pairs | Plain TypeScript; Angular, React and Vue wrappers included | MIT |
| dnd-kit | Drag-and-drop toolkit (sortable lists, grids, containers); not a layout | Yours to build | Not stated | React (18 or 19), Vue, Svelte, Solid, plain JavaScript | MIT |
| hypr-tiling | Tree of splits and tab groups | No: panes fill the area | No | React 19 only | PolyForm Perimeter 1.0.1 (source-available) |
| react-mosaic | Tree of splits and tab nodes (n-ary) | Not stated | Not stated | React 16 to 19 | Apache-2.0 |
| dockview | Docking: tabs, groups, grids, splitviews; floating panels, popout windows | Not stated | Not stated | React (16.8 to 19), Vue, Angular, plain JavaScript | MIT (`dockview-enterprise` is commercial) |

"Not stated" means the project's own pages say nothing on it, not that the feature is missing.

Latest GitHub releases on 4 November 2026, for reference: react-grid-layout 2.3.0 (5 October 2026), gridstack v14.0.0 (21 September 2026), react-mosaic v7.2.1 (28 September 2026), dockview v8.8.3 (30 October 2026). dnd-kit publishes per-package releases; the latest one listed is dated 31 October 2026.

## Which react-grid-layout alternative should you pick?

- **Widgets of fixed sizes on a grid, React only, per-breakpoint layouts:** stay with react-grid-layout. If it already does the job, there's no reason to move.
- **A grid outside React too, nested grids, or Angular and Vue screens:** gridstack.js.
- **A grid or board of your own design, with custom drop rules:** dnd-kit, and plan to write resizing and saving yourself.
- **Panels that fill the screen and users who rearrange and resize them:** a tiling layout. hypr-tiling if React 19 and Tailwind are fine for you and you want keyboard control, tab groups and workspaces; react-mosaic if you're on React 18 or older or want Apache-2.0.
- **Panels that float, detach or open in a new browser window:** dockview.
- **A component from a suite you already use:** KendoReact TileLayout or Syncfusion Dashboard Layout, after reading their licence pages.
- **An MIT or Apache-2.0 licence:** react-grid-layout, gridstack.js, dnd-kit, dockview (its enterprise package is separate) and react-mosaic. Not hypr-tiling; the two suite components come under their vendors' own terms.
- **Empty space or a layout per screen width:** not hypr-tiling, which has neither. react-grid-layout and gridstack.js have both.

If a tiled screen is what you want, start with the [quickstart](/docs#quickstart), then the [save and restore recipe](/docs#howto-save-restore) for keeping each user's layout. The [hypr-tiling home page](/) shows the library running. For a dashboard built step by step, see the [react drag and drop dashboard](/use-cases/react-drag-and-drop-dashboard) page; its table sets hypr-tiling against react-grid-layout and gridstack row by row.

hypr-tiling is made by n-uf. It isn't affiliated with react-grid-layout, gridstack, dnd-kit, react-mosaic, dockview, Syncfusion, Telerik (KendoReact) or Hyprland, and none of them endorses it.
