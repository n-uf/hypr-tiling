import * as React from "react";
import {
  TilingPaneRoot,
  TilingDragHandle,
  TilingPaneAction,
  TilingPaneBody,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// The MOSAIC skin's pane chrome — a technical HUD / instrument panel. It is one
// of three deliberately DIVERGENT pane SILHOUETTES on the homepage (Editorial =
// a chromeless printed folio with a left-margin running head; Canvas = a macOS
// app window with a title bar + bottom status strip). The three differ in FRAME
// ARCHITECTURE, not palette — rendered in greyscale with text hidden they are
// still three different layouts.
//
// Mosaic's architecture (what makes it NOT a top-bar card):
//   • Silhouette: a SHARP rectangle (no rounding) drawn by four L-shaped CORNER
//     BRACKETS rather than a filled frame — an instrument-panel bezel.
//   • Header placement: NO header bar. The label is a small FLOATING top-left
//     BRACKET TAG (`⌜ 03 ▸ FEATURES`) that overlays a chromeless body; the body
//     runs full-bleed underneath it. This is the drag-pickup surface.
//   • Control language: bare MONOSPACE INSTRUMENT TICKS floated in the top-right
//     corner (`⊞` group, `⤢`/`✕` maximize) — glyphs, not bordered icon boxes.
//   • Header↔body: OVERLAY / chromeless — there is no divider rule; the tag and
//     ticks float over the body, which fills the whole card.
//
// It stays fully interactive — drag (the corner tag), resize (renderer
// dividers), maximize + group (the corner ticks), focus (pane root),
// multi-select (Alt/Opt+click the corner tag) — and is built on ONLY the public
// `@n-uf/hypr-tiling` `.` API + the four helper primitives. The body renders
// `tile.content` through `TilingPaneBody`, so the drag ghost reuses the same
// render path and is never an empty-bodied shell.

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

// One L-shaped corner bracket. `corner` picks which two edges the bracket draws;
// the color tracks focus (amber) vs. rest (faint white) so the bezel "lights up"
// on the active pane — the Mosaic focus signal, in place of a header tint.
type Corner = "tl" | "tr" | "bl" | "br";

const CORNER_EDGES: Record<Corner, string> = {
  tl: "left-0 top-0 border-l border-t",
  tr: "right-0 top-0 border-r border-t",
  bl: "left-0 bottom-0 border-l border-b",
  br: "right-0 bottom-0 border-r border-b",
};

function CornerBracket({
  corner,
  focused,
}: {
  corner: Corner;
  focused: boolean;
}): React.ReactElement {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-3.5 w-3.5 transition-colors duration-200 ${
        CORNER_EDGES[corner]
      } ${focused ? "border-amber-300/70" : "border-white/20"}`}
    />
  );
}

// A bare monospace instrument tick — the Mosaic control affordance. No border
// box: just a mono glyph that lights amber on hover/focus, like a HUD readout.
const TICK: string =
  "flex h-5 min-w-5 items-center justify-center px-0.5 font-mono text-[12px] leading-none text-stone-500 transition-colors hover:text-amber-200";

export function DocTile(args: TilingRenderTileProps): React.ReactElement {
  const dropRing: string = dropStateRing(args);
  const sourceFade: string = args.isDragSource ? "opacity-60" : "";
  const ordinal: string = String(args.paneOrdinal).padStart(2, "0");

  return (
    <TilingPaneRoot
      pane={args}
      className={`group relative flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-none border bg-[#0e0f11] outline-none shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.03)] transition-[border-color,box-shadow,opacity] duration-200 ${
        args.isMoveSource
          ? "border-amber-300/50 border-dashed"
          : args.isFocused
            ? "border-amber-300/25"
            : "border-white/[0.05]"
      } ${dropRing} ${sourceFade}`}
    >
      <CornerBracket corner="tl" focused={args.isFocused} />
      <CornerBracket corner="tr" focused={args.isFocused} />
      <CornerBracket corner="bl" focused={args.isFocused} />
      <CornerBracket corner="br" focused={args.isFocused} />

      {/* Floating top-left BRACKET TAG — the label + the drag-pickup surface. */}
      <TilingDragHandle
        pane={args}
        className={`absolute left-2 top-2 z-10 inline-flex max-w-[calc(100%-5.5rem)] cursor-grab touch-none select-none items-center gap-2 rounded-[2px] px-2 py-1 backdrop-blur-[1px] transition-colors active:cursor-grabbing ${
          args.isFocused
            ? "bg-amber-300/[0.06]"
            : "bg-[#0e0f11]/70"
        } ${
          args.isMultiSelected
            ? "outline-dashed outline-1 -outline-offset-2 outline-stone-300/55"
            : ""
        }`}
      >
        <span
          aria-hidden
          className={`shrink-0 font-mono text-[11px] leading-none ${
            args.isFocused ? "text-amber-300/80" : "text-stone-600"
          }`}
        >
          {"\u231C"}
        </span>
        <span
          aria-hidden
          className={`shrink-0 font-mono text-[10px] tabular-nums tracking-[0.1em] ${
            args.isFocused ? "text-amber-300/80" : "text-stone-500"
          }`}
        >
          {ordinal}
        </span>
        <span
          aria-hidden
          className={`shrink-0 font-mono text-[10px] leading-none ${
            args.isFocused ? "text-amber-300/70" : "text-stone-600"
          }`}
        >
          {"\u25B8"}
        </span>
        <span className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-stone-200">
          {args.tile.title}
        </span>
        {args.isMoveSource ? (
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-200">
            {"\u00b7 moving"}
          </span>
        ) : null}
      </TilingDragHandle>

      {/* Floating top-right INSTRUMENT TICKS — group / maximize as bare glyphs. */}
      <span className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5">
        {args.isMultiSelected ? (
          <span
            aria-label={`pane ${args.leafId} selected`}
            title="selected (Alt/Opt+click to deselect)"
            className="flex h-5 w-5 items-center justify-center font-mono text-[11px] leading-none text-stone-200"
          >
            <span aria-hidden>{"\u2713"}</span>
          </span>
        ) : null}
        {args.isMultiSelected && args.canGroupMultiSelection ? (
          <TilingPaneAction
            onClick={(): void => args.onGroupMultiSelection(args.leafId)}
            aria-label={`group ${args.leafId} with the selected panes`}
            title="group selected panes into a tabbed group"
            className={TICK}
          >
            <span aria-hidden>{"\u229E"}</span>
          </TilingPaneAction>
        ) : null}
        {args.isMaximizeEnabled ? (
          <TilingPaneAction
            onClick={(): void => args.onToggleMaximize()}
            aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
            title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
            className={TICK}
          >
            <span aria-hidden>{args.isMaximized ? "\u2715" : "\u2922"}</span>
          </TilingPaneAction>
        ) : null}
      </span>

      {/* Chromeless body — runs full-bleed under the floating tag + ticks. */}
      <TilingPaneBody
        pane={args}
        className="min-h-0 flex-1 overflow-auto px-5 pb-4 pt-10"
      >
        {args.tile.content}
      </TilingPaneBody>
    </TilingPaneRoot>
  );
}
