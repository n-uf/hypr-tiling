import * as React from "react";
import type { DynamicRenderTileArgs } from "@n-uf/hypr-tiling";

// Custom pane renderer for the homepage ("mosaic" identity). The library's
// default tile keeps its body empty until an in-renderer toggle is flipped,
// which would leave the prerendered HTML contentless — so the homepage supplies
// its own tile that always paints the documentation content. The renderer still
// owns layout, splits, resize, drag mechanics, focus, and keyboard control;
// this component only paints one pane's chrome + content and forwards the
// drag/focus handles.
//
// Form vocabulary: a flat matte ink surface (no glass blur), a hairline rim, a
// monospace workspace ordinal (01, 02, …) echoing a tiling-WM workspace index,
// and a single gold accent that appears ONLY on interaction — focus, hover,
// drag, and the move/drop affordances. The root is an `<article data-leaf-id>`
// because the renderer's drag pickup resolves the source pane via
// `closest("article[data-leaf-id]")`.

function dropStateRing(args: DynamicRenderTileArgs): string {
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

export function DocTile(args: DynamicRenderTileArgs): React.ReactElement {
  const dropRing: string = dropStateRing(args);
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
        className={`flex shrink-0 cursor-grab touch-none select-none items-center justify-between gap-2 border-b px-3.5 py-2 transition-colors active:cursor-grabbing ${
          args.isFocused
            ? "border-b-amber-300/25 bg-amber-300/[0.04]"
            : "border-b-white/[0.06] bg-white/[0.012]"
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
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {args.tile.content}
      </div>
    </article>
  );
}
