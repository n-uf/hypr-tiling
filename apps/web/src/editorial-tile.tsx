import * as React from "react";
import {
  TilingPaneRoot,
  TilingDragHandle,
  TilingPaneAction,
  TilingPaneBody,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// The EDITORIAL skin's pane chrome — a printed FOLIO, deliberately CHROMELESS.
// It is one of three divergent pane SILHOUETTES on the homepage (Mosaic = a
// corner-bracket instrument HUD with a floating top-left tag; Canvas = a macOS
// app window with a top title bar + bottom status strip). The three differ in
// FRAME ARCHITECTURE, not palette — in greyscale with text hidden they read as
// three different layouts.
//
// Editorial's architecture (what makes it NOT a top-bar card):
//   • Silhouette: a borderless FLOATING paper leaf — a single soft drop-shadow,
//     no outer frame; the page/body is the object, not an app pane.
//   • Header placement: NO header bar. The title is a running head set in the
//     LEFT MARGIN, rotated to read up the spine (`№ 03 · Features`), separated
//     from the text block by a single hairline rule. The margin rail is the
//     drag-pickup surface.
//   • Control language: understated TEXT LINKS ("Group" / "Max" / "Restore")
//     that are HOVER-REVEALED in the top-right of the page — no buttons, no
//     boxes, no icons.
//   • Header↔body: SEAMLESS — a hairline vertical rule is the only separation;
//     the layout is a flex-ROW (margin + page), unlike the flex-col skins.
//
// It stays fully interactive — drag (margin rail), resize (renderer dividers),
// maximize + group (hover-revealed links), focus (pane root), multi-select
// (Alt/Opt+click the margin rail) — and is built on ONLY the public
// `@n-uf/hypr-tiling` `.` API + the four helper primitives. The body renders
// `tile.content` through `TilingPaneBody`, so the drag ghost reuses the same
// render path.

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

// An understated folio TEXT LINK — the Editorial control affordance. No border,
// no box: ink text with an underline that only inks in on hover.
const FOLIO_LINK: string =
  "shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8c8069] underline decoration-transparent underline-offset-[3px] transition-colors hover:text-[#241f17] hover:decoration-[#241f17]";

export function EditorialTile(args: TilingRenderTileProps): React.ReactElement {
  const dropRing: string = dropStateRing(args);
  const ring: string =
    dropRing !== ""
      ? dropRing
      : args.isFocused
        ? "ring-1 ring-[#241f17]/12"
        : "";
  const sourceFade: string = args.isDragSource ? "opacity-60" : "";
  const folio: string = String(args.paneOrdinal).padStart(2, "0");
  // The action cluster is hover-revealed, but stays visible whenever the pane is
  // multi-selected so the Group link is always reachable in that mode.
  const actionsVisibility: string = args.isMultiSelected
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";

  return (
    <TilingPaneRoot
      pane={args}
      className={`group relative flex h-full max-h-full min-h-0 w-full min-w-0 flex-row overflow-hidden rounded-[2px] bg-[#fbf9f2] text-[#4b4335] outline-none shadow-[0_1px_0_rgba(36,31,23,0.03),0_12px_30px_-22px_rgba(36,31,23,0.45)] transition-[box-shadow,opacity] duration-200 ${ring} ${sourceFade}`}
    >
      {/* LEFT MARGIN RAIL — rotated spine running-head + the drag surface. */}
      <TilingDragHandle
        pane={args}
        className={`flex w-9 shrink-0 cursor-grab select-none flex-col items-center justify-between border-r py-4 active:cursor-grabbing ${
          args.isFocused ? "border-r-[#241f17]/70" : "border-r-[#e2dac6]"
        } ${
          args.isMultiSelected
            ? "outline-dashed outline-1 -outline-offset-[3px] outline-[#241f17]/35"
            : ""
        }`}
      >
        <span className="flex flex-col items-center gap-2">
          <span
            aria-hidden
            className={`h-4 w-px shrink-0 transition-colors ${
              args.isFocused ? "bg-[#241f17]" : "bg-[#cabf9f]"
            }`}
          />
          {args.isMultiSelected ? (
            <span
              aria-label={`pane ${args.leafId} selected`}
              title="selected (Alt/Opt+click to deselect)"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border border-[#241f17]/55 font-mono text-[10px] leading-none text-[#241f17]"
            >
              <span aria-hidden>{"\u2713"}</span>
            </span>
          ) : null}
        </span>
        <span className="flex min-h-0 flex-1 items-center justify-center py-2">
          <span
            className="whitespace-nowrap font-display text-[13px] leading-none tracking-[0.02em] text-[#241f17] [writing-mode:vertical-rl] rotate-180"
          >
            <span className="tabular-nums text-[#b0a487]">
              {"\u2116 "}
              {folio}
            </span>
            <span className="text-[#b0a487]">{"  \u00b7  "}</span>
            {args.tile.title}
          </span>
        </span>
        <span
          aria-hidden
          className={`h-4 w-px shrink-0 transition-colors ${
            args.isMoveSource
              ? "bg-[#241f17]"
              : args.isFocused
                ? "bg-[#241f17]/60"
                : "bg-[#cabf9f]"
          }`}
        />
      </TilingDragHandle>

      {/* PAGE — the object. Hover-revealed action links float top-right. */}
      <div className="relative min-h-0 min-w-0 flex-1">
        <span
          className={`absolute right-5 top-4 z-10 flex items-center gap-4 transition-opacity duration-150 ${actionsVisibility}`}
        >
          {args.isMoveSource ? (
            <span className="shrink-0 font-display text-[12px] italic text-[#8c8069]">
              moving…
            </span>
          ) : null}
          {args.isMultiSelected && args.canGroupMultiSelection ? (
            <TilingPaneAction
              onClick={(): void => args.onGroupMultiSelection(args.leafId)}
              aria-label={`group ${args.leafId} with the selected panes`}
              title="group selected panes into a tabbed group"
              className={FOLIO_LINK}
            >
              Group
            </TilingPaneAction>
          ) : null}
          {args.isMaximizeEnabled ? (
            <TilingPaneAction
              onClick={(): void => args.onToggleMaximize()}
              aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
              title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
              className={FOLIO_LINK}
            >
              {args.isMaximized ? "Restore" : "Max"}
            </TilingPaneAction>
          ) : null}
        </span>
        <TilingPaneBody
          pane={args}
          className="h-full min-h-0 overflow-auto px-6 py-5 text-[13px] leading-[1.75] text-[#4b4335]"
        >
          {args.tile.content}
        </TilingPaneBody>
      </div>
    </TilingPaneRoot>
  );
}
