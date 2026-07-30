<h1 align="center">
  <img src="https://raw.githubusercontent.com/n-uf/hypr-tiling/main/assets/hypr-tiling-logo-transparent.png" alt="hypr-tiling" width="48" align="center" />
  @n-uf/hypr-tiling
</h1>
<p align="center">Dynamic tiling for React</p>

Dynamic tiling for React: a recursive split-tree renderer for drag/drop,
resizable, keyboard-controlled panes — inspired by
[Hyprland](https://hypr.land).

Reach for it when users need to rearrange dense, multi-panel screens at runtime
— IDE-like tools, trading and operator consoles, analytics dashboards — while
your app keeps strict, controlled ownership of the layout state.

## Quick links

- Documentation homepage: <https://hypr-tiling.n-uf.com/>
- Interactive showcase route: <https://hypr-tiling.n-uf.com/showcase>
- API report index: [`etc/hypr-tiling.api.md`](https://github.com/n-uf/hypr-tiling/blob/main/packages/hypr-tiling/etc/hypr-tiling.api.md)
- Repository issues: <https://github.com/n-uf/hypr-tiling/issues>

## Install

```bash
pnpm add @n-uf/hypr-tiling react react-dom
```

```bash
npm install @n-uf/hypr-tiling react react-dom
```

```bash
yarn add @n-uf/hypr-tiling react react-dom
```

`react` and `react-dom` are peer dependencies (version `^19`).

## Compatibility

- React: `^19`
- React DOM: `^19`
- Tailwind scanning: required (`content` glob or v4 `@source`)
- Runtime: browser DOM (React renderer package)

### Tailwind content requirement

The renderer styles its **visual** surfaces (pane shells, header, dividers,
focus frame, ghost) by emitting Tailwind utility class strings (via `clsx` +
`tailwind-merge`) — those classes only resolve to real styles if Tailwind scans
this package's built output and generates the matching CSS. If you do not
register the package in your Tailwind `content` glob, those surfaces render
**unstyled**.

> **Critical chrome ships as CSS, not purge-dependent classes.** The functional
> chrome the tiler cannot work without — resize-divider `col-resize` /
> `row-resize` cursors and the focus-outline handling below — is emitted by the
> renderer as a small stylesheet **scoped to `.hpt-root`** (React 19
> `<style href>` hoisting), keyed off data attributes rather than Tailwind
> `cursor-*` utilities. So resize cursors resolve correctly **even if your
> Tailwind build never scans our dist**. Tailwind scanning affects only the
> *visual* theme utilities, not these affordances.

Add `@n-uf/hypr-tiling` to your Tailwind `content` configuration:

```js
// tailwind.config.js
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@n-uf/hypr-tiling/dist/**/*.{js,mjs}",
  ],
  // ...
};
```

For Tailwind v4 (CSS-first config), declare the same path as a source in your
stylesheet:

```css
@import "tailwindcss";
@source "../node_modules/@n-uf/hypr-tiling/dist/**/*.{js,mjs}";
```

## Quick start

The renderer is a **controlled component**: you own the layout tree in state and
apply every change it reports through `onLayoutChange`. Nothing about the layout
is hidden inside the component — the tree is yours to persist, diff, and restore.

```tsx
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
} from "@n-uf/hypr-tiling";
import { useState } from "react";

const tiles: TilingTile[] = [
  { id: "a", title: "editor", content: <Editor /> },
  { id: "b", title: "preview", content: <Preview /> },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "vertical",
  ratio: 0.5,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

export function Workspace(): JSX.Element {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      onLayoutChange={setLayout}
    />
  );
}
```

## Programmatic layout API

Because you own the layout tree, you can mutate it from your own code — not just
through drag/keyboard interaction. The package exports a set of pure layout
reducers (each takes a layout node and returns a new one, never mutating in
place) as supported public API. Use these to script layout changes, build custom
commands, or restore persisted arrangements:

| Reducer | Purpose |
| --- | --- |
| `findLeafById` | Locate a leaf node within the tree by its id. |
| `insertLeafAdjacent` | Insert a new leaf next to an existing one along an axis. |
| `moveLeafToRoot` | Detach a leaf and re-seat it against the layout root. |
| `moveLeafToSplitContainer` | Move a leaf into a target split container. |
| `swapLeafTiles` | Exchange the tiles occupying two leaves. |
| `removeLeafTile` | Remove a leaf and collapse its parent split. |
| `updateSplitRatio` | Set the ratio of a binary split. |
| `toggleSplitAxis` | Flip a split between horizontal and vertical. |
| `setLeafSizing` | Set a leaf's sizing mode (static pixel extent vs. flexible). |
| `groupLeaves` | Collapse several leaves into one stacked/tabbed group. |
| `ungroupNode` | Expand a group back into individual leaves. |
| `collectGroups` | Enumerate the group nodes in a layout. |
| `isStructurallyValidLayout` | Validate a layout tree's structural invariants. |

All reducers are re-exported from the package root:

```ts
import {
  findLeafById,
  insertLeafAdjacent,
  swapLeafTiles,
  isStructurallyValidLayout,
} from "@n-uf/hypr-tiling";
```

Other layout-tree helpers are exported for advanced/internal use, but the
reducers above are the stable, documented surface for application code.

For complete generated API signatures, see
[`etc/hypr-tiling.api.md`](https://github.com/n-uf/hypr-tiling/blob/main/packages/hypr-tiling/etc/hypr-tiling.api.md).

### Persisted layout (optional glue)

`createPersistedTilingLayout` is a **thin persistence adapter**: it persists
ONLY the layout tree (splits, ratios, tileId leaves) to a key/value store
(`localStorage` by default) and delegates every heal to the engine's first-class
`assertLayoutIntegrity` / `repairLayout`. Repair is an engine trait, not a
persistence feature — the integrity APIs stay usable with or without this
helper. The storage key, expected tile ids, and fallback tree stay app-owned.

```ts
import { createPersistedTilingLayout } from "@n-uf/hypr-tiling";
// also available from "@n-uf/hypr-tiling/engine"

const persisted = createPersistedTilingLayout({
  storageKey: "workspace.layout",
  expectedTileIds: ["editor", "preview", "terminal"],
  fallbackLayout: DEFAULT_LAYOUT,
  config: DEFAULT_TILING_LAYOUT_CONFIG,
  // storage? — defaults to window.localStorage (in-memory when no DOM)
  // resolveContainerSize? — defaults to window.innerWidth/innerHeight
});

const [layout, setLayout] = useState<TilingLayoutNode>(() => persisted.load());
// onLayoutChange={(next) => setLayout(persisted.commit(next))}
// persisted.reset() restores + persists the fallback tree
```

`load()` reads → structurally validates → checks integrity → returns a repaired
copy (or the fallback when nothing is stored / a saved tree fails hard
integrity). `commit()` validates → repairs → persists the healed tree.

### Focus-outline handling (SDK-controlled)

By default the renderer suppresses native UA focus outlines on its own chrome
(pane roots, tabs, buttons) via a stylesheet **scoped to `.hpt-root`** — it never
touches app chrome. Opt out with the `chromeFocusOutline` prop to keep native
browser focus rings:

```tsx
<TilingRenderer chromeFocusOutline="native" /* … */ />
// "suppress" (default) | "native"
```

## Features

- **Drag/drop rearrange** — Hyprland-style live drag; the move commits on
  release, resolving to swap, edge-insert, split-container-insert, or
  group-merge.
- **Resizable split dividers** — drag dividers, or pin a pane to a measured pixel
  extent (static) versus ratio-distributed (flexible).
- **Group / stack tabs** — collapse several leaves into one slot as a stacked
  group with a tab strip; only the active member renders.
- **Maximize** — promote any pane to fill the viewport and restore it back.
- **Keyboard-driven focus** — directional focus, a pane switcher
  (cycle / jump / overlay), keyboard move-mode, and master/group commands behind
  a remappable keymap.
- **Theming engine** — two built-in themes (`neon-terminal`, `clean-flat`),
  eight accent hues, and live theme switching with no remount.
- **Self-healing drag recovery** — a frame-deadline backstop, an idle watchdog,
  transient-style teardown, and a `visibilitychange` reconcile so a drag never
  strands the tree mid-transition.

## Use cases

hypr-tiling is built for screens where users live across multiple panels and
rearrange them as the work demands:

- **Dynamic / content sites** — real, SEO-indexable content arranged as tiles
  instead of a single scroll, with docs living in prerendered panes.
- **Dashboards** — analytics, metrics, and monitoring consoles where several
  resizable panes share one screen.
- **IDE-like tools** — editor, preview, and terminal workspaces a user splits,
  stacks, and rearranges at runtime.
- **Trading & operator consoles** — dense, keyboard-driven control surfaces that
  pack many live panels into a fixed viewport.
- **Admin & data apps** — table, detail, and activity panes side by side, resized
  to fit the task at hand.
- **Observability & log explorers** — query, results, and trace panes rearranged
  on the fly while chasing an incident.
- **Web terminals & consoles** — browser-based shells, multiplexed sessions, and
  live log streams split and resized Hyprland-style — the tiling homage made
  literal, in the terminal.
- **Realtime trading terminals** — Bloomberg-style desks: live charts, order
  books, watchlists, and order entry packed into dense panes that stream and
  rearrange in realtime.

## Roadmap

Where hypr-tiling is headed. These are **planned** directions, not shipped
features today — the library currently renders to the DOM and ships a React
adapter only. The items below describe where the project is going:

- **Framework-agnostic core** — a dependency-free vanilla TypeScript core so the
  tiling engine runs without any framework: the layout tree, the drag/FLIP state
  machine, and the self-healing recovery logic decoupled from React, ready to
  drive any view layer.
- **First-class adapters for every major framework** — React ships today;
  planned official adapters for Vue, Svelte, Solid, Angular, and standard Web
  Components, each a thin binding over the same vanilla core so behavior stays
  identical across frameworks.
- **Canvas rendering backend** — an optional canvas / GPU-accelerated render path
  for very high pane counts and animation-heavy scenes where DOM reflow is the
  bottleneck; the semantic DOM path stays the default and canvas is opt-in for
  density.
- **Rust + WebAssembly core** — porting the hot layout, drag, and geometry math
  to a Rust → WebAssembly core for deterministic, high-frame-rate behavior,
  unlocking more window-manager-like UX: virtual workspaces, snap zones,
  persistent session layouts, fully keyboard-driven tiling, and
  per-monitor-style multi-viewport arrangements.

## Contributing

hypr-tiling is built in the open and welcomes collaboration — framework
adapters, rendering backends, bug reports, and ideas from the roadmap above are
all welcome. To get involved, email
[metelin@gmail.com](mailto:metelin@gmail.com).

## Links

- Homepage: <https://hypr-tiling.n-uf.com>
- Showcase: <https://hypr-tiling.n-uf.com/showcase>
- Repository: <https://github.com/n-uf/hypr-tiling>
- Issues: <https://github.com/n-uf/hypr-tiling/issues>

## License

Source-available under
[PolyForm Perimeter 1.0.1](https://polyformproject.org/licenses/perimeter/1.0.1)
— business use allowed, but no competing product built from this software.
