import * as React from "react";
import {
  TilingPaneRoot,
  TilingDragHandle,
  TilingPaneAction,
  TilingPaneBody,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";
import { CANVAS_THEME, canvasAccentTick } from "./canvas-theme";

// The CANVAS skin's pane chrome — the light "document desk" counterpart to the
// dark Mosaic `DocTile` and the warm Editorial folio. It is a distinct chrome
// system on every axis, and it is DRIVEN BY `CANVAS_THEME` (the consumer-authored
// `TilingTheme`): the shell, header, focus frame, and drop states all read from
// the theme's tokens/resolvers, so chrome and content share one greyish palette.
//
//   • Header vocabulary: a quiet grey bar carrying a small tick in the pane's
//     OWN accent hue (the Canvas "accent language"), a tabular folio number, and
//     a neutral mono title. Actions are KEYCAP CHIPS ("GROUP" / "MAX" / "ESC")
//     — the workspace's hint-chip idiom — not bordered icon boxes or ink text.
//   • Border / elevation: a crisp white card with a hairline slate rim and a
//     soft low workspace shadow — flat and calm, neither Mosaic's matte ink card
//     nor Editorial's printed paper leaf.
//   • Focus / drag / drop: the theme's `resolveFocusFrame` paints a hairline
//     slate border + a single 1px ring in the pane's accent; move/drop states use
//     quiet slate rings; only a genuine invalid drop borrows the theme's rose.
//
// Fully interactive — drag (header), resize (renderer dividers), maximize + group
// (header actions), focus (pane root), multi-select (Alt/Opt+click header) — and
// built on ONLY the public `@n-uf/hypr-tiling` `.` API + the helper primitives.
// The body renders `tile.content` (the Canvas content supplied by the page)
// through `TilingPaneBody`, so the drag ghost reuses the same render path.

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

const KEYCAP: string =
  "rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9px] uppercase leading-none tracking-[0.16em] text-slate-500 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:text-slate-700";

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
  const moveDash: string = args.isMoveSource ? "border-dashed border-slate-300" : "";
  const folio: string = String(args.paneOrdinal).padStart(2, "0");

  return (
    <TilingPaneRoot
      pane={args}
      className={`${CANVAS_THEME.paneShell.surface} outline-none transition-[border-color,box-shadow,opacity] duration-200 ${moveDash} ${ring} ${sourceFade}`}
    >
      <TilingDragHandle
        pane={args}
        className={`cursor-grab select-none active:cursor-grabbing ${CANVAS_THEME.paneHeader.base} ${
          args.isFocused ? CANVAS_THEME.paneHeader.focused : ""
        } ${args.isMultiSelected ? CANVAS_THEME.paneHeader.selected : ""}`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={`h-[3px] w-4 shrink-0 rounded-full ${canvasAccentTick(
              args.tile.accent,
            )}`}
          />
          <span
            aria-hidden
            className="shrink-0 font-mono text-[10px] tabular-nums tracking-[0.14em] text-slate-400"
          >
            {folio}
          </span>
          <span
            className={`${CANVAS_THEME.paneHeader.titleText} ${
              args.isFocused ? "text-slate-900" : "text-slate-500"
            }`}
          >
            {args.tile.title}
          </span>
          {args.isMoveSource ? (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
              moving
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
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
              className={KEYCAP}
            >
              Group
            </TilingPaneAction>
          ) : null}
          {args.isMaximizeEnabled ? (
            <TilingPaneAction
              onClick={(): void => args.onToggleMaximize()}
              aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
              title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
              className={KEYCAP}
            >
              {args.isMaximized ? "Esc" : "Max"}
            </TilingPaneAction>
          ) : null}
        </span>
      </TilingDragHandle>
      <TilingPaneBody pane={args} className={CANVAS_THEME.paneShell.bodyText}>
        {args.tile.content}
      </TilingPaneBody>
    </TilingPaneRoot>
  );
}
