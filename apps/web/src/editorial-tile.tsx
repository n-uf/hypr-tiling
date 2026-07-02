import * as React from "react";
import {
  TilingPaneRoot,
  TilingDragHandle,
  TilingPaneAction,
  TilingPaneBody,
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

// The EDITORIAL skin's pane chrome — the "paper & ink" counterpart to the
// Mosaic `DocTile`. It is a deliberate departure in EVERY chrome axis, not a
// recolor:
//
//   • Header vocabulary: DocTile wears an uppercase-mono workspace ordinal + a
//     divider tick + an uppercase-mono title. Here the header is a printed
//     FOLIO — a serif (Fraunces) title in sentence case with a "№ NN" folio
//     number and italic-serif state words ("moving"). Actions are small-caps
//     mono TEXT ("Group" / "Max" / "Restore"), not bordered icon boxes.
//   • Border / elevation: DocTile is a rounded matte ink card with an inset
//     sheen. Here it is a crisp near-white paper leaf with a hairline rim and a
//     single soft paper drop-shadow — flat, printed, quiet.
//   • Focus / drag / drop: DocTile signals with an amber ring + amber border.
//     Here the whole language is MONOCHROME INK — a focused leaf raises a 2px
//     ink rule along the header top and darkens its rim; move/drop states use
//     dashed and solid ink; only a genuine error (invalid drop) borrows a muted
//     clay so it stays semantically distinct.
//
// It stays fully interactive — drag (header), resize (renderer dividers),
// maximize + group (header actions), focus (pane root), multi-select
// (Alt/Opt+click header) — and is built on ONLY the public `@n-uf/hypr-tiling`
// `.` API and the helper primitives. The body renders `tile.content` (the
// editorial content supplied by the page) through `TilingPaneBody`, so the drag
// ghost reuses the same render path.

const DROP_TARGET_RING: string = "ring-1 ring-[#241f17]/45";
const DROP_HOVER_RING: string = "ring-1 ring-[#241f17]/25";
const DROP_ELIGIBLE_RING: string = "ring-1 ring-dashed ring-[#c1b48f]";
const INVALID_DROP_RING: string = "ring-2 ring-[#a8543a]/55";

function dropStateRing(args: TilingRenderTileProps): string {
  if (args.isInvalidDrop) {
    return INVALID_DROP_RING;
  }
  if (args.isDropTarget) {
    return DROP_TARGET_RING;
  }
  if (args.isHoveringDropCandidate) {
    return DROP_HOVER_RING;
  }
  if (args.isDropEligible) {
    return DROP_ELIGIBLE_RING;
  }
  return "";
}

// The Editorial grouped-stack representation: a printed folio-run of member
// entries in the pane FOOTER — a "NN title" per member in the paper/ink
// vocabulary, the active member set in ink with an ink underline, the rest in
// quiet clay. Replaces the library's suppressed default group tab strip for the
// Editorial skin. Click an entry → `group-tab-jump`; a hover-revealed "×" ejects
// a member (`remove-from-group`); a trailing "ungroup" dissolves the group
// (`ungroup`). Routes through the shared `dispatch` ref — no public API added.
function EditorialGroupSwitcher({
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
    <span className="flex min-w-0 shrink items-baseline gap-2 overflow-hidden font-mono text-[10px] uppercase tracking-[0.14em]">
      <span aria-hidden className="shrink-0 text-[#b0a487]">
        grp
      </span>
      <span className="flex shrink items-baseline gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {members.map((member: GroupMemberView): React.ReactElement => (
          <span
            key={member.memberId}
            className="group/folio flex shrink-0 items-baseline gap-1"
          >
            <TilingPaneAction
              onClick={(): void => dispatch(commands.jump(member.memberNumber))}
              aria-label={`activate ${member.title}`}
              aria-pressed={member.isActive}
              title={member.title}
              className={`flex items-baseline gap-1 transition-colors ${
                member.isActive
                  ? "text-[#241f17] underline decoration-[#241f17] underline-offset-[3px]"
                  : "text-[#9c8f77] hover:text-[#241f17]"
              }`}
            >
              <span className="tabular-nums text-[#b0a487]">
                {String(member.memberNumber).padStart(2, "0")}
              </span>
              <span className="max-w-[9ch] truncate">{member.title}</span>
            </TilingPaneAction>
            <TilingPaneAction
              onClick={(): void => dispatch(commands.remove(member.memberId))}
              aria-label={`remove ${member.title} from group`}
              title={`remove ${member.title} from group`}
              className="hidden text-[#a89c83] transition-colors hover:text-[#a8543a] group-hover/folio:inline"
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
        className="shrink-0 text-[#9c8f77] underline decoration-transparent underline-offset-[3px] transition-colors hover:text-[#241f17] hover:decoration-[#241f17]"
      >
        ungroup
      </TilingPaneAction>
    </span>
  );
}

export function EditorialTile(args: HomeTileProps): React.ReactElement {
  const dropRing: string = dropStateRing(args);
  const group: TilingGroupNode | null = resolveActiveGroup(
    args.layout,
    args.leafId,
  );
  const ring: string =
    dropRing !== ""
      ? dropRing
      : args.isFocused
        ? "ring-1 ring-[#241f17]/15"
        : "";
  const border: string = args.isMoveSource
    ? "border-[#241f17]/70 border-dashed"
    : args.isFocused
      ? "border-[#241f17]/45"
      : "border-[#e2dac6]";
  const sourceFade: string = args.isDragSource ? "opacity-60" : "";
  const folio: string = String(args.paneOrdinal).padStart(2, "0");
  const metrics: PaneContentMetrics | null = paneContentMetrics(args.tile.id);

  return (
    <TilingPaneRoot
      pane={args}
      className={`flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[4px] border bg-[#fbf9f2] text-[#4b4335] shadow-[0_1px_0_rgba(36,31,23,0.03),0_10px_28px_-22px_rgba(36,31,23,0.4)] outline-none transition-[border-color,box-shadow,opacity] duration-200 ${border} ${ring} ${sourceFade}`}
    >
      <TilingDragHandle
        pane={args}
        className={`flex shrink-0 cursor-grab select-none items-baseline justify-between gap-3 border-t-2 border-b px-4 py-2.5 active:cursor-grabbing ${
          args.isFocused
            ? "border-t-[#241f17] border-b-[#d7ccb2]"
            : "border-t-transparent border-b-[#ece4d2]"
        } ${
          args.isMultiSelected
            ? "outline-dashed outline-1 -outline-offset-[3px] outline-[#241f17]/35"
            : ""
        }`}
      >
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span
            aria-hidden
            className="shrink-0 font-mono text-[10px] tabular-nums tracking-[0.14em] text-[#b0a487]"
          >
            {"\u2116 "}
            {folio}
          </span>
          <span className="truncate font-display text-[14px] font-normal leading-none text-[#241f17]">
            {args.tile.title}
          </span>
          {args.isMoveSource ? (
            <span className="shrink-0 font-display text-[12px] italic text-[#8c8069]">
              moving…
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {args.isMultiSelected ? (
            <span
              aria-label={`pane ${args.leafId} selected`}
              title="selected (Alt/Opt+click to deselect)"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border border-[#241f17]/55 font-mono text-[10px] leading-none text-[#241f17]"
            >
              <span aria-hidden>{"\u2713"}</span>
            </span>
          ) : null}
          {args.isMultiSelected && args.canGroupMultiSelection ? (
            <TilingPaneAction
              onClick={(): void => args.onGroupMultiSelection(args.leafId)}
              aria-label={`group ${args.leafId} with the selected panes`}
              title="group selected panes into a tabbed group"
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8c8069] underline decoration-transparent underline-offset-[3px] transition-colors hover:text-[#241f17] hover:decoration-[#241f17]"
            >
              Group
            </TilingPaneAction>
          ) : null}
          {args.isMaximizeEnabled ? (
            <TilingPaneAction
              onClick={(): void => args.onToggleMaximize()}
              aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
              title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8c8069] underline decoration-transparent underline-offset-[3px] transition-colors hover:text-[#241f17] hover:decoration-[#241f17]"
            >
              {args.isMaximized ? "Restore" : "Max"}
            </TilingPaneAction>
          ) : null}
        </span>
      </TilingDragHandle>
      <TilingPaneBody
        pane={args}
        className="min-h-0 flex-1 overflow-auto px-5 py-4 text-[13px] leading-[1.75] text-[#4b4335]"
      >
        {args.tile.content}
      </TilingPaneBody>
      {/* Content-metrics footer: the pane's real content metrics (chars · words
          · ~read-time) from the shared docs model, set in the Editorial paper
          mono-smallcaps vocabulary with printed middot separators. Panes with no
          measurable text degrade to a quiet colophon label. */}
      <div className="flex shrink-0 items-baseline justify-between gap-3 border-t border-[#ece4d2] px-4 py-1.5">
        <span
          aria-hidden
          className="shrink-0 font-mono text-[10px] tabular-nums tracking-[0.14em] text-[#b0a487]"
        >
          {"\u2116 "}
          {folio}
        </span>
        {group != null ? (
          <EditorialGroupSwitcher
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
            className="flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8c8069]"
          >
            <span className="shrink-0 tabular-nums">
              <span className="text-[#4b4335]">
                {metrics.chars.toLocaleString("en-US")}
              </span>{" "}
              ch
            </span>
            <span aria-hidden className="text-[#c9bd9f]">
              ·
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="text-[#4b4335]">
                {metrics.words.toLocaleString("en-US")}
              </span>{" "}
              w
            </span>
            <span aria-hidden className="text-[#c9bd9f]">
              ·
            </span>
            <span className="shrink-0 tabular-nums text-[#4b4335]">
              {"~"}
              {metrics.readMinutes} min read
            </span>
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0a487]">
            no text metrics
          </span>
        )}
      </div>
    </TilingPaneRoot>
  );
}
