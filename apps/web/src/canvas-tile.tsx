import * as React from "react";
import {
  TilingPaneRoot,
  TilingDragHandle,
  TilingPaneAction,
  TilingPaneBody,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";
import { CANVAS_THEME, canvasAccentTick } from "./canvas-theme";

// The CANVAS skin's pane chrome — a macOS-style APP WINDOW. It is one of three
// divergent pane SILHOUETTES on the homepage (Mosaic = a corner-bracket
// instrument HUD with a floating top-left tag; Editorial = a chromeless printed
// folio with a left-margin running head). The three differ in FRAME
// ARCHITECTURE, not palette — in greyscale with text hidden they read as three
// different layouts. This one is DRIVEN BY `CANVAS_THEME` (the consumer-authored
// `TilingTheme`): focus frame, accent tick, drop states, and body type all read
// from the theme's tokens/resolvers.
//
// Canvas's architecture (what makes it NOT a bare header card):
//   • Silhouette: a heavily-ROUNDED window (`rounded-xl`) with a soft desktop
//     drop-shadow — a floating desktop window, not a flat pane.
//   • Header placement: a full-width TITLE BAR at top with a CENTERED title, and
//     a matching STATUS STRIP at the bottom — window chrome top AND bottom. The
//     title bar is the drag-pickup surface.
//   • Control language: macOS TRAFFIC-LIGHT DOTS top-left (the green dot is the
//     live maximize/restore control); group is a quiet toolbar chip on the right.
//   • Header↔body: hard-bordered WINDOWED — a hairline rule divides the title
//     bar from the body and the body from the status strip (a title / content /
//     status stack).
//
// It stays fully interactive — drag (title bar), resize (renderer dividers),
// maximize (green traffic light) + group (toolbar chip), focus (pane root),
// multi-select (Alt/Opt+click the title bar) — and is built on ONLY the public
// `@n-uf/hypr-tiling` `.` API + the four helper primitives. The body renders
// `tile.content` through `TilingPaneBody`, so the drag ghost reuses the same
// render path.

const DROP_TARGET_RING: string = "ring-1 ring-cyan-400/60";
const DROP_HOVER_RING: string = "ring-1 ring-slate-300";
const DROP_ELIGIBLE_RING: string = "ring-1 ring-dashed ring-slate-300";

function dropStateRing(args: TilingRenderTileProps): string {
  if (args.isInvalidDrop) {
    return CANVAS_THEME.paneShell.invalidDropRing;
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

const GROUP_CHIP: string =
  "rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9px] uppercase leading-none tracking-[0.16em] text-slate-500 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:text-slate-700";

// A static macOS traffic-light dot (window decoration; the interactive one is
// the green maximize control rendered separately).
function TrafficDot({ className }: { className: string }): React.ReactElement {
  return <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${className}`} />;
}

export function CanvasTile(args: TilingRenderTileProps): React.ReactElement {
  const dropRing: string = dropStateRing(args);
  const ring: string =
    dropRing !== ""
      ? dropRing
      : args.isFocused
        ? CANVAS_THEME.resolveFocusFrame(args.tile.accent)
        : "";
  const sourceFade: string = args.isDragSource
    ? CANVAS_THEME.paneShell.dragSourceOpacity
    : "";
  const moveDash: string = args.isMoveSource
    ? "border-dashed border-slate-300"
    : "";
  const folio: string = String(args.paneOrdinal).padStart(2, "0");

  return (
    <TilingPaneRoot
      pane={args}
      className={`relative flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white outline-none shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_44px_-26px_rgba(15,23,42,0.5)] transition-[border-color,box-shadow,opacity] duration-200 ${moveDash} ${ring} ${sourceFade}`}
    >
      {/* TITLE BAR — traffic lights left, centered title, group chip right. */}
      <TilingDragHandle
        pane={args}
        className={`relative flex h-9 shrink-0 cursor-grab select-none items-center border-b px-3 active:cursor-grabbing ${
          args.isFocused
            ? "border-b-slate-200 bg-slate-50/80"
            : "border-b-slate-100 bg-slate-50/50"
        } ${
          args.isMultiSelected
            ? "outline-dashed outline-1 -outline-offset-2 outline-slate-300"
            : ""
        }`}
      >
        <span className="flex shrink-0 items-center gap-1.5">
          <TrafficDot className="bg-rose-300" />
          <TrafficDot className="bg-amber-300" />
          {args.isMaximizeEnabled ? (
            <TilingPaneAction
              onClick={(): void => args.onToggleMaximize()}
              aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
              title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
              className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-400 text-[7px] leading-none text-emerald-900/70 transition-colors hover:bg-emerald-500"
            >
              <span aria-hidden>{args.isMaximized ? "\u2013" : "+"}</span>
            </TilingPaneAction>
          ) : (
            <TrafficDot className="bg-emerald-300" />
          )}
        </span>

        <span
          className={`pointer-events-none absolute left-1/2 flex max-w-[60%] -translate-x-1/2 items-center gap-2 truncate font-mono text-[10px] uppercase tracking-[0.18em] ${
            args.isFocused ? "text-slate-700" : "text-slate-400"
          }`}
        >
          <span
            aria-hidden
            className={`h-[3px] w-3 shrink-0 rounded-full ${canvasAccentTick(
              args.tile.accent,
            )}`}
          />
          <span className="truncate">{args.tile.title}</span>
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {args.isMoveSource ? (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
              moving
            </span>
          ) : null}
          {args.isMultiSelected ? (
            <span
              aria-label={`pane ${args.leafId} selected`}
              title="selected (Alt/Opt+click to deselect)"
              className="flex h-4 w-4 items-center justify-center rounded-[3px] border border-slate-300 bg-white font-mono text-[9px] leading-none text-slate-600"
            >
              <span aria-hidden>{"\u2713"}</span>
            </span>
          ) : null}
          {args.isMultiSelected && args.canGroupMultiSelection ? (
            <TilingPaneAction
              onClick={(): void => args.onGroupMultiSelection(args.leafId)}
              aria-label={`group ${args.leafId} with the selected panes`}
              title="group selected panes into a tabbed group"
              className={GROUP_CHIP}
            >
              Group
            </TilingPaneAction>
          ) : null}
        </span>
      </TilingDragHandle>

      <TilingPaneBody pane={args} className={CANVAS_THEME.paneShell.bodyText}>
        {args.tile.content}
      </TilingPaneBody>

      {/* STATUS STRIP — the window's bottom chrome band. */}
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={`h-[3px] w-3 rounded-full ${canvasAccentTick(
              args.tile.accent,
            )}`}
          />
          <span className="tabular-nums text-slate-500">{folio}</span>
        </span>
        <span className="truncate">
          {args.isMaximized ? "maximized" : args.isFocused ? "focused" : "ready"}
        </span>
      </div>
    </TilingPaneRoot>
  );
}
