import * as React from "react";
import {
  TilingRenderer,
  TilingWorkspaceSwipeScope,
  WORKSPACE_KEY_BINDINGS,
  queryTilingLayout,
  resetWorkspaceLayout,
  useTilingWorkspaceSetController,
  useTilingWorkspaceTabs,
  workspaceSetEquals,
  type TilingCommand,
  type TilingCommandHandle,
  type TilingGroupTabMember,
  type TilingInteractionCapabilities,
  type TilingPaneTab,
  type TilingLayoutConfig,
  type TilingLayoutNode,
  type TilingPaneIdentityMode,
  type TilingRenderTileProps,
  type TilingTile,
  type TilingWorkspace,
  type TilingWorkspaceSet,
  type TilingWorkspaceSetController,
  type TilingWorkspaceSwitchEvent,
  type UseTilingWorkspaceTabsResult,
} from "@n-uf/hypr-tiling";
import {
  buildChangelogWidgetTiles,
  CHANGELOG_WIDGET_TILE_IDS,
  type HomeInspectorEvent,
} from "./changelog-widgets";
import { preloadRoute } from "./docs-route";
import { DOC_PANES, REPO_URL } from "./docs";
import { DocTile } from "./tile";
import { EditorialTile } from "./editorial-tile";
import { EditorialPaneContent } from "./content-editorial";
import { CanvasTile } from "./canvas-tile";
import { CanvasPaneContent } from "./content-canvas";
import { CANVAS_THEME, CANVAS_TICKS, HOME_GROUP_TAB_STRIP } from "./canvas-theme";
import { HomeShortcuts } from "./shortcuts";
import { HomeWorkspaceTabStrip } from "./home-workspace-tabs";
import {
  loadHomeWorkspaceBlob,
  type HomeLayoutHealOptions,
  type HomeWorkspaceHealResult,
} from "./home-layout-heal";
import {
  clearHomeLayoutSnapshot,
  corruptHomeWorkspaceSet,
  homeWorkspaceEnvelope,
  readHomeLayoutSnapshot,
  writeHomeLayoutSnapshot,
  type ScenarioHost,
} from "./home-scenarios";
import {
  clearHomeWorkspaceSet,
  HOME_WORKSPACE_SEED,
  HOME_WORKSPACE_STORAGE_KEY,
  mintHomeWorkspaceId,
  nextHomeWorkspaceName,
  parseHomeWorkspaceSetBlob,
  writeHomeWorkspaceSet,
} from "./home-workspaces";
import { ProofPane } from "./proof-pane";
import { ScenariosPane } from "./scenarios-pane";
import { MobileHome } from "./mobile-home/mobile-home";
import { MobileTopStrip } from "./mobile-home/top-strip";
import {
  readStoredMobileHomeMode,
  writeStoredMobileHomeMode,
} from "./mobile-home/mode-storage";
import { type MobileHomeMode } from "./mobile-home/types";
import {
  useIsCoarsePointer,
  useIsMobileHomeViewport,
} from "./mobile-home/use-viewport";

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
// shows the library's own pane tab strip only while a pane is maximized
// (`paneSwitching.showTabStrip: "maximized"`) so the other tiles stay one
// click away; at rest the top chrome bar carries the wordmark, the workspace
// tab strip (`useTilingWorkspaceTabs`), and the skin switch as site chrome. The home is a
// three-workspace set (Home · Workspaces · Changelog) so a first visit
// discovers workspaces by using the page.

// One label vocabulary for both library strips (group tabs and the maximized
// pane strip). Tile ids are the `DOC_PANES` ids; anything else keeps its title.
const HOME_TAB_LABELS: Readonly<Record<string, string>> = {
  intro: "hypr-tiling",
  discoverability: "SEO + LLM",
  features: "Features",
  install: "Install",
  usecases: "Use cases",
  proof: "Proof",
  scenarios: "Scenarios",
  workspaces: "Workspaces",
  "set-inspector": "Inspector",
  "swipe-meter": "Swipe",
};

function homeTabLabel(tileId: string, fallback: string): string {
  return HOME_TAB_LABELS[tileId] ?? fallback;
}

export type HomeSkin = "mosaic" | "editorial" | "canvas";

const LAYOUT_CONFIG: TilingLayoutConfig = {
  gapPx: 14,
  minPaneSizePx: 180,
  handleSizePx: 8,
};

const HOME_HEAL_OPTIONS: HomeLayoutHealOptions = {
  knownTileIds: [
    ...DOC_PANES.map((pane): string => pane.id),
    ...CHANGELOG_WIDGET_TILE_IDS,
  ],
  config: LAYOUT_CONFIG,
  containerWidthPx: 1440,
  containerHeightPx: 900,
};

const INITIAL_FOCUSED_LEAF_ID: string = "intro";

function activeWorkspaceLayout(
  set: TilingWorkspaceSet,
): TilingLayoutNode | null {
  const seated: TilingWorkspace | undefined = set.workspaces.find(
    (workspace: TilingWorkspace): boolean => workspace.id === set.activeId,
  );
  return seated?.layout ?? null;
}

function firstLeafIdInLayout(layout: TilingLayoutNode | null): string | null {
  if (layout == null) {
    return null;
  }
  const leafIds: ReadonlyArray<string> = queryTilingLayout(layout).leafIds;
  return leafIds[0] ?? null;
}

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
  readonly ctaSecondary: string;
  readonly resetEnabled: string;
  readonly resetDisabled: string;
}

const SKIN_CHROME: Record<HomeSkin, SkinChromeTokens> = {
  mosaic: {
    bar: "flex shrink-0 items-center gap-3 rounded-lg border border-white/[0.07] bg-[#121316]/90 px-3 py-1.5 shadow-[0_14px_36px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur",
    wordmark:
      "flex shrink-0 items-center px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/70",
    tabRail:
      "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    tabBase:
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] outline-none transition-colors",
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
    ctaSecondary:
      "group inline-flex w-fit items-center gap-2 rounded-md border border-white/15 bg-white/[0.02] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-stone-200 transition-[transform,border-color,background-color,color] duration-150 hover:-translate-y-px hover:border-amber-300/50 hover:bg-amber-300/[0.06] hover:text-amber-100",
    resetEnabled:
      "rounded-full px-3 py-1 text-stone-300 transition-colors hover:text-amber-100",
    resetDisabled: "rounded-full px-3 py-1 text-stone-600",
  },
  editorial: {
    bar: "flex shrink-0 items-center gap-3 rounded-[4px] border border-[#e2dac6] bg-[#fbf9f2] px-3.5 py-2 shadow-[0_1px_0_rgba(36,31,23,0.03),0_10px_28px_-24px_rgba(36,31,23,0.4)]",
    wordmark:
      "flex shrink-0 items-center px-1 font-display text-[13px] font-normal tracking-[0.02em] text-[#241f17]",
    tabRail:
      "flex min-w-0 flex-1 items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    tabBase:
      "flex shrink-0 items-baseline gap-1.5 border-b-2 pb-0.5 pt-1 font-mono text-[10px] uppercase tracking-[0.16em] outline-none transition-colors",
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
    ctaSecondary:
      "group inline-flex w-fit items-center gap-2 rounded-[3px] border border-[#c9bd9f] bg-transparent px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6b6250] transition-[transform,border-color,color] duration-150 hover:-translate-y-px hover:border-[#241f17] hover:text-[#241f17]",
    resetEnabled:
      "text-[#6b6250] transition-colors hover:text-[#241f17]",
    resetDisabled: "text-[#c9bd9f]",
  },
  canvas: {
    bar: "flex shrink-0 items-center gap-3 rounded-lg border border-slate-200 bg-white/90 px-3.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur",
    wordmark:
      "flex shrink-0 items-center px-1 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500",
    tabRail:
      "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    tabBase:
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] outline-none transition-colors",
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
    ctaSecondary:
      "group inline-flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-600 transition-[transform,border-color,color] duration-150 hover:-translate-y-px hover:border-slate-300 hover:text-slate-900",
    resetEnabled:
      "rounded px-3 py-1 text-slate-600 transition-colors hover:text-slate-900",
    resetDisabled: "rounded px-3 py-1 text-slate-300",
  },
};

const SKIN_OPTIONS: ReadonlyArray<{ id: HomeSkin; label: string }> = [
  { id: "mosaic", label: "Mosaic" },
  { id: "editorial", label: "Editorial" },
  { id: "canvas", label: "Canvas" },
];

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
// wordmark. Middle: the workspace tab strip (`useTilingWorkspaceTabs` — native
// drop targets, spring-load, swipe-progress tick) — OR, on a narrow/coarse
// mobile viewport, the mobile home mode switcher (Master / Swipe / Grid) in
// that same slot. Mobile concepts each paint their own pane navigation and
// already consume horizontal swipe (Fullscreen + Swipe), so the workspace
// strip stays desktop-only there. Right: the skin switch.
function HomeTopBar({
  skin,
  onSkinChange,
  workspaceTabs,
  isMobile,
  mobileMode,
  onMobileModeChange,
  onResetWorkspace,
  onResetAll,
  resetWorkspaceDisabled,
  resetAllDisabled,
  snapshotHeld,
  onRestoreSnapshot,
}: {
  skin: HomeSkin;
  onSkinChange: (next: HomeSkin) => void;
  workspaceTabs: UseTilingWorkspaceTabsResult;
  isMobile: boolean;
  mobileMode: MobileHomeMode;
  onMobileModeChange: (mode: MobileHomeMode) => void;
  onResetWorkspace: () => void;
  onResetAll: () => void;
  resetWorkspaceDisabled: boolean;
  resetAllDisabled: boolean;
  snapshotHeld: boolean;
  onRestoreSnapshot: () => void;
}): React.ReactElement {
  const tokens: SkinChromeTokens = SKIN_CHROME[skin];

  // Mobile: the ENTIRE top chrome collapses to one thin status-bar row
  // (wordmark · mode segments · skin menu — see `MobileTopStrip`). The desktop
  // workspace-tab rail is dropped here because each mobile concept paints its
  // own in-content pane navigation, and the skin pills fold into an overflow
  // menu, so nothing but a single ~44px strip stands between the top edge and
  // the content.
  if (isMobile) {
    return (
      <MobileTopStrip
        skin={skin}
        onSkinChange={onSkinChange}
        mode={mobileMode}
        onModeChange={onMobileModeChange}
      />
    );
  }

  return (
    <div className={tokens.bar}>
      <div aria-label="hypr tiling title" className={tokens.wordmark}>
        HYPR TILING
      </div>
      <HomeWorkspaceTabStrip
        skin={skin}
        tabs={workspaceTabs.tabs}
        tablistProps={workspaceTabs.tablistProps}
      />
      <div className={tokens.switchGroup} role="group" aria-label="Reset layout">
        {snapshotHeld ? (
          <button
            type="button"
            aria-label="Restore layout snapshot"
            onClick={onRestoreSnapshot}
            className={tokens.resetEnabled}
          >
            Restore
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Reset workspace"
          disabled={resetWorkspaceDisabled}
          onClick={onResetWorkspace}
          className={
            resetWorkspaceDisabled ? tokens.resetDisabled : tokens.resetEnabled
          }
        >
          Reset workspace
        </button>
        <button
          type="button"
          aria-label="Reset all"
          disabled={resetAllDisabled}
          onClick={onResetAll}
          className={resetAllDisabled ? tokens.resetDisabled : tokens.resetEnabled}
        >
          Reset all
        </button>
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

// The page-level bottom bar — DESKTOP only (the mobile home drops it entirely;
// see the render gate in `HomePage`, where each concept carries its own thin
// in-content controls instead of a second page-level bar). Left: a minimal
// per-skin accent mark. Center: the keyboard-shortcut strip (`HomeShortcuts`),
// suppressed on a coarse (touch) pointer since key-chord chips are inert without
// a physical keyboard. Right: the workspace-tab drop hint.
function HomeBottomBar({
  skin,
  commandHandleRef,
  interaction,
  layout,
  workspaceSet,
  focusedLeafId,
  maximizedLeafId,
  isCoarsePointer,
  resetWorkspaceDisabled,
  resetAllDisabled,
  onResetCommand,
}: {
  skin: HomeSkin;
  commandHandleRef: React.RefObject<TilingCommandHandle | null>;
  interaction: TilingInteractionCapabilities;
  layout: TilingLayoutNode | null;
  workspaceSet: TilingWorkspaceSet;
  focusedLeafId: string | null;
  maximizedLeafId: string | null;
  isCoarsePointer: boolean;
  resetWorkspaceDisabled: boolean;
  resetAllDisabled: boolean;
  onResetCommand: (scope: "workspace" | "all") => void;
}): React.ReactElement {
  const tokens: SkinBottomBarTokens = SKIN_BOTTOM_BAR[skin];

  return (
    <div className={tokens.bar}>
      <BottomBarAccent skin={skin} />
      {isCoarsePointer ? null : (
        <HomeShortcuts
          commandHandleRef={commandHandleRef}
          layout={layout}
          workspaceSet={workspaceSet}
          focusedLeafId={focusedLeafId}
          maximizedLeafId={maximizedLeafId}
          interaction={interaction}
          skin={skin}
          resetWorkspaceDisabled={resetWorkspaceDisabled}
          resetAllDisabled={resetAllDisabled}
          onResetCommand={onResetCommand}
        />
      )}
      {isCoarsePointer ? null : (
        <span className="ml-auto hidden shrink-0 items-center gap-3 sm:flex">
          <span className="flex items-center gap-2">
            <span className={tokens.hintKbd}>drag pane to tab</span>
            <span className={tokens.hintText}>to move</span>
          </span>
          <span className="flex items-center gap-2">
            <span className={tokens.hintKbd}>drag header onto a title bar</span>
            <span className={tokens.hintText}>to group</span>
          </span>
        </span>
      )}
    </div>
  );
}

export function HomePage({
  navigate,
}: {
  navigate?: (to: string) => void;
}): React.ReactElement {
  // Seed on first paint (SSR + hydration). Storage is applied after mount so
  // the prerendered tree stays deterministic: workspace 1 (Home) is active.
  const [workspaceDocument, setWorkspaceDocument] =
    React.useState<TilingWorkspaceSet>(HOME_WORKSPACE_SEED);
  const [focusedLeafId, setFocusedLeafId] = React.useState<string | null>(
    INITIAL_FOCUSED_LEAF_ID,
  );
  const [maximizedLeafId, setMaximizedLeafId] = React.useState<string | null>(
    null,
  );
  const [skin, setSkin] = React.useState<HomeSkin>("mosaic");
  const [inspectorEvent, setInspectorEvent] =
    React.useState<HomeInspectorEvent | null>(null);
  const [switchFlashNonce, setSwitchFlashNonce] = React.useState<number>(0);
  const commandHandleRef = React.useRef<TilingCommandHandle | null>(null);
  const hydratedStorageRef = React.useRef<boolean>(false);
  const [snapshotHeld, setSnapshotHeld] = React.useState<boolean>(false);
  // SSR and the hydration pass must use `"slot"` so pane bodies land in the HTML;
  // switch to `"stable"` after mount so tile-keyed state survives workspace changes.
  const [paneIdentity, setPaneIdentity] =
    React.useState<TilingPaneIdentityMode>("slot");
  React.useEffect((): void => {
    setPaneIdentity("stable");
  }, []);

  const onWorkspaceSwitch = React.useCallback(
    (event: TilingWorkspaceSwitchEvent): void => {
      setInspectorEvent({ kind: "switch", event });
      setSwitchFlashNonce((nonce: number): number => nonce + 1);
    },
    [],
  );

  const openDocsHref = React.useCallback(
    (to: string): void => {
      if (navigate == null) {
        return;
      }
      void preloadRoute("/docs").then((): void => {
        navigate(to);
      });
    },
    [navigate],
  );

  const onWorkspaceCommit = React.useCallback(
    (next: TilingWorkspaceSet): void => {
      setWorkspaceDocument(next);
      if (workspaceSetEquals(next, HOME_WORKSPACE_SEED)) {
        clearHomeWorkspaceSet();
      } else {
        writeHomeWorkspaceSet(next);
      }
    },
    [],
  );

  const workspaceController: TilingWorkspaceSetController =
    useTilingWorkspaceSetController({
      value: workspaceDocument,
      onCommit: onWorkspaceCommit,
      mintWorkspaceId: mintHomeWorkspaceId,
      nextWorkspaceName: nextHomeWorkspaceName,
      maxWorkspaces: 4,
      defaults: HOME_WORKSPACE_SEED,
    });

  const workspaceTabs: UseTilingWorkspaceTabsResult = useTilingWorkspaceTabs({
    workspaces: workspaceController.set,
    onWorkspacesChange: workspaceController.onWorkspacesChange,
    theme: skin === "canvas" ? CANVAS_THEME : undefined,
  });

  const resetWorkspaceDisabled: boolean =
    resetWorkspaceLayout(
      workspaceController.set,
      HOME_WORKSPACE_SEED,
      workspaceController.set.activeId,
    ) === workspaceController.set;
  const resetAllDisabled: boolean = workspaceController.atDefaults;

  const applyReset = React.useCallback(
    (scope: "workspace" | "all"): void => {
      const seated: TilingWorkspace | undefined =
        workspaceController.set.workspaces.find(
          (workspace: TilingWorkspace): boolean =>
            workspace.id === workspaceController.set.activeId,
        );
      const workspaceName: string =
        seated?.name ?? workspaceController.set.activeId;
      workspaceController.reset(scope);
      setInspectorEvent(
        scope === "workspace"
          ? { kind: "reset-workspace", workspaceName }
          : { kind: "reset-all" },
      );
      setSwitchFlashNonce((nonce: number): number => nonce + 1);
    },
    [workspaceController],
  );

  React.useEffect((): void => {
    if (hydratedStorageRef.current) {
      return;
    }
    hydratedStorageRef.current = true;
    if (readHomeLayoutSnapshot() != null) {
      setSnapshotHeld(true);
    }
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(HOME_WORKSPACE_STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (raw == null) {
      return;
    }
    const healed: HomeWorkspaceHealResult | null = loadHomeWorkspaceBlob(
      raw,
      HOME_HEAL_OPTIONS,
    );
    if (healed == null) {
      return;
    }
    if (healed.lines.length > 0) {
      onWorkspaceCommit(healed.set);
      return;
    }
    setWorkspaceDocument(healed.set);
  }, [onWorkspaceCommit]);

  React.useEffect((): (() => void) => {
    const flush = workspaceController.flush;
    const onPageHide = (): void => {
      flush();
    };
    window.addEventListener("pagehide", onPageHide);
    return (): void => {
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
  }, [workspaceController.flush]);

  const workspaceSetRef = React.useRef<TilingWorkspaceSet>(workspaceController.set);
  workspaceSetRef.current = workspaceController.set;
  const applyResetRef = React.useRef<(scope: "workspace" | "all") => void>(
    applyReset,
  );
  applyResetRef.current = applyReset;
  const commitRef = React.useRef<(next: TilingWorkspaceSet) => void>(
    onWorkspaceCommit,
  );
  commitRef.current = onWorkspaceCommit;

  const restoreSnapshot = React.useCallback((): void => {
    const raw: string | null = readHomeLayoutSnapshot();
    if (raw == null) {
      setSnapshotHeld(false);
      return;
    }
    const parsed: TilingWorkspaceSet | null = parseHomeWorkspaceSetBlob(raw);
    if (parsed != null) {
      onWorkspaceCommit(parsed);
    }
    clearHomeLayoutSnapshot();
    setSnapshotHeld(false);
  }, [onWorkspaceCommit]);

  const scenarioHost: ScenarioHost = {
    atDefaults: workspaceController.atDefaults,
    dispatch: (command: TilingCommand): void => {
      commandHandleRef.current?.dispatch(command);
    },
    resetAll: (): void => {
      applyResetRef.current("all");
    },
    holdSnapshot: (): void => {
      writeHomeLayoutSnapshot(homeWorkspaceEnvelope(workspaceSetRef.current));
      setSnapshotHeld(true);
    },
    writeBrokenLayout: (): void => {
      const broken: TilingWorkspaceSet = corruptHomeWorkspaceSet(
        workspaceSetRef.current,
      );
      try {
        window.localStorage.setItem(
          HOME_WORKSPACE_STORAGE_KEY,
          homeWorkspaceEnvelope(broken),
        );
      } catch {
        // Quota / private-mode: the heal step reports an empty key.
      }
    },
    loadAndHeal: (): ReadonlyArray<string> => {
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(HOME_WORKSPACE_STORAGE_KEY);
      } catch {
        raw = null;
      }
      if (raw == null) {
        return ["persistence key is empty"];
      }
      const healed: HomeWorkspaceHealResult | null = loadHomeWorkspaceBlob(
        raw,
        HOME_HEAL_OPTIONS,
      );
      if (healed == null) {
        return ["persisted blob did not parse"];
      }
      commitRef.current(healed.set);
      return healed.lines;
    },
  };

  const activeLayout: TilingLayoutNode | null = activeWorkspaceLayout(
    workspaceController.set,
  );

  React.useEffect((): void => {
    if (activeLayout == null) {
      if (focusedLeafId != null) {
        setFocusedLeafId(null);
      }
      if (maximizedLeafId != null) {
        setMaximizedLeafId(null);
      }
      return;
    }
    const leafIds: ReadonlyArray<string> = queryTilingLayout(activeLayout).leafIds;
    if (focusedLeafId == null || !leafIds.includes(focusedLeafId)) {
      setFocusedLeafId(firstLeafIdInLayout(activeLayout));
    }
    if (maximizedLeafId != null && !leafIds.includes(maximizedLeafId)) {
      setMaximizedLeafId(null);
    }
  }, [activeLayout, focusedLeafId, maximizedLeafId]);

  // Mobile home mode: which of the three mobile organization concepts
  // (Master + Rail / Fullscreen + Swipe / Pocket Grid) presents on a
  // narrow/coarse viewport. Read lazily from `localStorage` so a returning
  // visitor's choice persists; defaults to Master + Rail (`"master"`) when
  // unset. `isMobile` gates the mobile presentation entirely — wide/desktop
  // viewports never see this state at all, keeping the classic dwindle demo
  // exactly as it was.
  const [mobileMode, setMobileMode] = React.useState<MobileHomeMode>(
    readStoredMobileHomeMode,
  );
  const isMobile: boolean = useIsMobileHomeViewport();
  const isCoarsePointer: boolean = useIsCoarsePointer();

  const onMobileModeChange = React.useCallback((next: MobileHomeMode): void => {
    setMobileMode(next);
    writeStoredMobileHomeMode(next);
  }, []);

  const docTiles: ReadonlyArray<TilingTile> = DOC_PANES.map(
    (pane): TilingTile => {
      const body: React.ReactNode =
        pane.id === "proof" ? (
          <ProofPane skin={skin} />
        ) : pane.id === "scenarios" ? (
          <ScenariosPane
            skin={skin}
            host={scenarioHost}
            atDefaults={workspaceController.atDefaults}
            snapshotHeld={snapshotHeld}
            onRestore={restoreSnapshot}
          />
        ) : skin === "editorial" ? (
          <EditorialPaneContent paneId={pane.id} />
        ) : skin === "canvas" ? (
          <CanvasPaneContent paneId={pane.id} />
        ) : (
          pane.content
        );
      const content: React.ReactNode =
        pane.id === "intro" ? (
          <div className="flex min-h-full flex-col gap-2.5">
            {body}
            <div className="flex flex-wrap items-center gap-2.5">
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
  const widgetTiles: ReadonlyArray<TilingTile> = buildChangelogWidgetTiles({
    skin,
    workspaceSet: workspaceController.set,
    lastEvent: inspectorEvent,
    flashNonce: switchFlashNonce,
    navigate: navigate == null ? undefined : openDocsHref,
  });
  const tiles: ReadonlyArray<TilingTile> = [...docTiles, ...widgetTiles];

  const tilesById: ReadonlyMap<string, TilingTile> = React.useMemo(
    (): ReadonlyMap<string, TilingTile> =>
      new Map(
        tiles.map((tile: TilingTile): [string, TilingTile] => [tile.id, tile]),
      ),
    [tiles],
  );

  // Interaction: the homepage keeps the library's own pane tab strip OFF (the
  // top chrome bar owns workspace switching). Group tabs use the built-in
  // strip, themed per skin (`HOME_GROUP_TAB_STRIP`), placed above the header.
  // The two light skins (Editorial, Canvas) additionally hide the resize
  // handles so the airy gutters carry the separation (drag resize still works
  // through the invisible hit area). Workspace navigation is on: swipe, slide,
  // spring-load, and `WORKSPACE_KEY_BINDINGS` (Alt+1..9 / Alt+arrows) merged
  // into the default keymap — colliding chords (Alt+1..9) become workspace
  // switches.
  const interaction: TilingInteractionCapabilities = React.useMemo(
    (): TilingInteractionCapabilities => ({
      paneSwitching: {
        showTabStrip: "maximized",
        tabStrip: {
          placement: "top",
          theme: HOME_GROUP_TAB_STRIP[skin],
          renderTabLabel: (tab: TilingPaneTab): string =>
            homeTabLabel(tab.tileId, tab.title),
        },
      },
      maximize: { keepGroupTabStrip: true },
      grouping: {
        showGroupTabStrip: true,
        groupTabStrip: {
          placement: "top",
          theme: HOME_GROUP_TAB_STRIP[skin],
          renderTabLabel: (member: TilingGroupTabMember): string =>
            homeTabLabel(member.tileId, member.title),
        },
      },
      resizeHandlesVisible: skin === "mosaic",
      keyBindings: { bindings: [...WORKSPACE_KEY_BINDINGS] },
      workspaces: {
        enable: true,
        followMovedLeaf: true,
        switch: {
          wheelSwipe: { modifier: "meta" },
          touchSwipe: true,
          transition: "slide",
        },
        springLoad: { dwellMs: 450 },
      },
    }),
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
      className={`mosaic-rise flex h-screen max-h-screen min-h-0 w-full flex-col overflow-hidden font-sans ${
        isMobile ? "gap-1.5 p-1.5" : "gap-2 p-3"
      } ${
        skin === "editorial"
          ? "text-[#241f17]"
          : skin === "canvas"
            ? "text-slate-700"
            : "text-stone-100"
      }`}
      style={background}
    >
      <TilingWorkspaceSwipeScope>
        <HomeTopBar
          skin={skin}
          onSkinChange={setSkin}
          workspaceTabs={workspaceTabs}
          isMobile={isMobile}
          mobileMode={mobileMode}
          onMobileModeChange={onMobileModeChange}
          onResetWorkspace={(): void => {
            applyReset("workspace");
          }}
          onResetAll={(): void => {
            applyReset("all");
          }}
          resetWorkspaceDisabled={resetWorkspaceDisabled}
          resetAllDisabled={resetAllDisabled}
          snapshotHeld={snapshotHeld}
          onRestoreSnapshot={restoreSnapshot}
        />
        <div
          className="min-h-0 min-w-0 flex-1"
          {...workspaceTabs.panelProps(workspaceController.set.activeId)}
        >
          {isMobile ? (
            // Narrow/coarse viewport: one of the three mobile organization
            // concepts, each with its own independent `TilingRenderer`
            // instance/state (see `mobile-home/`) — the desktop workspace set
            // above is untouched. Same tiles, same skin, same renderTile.
            <MobileHome
              mode={mobileMode}
              tiles={tiles}
              tilesById={tilesById}
              skin={skin}
              renderTile={(args: TilingRenderTileProps): React.ReactNode =>
                skin === "editorial" ? (
                  <EditorialTile {...args} />
                ) : skin === "canvas" ? (
                  <CanvasTile {...args} />
                ) : (
                  <DocTile {...args} />
                )
              }
            />
          ) : (
            <TilingRenderer
              ref={commandHandleRef}
              workspaces={workspaceController.set}
              onWorkspacesChange={workspaceController.onWorkspacesChange}
              workspaceDefaults={HOME_WORKSPACE_SEED}
              tiles={tiles}
              config={LAYOUT_CONFIG}
              interaction={interaction}
              orphanTiles="report"
              paneIdentity={paneIdentity}
              inactiveWorkspaces="keep-mounted"
              // Canvas runs its full consumer-authored `TilingTheme` (the `theme`
              // prop takes precedence over `themeId`), so the renderer-owned
              // surfaces (root/viewport/divider/ghost shell) paint the Canvas desk
              // vocabulary too. Mosaic and Editorial keep the built-in `mosaic`
              // theme via `themeId` (Editorial's pane chrome is fully custom and
              // its renderer-owned surfaces stay transparent under `mosaic`).
              theme={skin === "canvas" ? CANVAS_THEME : undefined}
              themeId="mosaic"
              focusedLeafId={focusedLeafId}
              onFocusedLeafChange={setFocusedLeafId}
              maximizedLeafId={maximizedLeafId}
              onMaximizedLeafChange={setMaximizedLeafId}
              {...workspaceTabs.rendererProps}
              onWorkspaceSwitch={onWorkspaceSwitch}
              renderTile={(args: TilingRenderTileProps): React.ReactNode =>
                // Each skin's tile consumes the library `TilingRenderTileProps`
                // directly — group representation comes from `args.group`, drag
                // surfaces discriminate on `args.surface`. No prop threading.
                skin === "editorial" ? (
                  <EditorialTile {...args} />
                ) : skin === "canvas" ? (
                  <CanvasTile {...args} />
                ) : (
                  <DocTile {...args} />
                )
              }
            />
          )}
        </div>
        {isMobile ? null : (
          <HomeBottomBar
            skin={skin}
            commandHandleRef={commandHandleRef}
            interaction={interaction}
            layout={activeLayout}
            workspaceSet={workspaceController.set}
            focusedLeafId={focusedLeafId}
            maximizedLeafId={maximizedLeafId}
            isCoarsePointer={isCoarsePointer}
            resetWorkspaceDisabled={resetWorkspaceDisabled}
            resetAllDisabled={resetAllDisabled}
            onResetCommand={applyReset}
          />
        )}
      </TilingWorkspaceSwipeScope>
    </main>
  );
}
