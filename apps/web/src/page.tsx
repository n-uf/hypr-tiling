import * as React from "react";
import {
  TilingRenderer,
  type TilingLayoutConfig,
  type TilingLayoutNode,
  type TilingRenderTileProps,
  type TilingTile,
  type TilingCommandHandle,
} from "@n-uf/hypr-tiling";
import { DOC_PANES, REPO_URL } from "./docs";
import { DocTile } from "./tile";
import { ShortcutsPane } from "./shortcuts";

// The homepage keeps every interaction at its library default and passes no
// `interaction` prop. It always paints its own documentation content through
// `DocTile`, and the tab strip's dev-only "show pane body" checkbox is off by
// default (`paneSwitching.showContentToggle` defaults to `false`), which pins
// panes content-visible at rest — so the SEO/prerendered body carries the docs
// text with zero configuration. The shortcuts pane likewise reads the defaults
// (no `interaction` prop), so its command gates match the renderer exactly.

const LAYOUT_CONFIG: TilingLayoutConfig = {
  gapPx: 14,
  minPaneSizePx: 180,
  handleSizePx: 8,
};

// Composition: a master-stack reading of the docs, dogfooding the lib's own
// master/stack idea. A wide "master" hero column on the left carries the
// positioning copy over the use-cases pane (what it is, then what it's for); the
// right region is a two-column stack — features over the model/kudos note and
// the roadmap pane, and the install/integration column over a bottom row that
// pairs the SEO note with the live controls. A leaf id mirrors its tile id (one
// tile per pane).
const INITIAL_LAYOUT: TilingLayoutNode = {
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
      ratio: 0.44,
      first: { kind: "leaf", id: "features", tileId: "features" },
      second: {
        kind: "split",
        id: "mid-stack",
        axis: "vertical",
        ratio: 0.5,
        first: { kind: "leaf", id: "model", tileId: "model" },
        second: { kind: "leaf", id: "roadmap", tileId: "roadmap" },
      },
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

// Secondary CTA paired with the showcase link: an external link to the GitHub
// repository. Reuses the single-source `REPO_URL` (also referenced by the
// JSON-LD in entry-server.tsx). Styled as a neutral pill so the gold showcase
// CTA stays the primary action, but shares the same monospace pill vocabulary
// (border, tracking, hover) — no third-party badge, no heavy icon. External
// destination → opens in a new tab.
function RepoLink(): React.ReactElement {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex w-fit items-center gap-2 rounded-md border border-white/15 bg-white/[0.02] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-stone-200 transition-[transform,border-color,background-color,color] duration-150 hover:-translate-y-px hover:border-amber-300/50 hover:bg-amber-300/[0.06] hover:text-amber-100"
    >
      GitHub
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
  const [layout, setLayout] = React.useState<TilingLayoutNode>(INITIAL_LAYOUT);
  const [focusedLeafId, setFocusedLeafId] = React.useState<string | null>(
    INITIAL_FOCUSED_LEAF_ID,
  );
  const [maximizedLeafId, setMaximizedLeafId] = React.useState<string | null>(
    null,
  );
  const commandHandleRef = React.useRef<TilingCommandHandle | null>(null);

  const tiles: ReadonlyArray<TilingTile> = DOC_PANES.map(
    (pane): TilingTile => ({
      id: pane.id,
      title: pane.title,
      accent: pane.accent,
      content:
        pane.id === "intro" ? (
          <div className="flex flex-col gap-5">
            {pane.content}
            <div className="flex flex-wrap items-center gap-2.5">
              <ShowcaseLink navigate={navigate} />
              <RepoLink />
            </div>
          </div>
        ) : (
          pane.content
        ),
    }),
  );

  const allTiles: ReadonlyArray<TilingTile> = [
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
        />
      ),
    },
  ];

  return (
    <main
      className="mosaic-rise h-screen max-h-screen min-h-0 w-full overflow-hidden p-3 font-sans text-stone-100"
      style={MAIN_BACKGROUND}
    >
      <TilingRenderer
        ref={commandHandleRef}
        layout={layout}
        tiles={allTiles}
        config={LAYOUT_CONFIG}
        onLayoutChange={setLayout}
        themeId="mosaic"
        focusedLeafId={focusedLeafId}
        onFocusedLeafChange={setFocusedLeafId}
        maximizedLeafId={maximizedLeafId}
        onMaximizedLeafChange={setMaximizedLeafId}
        renderTile={(args: TilingRenderTileProps): React.ReactNode => (
          <DocTile {...args} />
        )}
      />
    </main>
  );
}
