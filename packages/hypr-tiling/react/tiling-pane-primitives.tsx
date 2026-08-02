"use client";

import * as React from "react";
import { isInteractiveControlTarget } from "../engine/interactive-controls";
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
export interface TilingPaneRootProps extends Omit<
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
  className,
  ...rest
}: TilingPaneRootProps): React.ReactElement {
  return (
    <article
      tabIndex={-1}
      {...rest}
      // Kill UA `:focus-visible` — Shift/modifiers flip keyboard modality on an
      // already-focused pane; theme `resolveFocusFrame` / host borders own focus.
      className={["outline-none", className].filter(Boolean).join(" ")}
      data-leaf-id={pane.leafId}
      onFocus={pane.onFocus}
      onClick={pane.onFocus}
      onPointerMove={pane.onPointerMove}
      onPointerLeave={pane.onPointerLeave}
    />
  );
}

/** Props for {@link TilingDragHandle}. */
export interface TilingDragHandleProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "onPointerDown" | "onClick"
> {
  /**
   * The `renderTile` args for this pane (the drag-pickup handler and the
   * multi-select toggle handlers are read). Pass the whole args object.
   */
  pane: Pick<
    TilingRenderTileProps,
    | "onHandlePointerDown"
    | "isMultiSelectGroupingEnabled"
    | "onToggleMultiSelect"
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

/** Props for {@link TilingPaneTitleBarContent}. */
export interface TilingPaneTitleBarContentProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Middle slot of a custom pane titlebar — between the title (left) and native
 * window controls (right). Stops pointer-down propagation ONLY when the press
 * lands on a genuine interactive control inside the slot (button, link,
 * input/textarea/select, `role="button"`, or a `contenteditable` node — see
 * {@link isInteractiveControlTarget}), so a real toolbar click / find input
 * does not start a rearrange drag from the surrounding {@link TilingDragHandle}.
 * A press anywhere ELSE in the slot — decorative labels, badges, a selected-
 * case id, any non-interactive content — falls through untouched, so the
 * titlebar stays draggable from the whole slot minus its actual controls
 * (HT-TITLEBAR-DRAG-THRU: a blanket stop here previously turned any non-empty
 * `titleBarContent` into a dead zone that swallowed drag pickup entirely, even
 * where nothing inside it was interactive).
 *
 * Unstyled: bring `className` (typically `min-w-0 flex-1` so the slot fills
 * remaining header width and truncates). Prefer reading `tile.titleBarContent`
 * from {@link TilingRenderTileProps} and wrapping it here.
 *
 * @param props - {@link TilingPaneTitleBarContentProps}
 */
export function TilingPaneTitleBarContent({
  onPointerDown,
  ...rest
}: TilingPaneTitleBarContentProps): React.ReactElement {
  return (
    <div
      {...rest}
      onPointerDown={(event: React.PointerEvent<HTMLDivElement>): void => {
        if (isInteractiveControlTarget(event.target)) {
          event.stopPropagation();
        }
        onPointerDown?.(event);
      }}
    />
  );
}

/** Props for {@link TilingPaneBody}. */
export interface TilingPaneBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The `renderTile` args for this pane (`paneBodyRenderMode`, `isCollapsed`,
   * and `isMaximized` are read). Pass the whole args object.
   */
  pane: Pick<TilingRenderTileProps, "paneBodyRenderMode" | "isCollapsed" | "isMaximized">;
}

/**
 * The body wrapper of a custom pane. Always renders its wrapper `<div>` (so the
 * pane keeps its layout), but renders children ONLY when
 * `paneBodyRenderMode === "render-content"`. This keeps a custom pane aligned
 * with the renderer's drag-ghost / hidden-body semantics — the ghost reuses the
 * same render path, so an empty body never rides along. Bring your own
 * `className` / `style`.
 *
 * HT-PANE-COLLAPSE: while `pane.isCollapsed` is true (and the pane is NOT
 * maximized — see below) the wrapper is forced to `display: none` (merged into
 * any consumer `style`) rather than merely emptying its children. A collapsed
 * leaf is pinned to the chrome extent (titlebar-only, along its parent split's
 * axis), but a bare empty body still keeps its `flex-1` / `min-h-0` box in the
 * layout — the leftover slack between that box and the pinned extent rendered
 * as a dead strip beside/below the titlebar. Hiding the box entirely removes
 * that strip so the collapsed pane is exactly titlebar-sized.
 *
 * HT-PANE-COLLAPSE + maximize: `pane.isMaximized` SUSPENDS the `display: none`
 * gate for exactly this leaf, matching `resolvePaneBodyRenderMode`'s own
 * maximize override — otherwise a maximized collapsed pane would render
 * `render-content` children into a wrapper still forced invisible, i.e. a
 * titlebar strip in an empty full-screen frame.
 *
 * @param props - {@link TilingPaneBodyProps}
 */
export function TilingPaneBody({
  pane,
  children,
  style,
  ...rest
}: TilingPaneBodyProps): React.ReactElement {
  const forceHidden: boolean = pane.isCollapsed === true && pane.isMaximized !== true;
  return (
    <div {...rest} style={forceHidden ? { ...style, display: "none" } : style}>
      {pane.paneBodyRenderMode === "render-content" ? children : null}
    </div>
  );
}
