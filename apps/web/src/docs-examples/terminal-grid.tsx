import { useState, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// A whole runnable "terminal grid" — the Hyprland homage made literal: several
// monospace shell panes a user splits, stacks and rearranges at runtime. Copy
// this file wholesale.

function Terminal({ lines }: { lines: ReadonlyArray<string> }): ReactElement {
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        height: "100%",
        overflow: "auto",
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        lineHeight: 1.6,
        color: "#a7f3d0",
        background: "#0a0b0d",
      }}
    >
      {lines.join("\n")}
    </pre>
  );
}

const tiles: TilingTile[] = [
  { id: "shell", title: "zsh", content: <Terminal lines={["$ pnpm dev", "▸ ready in 312ms", "$ _"]} /> },
  { id: "logs", title: "logs", content: <Terminal lines={["[info] listening :3000", "[info] compiled ok"]} /> },
  { id: "top", title: "htop", content: <Terminal lines={["cpu  12%", "mem  3.1G / 16G", "load 0.42"]} /> },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "vertical",
  ratio: 0.6,
  first: {
    kind: "split",
    id: "top-row",
    axis: "horizontal",
    ratio: 0.5,
    first: { kind: "leaf", id: "shell-pane", tileId: "shell" },
    second: { kind: "leaf", id: "logs-pane", tileId: "logs" },
  },
  second: { kind: "leaf", id: "top-pane", tileId: "top" },
};

export function TerminalGridApp(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      themeId="neon-terminal"
      onLayoutChange={setLayout}
      renderTile={({ tile }: TilingRenderTileProps): ReactNode => tile.content}
    />
  );
}
