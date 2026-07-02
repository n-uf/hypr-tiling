<h1 align="center">
  <img src="assets/hypr-tiling-logo-transparent.png" alt="hypr-tiling" width="48" align="center" />
  hypr-tiling
</h1>
<p align="center">Dynamic tiling for React</p>

`@n-uf/hypr-tiling` is a dynamic tiling layout engine for React: a recursive
split-tree renderer that lets users drag, drop, resize, group, maximize, and
keyboard-control resizable panes at runtime, with a theming engine and
self-healing drag recovery.

Reach for it when users need to rearrange dense, multi-panel screens at runtime
— IDE-like tools, trading and operator consoles, analytics dashboards — while
your app keeps strict, controlled ownership of the layout state.

## Quick links

- Documentation homepage: <https://hypr-tiling.n-uf.com/>
- Interactive showcase route: <https://hypr-tiling.n-uf.com/showcase>
- Package README: [`packages/hypr-tiling/README.md`](packages/hypr-tiling/README.md)
- API report index: [`packages/hypr-tiling/etc/hypr-tiling.api.md`](packages/hypr-tiling/etc/hypr-tiling.api.md)
- GitHub issues: <https://github.com/n-uf/hypr-tiling/issues>

## Use cases

hypr-tiling is built for screens where users live across multiple panels and
rearrange them as the work demands:

- **Dynamic / content sites** — real, SEO-indexable content arranged as tiles
  instead of a single scroll; the homepage in `apps/web` dogfoods this, with its
  docs living in prerendered panes.
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

## Kudos to Hyprland

The interaction model is inspired by [Hyprland](https://hypr.land), the
dynamic-tiling Wayland compositor, and its tiling-first philosophy:
detach-and-drop movement, master/stack layouts, and keyboard-driven focus.
Kudos to the Hyprland maintainers and contributors for advancing modern Linux
compositor and tiling workflow design.

## Install

```bash
pnpm add @n-uf/hypr-tiling react react-dom
```

`react` and `react-dom` are peer dependencies (version `^19`).

The package **ships no CSS** — the renderer emits Tailwind utility class strings,
so you must register it in your Tailwind `content` glob or the component renders
unstyled:

```js
// tailwind.config.js
content: [
  "./src/**/*.{js,ts,jsx,tsx}",
  "./node_modules/@n-uf/hypr-tiling/dist/**/*.{js,mjs}",
];
```

See the [package README](packages/hypr-tiling/README.md) for the Tailwind v4
`@source` form and the full programmatic layout API.

## Integrate

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

## API reference

Public API docs and export signatures live in:

- Human guide: [`packages/hypr-tiling/README.md`](packages/hypr-tiling/README.md)
- Extracted API report: [`packages/hypr-tiling/etc/hypr-tiling.api.md`](packages/hypr-tiling/etc/hypr-tiling.api.md)

## Features

- **Recursive split-tree layout** — a layout is a tree of `leaf`, `split`, and
  `group` nodes; binary splits carry an axis and a ratio.
- **Drag-and-drop tiling** — Hyprland-style live drag: the source detaches, the
  tree freezes, a cursor-following ghost hops between seats, and the move commits
  on release, resolving to swap, edge-insert, split-container-insert, or
  group-merge.
- **Resize & sizing modes** — drag split dividers, or pin a pane to a measured
  pixel extent per dimension (static) versus ratio-distributed (flexible); panes
  can acquire space directionally.
- **Master / stack layout** — any subtree can switch to a master-area-plus-stack
  arrangement with a configurable master count and orientation.
- **Tabbed grouping** — collapse several leaves into one slot as a stacked group
  with a tab strip; only the active member renders and is hit-tested.
- **Full keyboard control** — directional focus, a pane switcher (cycle / jump /
  overlay), maximize, keyboard move-mode, and master/group commands, all behind a
  remappable keymap.
- **Theming engine** — two built-in themes (`neon-terminal`, `clean-flat`), eight
  accent hues, a theme provider with hooks, and live theme switching with no
  remount.
- **Self-healing drag recovery** — a frame-deadline animation backstop, an idle
  watchdog, transient-style teardown, and a `visibilitychange` reconcile so a drag
  never strands the tree mid-transition.
- **Animation choreography** — FLIP survivor reflow, ghost transit, swap bounce,
  easing knobs, and `prefers-reduced-motion` support.

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

## SEO & LLM discoverability

Pane content is real semantic DOM — headings, paragraphs, lists, code — emitted
into the document, not painted onto a canvas or hidden behind a transform. All
panes render at once, so unfocused sections stay in the DOM. Because the content
lives in the DOM, it prerenders: a tiling UI can ship its full text in the
initial static HTML (with the interactive tiling layered on as progressive
enhancement), so search crawlers and LLM assistants that fetch and cite docs read
the real content without executing JavaScript. The homepage app in `apps/web`
dogfoods exactly this — its documentation lives inside the panes and is
prerendered to static HTML alongside a `/llms.txt` mirror.

## Workspace layout

- `packages/hypr-tiling` — core React tiling renderer package (`@n-uf/hypr-tiling`)
- `packages/showcase` — interactive showcase package (`hypr-tiling-showcase`)
- `apps/web` — content-first homepage that renders the library's docs inside the
  tiling panes and prerenders them for SEO/LLM crawlers

## Versioning policy

The package uses calendar-aligned versioning, `YY.M.R`:

- First clause (`26`) is the release year (`2026`)
- Second clause (`6`) is the release month (`June`)
- Third clause (`1`) is the major release sequence for that year/month window

Semver numeric identifiers cannot use leading zeroes (`26.06.1` is invalid), so
this workspace uses `YY.M.R` (e.g. `26.6.1`), not `YY.MM.R`.

Release commands (package `packages/hypr-tiling`):

- `npm run release` — auto-aligns `YY.M` to the current calendar year/month
  (bumps patch within the same month; resets to `.0` when the month changes),
  then publishes with `npm publish --access public`
- `npm run release --nobump=true` — publishes without changing the version
- `npm run release:next-version` — prints the computed next version without
  publishing

See `_agent/versioning-policy.md` for deeper guidance.

## License policy

This repository uses the source-available
[PolyForm Perimeter 1.0.1](https://polyformproject.org/licenses/perimeter/1.0.1)
license — "business use allowed, but no competing product built from this
software":

- Internal and commercial use is allowed under PolyForm Perimeter
- Providing a product that competes with this software is not allowed
- This is source-available licensing, not OSI open-source licensing

See `_agent/license-policy.md` for rationale and source links.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```
