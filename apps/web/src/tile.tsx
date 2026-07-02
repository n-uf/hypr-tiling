import * as React from "react";
import {
  isMultiSelectModifierActive,
  TilingPaneAction,
  type TilingCommand,
  type TilingGroupNode,
  type TilingRenderTileProps,
  type TilingTile,
} from "@n-uf/hypr-tiling";
import { paneContentMetrics, type PaneContentMetrics } from "./pane-metrics";
import {
  groupCommands,
  groupMemberViews,
  resolveActiveGroup,
  type GroupMemberView,
  type HomeTileProps,
} from "./group-switcher";

// Custom pane renderer for the homepage ("mosaic" identity) — a worked example
// of a fully custom pane frame + header (see the /docs "custom look-and-feel"
// guide). The body honors the renderer's canonical `paneBodyRenderMode` (the
// single source of truth shared by every drag surface), so the in-tree pane and
// the drag ghost paint identically and the ghost is never an empty-bodied shell.
// The content toggle is off by the library default
// (`paneSwitching.showContentToggle: false`), so the renderer pins
// content-visible at rest and `render-content` resolves without any config — the
// prerendered HTML still carries the documentation content (SEO intact). The
// renderer still owns layout, splits, resize, drag mechanics, focus, and keyboard
// control; this component only paints one pane's chrome + content and forwards
// the drag/focus/maximize/multi-select handles.
//
// Form vocabulary: a flat matte ink surface (no glass blur), a hairline rim, a
// monospace workspace ordinal (01, 02, …) echoing a tiling-WM workspace index,
// and a single gold accent that appears ONLY on interaction — focus, hover,
// drag, and the move/drop affordances. The root is an `<article data-leaf-id>`
// because the renderer's drag pickup resolves the source pane via
// `closest("article[data-leaf-id]")`.

function dropStateRing(args: TilingRenderTileProps): string {
  if (args.isInvalidDrop) {
    return "ring-2 ring-rose-300/55";
  }
  if (args.isDropTarget) {
    return "ring-2 ring-amber-300/55";
  }
  if (args.isHoveringDropCandidate) {
    return "ring-1 ring-amber-200/45";
  }
  if (args.isDropEligible) {
    return "ring-1 ring-dashed ring-amber-300/25";
  }
  return "";
}

// The Mosaic grouped-stack representation: a compact row of member chips in the
// pane FOOTER (mono smallcaps ordinal + truncated title, gold-lit when active),
// replacing the library's suppressed default group tab strip for this skin.
// Click a chip → `group-tab-jump` activates that member; a hover-revealed "×"
// per chip ejects it (`remove-from-group`); a trailing "ungroup" chip dissolves
// the group (`ungroup`). All route through the shared `dispatch` ref — no public
// API is added. Only the group's active member renders, so this shows once.
function MosaicGroupSwitcher({
  group,
  tilesById,
  dispatch,
}: {
  group: TilingGroupNode;
  tilesById: ReadonlyMap<string, TilingTile>;
  dispatch: (command: TilingCommand) => void;
}): React.ReactElement {
  const members: ReadonlyArray<GroupMemberView> = groupMemberViews(
    group,
    tilesById,
  );
  const commands = groupCommands(group.id);
  return (
    <span className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden">
      <span
        aria-hidden
        className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-600"
      >
        grp
      </span>
      <span className="flex shrink items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {members.map((member: GroupMemberView): React.ReactElement => (
          <span
            key={member.memberId}
            className="group/tab flex shrink-0 items-center"
          >
            <TilingPaneAction
              onClick={(): void => dispatch(commands.jump(member.memberNumber))}
              aria-label={`activate ${member.title}`}
              aria-pressed={member.isActive}
              title={member.title}
              className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors ${
                member.isActive
                  ? "border-amber-300/55 bg-amber-300/10 text-amber-100"
                  : "border-white/[0.08] bg-white/[0.02] text-stone-400 hover:border-white/20 hover:text-stone-100"
              }`}
            >
              <span className="font-semibold tabular-nums opacity-70">
                {String(member.memberNumber).padStart(2, "0")}
              </span>
              <span className="max-w-[9ch] truncate">{member.title}</span>
            </TilingPaneAction>
            <TilingPaneAction
              onClick={(): void => dispatch(commands.remove(member.memberId))}
              aria-label={`remove ${member.title} from group`}
              title={`remove ${member.title} from group`}
              className="ml-0.5 hidden rounded border border-white/10 px-1 py-0.5 font-mono text-[9px] leading-none text-stone-500 transition-colors hover:border-rose-400/50 hover:text-rose-200 group-hover/tab:inline-flex"
            >
              <span aria-hidden>{"\u00d7"}</span>
            </TilingPaneAction>
          </span>
        ))}
      </span>
      <TilingPaneAction
        onClick={(): void => dispatch(commands.ungroup())}
        aria-label={`ungroup ${group.id}`}
        title="ungroup this stack"
        className="shrink-0 rounded border border-white/[0.08] bg-white/[0.02] px-1 py-0.5 font-mono text-[9px] uppercase leading-none tracking-[0.12em] text-stone-400 transition-colors hover:border-amber-300/40 hover:text-amber-100"
      >
        ungroup
      </TilingPaneAction>
    </span>
  );
}

export function DocTile(args: HomeTileProps): React.ReactElement {
  const dropRing: string = dropStateRing(args);
  const group: TilingGroupNode | null = resolveActiveGroup(
    args.layout,
    args.leafId,
  );
  // Drop-state rings take precedence over the resting focus ring during a drag.
  const ring: string =
    dropRing !== "" ? dropRing : args.isFocused ? "ring-1 ring-amber-300/35" : "";
  const border: string = args.isMoveSource
    ? "border-amber-300/60 border-dashed"
    : args.isFocused
      ? "border-amber-300/45"
      : "border-white/[0.07]";
  const sourceFade: string = args.isDragSource ? "opacity-60" : "";
  const ordinal: string = String(args.paneOrdinal).padStart(2, "0");
  const metrics: PaneContentMetrics | null = paneContentMetrics(args.tile.id);

  return (
    <article
      data-leaf-id={args.leafId}
      tabIndex={-1}
      onFocus={args.onFocus}
      onPointerMove={args.onPointerMove}
      onPointerLeave={args.onPointerLeave}
      className={`flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border bg-[#121316] outline-none shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] ring-offset-0 transition-[border-color,box-shadow,opacity] duration-200 ${border} ${ring} ${sourceFade}`}
    >
      <header
        onPointerDown={args.onHandlePointerDown}
        onClick={(event: React.MouseEvent<HTMLElement>): void => {
          // Alt/Opt+click toggles this pane's multi-selection membership
          // WITHOUT changing focus. The renderer's `onHandlePointerDown` already
          // `preventDefault`s the modified press, so native focus never fires and
          // `onFocus` (which would clear the selection) never runs — the toggle is
          // preserved. A plain click falls through to the article focus unchanged.
          if (
            args.isMultiSelectGroupingEnabled &&
            isMultiSelectModifierActive(event)
          ) {
            event.stopPropagation();
            event.preventDefault();
            args.onToggleMultiSelect();
          }
        }}
        className={`flex shrink-0 cursor-grab touch-none select-none items-center justify-between gap-2 border-b px-3.5 py-2 transition-colors active:cursor-grabbing ${
          args.isFocused
            ? "border-b-amber-300/25 bg-amber-300/[0.04]"
            : "border-b-white/[0.06] bg-white/[0.012]"
        } ${
          args.isMultiSelected
            ? "outline-dashed outline-1 -outline-offset-2 outline-stone-300/55 bg-stone-300/[0.05]"
            : ""
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={`shrink-0 font-mono text-[10px] tabular-nums tracking-[0.1em] ${
              args.isFocused ? "text-amber-300/80" : "text-stone-500"
            }`}
          >
            {ordinal}
          </span>
          <span aria-hidden className="h-3 w-px shrink-0 bg-white/10" />
          <span className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-stone-200">
            {args.tile.title}
          </span>
          {args.isMoveSource ? (
            <span className="shrink-0 rounded border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-200">
              moving
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {args.isMultiSelected ? (
            <span
              aria-label={`pane ${args.leafId} selected`}
              title="selected (Alt/Opt+click to deselect)"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-stone-300/45 bg-stone-300/[0.08] font-mono text-[11px] leading-none text-stone-200"
            >
              <span aria-hidden>{"\u2713"}</span>
            </span>
          ) : null}
          {args.isMultiSelected && args.canGroupMultiSelection ? (
            <button
              type="button"
              onPointerDown={(
                event: React.PointerEvent<HTMLButtonElement>,
              ): void => {
                event.stopPropagation();
              }}
              onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                event.stopPropagation();
                args.onGroupMultiSelection(args.leafId);
              }}
              aria-label={`group ${args.leafId} with the selected panes`}
              title="group selected panes into a tabbed group"
              className="flex h-6 shrink-0 items-center justify-center rounded-md border border-amber-300/45 bg-amber-300/10 px-2 font-mono text-[10px] uppercase leading-none tracking-[0.12em] text-amber-100 transition-colors hover:border-amber-300/70 hover:bg-amber-300/20"
            >
              Group
            </button>
          ) : null}
          {args.isMaximizeEnabled ? (
            <button
              type="button"
              onPointerDown={(
                event: React.PointerEvent<HTMLButtonElement>,
              ): void => {
                event.stopPropagation();
              }}
              onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                event.stopPropagation();
                args.onToggleMaximize();
              }}
              aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
              title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.02] font-mono text-[11px] leading-none text-stone-400 transition-colors hover:border-amber-300/45 hover:bg-amber-300/10 hover:text-amber-100"
            >
              <span aria-hidden>{args.isMaximized ? "\u2715" : "\u2922"}</span>
            </button>
          ) : null}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {args.paneBodyRenderMode === "render-content" ? args.tile.content : null}
      </div>
      {/* Content-metrics footer: the pane's real content metrics (chars · words
          · ~read-time) from the shared docs model, in the Mosaic dark-ink mono
          vocabulary. Panes with no measurable text degrade to a quiet label. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.012] px-3.5 py-1.5">
        <span
          aria-hidden
          className={`shrink-0 font-mono text-[9px] tabular-nums tracking-[0.16em] ${
            args.isFocused ? "text-amber-300/70" : "text-stone-600"
          }`}
        >
          {ordinal}
        </span>
        {group != null ? (
          <MosaicGroupSwitcher
            group={group}
            tilesById={args.tilesById}
            dispatch={args.dispatch}
          />
        ) : null}
        {metrics != null ? (
          <span
            aria-label={`${metrics.chars.toLocaleString("en-US")} characters, ${metrics.words.toLocaleString(
              "en-US",
            )} words, about ${metrics.readMinutes} minute read`}
            className="flex min-w-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500"
          >
            <span className="shrink-0 tabular-nums">
              <span className="text-stone-300">
                {metrics.chars.toLocaleString("en-US")}
              </span>{" "}
              ch
            </span>
            <span aria-hidden className="h-2.5 w-px shrink-0 bg-white/10" />
            <span className="shrink-0 tabular-nums">
              <span className="text-stone-300">
                {metrics.words.toLocaleString("en-US")}
              </span>{" "}
              w
            </span>
            <span aria-hidden className="h-2.5 w-px shrink-0 bg-white/10" />
            <span className="shrink-0 tabular-nums text-stone-300">
              {"~"}
              {metrics.readMinutes} min
            </span>
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-stone-600">
            no text metrics
          </span>
        )}
      </div>
    </article>
  );
}
