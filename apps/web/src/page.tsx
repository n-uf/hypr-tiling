import * as React from "react";
import {
  DynamicTilingRenderer,
  type DynamicLayoutConfig,
  type DynamicLayoutNode,
  type DynamicRenderTileArgs,
  type DynamicTile,
  type TilingThemeId,
} from "@n-uf/hypr-tiling";
import { DOC_PANES } from "./docs";
import { DocTile } from "./tile";

const TILES: ReadonlyArray<DynamicTile> = DOC_PANES.map(
  (pane): DynamicTile => ({
    id: pane.id,
    title: pane.title,
    accent: pane.accent,
    content: pane.content,
  }),
);

// Intro pane is a tall left column; the four reference sections fill a 2x2 grid
// on the right. A leaf id mirrors its tile id (one tile per pane).
const INITIAL_LAYOUT: DynamicLayoutNode = {
  kind: "split",
  id: "root",
  axis: "vertical",
  ratio: 0.34,
  first: { kind: "leaf", id: "intro", tileId: "intro" },
  second: {
    kind: "split",
    id: "right",
    axis: "horizontal",
    ratio: 0.5,
    first: {
      kind: "split",
      id: "right-top",
      axis: "vertical",
      ratio: 0.5,
      first: { kind: "leaf", id: "install", tileId: "install" },
      second: { kind: "leaf", id: "features", tileId: "features" },
    },
    second: {
      kind: "split",
      id: "right-bottom",
      axis: "vertical",
      ratio: 0.5,
      first: { kind: "leaf", id: "model", tileId: "model" },
      second: { kind: "leaf", id: "discoverability", tileId: "discoverability" },
    },
  },
};

const LAYOUT_CONFIG: DynamicLayoutConfig = {
  gapPx: 10,
  minPaneSizePx: 200,
  handleSizePx: 8,
};

export function HomePage(): React.ReactElement {
  const [layout, setLayout] = React.useState<DynamicLayoutNode>(INITIAL_LAYOUT);
  const [themeId, setThemeId] = React.useState<TilingThemeId>("neon-terminal");

  return (
    <main className="h-screen max-h-screen min-h-0 w-full overflow-hidden bg-[#0b0d12] p-2 text-slate-100">
      <h1 className="sr-only">hypr-tiling — dynamic tiling for React</h1>
      <DynamicTilingRenderer
        layout={layout}
        tiles={TILES}
        config={LAYOUT_CONFIG}
        onLayoutChange={setLayout}
        themeId={themeId}
        onThemeChange={setThemeId}
        renderTile={(args: DynamicRenderTileArgs): React.ReactNode => (
          <DocTile {...args} />
        )}
      />
    </main>
  );
}
