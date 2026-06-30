# hypr-tiling theme engine

A generic, typed theming capability for the `hypr-tiling` renderer. Every
visual surface (pane shells, header chrome, focus frame, drag ghost, split
dividers, renderer root/background, top-bar/tab-strip) is painted from a single
resolved `TilingTheme` instead of inline Tailwind class strings. Per-pane
accents (`DynamicTileAccent`) compose with the active theme through typed
resolver functions. Any consumer of the library inherits the engine + the
built-in themes; the showcase only selects a theme (and, from round 3, exposes
the switcher).

## Subfolders / files structure

```
packages/hypr-tiling/
├── theme.tsx                      # the engine: token interfaces, accent-hue
│                                  # registry, TilingTheme registry, React
│                                  # context + provider + useTilingTheme hook
├── types.ts                       # TilingThemeId union (central contract);
│                                  # DynamicTilingRendererProps.themeId / onThemeChange
├── dynamic-tiling-renderer.tsx    # consumes the active theme via context;
│                                  # no surface owns hardcoded class strings
├── index.ts                       # public re-exports of the theme API
└── _agent/
    └── theme-engine.md            # this document
```

## Theme contract (the token interface + what each token controls)

A `TilingTheme` is pure data + pure functions — static token groups (one per
surface) plus accent-composition resolvers.

```
TilingTheme
├── id / label                     # TilingThemeId + human label
├── root                           TilingThemeRootTokens
│   ├── container                  # renderer outer shell: bg/gradient, radius, padding, outline
│   └── viewport                   # inner pane-tree viewport: bg + radius
├── paneShell                      TilingThemePaneShellTokens
│   ├── surface                    # pane article: bg/gradient, radius, shadow/rim, backdrop-filter
│   ├── bodyText                   # pane body scroll region typography + color
│   ├── subtitleText               # pane subtitle color
│   ├── dropEligibleRing           # faint dashed candidate ring
│   ├── dropHoverRing              # pointer-over-candidate ring
│   ├── dropTargetRing             # active drop-target ring
│   ├── invalidDropRing            # invalid drop-target ring
│   └── dragSourceOpacity          # picked-up source pane opacity
├── paneHeader                     TilingThemePaneHeaderTokens
│   ├── base                       # resting header bar: border-b, bg, inset sheen
│   ├── focused                    # additive classes when the pane is focused
│   ├── titleText                  # pane title typography (accent color applied separately)
│   ├── controlIdle                # resting header control button (maximize etc.)
│   └── controlActive              # active/pressed header control button
├── ghost                          TilingThemeGhostTokens
│   ├── surface                    # lifted drag-ghost article shell
│   ├── header                     # ghost header bar
│   ├── bodyText                   # ghost body color
│   └── subtitleText               # ghost subtitle color
├── divider                        TilingThemeDividerTokens
│   ├── base                       # structural + focus-visible ring color
│   ├── visibleInteractive         # visible + resizable handle (resting + hover)
│   ├── visibleStatic              # visible but resize-disabled handle
│   └── hidden                     # hidden handle (hit-area only, no chrome)
├── topBar                         TilingThemeTopBarTokens
│   ├── container                  # tab-strip container: border, bg, shadow, backdrop
│   ├── titleText                  # strip title text
│   ├── pickerGroup                # accent-picker group wrapper
│   ├── controlGroup               # switcher-control group wrapper (theme picker etc.)
│   ├── tabBase                    # tab chip base typography/layout
│   ├── tabInactive                # inactive tab chip
│   ├── switcherCard               # centered pane-switcher overlay card
│   └── switcherCardInactive       # switcher card, pane not selected
└── accent-composition resolvers (DynamicTileAccent → className)
    ├── resolvePaneAccentSurface   # resting pane border tint + colored shadow
    ├── resolveAccentText          # accent title-text color
    ├── resolveFocusFrame          # full focused-pane frame (structural border/ring + glow)
    └── resolveTabActive           # active tab / switcher / group-member chip
```

### Accent hue atoms

`TILING_ACCENT_HUES: Record<DynamicTileAccent, TilingAccentHue>` holds the raw
color atoms per accent (border/text/ring/glow/tab tints + a `focusGlowSoft`
dialed-back variant). Decoupling hue from the previous bundled accent theme is
what lets a calm theme borrow an accent's hue WITHOUT its heavy neon glow, and a
refined theme pick the softened glow. Resolvers `cn(...)`-compose these atoms;
the JIT sees every literal because they all live in `theme.tsx`.

## Registry + selection API (props / context)

### Data flow

```
[themeId prop] → resolveTilingTheme(themeId) → TilingTheme
        │                                          │
        │                              TilingThemeProvider value
        ▼                                          ▼
DynamicTilingRenderer root  ────────────►  useTilingTheme() in:
 (root/viewport/divider/group-tab read       DefaultDynamicTile, PaneTabStrip,
  the closure `theme` directly)               DragPaneOverlay/cancel ghost,
                                              PaneSwitcherOverlay
```

- `DynamicTilingRendererProps.themeId?: TilingThemeId` — selects the active
  theme. `undefined` → `DEFAULT_TILING_THEME_ID` (`"neon-terminal"`). Reacts to
  prop changes without remount; a live switch re-themes the whole tree.
- `DynamicTilingRendererProps.onThemeChange?: (id) => void` — wired by the
  in-renderer theme switcher control (round 3). Controlled: the consumer owns
  the `themeId` state. Omit to hide the switcher.
- `TILING_THEME_REGISTRY: Record<TilingThemeId, TilingTheme>` — closed registry;
  adding a `TilingThemeId` member forces the registry to cover it.
- `TILING_THEMES: readonly TilingTheme[]` — ordered, enumerable list a switcher
  iterates (mirrors `DYNAMIC_TILE_ACCENT_SWATCHES` for the accent picker).
- `resolveTilingTheme(id)` / `useTilingTheme()` / `TilingThemeProvider` — the
  selection + context primitives.

The registry returns a stable object reference per id, so the resolved `theme`
is referentially stable across renders unless `themeId` changes — safe to thread
through the `renderBranch` `useCallback` deps.

## The refactor (what moved from hardcoded → tokens)

| Surface (former inline class string)            | Now reads                          |
|---|---|
| Pane article shell                              | `theme.paneShell.surface` + `resolvePaneAccentSurface` |
| Pane drop/eligibility/invalid rings + opacity   | `theme.paneShell.drop*Ring` / `dragSourceOpacity` |
| Pane focus frame (`border-2 ring-2` + glow)     | `theme.resolveFocusFrame(accent)`  |
| Pane header (resting + focused) + controls      | `theme.paneHeader.{base,focused,controlIdle,controlActive}` |
| Pane title / subtitle / body text               | `resolveAccentText` / `paneShell.subtitleText` / `paneShell.bodyText` |
| Drag ghost shell + header + text                | `theme.ghost.*`                    |
| Split divider (visible/static/hidden)           | `theme.divider.*`                  |
| Renderer root + viewport background             | `theme.root.{container,viewport}`  |
| Top-bar/tab-strip + accent picker + tabs        | `theme.topBar.*` + `resolveTabActive` |
| Pane-switcher overlay + group-member tabs       | `theme.topBar.switcherCard*` + `resolveTabActive` |

Behavior/layout is unchanged: only the source of the class strings moved. The
former `DYNAMIC_TILE_ACCENT_THEMES` record + its `accentTheme` / `accentClassName`
/ `accentTextClassName` / `focusFrameClassName` / `tabAccentActiveClassName` /
`switcherCardAccentClassName` helpers were removed; `DYNAMIC_TILE_ACCENTS` and
`DYNAMIC_TILE_ACCENT_SWATCHES` now derive from `TILING_ACCENT_HUES` in
`theme.tsx`.

## Generic-vs-showcase boundary

- **Library (`theme.tsx` + renderer):** the engine, the `TilingTheme` contract,
  the accent-hue registry, ALL built-in themes, and the context. Any consumer
  inherits them.
- **Showcase:** only owns `themeId` state, passes it as a prop, and (round 3)
  renders the switcher by wiring `onThemeChange`. No visual constants live in the
  showcase.

## Design decision: class-token strings (not CSS variables)

The renderer is class-driven and Tailwind's JIT must statically see every
utility. Every token is a literal string declared in `theme.tsx`, so the JIT
emits all of them for any consumer regardless of which theme is active at
runtime. CSS variables would move color decisions out of the type system and
defeat the closed-union exhaustiveness (`Record<TilingThemeId, …>`,
`Record<DynamicTileAccent, …>`) the rest of the renderer relies on. The chosen
shape keeps theme authoring fully type-checked and JIT-safe.

## Usage / integration

Select a built-in theme (controlled by the consumer):

```tsx
import {
  DynamicTilingRenderer,
  TILING_THEMES,
  type TilingThemeId,
} from "@n-uf/hypr-tiling";

const [themeId, setThemeId] = React.useState<TilingThemeId>("clean-flat");

<DynamicTilingRenderer
  layout={layout}
  tiles={tiles}
  config={config}
  onLayoutChange={setLayout}
  themeId={themeId}
  onThemeChange={setThemeId}   // shows the in-renderer theme switcher
/>;

// Build a custom theme switcher from the enumerable list:
TILING_THEMES.map((t) => ({ id: t.id, label: t.label }));
```

Read the active theme inside a custom `renderTile`:

```tsx
import { useTilingTheme } from "@n-uf/hypr-tiling";

function MyTile() {
  const theme = useTilingTheme();
  return <article className={theme.paneShell.surface}>…</article>;
}
```
