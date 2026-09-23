/**
 * Frozen viewport capture for the workspace-switch transition stage (N2).
 *
 * `cloneNode(true)` does not copy `<canvas>` bitmaps and would leave
 * duplicate `id` / hit-test `data-*` attributes that the live incoming tree
 * still owns. This module clones, copies canvases, and strips identity so
 * the overlay is inert. Lives in `react/` — `engine/**` stays React- and
 * DOM-free.
 */

/**
 * Pixel-area budget for a single canvas copy (`width * height`). Above this
 * the capture is marked `degraded` so the caller falls back from `"slide"`
 * to `"fade"` (a 16 megapixel bitmap is too large to snapshot synchronously).
 */
export const VIEW_CAPTURE_CANVAS_PIXEL_BUDGET: number = 16_000_000;

/**
 * Renderer pane / leaf / drag attributes used for hit-testing and
 * measurement (`[data-leaf-id]`, `[data-hpt-pane]`, drag-source seats, …).
 * Stripped from the clone so `querySelector` / pointer hit-tests on the
 * live viewport never resolve into the overlay.
 */
export const HIT_TEST_DATA_ATTRIBUTES: ReadonlyArray<string> = [
  "data-leaf-id",
  "data-hpt-pane",
  "data-hpt-pane-pool",
  "data-hpt-pane-slot",
  "data-hpt-resize-cursor",
  "data-drag-source-reservation",
  "data-drag-source-pane",
  "data-drop-target-pane",
  "data-drag-ghost",
  "data-drag-ghost-mode",
  "data-drag-ghost-wrapper",
  "data-drag-ghost-chip",
  "data-drag-ghost-target",
  "data-drag-ghost-workspace",
  "data-drag-cursor",
  "data-drag-cursor-kind",
  "data-drag-cancel",
];

/**
 * Overlay the transition stage mounts inside the viewport. Removed from a
 * clone so a mid-flight second `begin` captures the live view, not the
 * previous overlay (which would recurse).
 */
export const WORKSPACE_TRANSITION_LAYER_ATTR: "data-hpt-workspace-transition-layer" =
  "data-hpt-workspace-transition-layer";

/**
 * Marker written onto the captured clone root so tests and the stage can
 * find it. Not a hit-test attribute.
 */
export const WORKSPACE_TRANSITION_CLONE_ATTR: "data-hpt-workspace-transition-clone" =
  "data-hpt-workspace-transition-clone";

/** Result of {@link captureViewClone}. */
export interface CapturedViewClone {
  /** Inert clone of `root` (ids / hit-test attrs stripped; canvases copied). */
  readonly node: HTMLElement;
  /**
   * `true` when a canvas bitmap could not be copied (tainted `drawImage`,
   * `getContext("2d")` missing, canvas over {@link VIEW_CAPTURE_CANVAS_PIXEL_BUDGET},
   * or source/clone canvas counts differ). Caller should resolve `"slide"`
   * to `"fade"`.
   */
  readonly degraded: boolean;
}

interface InertAssignable {
  inert: boolean;
}

function stripElementIdentity(el: Element): void {
  el.removeAttribute("id");
  for (const name of HIT_TEST_DATA_ATTRIBUTES) {
    el.removeAttribute(name);
  }
}

/**
 * Strip `id` and renderer hit-test `data-*` attributes from `root` and every
 * descendant so the clone cannot steal `getElementById` / `[data-leaf-id]`
 * queries from the live incoming tree.
 */
export function stripCloneIdentity(root: HTMLElement): void {
  stripElementIdentity(root);
  const descendants: NodeListOf<Element> = root.querySelectorAll("*");
  for (let i: number = 0; i < descendants.length; i += 1) {
    stripElementIdentity(descendants[i]);
  }
}

/**
 * Drop any existing transition overlay from `root` so a capture of the
 * viewport (which contains the stage) does not recurse into the previous
 * clone.
 */
export function removeTransitionLayers(root: HTMLElement): void {
  const layers: NodeListOf<Element> = root.querySelectorAll(
    `[${WORKSPACE_TRANSITION_LAYER_ATTR}]`,
  );
  for (let i: number = 0; i < layers.length; i += 1) {
    layers[i].remove();
  }
}

/**
 * Canvases under `root` that are not inside a transition overlay. A
 * mid-flight second `begin` captures the live view; pairing must ignore
 * bitmaps that belong to the outgoing clone already in the overlay.
 */
export function liveCanvases(root: HTMLElement): HTMLCanvasElement[] {
  const all: NodeListOf<HTMLCanvasElement> = root.querySelectorAll("canvas");
  const live: HTMLCanvasElement[] = [];
  for (let i: number = 0; i < all.length; i += 1) {
    if (all[i].closest(`[${WORKSPACE_TRANSITION_LAYER_ATTR}]`) == null) {
      live.push(all[i]);
    }
  }
  return live;
}

/**
 * Copy each source `<canvas>` bitmap onto the matching clone canvas
 * (`getContext("2d").drawImage(source, 0, 0)` at the source intrinsic
 * size). Returns `true` when any canvas could not be copied.
 */
export function copyCanvasBitmaps(
  sourceRoot: HTMLElement,
  cloneRoot: HTMLElement,
  pixelBudget: number = VIEW_CAPTURE_CANVAS_PIXEL_BUDGET,
): boolean {
  const sources: HTMLCanvasElement[] = liveCanvases(sourceRoot);
  const clones: HTMLCanvasElement[] = liveCanvases(cloneRoot);
  if (sources.length !== clones.length) {
    return true;
  }
  let degraded: boolean = false;
  for (let i: number = 0; i < sources.length; i += 1) {
    const source: HTMLCanvasElement = sources[i];
    const clone: HTMLCanvasElement = clones[i];
    const width: number = source.width;
    const height: number = source.height;
    if (width * height > pixelBudget) {
      degraded = true;
      continue;
    }
    clone.width = width;
    clone.height = height;
    try {
      const ctx: CanvasRenderingContext2D | null = clone.getContext("2d");
      if (ctx == null) {
        degraded = true;
        continue;
      }
      ctx.drawImage(source, 0, 0);
    } catch {
      degraded = true;
    }
  }
  return degraded;
}

function markCloneInert(node: HTMLElement): void {
  node.style.pointerEvents = "none";
  node.setAttribute("aria-hidden", "true");
  const inertTarget: HTMLElement & Partial<InertAssignable> = node;
  if ("inert" in inertTarget) {
    inertTarget.inert = true;
  } else {
    node.setAttribute("inert", "");
  }
  node.setAttribute(WORKSPACE_TRANSITION_CLONE_ATTR, "");
}

function emptyDegradedClone(): CapturedViewClone {
  const node: HTMLElement = document.createElement("div");
  markCloneInert(node);
  return { node, degraded: true };
}

/**
 * Freeze `root` (typically the set-mode viewport) as an inert overlay clone.
 *
 * Steps: `cloneNode(true)` → drop existing transition layers → copy canvas
 * bitmaps → strip `id` + hit-test `data-*` → `pointer-events: none`,
 * `aria-hidden`, `inert`. A failed / oversized canvas sets `degraded`.
 */
export function captureViewClone(root: HTMLElement): CapturedViewClone {
  const cloned: Node = root.cloneNode(true);
  if (!(cloned instanceof HTMLElement)) {
    return emptyDegradedClone();
  }
  removeTransitionLayers(cloned);
  const degraded: boolean = copyCanvasBitmaps(root, cloned);
  stripCloneIdentity(cloned);
  markCloneInert(cloned);
  return { node: cloned, degraded };
}
