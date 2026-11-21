import {
  layoutSplitTree,
  masterCount,
  masterRatio,
  masterStack,
  type FixedLength,
  type MasterOptions,
  type MinLength,
  type Split,
  type SplitLayout,
  type SplitOptions,
} from "@n-uf/placement/tiling";
import {
  crossAxisDimension,
  isStaticAlongSplitAxis,
  isStaticOnCrossAxis,
  resolveAlongAxisFloor,
  splitAxisDimension,
} from "./pane-sizing";
import type {
  TilingGroupNode,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingMasterOrientation,
  TilingPaneFootprint,
  TilingSplitAxis,
  TilingSplitNode,
  TilingDimension,
} from "./types";

/**
 * Canonical single-source leaf geometry — the ONE pass that resolves where every
 * pane sits, for rendering, hit-testing, footprints, overlays, candidate
 * derivation and directional focus.
 *
 * The arithmetic is `@n-uf/placement/tiling`'s split tree (`layoutSplitTree`,
 * `masterStack`). This module is the adapter: it maps a `TilingLayoutNode` onto
 * placement's `Split` and answers placement's per-split questions from the
 * tree's own data.
 *
 * - A pane is a slot (a leaf, or a group shown by its active member), keyed by
 *   its place in reading order, so a tree that repeats a leaf id keeps every
 *   occurrence. A split carries an id (its place in reading order, mapped back
 *   to its own id in the results), its axis (`horizontal` → `"x"`), ratio and
 *   own gap. A master split carries its count and side and NO gap: the master
 *   arrangement reads the layout's gap only.
 * - `fixed`: a child static ALONG the split with a usable px pin takes it when
 *   it fits (`pin + gutter < extent`); a static child with no usable pin reports
 *   length 0, so the split falls back to its ratio. Two collapsed leaves each
 *   keep their pin (HT-PANE-COLLAPSE-VOID).
 * - `fixedAcross`: a child static on the CROSS axis takes its pin across, from
 *   the start (the renderer's `align-self: flex-start`).
 * - `floor`: each side's along-axis floor by hypr-tiling's own precedence
 *   (`resolveAlongAxisFloor`); a "chrome" floor takes the 5–95% net off.
 *
 * Callbacks answer by pane key and split id, never by object identity: a drop
 * judged by placement copies nodes and makes splits with no id (a new split has
 * no sizing and no floors of its own).
 */

const GAP_FREE_UNIT_CONFIG: TilingLayoutConfig = {
  gapPx: 0,
  minPaneSizePx: 0,
  handleSizePx: 0,
};

/** @internal */
export interface TilingLeafFootprint extends TilingPaneFootprint {
  leafId: string;
}

// ============================================================================
// The mapping onto placement's split tree
// ============================================================================

/** A pane of the mapped split tree: its slot's place in reading order. @internal */
export type TilingPaneKey = number;

/** A layout as placement's split tree, and what its callbacks read. */
interface TilingSplitTree {
  readonly tree: Split<TilingPaneKey>;
  /** Each pane's slot (a leaf, or a group), by pane key. */
  readonly slots: ReadonlyArray<TilingLeafNode | TilingGroupNode>;
  /** The leaf each pane shows (a group: its active member), by pane key; null for a group with no active member. */
  readonly shown: ReadonlyArray<string | null>;
  /** Each split, by the id the mapping gave it. */
  readonly splits: ReadonlyMap<string, TilingSplitNode>;
  /** The layout options: the config's gap and handle, and the tree's fixed lengths and floors. */
  readonly options: SplitOptions<TilingPaneKey>;
}

/** A split a drop made: placement gives it no id; it has no sizing and no floors of its own. */
const NEW_SPLIT: TilingSplitNode = {
  kind: "split",
  id: "",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "", tileId: "" },
  second: { kind: "leaf", id: "", tileId: "" },
};

const engineAxis = (axis: "x" | "y"): TilingSplitAxis => (axis === "x" ? "horizontal" : "vertical");

/**
 * The px pin of `node` on `dimension`, or `null` when it has no usable one: a
 * usable pin is finite and strictly positive (a zero, negative or absent pin is
 * content-sized and unknowable to pure geometry).
 */
function pinPx(node: TilingLayoutNode, dimension: TilingDimension): number | null {
  const px: number | undefined = dimension === "width" ? node.sizing?.widthPx : node.sizing?.heightPx;
  if (px == null || !Number.isFinite(px) || px <= 0) {
    return null;
  }
  return px;
}

/**
 * A binary split's stored ratio as the floor clamp has always read it: as a number (`null` is 0, `true` 1, a numeric
 * string its number) clamped to 0..1, so ±Infinity lands on the floor bound as before; NaN stays NaN, which placement
 * lays out at 0.5. A master split's ratio goes through as stored: placement's master clamp reads it as the engine's
 * did (anything not a finite number is 0.5).
 */
function storedRatio(raw: unknown): number {
  const ratio: number = Number(raw);
  return Number.isNaN(ratio) ? ratio : Math.min(1, Math.max(0, ratio));
}

/**
 * The config fields the geometry reads (the gutter, and the floors `resolveAlongAxisFloor` resolves), copied: a mapped
 * tree is memoised, so its callbacks must not read a caller's config object that may change in place later.
 */
function geometryConfigOf(config: TilingLayoutConfig): TilingLayoutConfig {
  return {
    gapPx: config.gapPx,
    handleSizePx: config.handleSizePx,
    minPaneSizePx: config.minPaneSizePx,
    collapsedExtentPx: config.collapsedExtentPx,
    resizeFloor: config.resizeFloor,
  };
}

/**
 * `layout` as placement's split tree, with the options that read its sizing and floors under `config` (a snapshot of
 * the fields it reads, taken here).
 */
function toSplitTree(layout: TilingLayoutNode, liveConfig: TilingLayoutConfig): TilingSplitTree {
  const config: TilingLayoutConfig = geometryConfigOf(liveConfig);
  const slots: Array<TilingLeafNode | TilingGroupNode> = [];
  const shown: Array<string | null> = [];
  const splits: Map<string, TilingSplitNode> = new Map<string, TilingSplitNode>();

  const map = (node: TilingLayoutNode): Split<TilingPaneKey> => {
    if (node.kind !== "split") {
      const key: TilingPaneKey = slots.length;
      slots.push(node);
      shown.push(
        node.kind === "leaf"
          ? node.id
          : node.members.some((member: TilingLeafNode): boolean => member.id === node.activeMemberId)
            ? node.activeMemberId
            : null,
      );
      return { pane: key };
    }
    const id: string = String(splits.size);
    splits.set(id, node);
    const master: boolean = node.layoutMode === "master";
    const split: { id: string; a: Split<TilingPaneKey>; b: Split<TilingPaneKey>; axis: "x" | "y"; ratio: number; gap?: number; master?: MasterOptions } = {
      id,
      a: map(node.first),
      b: map(node.second),
      axis: node.axis === "horizontal" ? "x" : "y",
      ratio: master ? node.ratio : storedRatio(node.ratio),
    };
    if (master) {
      const options: { count?: number; side?: TilingMasterOrientation } = {};
      if (node.masterCount !== undefined) options.count = node.masterCount;
      if (node.masterOrientation !== undefined) options.side = node.masterOrientation;
      split.master = options;
    } else if (node.gapPx != null) {
      split.gap = node.gapPx;
    }
    return split;
  };
  const tree: Split<TilingPaneKey> = map(layout);

  const nodeOf = (child: Split<TilingPaneKey>): TilingLayoutNode =>
    ("pane" in child ? slots[child.pane] : child.id !== undefined ? splits.get(child.id) : undefined) ?? NEW_SPLIT;
  const fixed = (child: Split<TilingPaneKey>, axis: "x" | "y"): FixedLength | undefined => {
    const node: TilingLayoutNode = nodeOf(child);
    const along: TilingSplitAxis = engineAxis(axis);
    if (!isStaticAlongSplitAxis(node, along)) {
      return undefined;
    }
    return { length: pinPx(node, splitAxisDimension(along)) ?? 0, keep: node.kind === "leaf" && node.collapsed === true };
  };
  const fixedAcross = (child: Split<TilingPaneKey>, axis: "x" | "y"): number | undefined => {
    const node: TilingLayoutNode = nodeOf(child);
    const along: TilingSplitAxis = engineAxis(axis);
    return isStaticOnCrossAxis(node, along) ? (pinPx(node, crossAxisDimension(along)) ?? undefined) : undefined;
  };
  const floor = (child: Split<TilingPaneKey>, axis: "x" | "y", split: Split<TilingPaneKey>): MinLength => {
    const splitNode: TilingSplitNode | undefined = "pane" in split || split.id === undefined ? undefined : splits.get(split.id);
    const resolved = resolveAlongAxisFloor(nodeOf(child), engineAxis(axis), splitNode?.minPaneSizePx, config);
    return { min: resolved.floorPx, net: !resolved.isChromeFloor };
  };

  return {
    tree,
    slots,
    shown,
    splits,
    options: { gap: config.gapPx, handle: config.handleSizePx, fixed, fixedAcross, floor },
  };
}

// ============================================================================
// Memo: layout trees are immutable (every reducer returns a new tree), so the
// mapped tree and its layout in a box are kept per root node, config and box.
// ============================================================================

/** A tree mapped under one config, and its layout in the last few boxes. */
interface MemoEntry {
  readonly configKey: string;
  readonly mapped: TilingSplitTree;
  readonly boxes: Array<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly laid: SplitLayout<TilingPaneKey> }>;
}

const MEMO: WeakMap<TilingLayoutNode, Array<MemoEntry>> = new WeakMap<TilingLayoutNode, Array<MemoEntry>>();
/** Configs and boxes kept per tree: a drag reads one or two of each. */
const MEMO_CONFIGS: number = 4;
const MEMO_BOXES: number = 4;

/** Every config field the geometry reads (the gutter, and the floors `resolveAlongAxisFloor` resolves). */
const configKeyOf = (config: TilingLayoutConfig): string =>
  `${config.gapPx}|${config.handleSizePx}|${config.minPaneSizePx}|${config.collapsedExtentPx}|${config.resizeFloor}`;

/** `layout` mapped under `config` and laid out in the box, from the memo when it has them. */
function layOut(layout: TilingLayoutNode, x: number, y: number, width: number, height: number, config: TilingLayoutConfig): { mapped: TilingSplitTree; laid: SplitLayout<TilingPaneKey> } {
  const configKey: string = configKeyOf(config);
  let entries: Array<MemoEntry> | undefined = MEMO.get(layout);
  if (entries == null) {
    entries = [];
    MEMO.set(layout, entries);
  }
  let entry: MemoEntry | undefined = entries.find((candidate: MemoEntry): boolean => candidate.configKey === configKey);
  if (entry == null) {
    entry = { configKey, mapped: toSplitTree(layout, config), boxes: [] };
    entries.unshift(entry);
    if (entries.length > MEMO_CONFIGS) entries.pop();
  }
  let box = entry.boxes.find((candidate): boolean => Object.is(candidate.x, x) && Object.is(candidate.y, y) && Object.is(candidate.width, width) && Object.is(candidate.height, height));
  if (box == null) {
    box = { x, y, width, height, laid: layoutSplitTree(entry.mapped.tree, { x, y, width, height }, entry.mapped.options) };
    entry.boxes.unshift(box);
    if (entry.boxes.length > MEMO_BOXES) entry.boxes.pop();
  }
  return { mapped: entry.mapped, laid: box.laid };
}

/** The footprints of a laid-out mapped tree, in reading order; a group with no active member shows nothing. */
function footprintsOf(mapped: TilingSplitTree, laid: SplitLayout<TilingPaneKey>): Array<TilingLeafFootprint> {
  const footprints: Array<TilingLeafFootprint> = [];
  for (const [key, rect] of laid.panes) {
    const leafId: string | null = mapped.shown[key] ?? null;
    if (leafId != null) {
      footprints.push({ leafId, left: rect.x, top: rect.y, width: rect.width, height: rect.height });
    }
  }
  return footprints;
}

// ============================================================================
// Master / stack
// ============================================================================

/** Resolved master/stack parameters for a `layoutMode: "master"` split. @internal */
export interface MasterStackParams {
  /** Number of slots in the master area, clamped to `[1, slotCount]`. */
  count: number;
  orientation: TilingMasterOrientation;
  /** Master-area fraction along the orientation's primary axis, clamped `[0.05, 0.95]`. */
  ratio: number;
}

/**
 * The ordered list of master/stack SLOTS under a subtree — the descendant
 * non-split nodes (leaves and groups) in reading order. Nested split structure
 * is flattened: a `layoutMode: "master"` split lays its descendant slots out as
 * a FLAT list (the Hyprland master layout is a flat window list, not a tree).
 * The binary structure still defines slot membership + order + identity and the
 * reducers still operate on it.
 * @internal
 */
export function collectMasterSlots(node: TilingLayoutNode): ReadonlyArray<TilingLayoutNode> {
  if (node.kind === "leaf" || node.kind === "group") {
    return [node];
  }
  return [...collectMasterSlots(node.first), ...collectMasterSlots(node.second)];
}

/**
 * The representative leaf id of a slot — the id its single footprint is keyed by
 * (and the id the renderer focuses / hit-tests). A leaf is itself; a group
 * resolves to its active member id; a split slot (never produced: slots are
 * flattened to non-splits) falls back to its first descendant leaf.
 * @internal
 */
export function slotRepresentativeLeafId(node: TilingLayoutNode): string {
  if (node.kind === "leaf") {
    return node.id;
  }
  if (node.kind === "group") {
    return node.activeMemberId;
  }
  return slotRepresentativeLeafId(node.first);
}

/**
 * Resolve a master split's parameters by placement's own master clamps: the
 * count rounded and kept within `[1, slotCount]` (NaN is 1, `masterCount`), the
 * ratio clamped to `[0.05, 0.95]` (not finite: 0.5, `masterRatio`), so the
 * params agree with the master layout `layoutSplitTree` draws. @internal
 */
export function resolveMasterParams(node: TilingSplitNode, slotCount: number): MasterStackParams {
  return {
    count: masterCount(node.masterCount, slotCount),
    orientation: node.masterOrientation ?? "left",
    ratio: masterRatio(node.ratio),
  };
}

/**
 * Master/stack geometry (HT-LAYOUT-MASTER-STACK): placement's `masterStack`
 * over the ordered `slots` — `params.count` master tiles in a master area of
 * `params.ratio` of the extent less one gap (`config.gapPx`, never the handle),
 * the rest in a stack, each area divided equally with gaps. Left and right make
 * the areas columns, top and bottom rows; right and bottom put the stack first.
 * With no stack all slots fill the container. Each slot then resolves its own
 * footprint (a group shows its active member). `masterStack` re-normalises
 * `params` itself: the count is rounded and kept within `[1, slotCount]` (NaN
 * is 1) and the ratio clamped to `[0.05, 0.95]` (not finite: 0.5), so params
 * from `resolveMasterParams` pass through unchanged.
 * @internal
 */
export function resolveMasterStackFootprints(
  slots: ReadonlyArray<TilingLayoutNode>,
  left: number,
  top: number,
  width: number,
  height: number,
  config: TilingLayoutConfig,
  params: MasterStackParams,
): ReadonlyArray<TilingLeafFootprint> {
  const rects = masterStack(
    slots.map((_slot: TilingLayoutNode, index: number): number => index),
    { x: left, y: top, width, height },
    { gap: config.gapPx, ratio: params.ratio, count: params.count, side: params.orientation },
  );
  return [...rects].flatMap(([index, rect]): ReadonlyArray<TilingLeafFootprint> =>
    collectLeafFootprints(slots[index] as TilingLayoutNode, rect.x, rect.y, rect.width, rect.height, config),
  );
}

/**
 * A slot box as CSS lengths: `left` / `width` resolve against the container's
 * width, `top` / `height` against its height. @internal
 */
export interface TilingCssFootprint {
  left: string;
  top: string;
  width: string;
  height: string;
}

// Probe sizes for `resolveMasterStackCssFootprints`: large enough that no
// `Math.max(0, …)` clamp in the resolver is reached.
const CSS_PROBE_BASE_PX: number = 10_000;
const CSS_PROBE_STEP_PX: number = 10_000;
const CSS_PROBE_CHECK_PX: number = 37_000;

function cssLength(perPx: number, offsetPx: number): string {
  const percent: number = Math.round(perPx * 100 * 1e4) / 1e4;
  const px: number = Math.round(offsetPx * 1e3) / 1e3;
  if (percent === 0) {
    return `${px}px`;
  }
  if (px === 0) {
    return `${percent}%`;
  }
  return `calc(${percent}% ${px < 0 ? "-" : "+"} ${Math.abs(px)}px)`;
}

/**
 * Master/stack slot boxes as CSS lengths, for a container that has no measured
 * size yet (server render, hydration). Each edge `resolveMasterStackFootprints`
 * returns is linear in one container dimension (`a * size + b`), so
 * `calc(a * 100% + b px)` lands on the same box once the container has a size:
 * a prerendered master layout paints at its real geometry and does not move
 * when it is measured. Keyed by slot representative leaf id, like the px
 * footprints. Null when a box is not linear in the container size (the
 * resolver has no such case today; this keeps a future floor from producing
 * wrong CSS).
 * @internal
 */
export function resolveMasterStackCssFootprints(
  slots: ReadonlyArray<TilingLayoutNode>,
  config: TilingLayoutConfig,
  params: MasterStackParams,
): ReadonlyMap<string, TilingCssFootprint> | null {
  const resolveAt = (widthPx: number, heightPx: number): ReadonlyMap<string, TilingPaneFootprint> =>
    footprintsByLeafId(resolveMasterStackFootprints(slots, 0, 0, widthPx, heightPx, config, params));
  const base: number = CSS_PROBE_BASE_PX;
  const step: number = CSS_PROBE_STEP_PX;
  const check: number = CSS_PROBE_CHECK_PX;
  const atBase = resolveAt(base, base);
  const wider = resolveAt(base + step, base);
  const taller = resolveAt(base, base + step);
  const atCheck = resolveAt(check, check);
  const result: Map<string, TilingCssFootprint> = new Map<string, TilingCssFootprint>();
  for (const [leafId, box] of atBase) {
    const boxWider: TilingPaneFootprint | undefined = wider.get(leafId);
    const boxTaller: TilingPaneFootprint | undefined = taller.get(leafId);
    const boxCheck: TilingPaneFootprint | undefined = atCheck.get(leafId);
    if (boxWider == null || boxTaller == null || boxCheck == null) {
      return null;
    }
    const edge = (key: keyof TilingPaneFootprint, alongWidth: boolean): string | null => {
      const grown: TilingPaneFootprint = alongWidth ? boxWider : boxTaller;
      const crossGrown: TilingPaneFootprint = alongWidth ? boxTaller : boxWider;
      if (Math.abs(crossGrown[key] - box[key]) > 0.001) {
        return null; // depends on the other dimension
      }
      const slope: number = (grown[key] - box[key]) / step;
      const offset: number = box[key] - slope * base;
      if (Math.abs(slope * check + offset - boxCheck[key]) > 0.001) {
        return null; // not linear
      }
      return cssLength(slope, offset);
    };
    const left: string | null = edge("left", true);
    const width: string | null = edge("width", true);
    const top: string | null = edge("top", false);
    const height: string | null = edge("height", false);
    if (left == null || width == null || top == null || height == null) {
      return null;
    }
    result.set(leafId, { left, top, width, height });
  }
  return result;
}

/**
 * Every shown leaf's footprint in the box `left`/`top`/`width`/`height`, in
 * reading order (placement's `layoutSplitTree` over the mapped tree): a binary
 * split puts the middle of its gutter (gap + handle) at `ratio` of its extent,
 * after its floors, unless a static child's pin decides; a master split lays its
 * slots out as master and stack; a group shows its active member only (inactive
 * members have no footprint, so they are never hit-tested / overlaid).
 * @internal
 */
export function collectLeafFootprints(
  node: TilingLayoutNode,
  left: number,
  top: number,
  width: number,
  height: number,
  config: TilingLayoutConfig,
): ReadonlyArray<TilingLeafFootprint> {
  const { mapped, laid } = layOut(node, left, top, width, height, config);
  return footprintsOf(mapped, laid);
}

// ============================================================================
// Public (engine entry): the layout's geometry in px, by the renderer's own math
// ============================================================================

/**
 * A rect in CSS px: `x` / `y` are its top-left corner in the container's coordinates.
 */
export interface TilingRect {
  /** Left edge, CSS px */
  x: number;
  /** Top edge, CSS px */
  y: number;
  /** CSS px, never negative */
  width: number;
  /** CSS px, never negative */
  height: number;
}

/** A split as laid out: its box and the ratio in effect (see {@link resolveLayoutGeometry}). */
export interface TilingSplitGeometry {
  /** The box the split divides */
  rect: TilingRect;
  /**
   * The ratio in effect: a binary split's stored ratio after the floor clamp, or where a static child puts the boundary
   * (the middle of the gutter); a master split's master-area share of its extent less one gap
   */
  ratio: number;
}

/** The px geometry of a layout tree in a container (see {@link resolveLayoutGeometry}). */
export interface TilingLayoutGeometry {
  /** Each shown leaf's rect, keyed by leaf id (a group: its active member's), in reading order */
  leaves: ReadonlyMap<string, TilingRect>;
  /** Each laid-out split's box and the ratio in effect, keyed by split id (unique ids: a repeated id keeps the last) */
  splits: ReadonlyMap<string, TilingSplitGeometry>;
}

const toRect = (box: TilingPaneFootprint): TilingRect => ({ x: box.left, y: box.top, width: box.width, height: box.height });

/**
 * Where every pane of `layout` sits in `container`, in CSS px: the renderer's own leaf geometry (the one pass that
 * also drives hit-testing, overlays and directional focus), so a host that places windows by it lands exactly where
 * the renderer would.
 *
 * - A binary split gives its first child `ratio` of the extent less half the gutter (`gapPx` + `handleSizePx`, a
 *   split's own `gapPx` first) and its second child the rest less the other half. The ratio in effect is the stored
 *   one clamped so each direct child keeps its floor; when both floors can't fit it is 0.5. Under the default
 *   `resizeFloor: "chrome"` the floor is the collapsed title bar (`collapsedExtentPx`) and the 5–95% net is off; for a
 *   minimum pane size pass `resizeFloor: "body"` with `minPaneSizePx` (a leaf's `minBBoxPx` and a split's
 *   `minPaneSizePx` win over it), and the 5–95% net applies. The floor counts against the extent less the gutter, so
 *   with a gutter a floored pane lands up to half a gutter short of it, as the renderer draws it. A child static along
 *   the split takes its px pin.
 * - A `layoutMode: "master"` split lays its descendants out as a flat list: `masterCount` tiles in a master area of
 *   `ratio` (clamped 0.05–0.95) of the extent less one gap, the rest in a stack, each area divided equally with
 *   gaps. Its nested splits are not reported.
 * - A group shows its active member in the whole slot.
 * - Nothing is rounded: rects are fractional px, as the renderer lays them out. A container smaller than its gutters
 *   gives zero-size panes (never negative), which may sit past its edge.
 *
 * `splits` reports each laid-out split once, with its box and the ratio in effect (a static child's boundary as a
 * ratio of the extent).
 */
export function resolveLayoutGeometry(layout: TilingLayoutNode, container: TilingRect, config: TilingLayoutConfig): TilingLayoutGeometry {
  const { mapped, laid } = layOut(layout, container.x, container.y, container.width, container.height, config);
  const leaves: Map<string, TilingRect> = new Map<string, TilingRect>(
    footprintsOf(mapped, laid).map((footprint: TilingLeafFootprint): [string, TilingRect] => [footprint.leafId, toRect(footprint)]),
  );
  const splits: Map<string, TilingSplitGeometry> = new Map<string, TilingSplitGeometry>();
  for (const [mappedId, geometry] of laid.splits) {
    const split: TilingSplitNode | undefined = mapped.splits.get(mappedId);
    if (split != null) {
      splits.set(split.id, { rect: { ...geometry.rect }, ratio: geometry.ratio });
    }
  }
  return { leaves, splits };
}

/** Each shown leaf's rect in `container`, in CSS px, keyed by leaf id: {@link resolveLayoutGeometry}'s `leaves`. */
export function resolveLeafRects(layout: TilingLayoutNode, container: TilingRect, config: TilingLayoutConfig): ReadonlyMap<string, TilingRect> {
  return resolveLayoutGeometry(layout, container, config).leaves;
}

/**
 * The layout in a unit square, for topological directional-neighbor search
 * (`findLeafByDirection`): the canonical geometry in normalized 0..1 space with
 * a gap-free config and the px floors (the 40 px chrome floor by default), in
 * reading order. Directional focus is purely positional (centers + axis
 * overlap): a px floor or along-axis pin cannot fit a 1-unit container, so
 * every split lays out at its floor fallback (0.5) and the static arm falls
 * through to the ratio.
 * @internal
 */
export function collectNormalizedLeafFootprints(node: TilingLayoutNode): ReadonlyArray<TilingLeafFootprint> {
  return collectLeafFootprints(node, 0, 0, 1, 1, GAP_FREE_UNIT_CONFIG);
}

/** @internal */
export function footprintsByLeafId(
  footprints: ReadonlyArray<TilingLeafFootprint>,
): ReadonlyMap<string, TilingPaneFootprint> {
  return new Map<string, TilingPaneFootprint>(
    footprints.map((footprint: TilingLeafFootprint): [string, TilingPaneFootprint] => [
      footprint.leafId,
      {
        left: footprint.left,
        top: footprint.top,
        width: footprint.width,
        height: footprint.height,
      },
    ]),
  );
}

const FOOTPRINT_DELTA_EPSILON_PX: number = 0.5;

/** @internal */
export function isFootprintChanged(previous: TilingPaneFootprint, next: TilingPaneFootprint): boolean {
  return (
    Math.abs(previous.left - next.left) > FOOTPRINT_DELTA_EPSILON_PX ||
    Math.abs(previous.top - next.top) > FOOTPRINT_DELTA_EPSILON_PX ||
    Math.abs(previous.width - next.width) > FOOTPRINT_DELTA_EPSILON_PX ||
    Math.abs(previous.height - next.height) > FOOTPRINT_DELTA_EPSILON_PX
  );
}
