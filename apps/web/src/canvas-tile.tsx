import * as React from "react";
import {
  TilingPaneRoot,
  TilingDragHandle,
  TilingPaneAction,
  TilingPaneBody,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";
import { CANVAS_THEME, CANVAS_TICKS, canvasAccentTick } from "./canvas-theme";

// The CANVAS skin's pane chrome — a self-standing DESKTOP WINDOW. Where the
// Mosaic (`tile.tsx`) and Editorial (`editorial-tile.tsx`) skins share one
// header-bar skeleton (a single top bar recolored per skin, then a body), the
// Canvas pane is a radically distinct silhouette: a heavily rounded window that
// visibly STANDS UP on the desk. It is a three-part stack, not a header+body:
//
//   1. TITLE BAR — a real standing window title bar carrying macOS-style
//      traffic-light dots on the left (red · amber · green), the green dot being
//      the LIVE maximize control, and a CENTER-ALIGNED window title. This is the
//      drag surface (drag the window by its title bar) and also owns the
//      Alt/Opt+click multi-select toggle via `TilingDragHandle`.
//   2. WINDOW BODY — a heavily rounded (`rounded-2xl`) white body lifted off the
//      desk by a soft desktop drop-shadow, so the window reads as floating.
//   3. BASE STRIP — a bottom status/base strip (folio index + the signature
//      Canvas accent-tick row + a window "foot" grip) that grounds the window so
//      it reads as standing on a surface.
//
// Acceptance: in greyscale with text hidden, the Canvas pane is obviously a
// different frame from the restored Mosaic/Editorial header-bar skeleton — a
// three-dot control cluster, a centered title, a floating rounded window, and a
// grounding base strip that neither other skin has.
//
// Fully interactive — drag (title bar), resize (renderer dividers), maximize
// (the live green window dot), group (title-bar chip), focus (pane root),
// multi-select (Alt/Opt+click title bar) — and built on ONLY the public
// `@n-uf/hypr-tiling` `.` API + the four helper primitives. Interactive states
// (focus frame, drop rings, drag-source fade) are resolved from the
// consumer-authored `CANVAS_THEME`. The body renders `tile.content` through
// `TilingPaneBody`, so the drag ghost reuses the same render path and the Canvas
// content still tracks the window frame.

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

// The floating window shell: a heavily rounded card lifted off the desk by a
// soft two-layer drop-shadow. This rounding + elevation, plus the three-row
// stack below, is what separates the Canvas silhouette from the flatter
// header-bar cards of Mosaic and Editorial.
const WINDOW_SHELL: string =
  "relative flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_4px_rgba(15,23,42,0.05),0_28px_52px_-26px_rgba(15,23,42,0.5)] outline-none transition-[border-color,box-shadow,opacity] duration-200";

// The standing title bar: a subtly recessed top strip (traffic lights left,
// centered title, actions right) resolved as a 3-column grid so the title stays
// optically centered regardless of the left/right cluster widths.
const TITLE_BAR: string =
  "grid shrink-0 cursor-grab touch-none select-none grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-slate-200/70 bg-gradient-to-b from-slate-50 to-slate-100/70 px-3.5 py-2.5 active:cursor-grabbing";

// A traffic-light dot: 12px, with a hairline inset rim for a little depth.
const DOT: string =
  "h-3 w-3 shrink-0 rounded-full shadow-[inset_0_0_0_0.5px_rgba(15,23,42,0.14)]";

// The title-bar group/max chip — a quiet keycap in the Canvas idiom.
const WINDOW_CHIP: string =
  "rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9px] uppercase leading-none tracking-[0.16em] text-slate-500 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:text-slate-700";

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
      className={`${WINDOW_SHELL} ${moveDash} ${ring} ${sourceFade}`}
    >
      <TilingDragHandle
        pane={args}
        className={`${TITLE_BAR} ${
          args.isFocused ? "from-white to-slate-100" : ""
        } ${
          args.isMultiSelected
            ? "outline-dashed outline-1 -outline-offset-2 outline-slate-300"
            : ""
        }`}
      >
        {/* Left: macOS-style traffic lights — green is the live maximize control. */}
        <span className="group/lights flex items-center gap-2 justify-self-start">
          <span aria-hidden className={`${DOT} bg-red-400/90`} />
          <span aria-hidden className={`${DOT} bg-amber-400/90`} />
          {args.isMaximizeEnabled ? (
            <TilingPaneAction
              onClick={(): void => args.onToggleMaximize()}
              aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
              title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
              className={`${DOT} flex items-center justify-center bg-emerald-400/90 text-[7px] leading-none text-emerald-950/70 transition-colors hover:bg-emerald-400`}
            >
              <span
                aria-hidden
                className="opacity-0 transition-opacity group-hover/lights:opacity-100"
              >
                {args.isMaximized ? "\u2013" : "\u2922"}
              </span>
            </TilingPaneAction>
          ) : (
            <span aria-hidden className={`${DOT} bg-emerald-400/90`} />
          )}
        </span>

        {/* Center: the window title, optically centered. */}
        <span className="flex min-w-0 items-center justify-center gap-2 justify-self-center">
          <span
            aria-hidden
            className={`h-[3px] w-3 shrink-0 rounded-full ${canvasAccentTick(
              args.tile.accent,
            )}`}
          />
          <span
            className={`truncate font-mono text-[10px] font-medium uppercase tracking-[0.18em] ${
              args.isFocused ? "text-slate-700" : "text-slate-400"
            }`}
          >
            {args.tile.title}
          </span>
        </span>

        {/* Right: transient state + group action. */}
        <span className="flex shrink-0 items-center justify-end gap-1.5 justify-self-end">
          {args.isMoveSource ? (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
              moving
            </span>
          ) : null}
          {args.isMultiSelected ? (
            <span
              aria-label={`pane ${args.leafId} selected`}
              title="selected (Alt/Opt+click to deselect)"
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] font-mono text-[9px] leading-none ${CANVAS_THEME.paneHeader.selectedBadge}`}
            >
              <span aria-hidden>{"\u2713"}</span>
            </span>
          ) : null}
          {args.isMultiSelected && args.canGroupMultiSelection ? (
            <TilingPaneAction
              onClick={(): void => args.onGroupMultiSelection(args.leafId)}
              aria-label={`group ${args.leafId} with the selected panes`}
              title="group selected panes into a tabbed group"
              className={WINDOW_CHIP}
            >
              Group
            </TilingPaneAction>
          ) : null}
        </span>
      </TilingDragHandle>

      <TilingPaneBody pane={args} className={CANVAS_THEME.paneShell.bodyText}>
        {args.tile.content}
      </TilingPaneBody>

      {/* Base strip: grounds the window on the desk — folio index, the signature
          Canvas accent-tick row, and a window "foot" grip. Decorative. */}
      <div
        aria-hidden
        className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200/70 bg-slate-50/80 px-3.5 py-1.5"
      >
        <span className="font-mono text-[9px] tabular-nums tracking-[0.16em] text-slate-400">
          {folio}
        </span>
        <span className="flex items-center gap-1.5">
          {CANVAS_TICKS.map((tick: string): React.ReactElement => (
            <span key={tick} className={`h-[3px] w-3.5 rounded-full ${tick}`} />
          ))}
        </span>
        <span className="h-1 w-8 rounded-full bg-slate-200" />
      </div>
    </TilingPaneRoot>
  );
}
