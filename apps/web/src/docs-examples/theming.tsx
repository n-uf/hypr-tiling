import { useState, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  TilingThemeProvider,
  useTilingTheme,
  resolveTilingTheme,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
  type TilingThemeId,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// Two ways to theme:
//   1. Pick a built-in theme with the `themeId` prop ("neon-terminal" |
//      "clean-flat" | "mosaic"). Switching is live — no remount.
//   2. Give a pane its own per-tile accent via `tile.accent` (one of eight hues).
// Inside a pane you can read the active theme with useTilingTheme() — wrap a
// subtree in TilingThemeProvider to supply it (resolveTilingTheme maps an id to
// the token object).

const tiles: TilingTile[] = [
  { id: "a", title: "Signals", accent: "emerald" },
  { id: "b", title: "Alerts", accent: "rose" },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

// A pane body that reads the live theme id from context.
function ThemedBody({ title }: { title: string }): ReactElement {
  const theme = useTilingTheme();
  return (
    <div style={{ padding: 12, fontSize: 13 }}>
      {title} · theme: {theme.id}
    </div>
  );
}

export function ThemingExample(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  const [themeId, setThemeId] = useState<TilingThemeId>("neon-terminal");

  return (
    <TilingThemeProvider theme={resolveTilingTheme(themeId)}>
      <button type="button" onClick={(): void => setThemeId("clean-flat")}>
        Use clean-flat
      </button>
      <TilingRenderer
        layout={layout}
        tiles={tiles}
        config={DEFAULT_TILING_LAYOUT_CONFIG}
        themeId={themeId}
        onLayoutChange={setLayout}
        onThemeChange={setThemeId}
        renderTile={({ tile }: TilingRenderTileProps): ReactNode => (
          <ThemedBody title={tile.title} />
        )}
      />
    </TilingThemeProvider>
  );
}
