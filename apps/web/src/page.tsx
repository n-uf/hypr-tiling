import * as React from "react";
import {
  TilingRenderer,
  queryTilingLayout,
  type TilingCommand,
  type TilingInteractionCapabilities,
  type TilingLayoutConfig,
  type TilingLayoutNode,
  type TilingLayoutQuery,
  type TilingRenderTileProps,
  type TilingTile,
  type TilingCommandHandle,
} from "@n-uf/hypr-tiling";
import { DOC_PANES, REPO_URL } from "./docs";
import { DocTile } from "./tile";
import { EditorialTile } from "./editorial-tile";
import { EditorialPaneContent } from "./content-editorial";
import { CanvasTile } from "./canvas-tile";
import { CanvasPaneContent } from "./content-canvas";
import { CANVAS_TICKS } from "./canvas-theme";
import { HomeShortcuts } from "./shortcuts";
import { type HomeTileProps } from "./group-switcher";

// The homepage is a live hypr-tiling layout that can present in three SKINS — a
// "skin" being a whole bundled look (theme + pane chrome + content presentation),
// not a pane selector. All three drive the SAME renderer, the SAME layout tree,
// and the SAME documentation content model; they differ only in presentation, so
// flipping between them reads as three designs of one site:
//
//   • "mosaic"    — dark technical-atlas: graphite canvas, amber accent,
//                   `DocTile` chrome, dense uppercase-mono content.
//   • "editorial" — light paper & ink: warm-paper canvas, serif headlines,
//                   `EditorialTile` folio chrome, a numbered reading index.
//   • "canvas"    — greyish workspace: soft grey desk, hairline white cards,
//                   quiet neutral type, keycap chips + colored accent ticks
//                   (`CanvasTile` chrome, `CANVAS_THEME` palette).
//
// `mosaic` is the default, so the prerendered HTML/SEO ships the Mosaic skin;
// the skin switch in the top bar is a client-side presentation toggle. The
// homepage always paints its own documentation content through `renderTile` and
// keeps the library's own tab strip OFF (`paneSwitching.showTabStrip: false`) —
// the top chrome bar below carries the wordmark, the pane tabs (rebuilt on the
// public query + command API), and the skin switch as site chrome.

type HomeSkin = "mosaic" | "editorial" | "canvas";

const LAYOUT_CONFIG: TilingLayoutConfig = {
  gapPx: 14,
  minPaneSizePx: 180,
  handleSizePx: 8,
};

// Composition: a master-stack reading of the docs, dogfooding the lib's own
// master/stack idea. A wide "master" hero column on the left carries the
// positioning copy over the use-cases pane (what it is, then what it's for); the
// right region is a two-column stack — features over the model/kudos note and
// the roadmap pane, and the install/integration column over the SEO note. Seven
// panes total; the keyboard-shortcut affordances live in the page-level bottom
// bar rather than a dedicated pane. A leaf id mirrors its tile id (one tile per
// pane).
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
      ratio: 0.55,
      first: { kind: "leaf", id: "install", tileId: "install" },
      second: {
        kind: "leaf",
        id: "discoverability",
        tileId: "discoverability",
      },
    },
  },
};

const INITIAL_FOCUSED_LEAF_ID: string = "intro";

// Mosaic canvas: warm-graphite with a faint blueprint grid (a quiet nod to the
// tiling geometry) plus two soft washes — a gold glow top-left and a cool depth
// wash bottom-right. The renderer root + viewport are transparent (mosaic
// theme), so this shows through the gutters between panes.
const MOSAIC_BACKGROUND: React.CSSProperties = {
  backgroundColor: "#0c0d0f",
  backgroundImage: [
    "linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px)",
    "linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)",
    "radial-gradient(1100px 700px at 6% -12%, rgba(251,191,36,0.07), transparent 60%)",
    "radial-gradient(950px 760px at 112% 116%, rgba(120,113,108,0.10), transparent 55%)",
  ].join(", "),
  backgroundSize: "34px 34px, 34px 34px, 100% 100%, 100% 100%",
};

// Editorial canvas: a warm paper "desk" — no grid, no glass. Two soft light
// washes lift the top-left and warm the bottom-right so the near-white pane
// leaves read as sheets on a warm surface. Same transparent renderer root lets
// this show through the gutters.
const EDITORIAL_BACKGROUND: React.CSSProperties = {
  backgroundColor: "#ece3d1",
  backgroundImage: [
    "radial-gradient(1150px 720px at 6% -12%, rgba(255,253,247,0.75), transparent 60%)",
    "radial-gradient(980px 780px at 112% 116%, rgba(178,158,118,0.18), transparent 55%)",
  ].join(", "),
};

// Canvas desk: a soft cool-grey workspace surface — flat, quiet, generous. One
// barely-there lighter wash at the top lifts the desk toward the light so the
// white pane cards read as sheets laid on it; no grid, no color. The transparent
// renderer root lets this show through the gutters between cards.
const CANVAS_BACKGROUND: React.CSSProperties = {
  backgroundColor: "#f1f3f5",
  backgroundImage: [
    "radial-gradient(1200px 680px at 50% -20%, rgba(255,255,255,0.9), transparent 62%)",
  ].join(", "),
};

// Skin-scoped chrome tokens for the top bar + CTAs. Kept as a small lookup so
// the top bar, tabs, and call-to-action links all read from one coherent per-skin
// vocabulary.
interface SkinChromeTokens {
  readonly bar: string;
  readonly wordmark: string;
  readonly tabRail: string;
  readonly tabBase: string;
  readonly tabActive: string;
  readonly tabInactive: string;
  readonly tabIndex: string;
  readonly switchGroup: string;
  readonly switchLabel: string;
  readonly switchActive: string;
  readonly switchInactive: string;
  readonly ctaPrimary: string;
  readonly ctaSecondary: string;
}

const SKIN_CHROME: Record<HomeSkin, SkinChromeTokens> = {
  mosaic: {
    bar: "flex shrink-0 items-center gap-3 rounded-lg border border-white/[0.07] bg-[#121316]/90 px-3 py-1.5 shadow-[0_14px_36px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur",
    wordmark:
      "flex shrink-0 items-center px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/70",
    tabRail:
      "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    tabBase:
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
    tabActive: "border-amber-300/55 bg-amber-300/10 text-amber-100",
    tabInactive:
      "border-white/[0.07] bg-white/[0.02] text-stone-400 hover:border-white/20 hover:text-stone-100",
    tabIndex: "font-semibold opacity-70",
    switchGroup:
      "flex shrink-0 items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.02] p-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
    switchLabel: "px-2 text-stone-500",
    switchActive: "rounded-full bg-amber-300/15 px-3 py-1 text-amber-100",
    switchInactive:
      "rounded-full px-3 py-1 text-stone-400 transition-colors hover:text-stone-200",
    ctaPrimary:
      "group inline-flex w-fit items-center gap-2 rounded-md border border-amber-300/30 bg-amber-300/[0.06] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber-100 transition-[transform,border-color,background-color] duration-150 hover:-translate-y-px hover:border-amber-300/55 hover:bg-amber-300/[0.12]",
    ctaSecondary:
      "group inline-flex w-fit items-center gap-2 rounded-md border border-white/15 bg-white/[0.02] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-stone-200 transition-[transform,border-color,background-color,color] duration-150 hover:-translate-y-px hover:border-amber-300/50 hover:bg-amber-300/[0.06] hover:text-amber-100",
  },
  editorial: {
    bar: "flex shrink-0 items-center gap-3 rounded-[4px] border border-[#e2dac6] bg-[#fbf9f2] px-3.5 py-2 shadow-[0_1px_0_rgba(36,31,23,0.03),0_10px_28px_-24px_rgba(36,31,23,0.4)]",
    wordmark:
      "flex shrink-0 items-center px-1 font-display text-[13px] font-normal tracking-[0.02em] text-[#241f17]",
    tabRail:
      "flex min-w-0 flex-1 items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    tabBase:
      "flex shrink-0 items-baseline gap-1.5 border-b-2 pb-0.5 pt-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
    tabActive: "border-b-[#241f17] text-[#241f17]",
    tabInactive:
      "border-b-transparent text-[#9c8f77] hover:text-[#241f17]",
    tabIndex: "text-[#b0a487]",
    switchGroup:
      "flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]",
    switchLabel: "text-[#a89c83]",
    switchActive: "text-[#241f17] underline decoration-[#241f17] underline-offset-[3px]",
    switchInactive:
      "text-[#9c8f77] transition-colors hover:text-[#241f17]",
    ctaPrimary:
      "group inline-flex w-fit items-center gap-2 rounded-[3px] border border-[#241f17]/75 bg-transparent px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#241f17] transition-[transform,background-color,color] duration-150 hover:-translate-y-px hover:bg-[#241f17] hover:text-[#fbf9f2]",
    ctaSecondary:
      "group inline-flex w-fit items-center gap-2 rounded-[3px] border border-[#c9bd9f] bg-transparent px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6b6250] transition-[transform,border-color,color] duration-150 hover:-translate-y-px hover:border-[#241f17] hover:text-[#241f17]",
  },
  canvas: {
    bar: "flex shrink-0 items-center gap-3 rounded-lg border border-slate-200 bg-white/90 px-3.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur",
    wordmark:
      "flex shrink-0 items-center px-1 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500",
    tabRail:
      "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    tabBase:
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
    tabActive: "border-cyan-300 bg-cyan-50 text-cyan-700",
    tabInactive:
      "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800",
    tabIndex: "font-semibold text-slate-400",
    switchGroup:
      "flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
    switchLabel: "px-2 text-slate-400",
    switchActive: "rounded bg-white px-3 py-1 text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.06)]",
    switchInactive:
      "rounded px-3 py-1 text-slate-400 transition-colors hover:text-slate-700",
    ctaPrimary:
      "group inline-flex w-fit items-center gap-2 rounded-md border border-cyan-300 bg-cyan-50 px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-cyan-700 transition-[transform,border-color,background-color] duration-150 hover:-translate-y-px hover:border-cyan-400 hover:bg-cyan-100",
    ctaSecondary:
      "group inline-flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-600 transition-[transform,border-color,color] duration-150 hover:-translate-y-px hover:border-slate-300 hover:text-slate-900",
  },
};

const SKIN_OPTIONS: ReadonlyArray<{ id: HomeSkin; label: string }> = [
  { id: "mosaic", label: "Mosaic" },
  { id: "editorial", label: "Editorial" },
  { id: "canvas", label: "Canvas" },
];

function ShowcaseLink({
  navigate,
  skin,
}: {
  navigate?: (to: string) => void;
  skin: HomeSkin;
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
      className={SKIN_CHROME[skin].ctaPrimary}
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

function RepoLink({ skin }: { skin: HomeSkin }): React.ReactElement {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={SKIN_CHROME[skin].ctaSecondary}
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

// The top chrome bar — site chrome, not floating over content. Left: the
// wordmark. Middle: the pane tabs, rebuilt entirely on the PUBLIC query +
// command API (`queryTilingLayout` for reading order + titles, a `focus-pane` /
// `toggle-maximize` dispatch per tab) so it replaces the library's built-in tab
// strip while staying consumer-surface-only. Right: the skin switch. The whole
// bar re-skins with the active skin so it belongs to the design it presents.
function HomeTopBar({
  skin,
  onSkinChange,
  layout,
  focusedLeafId,
  maximizedLeafId,
  tilesById,
  dispatch,
}: {
  skin: HomeSkin;
  onSkinChange: (next: HomeSkin) => void;
  layout: TilingLayoutNode;
  focusedLeafId: string | null;
  maximizedLeafId: string | null;
  tilesById: ReadonlyMap<string, TilingTile>;
  dispatch: (command: TilingCommand) => void;
}): React.ReactElement {
  const tokens: SkinChromeTokens = SKIN_CHROME[skin];
  const query: TilingLayoutQuery = queryTilingLayout(layout);

  return (
    <div className={tokens.bar}>
      <div aria-label="hypr tiling title" className={tokens.wordmark}>
        HYPR TILING
      </div>
      <div role="tablist" aria-label="panes" className={tokens.tabRail}>
        {query.leafIds.map((leafId: string, index: number): React.ReactElement => {
          const tileId: string = query.tileOrder[index] ?? leafId;
          const tile: TilingTile | undefined = tilesById.get(tileId);
          const title: string = tile?.title ?? tileId;
          const isActive: boolean = leafId === focusedLeafId;
          const isMaximized: boolean = leafId === maximizedLeafId;
          return (
            <button
              key={leafId}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={
                isMaximized
                  ? `${title} (maximized — double-click to restore)`
                  : `${title} (double-click to maximize)`
              }
              onClick={(): void => dispatch({ kind: "focus-pane", leafId })}
              onDoubleClick={(): void =>
                dispatch({ kind: "toggle-maximize", leafId })
              }
              className={`${tokens.tabBase} ${
                isActive ? tokens.tabActive : tokens.tabInactive
              }`}
            >
              <span aria-hidden className={tokens.tabIndex}>
                {index + 1}
              </span>
              <span className="truncate">{title}</span>
            </button>
          );
        })}
      </div>
      <div
        role="group"
        aria-label="Site skin"
        className={`ml-auto ${tokens.switchGroup}`}
      >
        <span aria-hidden className={tokens.switchLabel}>
          skin
        </span>
        {SKIN_OPTIONS.map((option): React.ReactElement => {
          const active: boolean = option.id === skin;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={(): void => onSkinChange(option.id)}
              className={active ? tokens.switchActive : tokens.switchInactive}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Per-skin chrome for the page-level bottom bar. The bar is present in ALL three
// skins: it now leads with only a minimal per-skin accent mark (the wordy
// PANES / FOCUS / MODEL & KUDOS readout is gone — decluttered so the shortcut
// chips are the bar's primary content), HOSTS the keyboard-shortcut chips, and
// keeps the "double-click tab to maximize" hint — each styled in its skin's
// vocabulary (Mosaic dark ink, Editorial paper, Canvas squared LED-engineering).
interface SkinBottomBarTokens {
  readonly bar: string;
  readonly hintKbd: string;
  readonly hintText: string;
}

const SKIN_BOTTOM_BAR: Record<HomeSkin, SkinBottomBarTokens> = {
  mosaic: {
    bar: "flex shrink-0 items-center gap-3 rounded-lg border border-white/[0.07] bg-[#121316]/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500 shadow-[0_14px_36px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur",
    hintKbd:
      "rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] leading-none text-stone-400",
    hintText: "text-stone-500",
  },
  editorial: {
    bar: "flex shrink-0 items-center gap-3 rounded-[4px] border border-[#e2dac6] bg-[#fbf9f2] px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8c8069] shadow-[0_1px_0_rgba(36,31,23,0.03),0_10px_28px_-24px_rgba(36,31,23,0.4)]",
    hintKbd:
      "rounded-[2px] border border-[#ddd4bf] bg-[#efe8d6] px-1.5 py-0.5 text-[9px] leading-none text-[#6b6250]",
    hintText: "text-[#a89c83]",
  },
  canvas: {
    bar: "flex shrink-0 items-center gap-3 rounded-lg border border-slate-200 bg-white/90 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur",
    hintKbd:
      "rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] leading-none text-slate-500",
    hintText: "text-slate-400",
  },
};

// The skin's accent mark at the far left of the bottom bar: Canvas keeps its
// signature multi-color LED tick row, Mosaic a single amber tick, Editorial a
// quiet ink hairline (paper carries no color).
function BottomBarAccent({ skin }: { skin: HomeSkin }): React.ReactElement {
  if (skin === "canvas") {
    return (
      <span aria-hidden className="flex shrink-0 items-center gap-1.5">
        {CANVAS_TICKS.map((tick: string): React.ReactElement => (
          <span key={tick} className={`h-[3px] w-4 rounded-full ${tick}`} />
        ))}
      </span>
    );
  }
  if (skin === "mosaic") {
    return (
      <span
        aria-hidden
        className="h-[3px] w-5 shrink-0 rounded-full bg-amber-300/70"
      />
    );
  }
  return <span aria-hidden className="h-px w-5 shrink-0 bg-[#c9bd9f]" />;
}

// The page-level bottom bar, present in every skin. Left: only a minimal
// per-skin accent mark (the old wordy pane-count / focused-pane / section
// readout is removed — decluttered). Center: the keyboard-shortcut strip
// (`HomeShortcuts`), horizontally scrollable and now the bar's primary content.
// Right: the "double-click tab to maximize" hint.
function HomeBottomBar({
  skin,
  commandHandleRef,
  interaction,
  layout,
  focusedLeafId,
  maximizedLeafId,
}: {
  skin: HomeSkin;
  commandHandleRef: React.RefObject<TilingCommandHandle | null>;
  interaction: TilingInteractionCapabilities;
  layout: TilingLayoutNode;
  focusedLeafId: string | null;
  maximizedLeafId: string | null;
}): React.ReactElement {
  const tokens: SkinBottomBarTokens = SKIN_BOTTOM_BAR[skin];

  return (
    <div className={tokens.bar}>
      <BottomBarAccent skin={skin} />
      <HomeShortcuts
        commandHandleRef={commandHandleRef}
        layout={layout}
        focusedLeafId={focusedLeafId}
        maximizedLeafId={maximizedLeafId}
        interaction={interaction}
        skin={skin}
      />
      <span className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
        <span className={tokens.hintKbd}>dbl-click tab</span>
        <span className={tokens.hintText}>to maximize</span>
      </span>
    </div>
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
  const [skin, setSkin] = React.useState<HomeSkin>("mosaic");
  const commandHandleRef = React.useRef<TilingCommandHandle | null>(null);

  const dispatch = React.useCallback((command: TilingCommand): void => {
    commandHandleRef.current?.dispatch(command);
  }, []);

  const tiles: ReadonlyArray<TilingTile> = DOC_PANES.map(
    (pane): TilingTile => {
      const body: React.ReactNode =
        skin === "editorial" ? (
          <EditorialPaneContent paneId={pane.id} />
        ) : skin === "canvas" ? (
          <CanvasPaneContent paneId={pane.id} />
        ) : (
          pane.content
        );
      const content: React.ReactNode =
        pane.id === "intro" ? (
          <div className="flex flex-col gap-5">
            {body}
            <div className="flex flex-wrap items-center gap-2.5">
              <ShowcaseLink navigate={navigate} skin={skin} />
              <RepoLink skin={skin} />
            </div>
          </div>
        ) : (
          body
        );
      return {
        id: pane.id,
        title: pane.title,
        accent: pane.accent,
        content,
      };
    },
  );

  const tilesById: ReadonlyMap<string, TilingTile> = React.useMemo(
    (): ReadonlyMap<string, TilingTile> =>
      new Map(
        tiles.map((tile: TilingTile): [string, TilingTile] => [tile.id, tile]),
      ),
    [tiles],
  );

  // Interaction: the homepage keeps the library's own top tab strip OFF (the top
  // chrome bar owns pane switching) for every skin. The two light skins
  // (Editorial, Canvas) additionally hide the resize handles so the airy gutters
  // carry the separation (drag resize still works through the invisible hit area).
  const interaction: TilingInteractionCapabilities = React.useMemo(
    (): TilingInteractionCapabilities =>
      skin === "mosaic"
        ? { paneSwitching: { showTabStrip: false } }
        : {
            paneSwitching: { showTabStrip: false },
            resizeHandlesVisible: false,
          },
    [skin],
  );

  const background: React.CSSProperties =
    skin === "editorial"
      ? EDITORIAL_BACKGROUND
      : skin === "canvas"
        ? CANVAS_BACKGROUND
        : MOSAIC_BACKGROUND;

  return (
    <main
      className={`mosaic-rise flex h-screen max-h-screen min-h-0 w-full flex-col gap-2 overflow-hidden p-3 font-sans ${
        skin === "editorial"
          ? "text-[#241f17]"
          : skin === "canvas"
            ? "text-slate-700"
            : "text-stone-100"
      }`}
      style={background}
    >
      <HomeTopBar
        skin={skin}
        onSkinChange={setSkin}
        layout={layout}
        focusedLeafId={focusedLeafId}
        maximizedLeafId={maximizedLeafId}
        tilesById={tilesById}
        dispatch={dispatch}
      />
      <div className="min-h-0 min-w-0 flex-1">
        <TilingRenderer
          ref={commandHandleRef}
          layout={layout}
          tiles={tiles}
          config={LAYOUT_CONFIG}
          interaction={interaction}
          onLayoutChange={setLayout}
          themeId="mosaic"
          focusedLeafId={focusedLeafId}
          onFocusedLeafChange={setFocusedLeafId}
          maximizedLeafId={maximizedLeafId}
          onMaximizedLeafChange={setMaximizedLeafId}
          renderTile={(args: TilingRenderTileProps): React.ReactNode => {
            // Thread the live layout + the SAME command-dispatch ref the shortcut
            // bar uses + the tile registry into each skin's renderer, so every
            // skin paints its OWN grouped-stack representation (the library's
            // default group tab strip is suppressed). No public API is added —
            // group commands route through the existing `TilingCommandHandle`.
            const homeArgs: HomeTileProps = {
              ...args,
              layout,
              dispatch,
              tilesById,
            };
            return skin === "editorial" ? (
              <EditorialTile {...homeArgs} />
            ) : skin === "canvas" ? (
              <CanvasTile {...homeArgs} />
            ) : (
              <DocTile {...homeArgs} />
            );
          }}
        />
      </div>
      <HomeBottomBar
        skin={skin}
        commandHandleRef={commandHandleRef}
        interaction={interaction}
        layout={layout}
        focusedLeafId={focusedLeafId}
        maximizedLeafId={maximizedLeafId}
      />
    </main>
  );
}
