# @n-uf/hypr-tiling

Dynamic tiling for React: a recursive split-tree renderer for drag/drop,
resizable, keyboard-controlled panes — inspired by
[Hyprland](https://hypr.land).

Reach for it when users need to rearrange dense, multi-panel screens at runtime
— IDE-like tools, trading and operator consoles, analytics dashboards — while
your app keeps strict, controlled ownership of the layout state.

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

## Quick start

The renderer is a **controlled component**: you own the layout tree in state and
apply every change it reports through `onLayoutChange`. Nothing about the layout
is hidden inside the component — the tree is yours to persist, diff, and restore.

```tsx
import {
  DynamicTilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type DynamicLayoutNode,
  type DynamicTile,
} from "@n-uf/hypr-tiling";
import { useState } from "react";

const tiles: DynamicTile[] = [
  { id: "a", title: "editor", content: <Editor /> },
  { id: "b", title: "preview", content: <Preview /> },
];

const initialLayout: DynamicLayoutNode = {
  kind: "split",
  id: "root",
  axis: "vertical",
  ratio: 0.5,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

export function Workspace(): JSX.Element {
  const [layout, setLayout] = useState<DynamicLayoutNode>(initialLayout);
  return (
    <DynamicTilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      onLayoutChange={setLayout}
    />
  );
}
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
[PolyForm-Perimeter-1.0.0](https://github.com/polyformproject/polyform-licenses/blob/1.0.0/PolyForm-Perimeter-1.0.0.md)
— business use allowed, but no competing product built from this software.
