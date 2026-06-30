import * as React from "react";
import type { DynamicRenderTileArgs } from "@n-uf/hypr-tiling";

// Custom pane renderer for the homepage. The library's default tile keeps its
// body empty until an in-renderer toggle is flipped, which would leave the
// prerendered HTML contentless — so the homepage supplies its own tile that
// always paints the documentation content. The renderer still owns layout,
// splits, resize, drag mechanics, focus, and keyboard control; this component
// only paints one pane's chrome + content and forwards the drag/focus handles.
//
// The root is an `<article data-leaf-id>` because the renderer's drag pickup
// resolves the source pane via `closest("article[data-leaf-id]")`.

export function DocTile(args: DynamicRenderTileArgs): React.ReactElement {
  const accentRing: string = args.isFocused
    ? "border-cyan-400/60 shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_8px_30px_rgba(8,12,20,0.55)]"
    : "border-white/10 shadow-[0_6px_22px_rgba(8,12,20,0.4)]";

  return (
    <article
      data-leaf-id={args.leafId}
      tabIndex={-1}
      onFocus={args.onFocus}
      onPointerMove={args.onPointerMove}
      onPointerLeave={args.onPointerLeave}
      className={`flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-[linear-gradient(180deg,rgba(20,24,33,0.92),rgba(11,13,18,0.96))] outline-none ${accentRing}`}
    >
      <header
        onPointerDown={args.onHandlePointerDown}
        className="flex shrink-0 cursor-grab touch-none select-none items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 active:cursor-grabbing"
      >
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          {args.tile.title}
        </span>
        {args.isMaximizeEnabled ? (
          <button
            type="button"
            onPointerDown={(event: React.PointerEvent<HTMLButtonElement>): void => {
              event.stopPropagation();
            }}
            onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
              event.stopPropagation();
              args.onToggleMaximize();
            }}
            aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
            title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/15 font-mono text-[11px] leading-none text-slate-300 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
          >
            <span aria-hidden>{args.isMaximized ? "\u2715" : "\u2922"}</span>
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3.5">
        {args.tile.content}
      </div>
    </article>
  );
}
