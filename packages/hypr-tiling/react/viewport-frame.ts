/**
 * The viewport's frame in window-client space, read live.
 *
 * Pointer input arrives in client px; the leaves are laid out in the
 * viewport's layout px. The two differ by the viewport's client origin (which
 * a page or ancestor scroll moves mid-drag) and by any scale an ancestor
 * transform applies (`scale(0.8)` on a host root). Both are read from the DOM
 * each time they are needed, never cached for a drag.
 *
 * @internal
 */

import type { DragMachinePoint } from "../engine/drag-machine";
import type { TilingRect } from "../engine/leaf-geometry";

/** The viewport's client origin and its client-px-per-layout-px scale. */
export interface ViewportClientFrame {
  readonly x: number;
  readonly y: number;
  /** Client px per layout px (1 unscaled; 0.8 under `scale(0.8)`). */
  readonly scale: number;
}

const IDENTITY_FRAME: ViewportClientFrame = { x: 0, y: 0, scale: 1 };

/** Measure `viewport`'s client frame now (identity when absent or unlaid). */
export function measureViewportClientFrame(
  viewport: HTMLElement | null,
): ViewportClientFrame {
  if (viewport == null) {
    return IDENTITY_FRAME;
  }
  const rect: DOMRect = viewport.getBoundingClientRect();
  const layoutWidth: number = viewport.offsetWidth;
  const scale: number =
    layoutWidth > 0 && rect.width > 0 ? rect.width / layoutWidth : 1;
  return { x: rect.left, y: rect.top, scale };
}

/** A window-client point in the viewport's layout px. */
export function clientToViewportPoint(
  frame: ViewportClientFrame,
  client: DragMachinePoint,
): DragMachinePoint {
  return {
    x: (client.x - frame.x) / frame.scale,
    y: (client.y - frame.y) / frame.scale,
  };
}

/** A window-client length in the viewport's layout px. */
export function clientToViewportLength(
  frame: ViewportClientFrame,
  length: number,
): number {
  return length / frame.scale;
}

/**
 * Lay out a `position: fixed` layer so its box sits at `rect` (viewport layout
 * px) over the viewport. Fixed positioning lets the layer escape the
 * viewport's `overflow: hidden`; it is laid out against its containing block,
 * which is the window unless an ancestor (a transform, filter, `contain`,
 * `will-change`) makes one — so the block's origin is measured, not assumed.
 * Assumes the scale (if any) applies at or above that containing block.
 */
export function placeFixedLayer(
  layer: HTMLElement,
  frame: ViewportClientFrame,
  rect: TilingRect,
): void {
  layer.style.left = "0px";
  layer.style.top = "0px";
  const block: DOMRect = layer.getBoundingClientRect();
  layer.style.left = `${(frame.x - block.left) / frame.scale + rect.x}px`;
  layer.style.top = `${(frame.y - block.top) / frame.scale + rect.y}px`;
}
