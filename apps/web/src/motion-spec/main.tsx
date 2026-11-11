import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_TILING_LAYOUT_CONFIG,
  TilingRenderer,
  type TilingCommand,
  type TilingCommandHandle,
  type TilingLayoutNode,
  type TilingRenderTileProps,
  type TilingTile,
} from "@n-uf/hypr-tiling";
import "../index.css";

/**
 * Dev-only motion spec scene (see motion-spec.html and scripts/motion-spec.mjs):
 * a tiling layout the spec drives through `window.__motionLab`. `?tiles=custom`
 * renders the panes through a `renderTile` with its own chrome (the path the
 * homepage uses); the default is the library's built-in pane and theme.
 */

const ROWS: ReadonlyArray<string> = [
  "The quick brown fox jumps over the lazy dog.",
  "Pack my box with five dozen liquor jugs.",
  "Sphinx of black quartz, judge my vow.",
  "How vexingly quick daft zebras jump!",
];

const TILES: ReadonlyArray<TilingTile> = [
  { id: "a", title: "alpha", description: "left pane", accent: "cyan", rows: ROWS },
  { id: "b", title: "bravo", description: "top right", accent: "amber", rows: ROWS },
  { id: "c", title: "charlie", description: "bottom right", accent: "emerald", rows: ROWS },
  { id: "d", title: "delta", description: "opened later", accent: "rose", rows: ROWS },
];

const INITIAL_LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "leaf-a", tileId: "a" },
  second: {
    kind: "split",
    id: "right",
    axis: "vertical",
    ratio: 0.5,
    first: { kind: "leaf", id: "leaf-b", tileId: "b" },
    second: { kind: "leaf", id: "leaf-c", tileId: "c" },
  },
};

interface MotionLab {
  readonly ready: boolean;
  layout(): TilingLayoutNode;
  /** Commit a layout; the tiles shown are exactly the ones it references. */
  setLayout(next: TilingLayoutNode): void;
  dispatch(command: TilingCommand): void;
}

function tileIdsOf(node: TilingLayoutNode): string[] {
  if (node.kind === "leaf") {
    return [node.tileId];
  }
  if (node.kind === "group") {
    return node.members.flatMap(tileIdsOf);
  }
  return [...tileIdsOf(node.first), ...tileIdsOf(node.second)];
}

declare global {
  interface Window {
    __motionLab?: MotionLab;
  }
}

function CustomPane(args: TilingRenderTileProps): React.ReactElement {
  return (
    <article
      data-leaf-id={args.leafId}
      onFocus={args.onFocus}
      onClick={args.onFocus}
      style={{
        boxSizing: "border-box",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "linear-gradient(160deg, #1d2430, #11151c)",
        boxShadow: "0 10px 30px -12px rgba(0,0,0,0.7)",
        color: "#e2e8f0",
        font: "13px/1.5 ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <header style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", fontWeight: 600 }}>
        {args.tile.title}
      </header>
      <div style={{ padding: "8px 12px" }}>
        {ROWS.map((row: string): React.ReactElement => (
          <p key={row} style={{ margin: "0 0 6px" }}>
            {row}
          </p>
        ))}
      </div>
    </article>
  );
}

function MotionScene(): React.ReactElement {
  const [layout, setLayout] = React.useState<TilingLayoutNode>(INITIAL_LAYOUT);
  const [maximizedLeafId, setMaximizedLeafId] = React.useState<string | null>(null);
  const layoutRef = React.useRef<TilingLayoutNode>(layout);
  layoutRef.current = layout;
  const handleRef = React.useRef<TilingCommandHandle | null>(null);
  const custom: boolean = new URLSearchParams(window.location.search).get("tiles") === "custom";
  const tiles: ReadonlyArray<TilingTile> = React.useMemo((): ReadonlyArray<TilingTile> => {
    const shown: Set<string> = new Set<string>(tileIdsOf(layout));
    return TILES.filter((tile: TilingTile): boolean => shown.has(tile.id));
  }, [layout]);

  React.useEffect((): void => {
    window.__motionLab = {
      ready: true,
      layout: (): TilingLayoutNode => layoutRef.current,
      setLayout: (next: TilingLayoutNode): void => setLayout(next),
      dispatch: (command: TilingCommand): void => handleRef.current?.dispatch(command),
    };
  }, []);

  return (
    <div style={{ height: "100%", padding: 16, boxSizing: "border-box" }}>
      <TilingRenderer
        ref={handleRef}
        layout={layout}
        tiles={tiles}
        config={DEFAULT_TILING_LAYOUT_CONFIG}
        onLayoutChange={setLayout}
        maximizedLeafId={maximizedLeafId}
        onMaximizedLeafChange={setMaximizedLeafId}
        renderTile={custom ? (args: TilingRenderTileProps): React.ReactNode => <CustomPane {...args} /> : undefined}
      />
    </div>
  );
}

const container: HTMLElement | null = document.getElementById("root");
if (container != null) {
  createRoot(container).render(<MotionScene />);
}
