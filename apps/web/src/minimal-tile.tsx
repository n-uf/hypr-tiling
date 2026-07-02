import * as React from "react";
import {
  TilingPaneRoot,
  TilingDragHandle,
  TilingPaneAction,
  TilingPaneBody,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// A LIGHT, minimalist custom pane — the alternate homepage chrome the "panes"
// switch flips to. It is the honest dogfood that the cleaned consumer
// `renderTile` contract is genuinely easy: it is built with ONLY the public
// `@n-uf/hypr-tiling` `.` API and the helper primitives (TilingPaneRoot /
// TilingDragHandle / TilingPaneAction / TilingPaneBody) — no debug/observability
// fields, no internal imports. The primitives encode the three wiring rules
// (data-leaf-id root + focus/hover handlers, drag handle + touch-action, action
// buttons that stop propagation, body render-mode gate), so this whole pane is
// declarative.
//
// Form vocabulary: a light "paper" surface, hairline slate borders, a thin quiet
// monospace header with a workspace ordinal, and a single restrained slate
// accent that appears ONLY on interaction — focus, drag, drop, and move. Stays
// fully interactive: drag (header handle), resize (renderer-owned dividers),
// maximize + group (header actions), focus (pane root), multi-select
// (Alt/Opt+click header).

function dropStateRing(args: TilingRenderTileProps): string {
  if (args.isInvalidDrop) {
    return "ring-2 ring-rose-400/50";
  }
  if (args.isDropTarget) {
    return "ring-2 ring-slate-500/45";
  }
  if (args.isHoveringDropCandidate) {
    return "ring-1 ring-slate-400/40";
  }
  if (args.isDropEligible) {
    return "ring-1 ring-dashed ring-slate-300/50";
  }
  return "";
}

export function MinimalTile(args: TilingRenderTileProps): React.ReactElement {
  const dropRing: string = dropStateRing(args);
  const ring: string =
    dropRing !== ""
      ? dropRing
      : args.isFocused
        ? "ring-1 ring-slate-400/55"
        : "";
  const border: string = args.isMoveSource
    ? "border-slate-400 border-dashed"
    : args.isFocused
      ? "border-slate-300"
      : "border-slate-200/80";
  const sourceFade: string = args.isDragSource ? "opacity-60" : "";
  const ordinal: string = String(args.paneOrdinal).padStart(2, "0");

  return (
    <TilingPaneRoot
      pane={args}
      className={`flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border bg-[#f7f7f4] text-slate-700 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.5)] outline-none transition-[border-color,box-shadow,opacity] duration-200 ${border} ${ring} ${sourceFade}`}
    >
      <TilingDragHandle
        pane={args}
        className={`flex shrink-0 cursor-grab select-none items-center justify-between gap-2 border-b px-3 py-1.5 active:cursor-grabbing ${
          args.isFocused
            ? "border-b-slate-300 bg-slate-900/[0.035]"
            : "border-b-slate-200/70 bg-slate-900/[0.015]"
        } ${
          args.isMultiSelected
            ? "outline-dashed outline-1 -outline-offset-2 outline-slate-400/60"
            : ""
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="shrink-0 font-mono text-[10px] tabular-nums tracking-[0.1em] text-slate-400"
          >
            {ordinal}
          </span>
          <span aria-hidden className="h-3 w-px shrink-0 bg-slate-300" />
          <span className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-600">
            {args.tile.title}
          </span>
          {args.isMoveSource ? (
            <span className="shrink-0 rounded border border-slate-400/60 bg-slate-200 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-600">
              moving
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {args.isMultiSelected ? (
            <span
              aria-label={`pane ${args.leafId} selected`}
              title="selected (Alt/Opt+click to deselect)"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-400/60 bg-slate-200 font-mono text-[10px] leading-none text-slate-600"
            >
              <span aria-hidden>{"\u2713"}</span>
            </span>
          ) : null}
          {args.isMultiSelected && args.canGroupMultiSelection ? (
            <TilingPaneAction
              onClick={(): void => args.onGroupMultiSelection(args.leafId)}
              aria-label={`group ${args.leafId} with the selected panes`}
              title="group selected panes into a tabbed group"
              className="flex h-5 shrink-0 items-center rounded border border-slate-400/60 bg-slate-100 px-2 font-mono text-[10px] uppercase leading-none tracking-[0.1em] text-slate-600 transition-colors hover:border-slate-500 hover:bg-slate-200"
            >
              Group
            </TilingPaneAction>
          ) : null}
          {args.isMaximizeEnabled ? (
            <TilingPaneAction
              onClick={(): void => args.onToggleMaximize()}
              aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
              title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 bg-white font-mono text-[11px] leading-none text-slate-500 transition-colors hover:border-slate-500 hover:text-slate-700"
            >
              <span aria-hidden>{args.isMaximized ? "\u2715" : "\u2922"}</span>
            </TilingPaneAction>
          ) : null}
        </span>
      </TilingDragHandle>
      <TilingPaneBody
        pane={args}
        className="min-h-0 flex-1 overflow-auto px-4 py-3 text-[13px] leading-relaxed text-slate-600 [&_a]:text-slate-800 [&_a]:underline [&_code]:text-slate-800 [&_strong]:text-slate-800"
      >
        {args.tile.content}
      </TilingPaneBody>
    </TilingPaneRoot>
  );
}
