import { createFrameLoop, type FrameLoop, type Rect } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import type { LeafMotionFrame, LeafMotionTick } from "../engine/leaf-motion";

/**
 * The DOM half of leaf motion (`engine/leaf-motion.ts` is the DOM-free half):
 * where a leaf is laid out, and how a {@link LeafMotionFrame} is drawn.
 *
 * Each leaf is a renderer-owned wrapper (`[data-hpt-leaf]`, laid out by the
 * flex/master geometry) holding the tile root (the content) and a frame layer
 * (`[data-hpt-leaf-frame]`). At rest the frame is hidden and nothing is written:
 * the leaf looks exactly as it did before leaf motion existed. While it moves:
 *
 * - the wrapper is translated by `reveal.dx, dy` (plus a uniform scale and
 *   opacity while it pops in) — never scaled per axis;
 * - the frame layer takes the tile root's chrome (background, border, radius,
 *   shadow, backdrop filter, copied once from its computed style when the move
 *   starts) and is drawn at the DRAWN size, behind the content;
 * - the tile root keeps its layout at the target size, its own chrome is made
 *   transparent (the frame draws it) and its content is clipped to the drawn
 *   size (`clip-path: inset(0 clipRight clipBottom 0 round …)`).
 *
 * So text is never stretched, a shrinking leaf shows its own background closing
 * in, and a growing one reveals content already laid out at its new size.
 */

/** The frame loop every renderer's leaf motion shares (created on first use, in the browser). */
let sharedLoop: FrameLoop | null = null;

/** The one frame loop leaf motion steps and draws on. */
export function leafMotionFrameLoop(): FrameLoop {
  if (sharedLoop == null) {
    sharedLoop = createFrameLoop({ clock: createBrowserClock() });
  }
  return sharedLoop;
}

/** Offset of `element`'s border box from the document, ignoring transforms. */
function offsetFromDocument(element: HTMLElement): { x: number; y: number } {
  let x: number = 0;
  let y: number = 0;
  let node: HTMLElement | null = element;
  while (node != null) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/**
 * The leaf's LAYOUT rect relative to `container`, from offset geometry, so a
 * transform on the leaf (a glide in flight) never leaks into its target.
 * `null` when the leaf is not laid out (display: none, detached).
 */
export function measureLeafLayoutRect(leaf: HTMLElement, container: HTMLElement): Rect | null {
  if (!leaf.isConnected || leaf.offsetParent == null) {
    return null;
  }
  const width: number = leaf.offsetWidth;
  const height: number = leaf.offsetHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const at: { x: number; y: number } = offsetFromDocument(leaf);
  const origin: { x: number; y: number } = offsetFromDocument(container);
  return { x: at.x - origin.x, y: at.y - origin.y, width, height };
}

/** The chrome properties the frame layer takes over from the tile root while a leaf moves. */
const FRAME_CHROME_PROPERTIES: ReadonlyArray<string> = [
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "background-origin",
  "background-clip",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "backdrop-filter",
  "-webkit-backdrop-filter",
];

/** What the tile root draws itself while the frame draws its chrome. */
const CONTENT_NEUTRAL_CHROME: ReadonlyArray<readonly [string, string]> = [
  ["background-color", "transparent"],
  ["background-image", "none"],
  ["box-shadow", "none"],
  ["border-top-color", "transparent"],
  ["border-right-color", "transparent"],
  ["border-bottom-color", "transparent"],
  ["border-left-color", "transparent"],
  ["backdrop-filter", "none"],
  ["-webkit-backdrop-filter", "none"],
  ["clip-path", ""],
];

/** One inline property leaf motion overrides on the tile root. */
interface OverriddenProperty {
  readonly property: string;
  /** The root's own inline value and priority before the move ("" when it had none). */
  readonly savedValue: string;
  readonly savedPriority: string;
  /** What leaf motion last wrote, as the browser serialises it. */
  written: string;
}

/** A leaf in motion: the tile root it took the chrome from and that root's own inline values. */
interface MovingLeaf {
  readonly content: HTMLElement;
  readonly overrides: ReadonlyArray<OverriddenProperty>;
  /** Content box inset inside the wrapper (the frame is drawn over the content's box). */
  readonly insetLeft: number;
  readonly insetTop: number;
  readonly insetWidth: number;
  readonly insetHeight: number;
  readonly radius: string;
}

const movingLeaves: WeakMap<HTMLElement, MovingLeaf> = new WeakMap<HTMLElement, MovingLeaf>();

/** The wrapper's frame layer (rendered by the renderer as its first child). */
function frameLayerOf(wrapper: HTMLElement): HTMLElement | null {
  for (const child of Array.from(wrapper.children)) {
    if (child instanceof HTMLElement && child.hasAttribute("data-hpt-leaf-frame")) {
      return child;
    }
  }
  return null;
}

/**
 * The tile root inside a leaf wrapper: its first element child that is neither
 * the frame layer nor a renderer affordance, looking through a stable-identity
 * host (`display: contents`).
 */
export function resolveLeafContent(wrapper: HTMLElement): HTMLElement | null {
  for (const child of Array.from(wrapper.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    if (child.hasAttribute("data-hpt-leaf-frame") || child.hasAttribute("data-hpt-leaf-affordance")) {
      continue;
    }
    if (child.hasAttribute("data-hpt-pane")) {
      const inner: Element | null = child.firstElementChild;
      return inner instanceof HTMLElement ? inner : null;
    }
    return child;
  }
  return null;
}

/**
 * Run `change` on `element`'s inline style with its transitions off, so the
 * consumer's own CSS transitions (a `transition: box-shadow …` on the pane) do
 * not replay when leaf motion swaps the chrome between the pane and the frame
 * layer: transitions off, the change, a style flush, then the pane's own
 * `transition` back.
 */
function withoutTransitions(element: HTMLElement, change: () => void): void {
  const value: string = element.style.getPropertyValue("transition");
  const priority: string = element.style.getPropertyPriority("transition");
  element.style.setProperty("transition", "none", "important");
  change();
  // Reading a computed value applies the change with transitions off.
  void getComputedStyle(element).getPropertyValue("box-shadow");
  if (value === "") {
    element.style.removeProperty("transition");
  } else {
    element.style.setProperty("transition", value, priority);
  }
}

function beginMove(wrapper: HTMLElement, frame: HTMLElement | null): MovingLeaf | null {
  const content: HTMLElement | null = resolveLeafContent(wrapper);
  if (content == null) {
    return null;
  }
  wrapper.style.position = "relative";
  wrapper.style.isolation = "isolate";
  const computed: CSSStyleDeclaration = getComputedStyle(content);
  if (frame != null) {
    for (const property of FRAME_CHROME_PROPERTIES) {
      frame.style.setProperty(property, computed.getPropertyValue(property));
    }
  }
  const radius: string = [
    computed.getPropertyValue("border-top-left-radius"),
    computed.getPropertyValue("border-top-right-radius"),
    computed.getPropertyValue("border-bottom-right-radius"),
    computed.getPropertyValue("border-bottom-left-radius"),
  ]
    .map((value: string): string => value.trim().split(" ")[0] || "0px")
    .join(" ");
  const overrides: OverriddenProperty[] = [];
  withoutTransitions(content, (): void => {
    for (const [property, value] of CONTENT_NEUTRAL_CHROME) {
      const override: OverriddenProperty = {
        property,
        savedValue: content.style.getPropertyValue(property),
        savedPriority: content.style.getPropertyPriority(property),
        written: "",
      };
      if (value !== "") {
        content.style.setProperty(property, value);
        override.written = content.style.getPropertyValue(property);
      }
      overrides.push(override);
    }
  });
  const moving: MovingLeaf = {
    content,
    overrides,
    insetLeft: content.offsetLeft,
    insetTop: content.offsetTop,
    insetWidth: wrapper.offsetWidth - content.offsetWidth,
    insetHeight: wrapper.offsetHeight - content.offsetHeight,
    radius,
  };
  movingLeaves.set(wrapper, moving);
  return moving;
}

function endMove(wrapper: HTMLElement): void {
  const moving: MovingLeaf | undefined = movingLeaves.get(wrapper);
  movingLeaves.delete(wrapper);
  if (moving != null) {
    const style: CSSStyleDeclaration = moving.content.style;
    withoutTransitions(moving.content, (): void => {
      for (const override of moving.overrides) {
        // Someone else (React re-rendering the pane's `style`) wrote this
        // property mid-glide: theirs wins, leave it alone.
        if (style.getPropertyValue(override.property) !== override.written) {
          continue;
        }
        if (override.savedValue === "") {
          style.removeProperty(override.property);
        } else {
          style.setProperty(override.property, override.savedValue, override.savedPriority);
        }
      }
    });
  }
  const frame: HTMLElement | null = frameLayerOf(wrapper);
  if (frame != null) {
    frame.removeAttribute("style");
    frame.style.display = "none";
  }
  for (const property of ["transform", "transform-origin", "opacity", "position", "isolation"]) {
    wrapper.style.removeProperty(property);
  }
}

/** Whether a frame draws the leaf exactly at its layout, fully open: nothing to write. */
function isAtRest(frame: LeafMotionFrame): boolean {
  const r = frame.reveal;
  return (
    !frame.moving &&
    frame.pop == null &&
    r.dx === 0 &&
    r.dy === 0 &&
    r.clipRight === 0 &&
    r.clipBottom === 0 &&
    r.width === frame.target.width &&
    r.height === frame.target.height
  );
}

const px = (value: number): string => `${Math.round(value * 100) / 100}px`;

/**
 * Draw one frame of a leaf on its wrapper. A frame at rest clears everything
 * leaf motion wrote, so a resting leaf carries no inline transform, clip or
 * frame layer.
 */
export function writeLeafMotionFrame(wrapper: HTMLElement, frame: LeafMotionFrame): void {
  if (isAtRest(frame)) {
    if (movingLeaves.has(wrapper) || wrapper.style.transform !== "") {
      endMove(wrapper);
    }
    return;
  }
  const layer: HTMLElement | null = frameLayerOf(wrapper);
  let moving: MovingLeaf | null = movingLeaves.get(wrapper) ?? null;
  if (moving != null && moving.content !== resolveLeafContent(wrapper)) {
    endMove(wrapper);
    moving = null;
  }
  if (moving == null) {
    moving = beginMove(wrapper, layer);
  }
  const r = frame.reveal;
  const pop = frame.pop;
  wrapper.style.transform =
    pop == null ? `translate(${px(r.dx)}, ${px(r.dy)})` : `translate(${px(r.dx)}, ${px(r.dy)}) scale(${pop.scale})`;
  if (pop == null) {
    wrapper.style.removeProperty("transform-origin");
    wrapper.style.removeProperty("opacity");
  } else {
    wrapper.style.transformOrigin = "50% 50%";
    wrapper.style.opacity = String(pop.opacity);
  }
  if (moving == null) {
    return;
  }
  if (layer != null) {
    layer.style.display = "block";
    layer.style.position = "absolute";
    layer.style.boxSizing = "border-box";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "-1";
    layer.style.left = px(moving.insetLeft);
    layer.style.top = px(moving.insetTop);
    layer.style.width = px(Math.max(0, r.width - moving.insetWidth));
    layer.style.height = px(Math.max(0, r.height - moving.insetHeight));
  }
  const clip: OverriddenProperty | undefined = moving.overrides.find(
    (override: OverriddenProperty): boolean => override.property === "clip-path",
  );
  moving.content.style.setProperty(
    "clip-path",
    r.clipRight > 0 || r.clipBottom > 0 ? `inset(0 ${px(r.clipRight)} ${px(r.clipBottom)} 0 round ${moving.radius})` : "none",
  );
  if (clip != null) {
    clip.written = moving.content.style.getPropertyValue("clip-path");
  }
}

/** Clear whatever leaf motion wrote on a wrapper (unmount, reset). */
export function clearLeafMotion(wrapper: HTMLElement): void {
  endMove(wrapper);
}

/**
 * Dev hook for frame-sampled browser specs (`apps/web/scripts/motion-spec.mjs`):
 * when the page defines `window.__HPT_MOTION_PROBE__ = {}` before the renderer
 * mounts, every leaf-motion write (once per animation frame while leaves move,
 * and once right after a layout commit) stores the stepped time and tempo there
 * and calls its `onWrite`, after the frame is drawn, so the spec samples the
 * page in the same frame and pairs it with the time the motion was stepped by.
 * Absent (always, in production use) it costs one property read per write.
 */
export interface LeafMotionProbe {
  time?: number;
  omega?: number;
  writes?: number;
  onWrite?: (time: number, delta: number) => void;
}

export function reportLeafMotionProbe(tick: LeafMotionTick, omega: number): void {
  const probe: LeafMotionProbe | undefined = (globalThis as { __HPT_MOTION_PROBE__?: LeafMotionProbe }).__HPT_MOTION_PROBE__;
  if (probe == null) {
    return;
  }
  probe.time = tick.time;
  probe.omega = omega;
  probe.writes = (probe.writes ?? 0) + 1;
  probe.onWrite?.(tick.time, tick.delta);
}
