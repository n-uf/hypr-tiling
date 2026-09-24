import * as React from "react";
import {
  useWorkspaceSwipe,
  type TilingWorkspaceTab,
  type TilingWorkspaceTablistElementProps,
  type TilingWorkspaceSwipeSnapshot,
} from "@n-uf/hypr-tiling";
import { LIBRARY_VERSION } from "./changelog";
import { HOME_WORKSPACE_ID_CHANGELOG } from "./home-workspaces";
import type { HomeSkin } from "./page";

// Workspace tab strip for the homepage chrome. Spreads the headless
// `useTilingWorkspaceTabs` props (a11y + native drop targets) and paints the
// per-skin tokens plus a swipe-progress tick that follows `useWorkspaceSwipe`.
// Must render under `TilingWorkspaceSwipeScope` alongside the set-mode renderer.

interface WorkspaceTabChrome {
  readonly rail: string;
  readonly tabBase: string;
  readonly tabActive: string;
  readonly tabInactive: string;
  readonly tabDrop: string;
  readonly tabIndex: string;
  readonly swipeTick: string;
}

const WORKSPACE_TAB_CHROME: Record<HomeSkin, WorkspaceTabChrome> = {
  mosaic: {
    rail: "relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    tabBase:
      "relative flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] outline-none transition-colors",
    tabActive: "border-amber-300/55 bg-amber-300/10 text-amber-100",
    tabInactive:
      "border-white/[0.07] bg-white/[0.02] text-stone-400 hover:border-white/20 hover:text-stone-100",
    tabDrop: "border-amber-200 bg-amber-300/20 text-amber-50",
    tabIndex: "font-semibold opacity-70",
    swipeTick: "absolute bottom-0 left-0 h-0.5 rounded-full bg-amber-300/80",
  },
  editorial: {
    rail: "relative flex min-w-0 flex-1 items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    tabBase:
      "relative flex shrink-0 items-baseline gap-1.5 border-b-2 pb-0.5 pt-1 font-mono text-[10px] uppercase tracking-[0.16em] outline-none transition-colors",
    tabActive: "border-b-[#241f17] text-[#241f17]",
    tabInactive: "border-b-transparent text-[#9c8f77] hover:text-[#241f17]",
    tabDrop: "border-b-[#241f17] text-[#241f17]",
    tabIndex: "text-[#b0a487]",
    swipeTick: "absolute bottom-0 left-0 h-px bg-[#241f17]",
  },
  canvas: {
    rail: "relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    tabBase:
      "relative flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] outline-none transition-colors",
    tabActive: "border-cyan-300 bg-cyan-50 text-cyan-700",
    tabInactive:
      "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800",
    tabDrop: "border-cyan-400 bg-cyan-100 text-cyan-800",
    tabIndex: "font-semibold text-slate-400",
    swipeTick: "absolute bottom-0 left-0 h-0.5 rounded-full bg-cyan-400",
  },
};

function composeClassName(
  hookClassName: string | undefined,
  ...parts: ReadonlyArray<string>
): string {
  return [hookClassName, ...parts]
    .filter((part: string | undefined): part is string => part != null && part !== "")
    .join(" ");
}

function swipeTickStyle(
  tabs: ReadonlyArray<TilingWorkspaceTab>,
  swipe: TilingWorkspaceSwipeSnapshot,
): React.CSSProperties | null {
  if (tabs.length === 0) {
    return null;
  }
  if (swipe.phase === "idle") {
    return null;
  }
  const activeIndex: number = tabs.findIndex(
    (tab: TilingWorkspaceTab): boolean => tab.isActive,
  );
  if (activeIndex < 0) {
    return null;
  }
  const widthPercent: number = 100 / tabs.length;
  const shift: number = activeIndex + swipe.progress;
  return {
    width: `${widthPercent}%`,
    transform: `translateX(${shift * 100}%)`,
    opacity: Math.min(1, Math.abs(swipe.progress)),
  };
}

export function HomeWorkspaceTabStrip({
  skin,
  tabs,
  tablistProps,
}: {
  skin: HomeSkin;
  tabs: ReadonlyArray<TilingWorkspaceTab>;
  tablistProps: TilingWorkspaceTablistElementProps;
}): React.ReactElement {
  const tokens: WorkspaceTabChrome = WORKSPACE_TAB_CHROME[skin];
  const swipe: TilingWorkspaceSwipeSnapshot = useWorkspaceSwipe();
  const tickStyle: React.CSSProperties | null = swipeTickStyle(tabs, swipe);

  return (
    <div
      {...tablistProps}
      aria-label="workspaces"
      className={composeClassName(tablistProps.className, tokens.rail)}
    >
      {tabs.map((tab: TilingWorkspaceTab, index: number): React.ReactElement => {
        const stateClass: string = tab.isDropTarget
          ? tokens.tabDrop
          : tab.isActive
            ? tokens.tabActive
            : tokens.tabInactive;
        return (
          <button
            key={tab.workspace.id}
            {...tab.tabProps}
            className={composeClassName(
              tab.tabProps.className,
              tokens.tabBase,
              stateClass,
            )}
          >
            <span aria-hidden className={tokens.tabIndex}>
              {index + 1}
            </span>
            <span className="truncate">
              {tab.workspace.id === HOME_WORKSPACE_ID_CHANGELOG
                ? `${tab.workspace.name} \u00b7 ${LIBRARY_VERSION}`
                : tab.workspace.name}
            </span>
          </button>
        );
      })}
      {tickStyle != null ? (
        <span aria-hidden className={tokens.swipeTick} style={tickStyle} />
      ) : null}
    </div>
  );
}
