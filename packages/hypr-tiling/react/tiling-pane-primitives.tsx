"use client";

import * as React from "react";
import { isMultiSelectModifierActive } from "../engine/multi-selection";
import type { TilingRenderTileProps } from "../engine/types";

// Optional, unstyled convenience primitives layered over the `renderTile`
// render-prop. Each one encodes ONE of the pane wiring rules that are otherwise
// prose-only conventions a custom pane can silently get wrong:
//
//   • TilingPaneRoot   — spreads `data-leaf-id` + the focus/hover handlers on
//                        the pane root (the renderer resolves the drag source
//                        through the `[data-leaf-id]` attribute).
//   • TilingDragHandle — wires the drag pickup (`onHandlePointerDown`) with
//                        `touch-action: none`, plus the Alt/Opt+click
//                        multi-select toggle that must not steal focus.
//   • TilingPaneAction — a header button that `stopPropagation`s on pointer-down
//                        AND click, so pressing it never starts a drag or
//                        establishes focus.
//   • TilingPaneBody   — renders children only in `render-content` mode (the
//                        drag ghost reuses the same render path).
//
// They ship no styling: a consumer brings their own className/style. The raw
// `renderTile` args stay the full escape hatch — use the primitives for the
// easy path, drop to bare DOM whenever you need more control.

/** Props for {@link TilingPaneRoot}. */
export interface TilingPaneRootProps
  extends Omit<
    React.HTMLAttributes<HTMLElement>,
    "onFocus" | "onClick" | "onPointerMove" | "onPointerLeave"
  > {
  /**
   * The `renderTile` args for this pane (only its `leafId` and the focus/hover
   * handlers are read). Pass the whole args object; the primitive wires the
   * root correctly.
   */
  pane: Pick<
    TilingRenderTileProps,
    "leafId" | "onFocus" | "onPointerMove" | "onPointerLeave"
  >;
}

/**
 * The root element of a custom pane. Renders an `<article data-leaf-id>` (the
 * attribute the renderer resolves the drag source from) and wires the pane's
 * `onFocus` (on both focus and click), `onPointerMove`, and `onPointerLeave`
 * handlers, so focus, resize, and pre-drag hover telemetry keep working. Bring
 * your own `className` / `style` / children; defaults `tabIndex` to `-1`.
 *
 * @param props - {@link TilingPaneRootProps}
 */
export function TilingPaneRoot({
  pane,
  ...rest
}: TilingPaneRootProps): React.ReactElement {
  return (
    <article
      tabIndex={-1}
      {...rest}
      data-leaf-id={pane.leafId}
      onFocus={pane.onFocus}
      onClick={pane.onFocus}
      onPointerMove={pane.onPointerMove}
      onPointerLeave={pane.onPointerLeave}
    />
  );
}

/** Props for {@link TilingDragHandle}. */
export interface TilingDragHandleProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "onPointerDown" | "onClick"> {
  /**
   * The `renderTile` args for this pane (the drag-pickup handler and the
   * multi-select toggle handlers are read). Pass the whole args object.
   */
  pane: Pick<
    TilingRenderTileProps,
    "onHandlePointerDown" | "isMultiSelectGroupingEnabled" | "onToggleMultiSelect"
  >;
}

/**
 * The drag-pickup surface of a custom pane (typically the header). Wires the
 * renderer's `onHandlePointerDown` and sets `touch-action: none` so a touch
 * press starts a drag instead of scrolling, and folds in the Alt/Opt+click
 * multi-select toggle (which must not establish focus). Renders a `<div>`;
 * bring your own `className` / `style` / children.
 *
 * @param props - {@link TilingDragHandleProps}
 */
export function TilingDragHandle({
  pane,
  style,
  ...rest
}: TilingDragHandleProps): React.ReactElement {
  return (
    <div
      {...rest}
      style={{ touchAction: "none", ...style }}
      onPointerDown={pane.onHandlePointerDown}
      onClick={(event: React.MouseEvent<HTMLElement>): void => {
        // Alt/Opt+click toggles this pane's multi-selection WITHOUT changing
        // focus. The renderer's onHandlePointerDown already preventDefaults the
        // modified press, so native focus never fires and the toggle survives.
        if (
          pane.isMultiSelectGroupingEnabled &&
          isMultiSelectModifierActive(event)
        ) {
          event.stopPropagation();
          event.preventDefault();
          pane.onToggleMultiSelect();
        }
      }}
    />
  );
}

/** Props for {@link TilingPaneAction}. */
export type TilingPaneActionProps =
  React.ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * A header action button (maximize, group, …) that `stopPropagation`s on both
 * pointer-down and click, so activating it never starts a drag or steals pane
 * focus. Defaults `type` to `"button"` and calls your `onClick` after stopping
 * propagation. Bring your own `className` / `style` / children.
 *
 * @param props - {@link TilingPaneActionProps}
 */
export function TilingPaneAction({
  onClick,
  type,
  ...rest
}: TilingPaneActionProps): React.ReactElement {
  return (
    <button
      {...rest}
      type={type ?? "button"}
      onPointerDown={(event: React.PointerEvent<HTMLButtonElement>): void => {
        event.stopPropagation();
      }}
      onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
        event.stopPropagation();
        onClick?.(event);
      }}
    />
  );
}

/** Props for {@link TilingPaneBody}. */
export interface TilingPaneBodyProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The `renderTile` args for this pane (only `paneBodyRenderMode` is read).
   * Pass the whole args object.
   */
  pane: Pick<TilingRenderTileProps, "paneBodyRenderMode">;
}

/**
 * The body wrapper of a custom pane. Always renders its wrapper `<div>` (so the
 * pane keeps its layout), but renders children ONLY when
 * `paneBodyRenderMode === "render-content"`. This keeps a custom pane aligned
 * with the renderer's drag-ghost / hidden-body semantics — the ghost reuses the
 * same render path, so an empty body never rides along. Bring your own
 * `className` / `style`.
 *
 * @param props - {@link TilingPaneBodyProps}
 */
export function TilingPaneBody({
  pane,
  children,
  ...rest
}: TilingPaneBodyProps): React.ReactElement {
  return (
    <div {...rest}>
      {pane.paneBodyRenderMode === "render-content" ? children : null}
    </div>
  );
}
