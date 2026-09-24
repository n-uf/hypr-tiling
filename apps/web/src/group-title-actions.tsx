import * as React from "react";
import {
  TilingPaneAction,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";
import { CANVAS_THEME } from "./canvas-theme";

// Modifier-free grouping cluster for the docs-site tile title bars. One
// component, three skins: the icon is select / add / remove, or ungroup when
// this pane already sits in a tab group and no selection is in progress.
// Alt/Opt-click stays on the drag handle; Alt+G stays on the library keymap.

const GROUP_WITH_LABEL: string = "Group with\u2026";
const ADD_TO_SELECTION_LABEL: string = "Add to group selection";
const REMOVE_FROM_SELECTION_LABEL: string = "Remove from selection";
const UNGROUP_LABEL: string = "Ungroup";
const GROUP_COMMIT_LABEL: string = "Group";
const CANCEL_SELECTION_LABEL: string = "Cancel";

type GroupIconKind = "start" | "add" | "remove" | "ungroup";

export type GroupTitleSkin = "mosaic" | "editorial" | "canvas";

interface GroupTitleSkinTokens {
  readonly icon: string;
  readonly iconPressed: string;
  readonly commit: string;
  readonly cancel: string;
  readonly glyph: string;
}

const GROUP_TITLE_SKIN: Record<GroupTitleSkin, GroupTitleSkinTokens> = {
  mosaic: {
    icon: "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.02] text-stone-400 transition-colors hover:border-amber-300/45 hover:bg-amber-300/10 hover:text-amber-100",
    iconPressed:
      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-300/55 bg-amber-300/15 text-amber-100 [&_rect]:fill-current",
    commit:
      "flex h-6 shrink-0 items-center justify-center rounded-md border border-amber-300/45 bg-amber-300/10 px-2 font-mono text-[10px] uppercase leading-none tracking-[0.12em] text-amber-100 transition-colors hover:border-amber-300/70 hover:bg-amber-300/20",
    cancel:
      "flex h-6 shrink-0 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.02] px-2 font-mono text-[10px] uppercase leading-none tracking-[0.12em] text-stone-400 transition-colors hover:border-white/25 hover:text-stone-100",
    glyph: "h-3.5 w-3.5",
  },
  editorial: {
    icon: "flex h-4 w-4 shrink-0 items-center justify-center text-[#8c8069] transition-colors hover:text-[#241f17]",
    iconPressed:
      "flex h-4 w-4 shrink-0 items-center justify-center text-[#241f17] [&_rect]:fill-current",
    commit:
      "shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8c8069] underline decoration-transparent underline-offset-[3px] transition-colors hover:text-[#241f17] hover:decoration-[#241f17]",
    cancel:
      "shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[#a89c83] underline decoration-transparent underline-offset-[3px] transition-colors hover:text-[#241f17] hover:decoration-[#241f17]",
    glyph: "h-3.5 w-3.5",
  },
  canvas: {
    icon: `flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[1px] border transition-colors ${CANVAS_THEME.paneHeader.controlIdle}`,
    iconPressed: `flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[1px] border transition-colors [&_rect]:fill-current ${CANVAS_THEME.paneHeader.controlActive}`,
    commit:
      "flex h-[18px] shrink-0 items-center justify-center rounded-[1px] border border-slate-300 bg-white px-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.14em] text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-800",
    cancel:
      "flex h-[18px] shrink-0 items-center justify-center rounded-[1px] border border-slate-200 bg-slate-50 px-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.14em] text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-700",
    glyph: "h-2.5 w-2.5",
  },
};

// Selected leaf ids, refcounted so a keep-mounted workspace copy of the same
// pane does not clear the flag when one instance unmounts. Tiles render as
// siblings under the renderer with no shared parent we own, so a module store
// is what lets a non-selected pane see "selection active elsewhere".
const selectedLeafCounts: Map<string, number> = new Map<string, number>();
const selectionListeners: Set<() => void> = new Set<() => void>();
let selectionVersion: number = 0;

function emitGroupSelection(): void {
  selectionVersion += 1;
  selectionListeners.forEach((listener: () => void): void => {
    listener();
  });
}

function subscribeGroupSelection(listener: () => void): () => void {
  selectionListeners.add(listener);
  return (): void => {
    selectionListeners.delete(listener);
  };
}

function getGroupSelectionVersion(): number {
  return selectionVersion;
}

function registerSelectedLeaf(leafId: string): () => void {
  const nextCount: number = (selectedLeafCounts.get(leafId) ?? 0) + 1;
  selectedLeafCounts.set(leafId, nextCount);
  emitGroupSelection();
  return (): void => {
    const remaining: number = (selectedLeafCounts.get(leafId) ?? 1) - 1;
    if (remaining <= 0) {
      selectedLeafCounts.delete(leafId);
    } else {
      selectedLeafCounts.set(leafId, remaining);
    }
    emitGroupSelection();
  };
}

function selectionActiveElsewhere(leafId: string): boolean {
  for (const [id, count] of selectedLeafCounts) {
    if (count > 0 && id !== leafId) {
      return true;
    }
  }
  return false;
}

function groupIconKind(
  pane: TilingRenderTileProps,
  elsewhere: boolean,
): GroupIconKind {
  if (pane.isMultiSelected) {
    return "remove";
  }
  if (elsewhere || pane.canGroupMultiSelection) {
    return "add";
  }
  if (pane.group != null && pane.group.members.length >= 2) {
    return "ungroup";
  }
  return "start";
}

function groupIconLabel(kind: GroupIconKind): string {
  switch (kind) {
    case "start":
      return GROUP_WITH_LABEL;
    case "add":
      return ADD_TO_SELECTION_LABEL;
    case "remove":
      return REMOVE_FROM_SELECTION_LABEL;
    case "ungroup":
      return UNGROUP_LABEL;
  }
}

function GroupTilesGlyph({ className }: { className: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7V5c0-1.1.9-2 2-2h2" />
      <path d="M17 3h2c1.1 0 2 .9 2 2v2" />
      <path d="M21 17v2c0 1.1-.9 2-2 2h-2" />
      <path d="M7 21H5c-1.1 0-2-.9-2-2v-2" />
      <rect width="7" height="5" x="7" y="7" rx="1" />
      <rect width="7" height="5" x="10" y="12" rx="1" />
    </svg>
  );
}

function UngroupTilesGlyph({ className }: { className: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="8" height="6" x="5" y="4" rx="1" />
      <rect width="8" height="6" x="11" y="14" rx="1" />
    </svg>
  );
}

function onGroupIconClick(pane: TilingRenderTileProps, kind: GroupIconKind): void {
  if (kind === "ungroup") {
    pane.group?.ungroup();
    return;
  }
  pane.onToggleMultiSelect();
}

export function GroupTitleActions({
  pane,
  skin,
}: {
  pane: TilingRenderTileProps;
  skin: GroupTitleSkin;
}): React.ReactElement | null {
  const selectionVersionNow: number = React.useSyncExternalStore(
    subscribeGroupSelection,
    getGroupSelectionVersion,
    getGroupSelectionVersion,
  );
  React.useEffect((): (() => void) | void => {
    if (
      pane.surface !== "pane" ||
      !pane.isMultiSelectGroupingEnabled ||
      !pane.isMultiSelected
    ) {
      return;
    }
    return registerSelectedLeaf(pane.leafId);
  }, [
    pane.surface,
    pane.isMultiSelectGroupingEnabled,
    pane.isMultiSelected,
    pane.leafId,
  ]);

  if (pane.surface !== "pane" || !pane.isMultiSelectGroupingEnabled) {
    return null;
  }

  const elsewhere: boolean = selectionActiveElsewhere(pane.leafId);
  void selectionVersionNow;
  const kind: GroupIconKind = groupIconKind(pane, elsewhere);
  const label: string = groupIconLabel(kind);
  const pressed: boolean = kind === "remove";
  const tokens: GroupTitleSkinTokens = GROUP_TITLE_SKIN[skin];
  const showCommit: boolean =
    pane.isMultiSelected && pane.canGroupMultiSelection;

  return (
    <>
      <TilingPaneAction
        aria-label={label}
        title={label}
        aria-pressed={pressed}
        onClick={(): void => onGroupIconClick(pane, kind)}
        className={pressed ? tokens.iconPressed : tokens.icon}
      >
        {kind === "ungroup" ? (
          <UngroupTilesGlyph className={tokens.glyph} />
        ) : (
          <GroupTilesGlyph className={tokens.glyph} />
        )}
      </TilingPaneAction>
      {showCommit ? (
        <TilingPaneAction
          onClick={(): void => pane.onGroupMultiSelection(pane.leafId)}
          aria-label={GROUP_COMMIT_LABEL}
          title="group selected panes into a tabbed group"
          className={tokens.commit}
        >
          {GROUP_COMMIT_LABEL}
        </TilingPaneAction>
      ) : null}
      {showCommit ? (
        <TilingPaneAction
          onClick={(): void => pane.onClearMultiSelection()}
          aria-label={CANCEL_SELECTION_LABEL}
          title="clear the group selection"
          className={tokens.cancel}
        >
          {CANCEL_SELECTION_LABEL}
        </TilingPaneAction>
      ) : null}
    </>
  );
}
