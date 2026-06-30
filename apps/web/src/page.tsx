import * as React from "react";
import {
  DynamicTilingRenderer,
  type DynamicLayoutConfig,
  type DynamicLayoutNode,
  type DynamicRenderTileArgs,
  type DynamicTile,
  type TilingCommandHandle,
  type TilingInteractionCapabilities,
} from "@n-uf/hypr-tiling";
import { DOC_PANES } from "./docs";
import { DocTile } from "./tile";
import { ShortcutsPane } from "./shortcuts";

// Homepage interaction config. All capabilities stay at their (all-enabled)
// defaults except the tab strip's pane-content checkbox, which is suppressed via
// the library `paneSwitching.showContentToggle` flag — the homepage always
// paints its own documentation content through `DocTile`, so the toggle is inert
// chrome here. The same object feeds the shortcuts pane so its command gates
// match the renderer exactly.
const INTERACTION: TilingInteractionCapabilities = {
  paneSwitching: { showContentToggle: false },
};

const LAYOUT_CONFIG: DynamicLayoutConfig = {
  gapPx: 14,
  minPaneSizePx: 180,
  handleSizePx: 8,
};

// Composition: a master-stack reading of the docs, dogfooding the lib's own
// master/stack idea. A wide "master" hero column on the left carries the
// positioning copy over the use-cases pane (what it is, then what it's for); the
// right region is a two-column stack — features over the model/kudos note, and
// the install/integration column over a bottom row that pairs the SEO note with
// the live controls. A leaf id mirrors its tile id (one tile per pane).
const INITIAL_LAYOUT: DynamicLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.3,
  first: {
    kind: "split",
    id: "intro-col",
    axis: "vertical",
    ratio: 0.62,
    first: { kind: "leaf", id: "intro", tileId: "intro" },
    second: { kind: "leaf", id: "usecases", tileId: "usecases" },
  },
  second: {
    kind: "split",
    id: "right",
    axis: "horizontal",
    ratio: 0.46,
    first: {
      kind: "split",
      id: "mid",
      axis: "vertical",
      ratio: 0.58,
      first: { kind: "leaf", id: "features", tileId: "features" },
      second: { kind: "leaf", id: "model", tileId: "model" },
    },
    second: {
      kind: "split",
      id: "far",
      axis: "vertical",
      ratio: 0.58,
      first: { kind: "leaf", id: "install", tileId: "install" },
      second: {
        kind: "split",
        id: "far-bottom",
        axis: "horizontal",
        ratio: 0.52,
        first: {
          kind: "leaf",
          id: "discoverability",
          tileId: "discoverability",
        },
        second: { kind: "leaf", id: "controls", tileId: "controls" },
      },
    },
  },
};

const INITIAL_FOCUSED_LEAF_ID: string = "intro";

// Warm-graphite canvas with a faint blueprint grid (a quiet nod to the tiling
// geometry) plus two soft washes: a gold glow top-left that ties the single
// accent into the backdrop, and a cool depth wash bottom-right. The renderer
// root + viewport are transparent (mosaic theme), so this grid shows through the
// gutters between panes.
const MAIN_BACKGROUND: React.CSSProperties = {
  backgroundColor: "#0c0d0f",
  backgroundImage: [
    "linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px)",
    "linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)",
    "radial-gradient(1100px 700px at 6% -12%, rgba(251,191,36,0.07), transparent 60%)",
    "radial-gradient(950px 760px at 112% 116%, rgba(120,113,108,0.10), transparent 55%)",
  ].join(", "),
  backgroundSize: "34px 34px, 34px 34px, 100% 100%, 100% 100%",
};

function ShowcaseLink({
  navigate,
}: {
  navigate?: (to: string) => void;
}): React.ReactElement {
  return (
    <a
      href="/showcase"
      onClick={(event: React.MouseEvent<HTMLAnchorElement>): void => {
        if (navigate != null) {
          event.preventDefault();
          navigate("/showcase");
        }
      }}
      className="group inline-flex w-fit items-center gap-2 rounded-md border border-amber-300/30 bg-amber-300/[0.06] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber-100 transition-[transform,border-color,background-color] duration-150 hover:-translate-y-px hover:border-amber-300/55 hover:bg-amber-300/[0.12]"
    >
      Open the full interactive showcase
      <span
        aria-hidden
        className="transition-transform duration-150 group-hover:translate-x-0.5"
      >
        {"\u2192"}
      </span>
    </a>
  );
}

export function HomePage({
  navigate,
}: {
  navigate?: (to: string) => void;
}): React.ReactElement {
  const [layout, setLayout] = React.useState<DynamicLayoutNode>(INITIAL_LAYOUT);
  const [focusedLeafId, setFocusedLeafId] = React.useState<string | null>(
    INITIAL_FOCUSED_LEAF_ID,
  );
  const [maximizedLeafId, setMaximizedLeafId] = React.useState<string | null>(
    null,
  );
  const commandHandleRef = React.useRef<TilingCommandHandle | null>(null);

  const tiles: ReadonlyArray<DynamicTile> = DOC_PANES.map(
    (pane): DynamicTile => ({
      id: pane.id,
      title: pane.title,
      accent: pane.accent,
      content:
        pane.id === "intro" ? (
          <div className="flex flex-col gap-5">
            {pane.content}
            <ShowcaseLink navigate={navigate} />
          </div>
        ) : (
          pane.content
        ),
    }),
  );

  const allTiles: ReadonlyArray<DynamicTile> = [
    ...tiles,
    {
      id: "controls",
      title: "live controls",
      accent: "amber",
      content: (
        <ShortcutsPane
          commandHandleRef={commandHandleRef}
          layout={layout}
          focusedLeafId={focusedLeafId}
          maximizedLeafId={maximizedLeafId}
          interaction={INTERACTION}
        />
      ),
    },
  ];

  return (
    <main
      className="mosaic-rise h-screen max-h-screen min-h-0 w-full overflow-hidden p-3 font-sans text-stone-100"
      style={MAIN_BACKGROUND}
    >
      <DynamicTilingRenderer
        ref={commandHandleRef}
        layout={layout}
        tiles={allTiles}
        config={LAYOUT_CONFIG}
        onLayoutChange={setLayout}
        interaction={INTERACTION}
        themeId="mosaic"
        focusedLeafId={focusedLeafId}
        onFocusedLeafChange={setFocusedLeafId}
        maximizedLeafId={maximizedLeafId}
        onMaximizedLeafChange={setMaximizedLeafId}
        renderTile={(args: DynamicRenderTileArgs): React.ReactNode => (
          <DocTile {...args} />
        )}
      />
    </main>
  );
}
