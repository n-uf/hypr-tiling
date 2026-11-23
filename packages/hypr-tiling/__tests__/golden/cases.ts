/**
 * Golden cases: the engine's answers over seeded inputs, recorded once from the
 * 26.11.6 release and replayed by `golden.test.ts`, so a change that moves any
 * layout, drop region, drop, close, focus move, pane-motion frame or gesture
 * state shows up as a difference. `HPT_GOLDEN_WRITE=1 pnpm test golden` rewrites
 * the fixtures; do that only for a change meant to alter an answer, and say
 * which cases moved in its commit.
 *
 * The drag sections (`regions`, `drops`, `drop-boundary`, `drag-home`, `drag-home-return`, `drag-home-column`,
 * `drag-forward-column`) were re-recorded for the drag's place coming from placement's `tilingDrag` hit: they read
 * the hit and `after(place)` where they once read hypr-tiling's own zone classifier, validity and home rules.
 *
 * The one move rule (every move commits `after(place)` and shares its refusals) re-recorded `drops`,
 * `drag-forward-column` and the keyboard rows of `edits` (`move/…`): a refused place commits nothing there now,
 * where the reducers' tree used to be recorded, and a keyboard move is the drag's `after(beside)`.
 */
import { createFakeClock, createFrameLoop, type FakeClock, type FrameLoop, type Rect } from "@n-uf/motion";
import { createDragIntent } from "@n-uf/motion/drag";
import { paneRegion, type TilingBasis, type TilingDrag, type TilingHeld, type TilingHit, type TilingHitRead, type TilingHitTarget } from "@n-uf/placement/tiling";
import { resolvePaneCenterGeometry, TILING_DROP_INTENT_CONFIG } from "../../engine/drop-intent-resolver";
import type { DragMachinePoint, DragResolvedTarget } from "../../engine/drag-machine";
import { clampHeldRectToStage, resolveTileRect } from "../../engine/drag-landing";
import {
  collectStaticGatedLeafIds,
  createLayoutTilingDrag,
  deriveDropCommitTree,
  resolveTilingMove,
  tilingDragParts,
  tilingStillTiles,
  type TilingDragTree,
} from "../../engine/tiling-drag-tree";
import { collectLeafFootprints, footprintsByLeafId, resolveLayoutGeometry } from "../../engine/leaf-geometry";
import { buildDefaultDwindleLayout, normalizeLayout } from "../../engine/layout-normalize";
import { createLeafMotion, type LeafMotion, type LeafMotionFrame } from "../../engine/leaf-motion";
import {
  findLeafByDirection,
  growLeafToward,
  insertLeafInto,
  readLeafNodeIds,
  removeLeafTile,
  setLeafCollapsed,
} from "../../engine/state";
import {
  TILING_SPRING_LOAD_INITIAL_STATE,
  springLoadReducer,
  type TilingSpringLoadEvent,
  type TilingSpringLoadState,
} from "../../engine/workspace-spring-load";
import {
  TILING_WORKSPACE_SWIPE_DEFAULTS,
  TILING_WORKSPACE_SWIPE_INITIAL_STATE,
  workspaceSwipeReducer,
  type TilingWorkspaceSwipeConfig,
  type TilingWorkspaceSwipeEvent,
  type TilingWorkspaceSwipeState,
} from "../../engine/workspace-navigation";
import type { TilingLayoutConfig, TilingLayoutNode, TilingLeafNode, TilingSplitNode } from "../../engine/types";

// ---------------------------------------------------------------- inputs

/** A seeded generator (mulberry32): the same seed gives the same cases on every machine. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ORIENTATIONS = ["left", "right", "top", "bottom"] as const;

/**
 * A random tree over `tiles`. `rich` adds the node features the geometry reads: per-split gaps and floors, static
 * pins along and across, leaf floors and resize floors, collapsed leaves, master splits and groups.
 */
export function randomTree(r: () => number, tiles: readonly string[], rich: boolean, prefix = "s"): TilingLayoutNode {
  let seq = 0;
  const leaf = (tile: string): TilingLeafNode => {
    const node: TilingLeafNode = { kind: "leaf", id: `L-${tile}`, tileId: tile };
    if (!rich) return node;
    const roll = r();
    if (roll < 0.08) return { ...node, sizing: { width: "static", widthPx: Math.round(60 + r() * 240) } };
    if (roll < 0.16) return { ...node, sizing: { height: "static", heightPx: Math.round(40 + r() * 200) } };
    if (roll < 0.22) return { ...node, minBBoxPx: { widthPx: Math.round(50 + r() * 200), heightPx: Math.round(40 + r() * 150) }, resizeFloor: "body" };
    if (roll < 0.27) return { ...node, resizeFloor: "body" };
    return node;
  };
  const build = (ids: readonly string[]): TilingLayoutNode => {
    if (ids.length === 1) {
      if (rich && r() < 0.08) {
        const tile = ids[0]!;
        const extra = `${tile}x`;
        return {
          kind: "group",
          id: `G-${tile}`,
          members: [leaf(tile), { kind: "leaf", id: `L-${extra}`, tileId: extra }],
          activeMemberId: r() < 0.5 ? `L-${tile}` : `L-${extra}`,
        };
      }
      return leaf(ids[0]!);
    }
    const cut = 1 + Math.floor(r() * (ids.length - 1));
    const split: TilingSplitNode = {
      kind: "split",
      id: `${prefix}${seq++}`,
      axis: r() < 0.5 ? "horizontal" : "vertical",
      ratio: Math.round((0.1 + r() * 0.8) * 1000) / 1000,
      first: build(ids.slice(0, cut)),
      second: build(ids.slice(cut)),
    };
    if (!rich) return split;
    const roll = r();
    if (roll < 0.08) return { ...split, gapPx: Math.round(r() * 16) };
    if (roll < 0.14) return { ...split, minPaneSizePx: Math.round(30 + r() * 150) };
    if (roll < 0.2 && ids.length >= 3)
      return { ...split, layoutMode: "master", masterCount: 1 + Math.floor(r() * 3), masterOrientation: ORIENTATIONS[Math.floor(r() * 4)]! };
    return split;
  };
  let tree = build(tiles);
  if (rich) {
    for (const id of readLeafNodeIds(tree)) if (r() < 0.07) tree = setLeafCollapsed(tree, id, true, 40);
  }
  return tree;
}

export const tilesOf = (n: number): string[] => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

export const CONFIGS: Readonly<Record<string, TilingLayoutConfig>> = {
  bare: { gapPx: 0, handleSizePx: 0, minPaneSizePx: 0, resizeFloor: "body" },
  default: { gapPx: 6, minPaneSizePx: 96, handleSizePx: 4 },
  body: { gapPx: 6, minPaneSizePx: 96, handleSizePx: 4, resizeFloor: "body" },
  wide: { gapPx: 12, minPaneSizePx: 40, handleSizePx: 0, collapsedExtentPx: 28 },
};

export const AREAS: readonly Rect[] = [
  { x: 0, y: 0, width: 1280, height: 800 },
  { x: 10, y: 20, width: 800, height: 1280 },
  { x: 0, y: 0, width: 320, height: 240 },
  { x: 0, y: 0, width: 97.5, height: 61.3 },
];

/** The trees every section reads: plain ones, then ones with every node feature. */
export function goldenTrees(): { readonly name: string; readonly tree: TilingLayoutNode }[] {
  const out: { name: string; tree: TilingLayoutNode }[] = [];
  for (let seed = 1; seed <= 24; seed++) {
    const r = seeded(seed);
    out.push({ name: `plain-${seed}`, tree: randomTree(r, tilesOf(2 + Math.floor(r() * 7)), false) });
  }
  for (let seed = 101; seed <= 136; seed++) {
    const r = seeded(seed);
    out.push({ name: `rich-${seed}`, tree: randomTree(r, tilesOf(2 + Math.floor(r() * 8)), true) });
  }
  return out;
}

// ---------------------------------------------------------------- a compact tree print

/** A tree as one line: ids, axes, ratios and every stored field, so a structural change shows. */
export function shape(node: TilingLayoutNode | null): string {
  if (node == null) return "∅";
  if (node.kind === "leaf") {
    const extras = Object.keys(node)
      .filter((k) => !["kind", "id", "tileId"].includes(k))
      .sort()
      .map((k) => `${k}=${JSON.stringify((node as unknown as Record<string, unknown>)[k])}`);
    return `L[${node.id}:${node.tileId}${extras.length ? `|${extras.join("|")}` : ""}]`;
  }
  if (node.kind === "group") return `G[${node.id}|${node.activeMemberId}|${node.sizing ? JSON.stringify(node.sizing) : ""}](${node.members.map(shape).join(",")})`;
  const extras = Object.keys(node)
    .filter((k) => !["kind", "id", "axis", "ratio", "first", "second"].includes(k))
    .sort()
    .map((k) => `${k}=${JSON.stringify((node as unknown as Record<string, unknown>)[k])}`);
  return `S[${node.id}|${node.axis === "horizontal" ? "h" : "v"}|${node.ratio}${extras.length ? `|${extras.join("|")}` : ""}](${shape(node.first)},${shape(node.second)})`;
}

const rectOf = (r: Rect): number[] => [r.x, r.y, r.width, r.height];

// ---------------------------------------------------------------- sections

/** Layouts: every leaf rect and every split's box and ratio in effect. */
export function layoutCases(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { name, tree } of goldenTrees()) {
    for (const [cname, config] of Object.entries(CONFIGS)) {
      AREAS.forEach((area, ai) => {
        const g = resolveLayoutGeometry(tree, area, config);
        out[`${name}/${cname}/${ai}`] = {
          leaves: [...g.leaves].map(([id, rect]) => [id, ...rectOf(rect)]),
          splits: [...g.splits].map(([id, s]) => [id, ...rectOf(s.rect), s.ratio]),
        };
      });
    }
  }
  for (let n = 0; n <= 8; n++) {
    const tree = buildDefaultDwindleLayout(tilesOf(n));
    out[`default-build/${n}`] = { shape: shape(tree), leaves: [...resolveLayoutGeometry(tree, AREAS[0]!, CONFIGS.default!).leaves].map(([id, rect]) => [id, ...rectOf(rect)]) };
  }
  // master geometry over every count and side
  for (const n of [1, 2, 3, 5]) {
    for (const count of [1, 2, 3, 9]) {
      for (const side of ORIENTATIONS) {
        for (const ratio of [0.5, 0.3, 0.97, Number.NaN]) {
          const chain = buildDefaultDwindleLayout(tilesOf(n));
          if (chain.kind !== "split") continue;
          const tree: TilingLayoutNode = { ...chain, layoutMode: "master", masterCount: count, masterOrientation: side, ratio };
          const g = resolveLayoutGeometry(tree, AREAS[0]!, CONFIGS.default!);
          out[`master/${n}/${count}/${side}/${ratio}`] = {
            leaves: [...g.leaves].map(([id, rect]) => [id, ...rectOf(rect)]),
            splits: [...g.splits].map(([id, s]) => [id, ...rectOf(s.rect), s.ratio]),
          };
        }
      }
    }
  }
  return out;
}

const ZONE_CODE: Record<string, string> = { center: "c", top: "t", right: "r", bottom: "b", left: "l" };

/**
 * Drop regions on a point grid, for every pane size and pixel ratio: the pane's center rectangle as the drop hit zone
 * geometry gives it (`resolvePaneCenterGeometry`), and the region of each point of the grid by placement's
 * `paneRegion` on that center, which is how the drag's hit reads a pane. The hit has no hysteresis of its own: what
 * it holds past a zone's edge is its one hold rule (`hold` in the drag hit's properties).
 */
export function regionCases(): Record<string, string | number[]> {
  const out: Record<string, string | number[]> = {};
  const sizes = [
    { width: 600, height: 400 },
    { width: 120, height: 90 },
    { width: 40, height: 300 },
    { width: 20, height: 20 },
    { width: 333.3, height: 211.7 },
  ];
  const configs = [TILING_DROP_INTENT_CONFIG, { centerRatio: 0.5, centerRatioY: 0.2, centerMinPx: 40 }];
  configs.forEach((config, ci) => {
    for (const size of sizes) {
      for (const dpr of [1, 1.5, 2]) {
        const geo = resolvePaneCenterGeometry(size, { ...config, devicePixelRatio: dpr });
        const paneCenter = { width: geo.width, height: geo.height, left: geo.centerLeftPx, top: geo.centerTopPx, right: geo.centerRightPx, bottom: geo.centerBottomPx };
        let line = "";
        for (let iy = 0; iy <= 16; iy++) {
          for (let ix = 0; ix <= 20; ix++) {
            const point = { x: -2 + ((size.width + 4) * ix) / 20, y: -2 + ((size.height + 4) * iy) / 16 };
            line += ZONE_CODE[paneRegion({ x: 0, y: 0, ...size }, point, null, { paneCenter })];
          }
        }
        out[`${ci}/${size.width}x${size.height}/${dpr}`] = line;
        out[`center/${ci}/${size.width}x${size.height}/${dpr}`] = [geo.centerLeftPx, geo.centerTopPx, geo.centerRightPx, geo.centerBottomPx];
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------- the drag's hit

/** The tile a leaf of `layout` shows (a group member's own tile), or null. */
function tileOfLeaf(layout: TilingLayoutNode, leafId: string): string | null {
  if (layout.kind === "leaf") return layout.id === leafId ? layout.tileId : null;
  if (layout.kind === "group") return layout.members.find((m) => m.id === leafId)?.tileId ?? null;
  return tileOfLeaf(layout.first, leafId) ?? tileOfLeaf(layout.second, leafId);
}

/** The drag of `sourceLeafId` as the renderer builds it at the lift (the static-gated panes take no drop), or null when the leaf cannot be lifted. */
export function layoutDrag(
  layout: TilingLayoutNode,
  sourceLeafId: string,
  area: { readonly width: number; readonly height: number },
  config: TilingLayoutConfig,
  subject?: "pane" | "group",
  parts?: Parameters<typeof tilingDragParts>[0],
): TilingDrag<TilingDragTree, string> | null {
  const gated = new Set<string>();
  for (const id of collectStaticGatedLeafIds(layout)) {
    const tile = tileOfLeaf(layout, id);
    if (tile != null) gated.add(tile);
  }
  try {
    return createLayoutTilingDrag({
      layout,
      sourceLeafId,
      ...(subject != null ? { subject } : {}),
      container: { width: area.width, height: area.height },
      config,
      min: config.minPaneSizePx,
      still: (tile: string): boolean => gated.has(tile),
      ...(parts != null ? { parts: tilingDragParts(parts) } : {}),
    });
  } catch {
    return null;
  }
}

/** A drag's hit on one basis, with the drag intent the pointer goes through, one sample every 16 ms. */
export interface HitRun {
  readonly drag: TilingDrag<TilingDragTree, string>;
  readonly hit: TilingHit<TilingDragTree, string>;
  /** The pointer at `point`: what the hit reads of the intent's frame. */
  at(point: DragMachinePoint): TilingHitRead<string>;
}

export function hitRun(drag: TilingDrag<TilingDragTree, string>, basis: TilingBasis): HitRun {
  const hit = drag.hit(basis);
  const intent = createDragIntent<TilingHitTarget<string>>({ ...hit.intent });
  let now = 0;
  return {
    drag,
    hit,
    at: (point: DragMachinePoint): TilingHitRead<string> => hit.read(intent.update(point, (now += 16), hit.targets), point),
  };
}

/** A held place as a short label. */
function heldLabel(held: TilingHeld<string>): string {
  if (held.kind === "home") return "home";
  if (held.kind === "swap") return `swap ${held.at}`;
  if (held.kind === "beside") return `${held.side} of ${held.at}`;
  return `join ${held.at}${held.index !== undefined ? `#${held.index}` : ""}`;
}

/** What a read holds, as a label: the held place, or the refused one with its code, or `-`. */
function readLabel(run: HitRun, read: TilingHitRead<string>): string {
  if (read.held != null) return heldLabel(read.held);
  if (read.refused != null) return `refused ${heldLabel(read.refused)} ${run.drag.after(read.refused).refusal?.code ?? "?"}`;
  return "-";
}

/** What a frame draws on the hit's basis: `lift` for the layout at the lift, else the tree's shape. */
function drawnLabel(run: HitRun, read: TilingHitRead<string>): string {
  const drawn = run.hit.drawn(read);
  return drawn.tree === run.drag.lift.tree ? "lift" : shape(drawn.tree.layout);
}

/** A release on a read: `cancel` (the layout comes back) or `commit` with the shape of the tree it stores. */
function releaseLabel(run: HitRun, read: TilingHitRead<string>): string {
  const after = run.hit.release(read);
  return read.held == null || read.held.kind === "home" || after.refusal != null ? "cancel" : `commit ${shape(after.tree.layout)}`;
}

/**
 * Drops: every source, target and region on the first trees of each kind. The tree the release commits (the drag
 * hit's `after(place).tree`, as the renderer stores it), the landing rect, and the verdict of each place under two
 * configs and two areas: `after(place).refusal`, judged on the drag's base (room) and on the layout the release
 * makes (fit); `1` taken, `0` refused, `-1` for a target the base does not draw.
 */
export function dropCases(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const trees = goldenTrees().filter((t) => /^(plain-[1-7]|rich-10[1-8])$/.test(t.name));
  for (const { name, tree } of trees) {
    const ids = readLeafNodeIds(tree);
    for (const s of ids) {
      for (const t of ids) {
        if (t === s) continue;
        const at = tileOfLeaf(tree, t)!;
        for (const zone of ["center", "top", "right", "bottom", "left"] as const) {
          const place: TilingHeld<string> = zone === "center" ? { kind: "swap", at } : { kind: "beside", at, side: zone };
          const target = {
            leafId: t,
            zone,
            action: zone === "center" ? "swap" : "edge-insert",
            finalEdge: zone === "center" ? null : zone,
            selectedSplitZone: zone === "center" ? null : zone,
            place,
          } as unknown as DragResolvedTarget;
          // A refused place commits nothing (null): no tree, no landing. The still panes are the renderer's.
          const committed = deriveDropCommitTree({
            layout: tree,
            sourceLeafId: s,
            target,
            container: { width: 1280, height: 800 },
            config: CONFIGS.default!,
            still: tilingStillTiles(tree, collectStaticGatedLeafIds(tree)),
          });
          const landing = committed == null ? null : resolveTileRect(committed, tileOfLeaf(tree, s)!, { width: 1280, height: 800 }, CONFIGS.default!);
          const valid: number[] = [];
          for (const config of [CONFIGS.default!, CONFIGS.body!]) {
            for (const area of [AREAS[0]!, AREAS[2]!]) {
              const drag = layoutDrag(tree, s, area, config);
              if (drag == null || !drag.base.layout.has(at)) {
                valid.push(-1);
                continue;
              }
              valid.push(drag.after(place).refusal == null ? 1 : 0);
            }
          }
          out[`${name}/${s}>${t}/${zone}`] = { tree: shape(committed), landing: landing ? rectOf(landing) : null, valid };
        }
      }
    }
  }
  return out;
}

/**
 * Closing a pane, opening one, the keyboard's edge inserts and growth. A keyboard edge insert (move mode's commit) is
 * the one move rule's (`resolveTilingMove`): the drag's `after(beside)` on a 1280×800 stage under the default config,
 * or `refused <code>` where that drag place is refused.
 */
export function editCases(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { name, tree } of goldenTrees()) {
    const ids = readLeafNodeIds(tree);
    for (const id of ids) out[`close/${name}/${id}`] = shape(removeLeafTile(tree, id));
    out[`open/${name}`] = shape(insertLeafInto(tree, { kind: "leaf", id: "L-new", tileId: "new" }));
    out[`open-first/${name}`] = shape(insertLeafInto(tree, { kind: "leaf", id: "L-new", tileId: "new" }, { kind: "root", side: "first" }));
    if (ids.length >= 2) {
      for (const side of ["left", "right", "top", "bottom"] as const) {
        const moved = resolveTilingMove({
          layout: tree,
          move: { kind: "move-mode", sourceLeafId: ids[0]!, targetLeafId: ids[ids.length - 1]!, placement: side },
          container: { width: 1280, height: 800 },
          config: CONFIGS.default!,
        });
        out[`move/${name}/${side}`] = moved.refusal != null ? `refused ${moved.refusal.code}` : shape(moved.layout);
      }
      for (const dir of ["left", "right", "up", "down"] as const) {
        out[`grow/${name}/${dir}`] = shape(growLeafToward(tree, ids[0]!, dir, { containerSizePx: 1280, gapPx: 10, minPaneSizePx: 96 }));
      }
    }
  }
  return out;
}

/** Directional focus from every pane in every direction. */
export function focusCases(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { name, tree } of goldenTrees()) {
    for (const id of readLeafNodeIds(tree)) {
      out[`${name}/${id}`] = (["left", "right", "up", "down"] as const).map((d) => findLeafByDirection(tree, id, d) ?? "-").join(" ");
    }
  }
  return out;
}

/** Repair: corrupted trees healed against the expected tiles. */
export function normalizeCases(): Record<string, string> {
  const out: Record<string, string> = {};
  const base = (n: number): TilingLayoutNode => randomTree(seeded(500 + n), tilesOf(n), false, "n");
  const corrupt: Record<string, (t: TilingLayoutNode) => TilingLayoutNode> = {
    none: (t) => t,
    ratio99: (t) => (t.kind === "split" ? { ...t, ratio: 0.99 } : t),
    ratio01: (t) => (t.kind === "split" ? { ...t, ratio: 0.01 } : t),
    duplicate: (t) => (t.kind === "split" ? { ...t, second: t.first } : t),
    missing: (t) => (t.kind === "split" ? t.first : t),
    unknownTile: (t) => (t.kind === "split" ? { ...t, first: { kind: "leaf", id: "L-zz", tileId: "zz" } } : t),
  };
  for (const n of [1, 2, 4, 7]) {
    const expected = tilesOf(n);
    for (const [cname, fn] of Object.entries(corrupt)) {
      for (const config of ["default", "body"] as const) {
        const healed = normalizeLayout(fn(base(n)), { containerWidthPx: 1280, containerHeightPx: 800, config: CONFIGS[config]!, expectedTileIds: expected });
        out[`${n}/${cname}/${config}`] = shape(healed);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- pane motion

interface MotionRun {
  readonly clock: FakeClock;
  readonly loop: FrameLoop;
  readonly motion: LeafMotion;
  readonly log: unknown[];
  reduced: boolean;
}

function motionRun(omega?: number): MotionRun {
  const clock = createFakeClock();
  const loop = createFrameLoop({ clock });
  const run: MotionRun = { clock, loop, log: [], reduced: false, motion: undefined as unknown as LeafMotion };
  const frameOf = (f: LeafMotionFrame): unknown[] => [
    f.id,
    ...rectOf(f.drawn),
    ...rectOf(f.target),
    f.reveal.dx,
    f.reveal.dy,
    f.reveal.width,
    f.reveal.height,
    f.reveal.clipRight,
    f.reveal.clipBottom,
    f.pop ? f.pop.scale : null,
    f.pop ? f.pop.opacity : null,
    f.moving,
  ];
  (run as { motion: LeafMotion }).motion = createLeafMotion({
    loop,
    ...(omega !== undefined ? { omega } : {}),
    reducedMotion: () => run.reduced,
    onWrite: (frames, tick) => run.log.push(["write", tick.time, tick.delta, frames.map(frameOf)]),
    onActiveChange: (active) => run.log.push(["active", active]),
  });
  return run;
}

const R = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * The motion with a flush after every change, as the renderer drives it (it flushes after each commit and each held
 * move): what the app draws.
 */
function flushingEveryChange(motion: LeafMotion): LeafMotion {
  const after =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A): void => {
      fn(...args);
      motion.flush();
    };
  return {
    ...motion,
    get omega() {
      return motion.omega;
    },
    get active() {
      return motion.active;
    },
    get time() {
      return motion.time;
    },
    target: after(motion.target.bind(motion)),
    jump: after(motion.jump.bind(motion)),
    hold: after(motion.hold.bind(motion)),
    open: after(motion.open.bind(motion)),
    remove: after(motion.remove.bind(motion)),
    retain: after(motion.retain.bind(motion)),
    configure: after(motion.configure.bind(motion)),
  };
}

/** Pane-motion frames: what the renderer would draw each frame, for scripted layout changes. */
export function motionCases(flushEach = false): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  const scenario = (name: string, fn: (run: MotionRun) => void, omega?: number): void => {
    const run = motionRun(omega);
    if (flushEach) (run as { motion: LeafMotion }).motion = flushingEveryChange(run.motion);
    fn(run);
    out[name] = run.log;
    run.motion.dispose();
  };
  scenario("glide", (r) => {
    r.motion.target("a", R(0, 0, 400, 300));
    r.motion.target("a", R(200, 100, 600, 300));
    r.clock.runUntilIdle();
  });
  scenario("retarget", (r) => {
    r.motion.target("a", R(0, 0, 400, 300));
    r.motion.target("a", R(400, 0, 400, 300));
    r.clock.frames(3);
    r.motion.target("a", R(100, 300, 200, 500));
    r.clock.runUntilIdle();
  });
  scenario("hold-then-target", (r) => {
    r.motion.target("a", R(0, 0, 400, 300));
    r.motion.hold("a", R(37.5, 12.25, 400, 300), R(0, 0, 500, 300));
    r.motion.flush();
    r.clock.frame();
    r.motion.hold("a", R(80, 40, 400, 300));
    r.clock.frame();
    r.motion.target("a", R(600, 0, 500, 300));
    r.clock.runUntilIdle();
  });
  scenario("open", (r) => {
    r.motion.target("a", R(0, 0, 640, 800));
    r.motion.target("b", R(640, 0, 640, 800));
    r.motion.target("a", R(0, 0, 640, 400));
    r.motion.target("c", R(0, 400, 640, 400));
    r.motion.open("c");
    r.motion.flush();
    r.clock.runUntilIdle();
  });
  scenario("reduced", (r) => {
    r.motion.target("a", R(0, 0, 400, 300));
    r.reduced = true;
    r.motion.target("a", R(300, 0, 400, 300));
    r.motion.open("a");
    r.motion.flush();
    r.clock.runUntilIdle();
  });
  scenario("configure", (r) => {
    r.motion.target("a", R(0, 0, 400, 300));
    r.motion.target("a", R(800, 0, 400, 300));
    r.clock.frames(2);
    r.motion.configure({ omega: 50 });
    r.clock.runUntilIdle();
  });
  scenario("jump", (r) => {
    r.motion.target("a", R(0, 0, 400, 300));
    r.motion.target("a", R(800, 0, 400, 300));
    r.clock.frames(2);
    r.motion.jump("a", R(10, 10, 100, 100));
    r.clock.runUntilIdle();
  });
  scenario("retain-and-two-changes", (r) => {
    r.motion.target("a", R(0, 0, 640, 800));
    r.motion.target("b", R(640, 0, 640, 800));
    r.motion.target("c", R(0, 0, 10, 10));
    r.motion.retain(new Set(["a", "b"]));
    r.motion.target("a", R(0, 0, 384, 800));
    r.motion.target("b", R(384, 0, 896, 800));
    r.clock.frame(20);
    r.clock.frame(20);
    r.motion.target("a", R(0, 0, 832, 800));
    r.motion.target("b", R(832, 0, 448, 800));
    r.clock.runUntilIdle();
  });
  scenario("slow-tempo", (r) => {
    r.motion.target("a", R(0, 0, 400, 300));
    r.motion.target("a", R(0, 500, 400, 100));
    r.clock.runUntilIdle();
  }, 10);
  return out;
}

// ---------------------------------------------------------------- gestures

/** A seeded run of wheel, touch and control events. */
function swipeScript(r: () => number, length: number, fractional = false): TilingWorkspaceSwipeEvent[] {
  // Whole numbers keep the first fixture as recorded; fractional deltas and times reach floating-point rounding.
  const round = (v: number): number => (fractional ? v : Math.round(v));
  const events: TilingWorkspaceSwipeEvent[] = [];
  let ts = 0;
  let touching = false;
  let tx = 400;
  for (let i = 0; i < length; i++) {
    ts += round(r() * 60);
    const roll = r();
    if (roll < 0.5) {
      const dx = round((r() - 0.4) * 60);
      events.push({ type: "WHEEL", dx, dy: Math.round((r() - 0.5) * (r() < 0.2 ? 80 : 10)), ctrlKey: r() < 0.05, metaKey: r() < 0.2, altKey: r() < 0.2, shiftKey: r() < 0.1, ts, canScrollFurther: r() < 0.1, ...(r() < 0.2 ? { widthPx: 600 } : {}) });
    } else if (roll < 0.62) {
      if (!touching) {
        touching = true;
        tx = 400;
        events.push({ type: "TOUCH_START", x: tx, y: 300, ts });
      } else {
        tx += Math.round((r() - 0.6) * 120);
        events.push({ type: "TOUCH_MOVE", x: tx, y: 300 + Math.round((r() - 0.5) * 30), ts });
      }
    } else if (roll < 0.68 && touching) {
      touching = false;
      events.push({ type: "TOUCH_END", ts });
    } else if (roll < 0.8) {
      ts += 130;
      events.push({ type: "IDLE_TICK", ts });
    } else if (roll < 0.87) {
      events.push({ type: "SETTLE_DONE" });
    } else if (roll < 0.91) {
      events.push({ type: "SET_CONTEXT", hasPrev: r() < 0.7, hasNext: r() < 0.8, ...(r() < 0.5 ? { widthPx: 900 } : {}) });
    } else if (roll < 0.95) {
      events.push({ type: "DRAG_ACTIVE", active: r() < 0.5 });
    } else if (roll < 0.97) {
      events.push({ type: "CANCEL" });
    } else {
      ts += 400;
      events.push({ type: "IDLE_TICK", ts });
    }
  }
  return events;
}

/** Workspace swipe states after every event of seeded scripts, under three configs (fractional: no rounding). */
export function swipeCases(fractional = false): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  const configs: Record<string, TilingWorkspaceSwipeConfig> = {
    default: TILING_WORKSPACE_SWIPE_DEFAULTS,
    alt: { ...TILING_WORKSPACE_SWIPE_DEFAULTS, modifier: "alt" },
    wrap: { ...TILING_WORKSPACE_SWIPE_DEFAULTS, wrap: true, thresholdPx: 10, commitFraction: 0.5 },
  };
  for (const [cname, config] of Object.entries(configs)) {
    for (let seed = 1; seed <= 14; seed++) {
      const r = seeded(9000 + seed);
      let state: TilingWorkspaceSwipeState = workspaceSwipeReducer(TILING_WORKSPACE_SWIPE_INITIAL_STATE, { type: "SET_CONTEXT", hasPrev: true, hasNext: true, widthPx: 800 }, config);
      const trace: unknown[] = [];
      for (const event of swipeScript(r, 40, fractional)) {
        state = workspaceSwipeReducer(state, event, config);
        trace.push(state);
      }
      out[`${cname}/${seed}`] = trace;
    }
  }
  return out;
}

/** Spring-load states after every event of seeded scripts. */
export function springLoadCases(): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const dwellMs of [500, 0, 120]) {
    for (let seed = 1; seed <= 16; seed++) {
      const r = seeded(7000 + seed);
      let state: TilingSpringLoadState = TILING_SPRING_LOAD_INITIAL_STATE;
      let ts = 0;
      const trace: unknown[] = [];
      for (let i = 0; i < 30; i++) {
        ts += Math.round(r() * 200);
        const roll = r();
        let event: TilingSpringLoadEvent;
        if (roll < 0.5) {
          const kind = r();
          const hover =
            kind < 0.15
              ? null
              : kind < 0.25
                ? ({ kind: "leaf", targetId: "x", point: { x: 1, y: 1 } } as unknown as TilingSpringLoadEvent & { type: "HOVER" })["hover"]
                : { kind: "workspace-tab" as const, targetId: `tab-${Math.floor(r() * 3)}`, point: { x: 10, y: 5 }, workspaceId: `ws-${Math.floor(r() * 3)}`, ...(r() < 0.3 ? { placement: { kind: "root" as const, side: "first" as const } } : {}) };
          event = { type: "HOVER", hover, leafId: r() < 0.1 ? null : `L-${Math.floor(r() * 2)}`, activeWorkspaceId: r() < 0.8 ? "ws-0" : null, ts };
        } else if (roll < 0.85) event = { type: "TICK", ts };
        else if (roll < 0.93) event = { type: "DRAG_END" };
        else event = { type: "RESET" };
        state = springLoadReducer(state, event, { dwellMs });
        trace.push(state);
      }
      out[`${dwellMs}/${seed}`] = trace;
    }
  }
  return out;
}

/**
 * Drop room at its boundary: edge and center drops judged with fractional gaps, handles and minimums, on a target
 * exactly at, just under and just over two minimums plus the gutter along the split (and the minimum across it). The
 * drag is the one pane A lifted from the pair A | B, so its base is B alone filling the stage, and the stage is sized
 * to the target: each place's verdict is `after(place).refusal` on B (`1` taken, else the refusal code). Then stored
 * ratios that are not plain numbers (±Infinity, null, a numeric string, true) through the layout, on a binary and on
 * a master split. NaN is left out: it lays out at 0.5 now, where 26.11.7 drew NaN rects.
 */
export function dropBoundaryCases(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const L = (id: string): TilingLeafNode => ({ kind: "leaf", id, tileId: `t-${id}` });
  const layout: TilingLayoutNode = {
    kind: "split",
    id: "s",
    axis: "horizontal",
    ratio: 0.5,
    first: L("A"),
    second: { kind: "split", id: "t", axis: "vertical", ratio: 0.5, first: L("B"), second: L("C") },
  };
  const pair: TilingLayoutNode = { kind: "split", id: "pair", axis: "horizontal", ratio: 0.5, first: L("A"), second: L("B") };
  const values = [0, 0.1, 0.2, 0.3, 1.1, 4, 12.3, 40.1];
  const deltas = [0, 1e-12, -1e-12, 1e-9, -1e-9];
  for (const gapPx of values) {
    for (const handleSizePx of values) {
      for (const minPaneSizePx of [0.1, 4, 12.3]) {
        const config: TilingLayoutConfig = { gapPx, handleSizePx, minPaneSizePx };
        const need = minPaneSizePx * 2 + (gapPx + handleSizePx);
        const verdicts: unknown[] = [];
        for (const zone of ["left", "top", "center"] as const) {
          for (const delta of deltas) {
            const along = need + delta;
            const across = minPaneSizePx + delta;
            const stages =
              zone === "top"
                ? [{ width: 300, height: along }, { width: across, height: along }]
                : [{ width: along, height: 300 }, { width: along, height: across }];
            for (const stage of stages) {
              const drag = layoutDrag(pair, "A", stage, config);
              if (drag == null) {
                verdicts.push("no drag");
                continue;
              }
              const place: TilingHeld<string> = zone === "center" ? { kind: "swap", at: "t-B" } : { kind: "beside", at: "t-B", side: zone };
              const refusal = drag.after(place).refusal;
              verdicts.push(refusal == null ? 1 : refusal.code);
            }
          }
        }
        out[`drop/${gapPx}/${handleSizePx}/${minPaneSizePx}`] = verdicts;
      }
    }
  }
  const ratios: Record<string, unknown> = { inf: Number.POSITIVE_INFINITY, "-inf": Number.NEGATIVE_INFINITY, null: null, string: "0.3", true: true };
  for (const [name, ratio] of Object.entries(ratios)) {
    for (const [cname, config] of Object.entries(CONFIGS)) {
      for (const master of [false, true]) {
        const tree = { ...layout, ratio, ...(master ? { layoutMode: "master", masterOrientation: "top" } : {}) } as unknown as TilingLayoutNode;
        const g = resolveLayoutGeometry(tree, AREAS[0]!, config);
        out[`ratio/${name}/${cname}/${master ? "master" : "binary"}`] = {
          leaves: [...g.leaves].map(([id, rect]) => [id, ...rectOf(rect)]),
          splits: [...g.splits].map(([id, s]) => [id, ...rectOf(s.rect), s.ratio]),
        };
      }
    }
  }
  return out;
}

/**
 * The lifted pane's home through the drag's hit: for every leaf of every tree, on each basis (`lift` is Indicator's,
 * `base` Snap's), a pointer lifted at the leaf's center and moved to its far corner (inside home, edges included),
 * 1 px past its right edge, 7 px past it (beyond the hold rule's 6 px), then back to its center. Each step gives
 * what the hit holds and what a frame draws: `lift` for the layout at the lift (the pane's place kept open), else the
 * tree's shape. Home is a place of the hit for the whole drag, so the first three steps and the last hold it and
 * draw `lift`.
 */
export function dragHomeCases(): Record<string, Record<string, string[] | null>> {
  const out: Record<string, Record<string, string[] | null>> = {};
  for (const { name, tree } of goldenTrees()) {
    const rects = resolveLayoutGeometry(tree, AREAS[0]!, CONFIGS.default!).leaves;
    for (const [leafId, r] of rects) {
      const center: DragMachinePoint = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const drag = layoutDrag(tree, leafId, AREAS[0]!, CONFIGS.default!);
      const byBasis: Record<string, string[] | null> = {};
      for (const basis of ["lift", "base"] as const) {
        if (drag == null) {
          byBasis[basis] = null;
          continue;
        }
        const run = hitRun(drag, basis);
        byBasis[basis] = [
          { x: r.x + r.width, y: r.y + r.height },
          { x: r.x + r.width + 1, y: center.y },
          { x: r.x + r.width + 7, y: center.y },
          center,
        ].map((point) => {
          const read = run.at(point);
          return `${readLabel(run, read)} / ${drawnLabel(run, read)}`;
        });
      }
      out[`${name}/${leafId}`] = byBasis;
    }
  }
  return out;
}

/**
 * Back home after leaving, through the drag's hit: for every leaf of every tree, on each basis (`lift` is Indicator's,
 * `base` Snap's), a pointer lifted at the leaf's center (10 px right of it), taken 1 px past its bottom edge (or its
 * top edge, for a leaf at the bottom of the area: still home, the hold rule's edge is 6 px), then 30 px past it (into
 * the neighbour, or the gap), then back over its header (8 px below its top, at its center x), then released there.
 * Each step gives what the hit holds and what a frame draws (`lift` for the layout at the lift, else the tree's
 * shape), and the release's outcome: `cancel`, or `commit` with the tree it stores. Back over home it is `home`
 * whatever was held outside.
 */
export function dragHomeReturnCases(): Record<string, Record<string, string[] | null>> {
  const out: Record<string, Record<string, string[] | null>> = {};
  for (const { name, tree } of goldenTrees()) {
    const rects = resolveLayoutGeometry(tree, AREAS[0]!, CONFIGS.default!).leaves;
    if (rects.size < 2) continue;
    for (const [leafId, r] of rects) {
      const center: DragMachinePoint = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const atBottom = r.y + r.height + 1 > AREAS[0]!.y + AREAS[0]!.height;
      const sign = atBottom ? -1 : 1;
      const edge: number = atBottom ? r.y : r.y + r.height;
      const away: DragMachinePoint = { x: center.x, y: edge + sign };
      const gone: DragMachinePoint = { x: center.x, y: edge + sign * 30 };
      const header: DragMachinePoint = { x: center.x, y: r.y + 8 };
      const drag = layoutDrag(tree, leafId, AREAS[0]!, CONFIGS.default!);
      const byBasis: Record<string, string[] | null> = {};
      for (const basis of ["lift", "base"] as const) {
        if (drag == null) {
          byBasis[basis] = null;
          continue;
        }
        const run = hitRun(drag, basis);
        const steps: string[] = [];
        const record = (label: string, point: DragMachinePoint): TilingHitRead<string> => {
          const read = run.at(point);
          steps.push(`${label}: ${readLabel(run, read)} / ${drawnLabel(run, read)}`);
          return read;
        };
        record("lift", { x: center.x + 10, y: center.y });
        record("away", away);
        record("gone", gone);
        const back = record("back", header);
        steps.push(`release: ${releaseLabel(run, back)}`);
        byBasis[basis] = steps;
      }
      out[`${name}/${leafId}`] = byBasis;
    }
  }
  return out;
}

/**
 * Back home in a column, through the drag's hit: the dragged subject on top of pane B (a tab group of three dragged
 * whole, or a single pane), at ratios from short to tall, in a 360 × 784 column with a 180 px minimum, B with a 41 px
 * title bar that takes a join. Each case records the subject's home, B's rect in the drag's base (the gap closed,
 * B filling the column), the verdict of B's top edge there (`after(place).refusal`: for a tall group the edge is
 * refused, a short one is taken), and, on each basis (`lift` is Indicator's, `base` Snap's), a drag: lift on the
 * header, out below the column, over B's lower part, then back over the header or over the top of the subject's own
 * slot, then released. Each step gives what the hit holds and what a frame draws (`lift` for the layout at the lift,
 * else the tree's shape), and the release's outcome. Back over home it is `home` whatever B's grown title bar would
 * hold in the base.
 */
export function dragHomeColumnCases(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const area: Rect = { x: 0, y: 0, width: 360, height: 784 };
  const config: TilingLayoutConfig = { gapPx: 6, handleSizePx: 4, minPaneSizePx: 180 };
  const titleBarPx = 41;
  const parts = { bands: new Map([["b", [{ left: 0, top: 0, right: 0, height: titleBarPx }]]]) };
  for (const subject of ["group", "pane"] as const) {
    for (const ratio of [0.2, 0.25, 0.4, 0.5, 0.6, 0.7, 0.85]) {
      const layout: TilingLayoutNode = {
        kind: "split",
        id: "col",
        axis: "vertical",
        ratio,
        first:
          subject === "group"
            ? {
                kind: "group",
                id: "g",
                members: [
                  { kind: "leaf", id: "A", tileId: "a" },
                  { kind: "leaf", id: "P", tileId: "p" },
                  { kind: "leaf", id: "S", tileId: "s" },
                ],
                activeMemberId: "A",
              }
            : { kind: "leaf", id: "A", tileId: "a" },
        second: { kind: "leaf", id: "B", tileId: "b" },
      };
      const dragSubject = subject === "group" ? ("group" as const) : undefined;
      const a = resolveLayoutGeometry(layout, area, config).leaves.get("A")!;
      const home = { left: a.x, top: a.y, width: a.width, height: a.height };
      const drag = layoutDrag(layout, "A", area, config, dragSubject, parts);
      if (drag == null) {
        out[`${subject}/${ratio}`] = null;
        continue;
      }
      const grownB = drag.base.layout.get("b")!;
      const topEdge = drag.after({ kind: "beside", at: "b", side: "top" }).refusal;
      const header: DragMachinePoint = { x: home.left + 150, y: home.top + 20 };
      const drags: Record<string, Record<string, string[]>> = {};
      for (const basis of ["lift", "base"] as const) {
        const byBack: Record<string, string[]> = {};
        for (const [label, back] of [
          ["header", header],
          ["title-bar", { x: header.x, y: home.top + 8 }],
        ] as const) {
          const run = hitRun(drag, basis);
          const steps: string[] = [];
          const record = (step: string, point: DragMachinePoint): TilingHitRead<string> => {
            const read = run.at(point);
            steps.push(`${step}: ${readLabel(run, read)} / ${drawnLabel(run, read)}`);
            return read;
          };
          record("lift", { x: header.x, y: header.y + 10 });
          record("below", { x: header.x, y: area.height + 30 });
          record("over-b", { x: header.x, y: area.height - 40 });
          const read = record(label, back);
          steps.push(`release: ${releaseLabel(run, read)}`);
          byBack[label] = steps;
        }
        drags[basis] = byBack;
      }
      out[`${subject}/${ratio}`] = {
        home: [home.left, home.top, home.width, home.height],
        baseB: [grownB.x, grownB.y, grownB.width, grownB.height],
        topEdge: topEdge == null ? "valid" : topEdge.code,
        drags,
      };
    }
  }
  return out;
}

/**
 * Dragging forward in a column, through the drag's hit: the subject on top of pane B (a tab group of three dragged
 * whole, or a single pane), at ratios from short to tall, in a 360 × 784 column with a 180 px minimum. For each of B's
 * edges as the drag's base measures B (filling the column): the verdict of the place (`after(place).refusal`) for the
 * subject, and the shape and leaf rects of the tree the release commits there. The verdict is that tree's: the
 * subject is released first, then placed.
 */
export function dragForwardColumnCases(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const area: Rect = { x: 0, y: 0, width: 360, height: 784 };
  const config: TilingLayoutConfig = { gapPx: 6, handleSizePx: 4, minPaneSizePx: 180 };
  for (const subject of ["group", "pane"] as const) {
    for (const ratio of [0.2, 0.25, 0.4, 0.5, 0.6, 0.7, 0.85]) {
      const layout: TilingLayoutNode = {
        kind: "split",
        id: "col",
        axis: "vertical",
        ratio,
        first:
          subject === "group"
            ? {
                kind: "group",
                id: "g",
                members: [
                  { kind: "leaf", id: "A", tileId: "a" },
                  { kind: "leaf", id: "P", tileId: "p" },
                  { kind: "leaf", id: "S", tileId: "s" },
                ],
                activeMemberId: "A",
              }
            : { kind: "leaf", id: "A", tileId: "a" },
        second: { kind: "leaf", id: "B", tileId: "b" },
      };
      const drag = layoutDrag(layout, "A", area, config, subject === "group" ? "group" : undefined);
      if (drag == null) {
        out[`${subject}/${ratio}`] = null;
        continue;
      }
      // The same drag with no minimum: its `after` is the tree each side's change makes, refused or not.
      const open = layoutDrag(layout, "A", area, { ...config, minPaneSizePx: 0 }, subject === "group" ? "group" : undefined)!;
      const edges: Record<string, unknown> = {};
      for (const zone of ["top", "bottom", "left", "right"] as const) {
        const after = drag.after({ kind: "beside", at: "b", side: zone });
        const committed = open.after({ kind: "beside", at: "b", side: zone }).tree.layout!;
        edges[zone] = {
          verdict: after.refusal == null ? "valid" : after.refusal.code,
          committed: shape(committed),
          rects: [...resolveLayoutGeometry(committed, area, config).leaves].map(([id, r]) => [id, ...rectOf(r)]),
          // What the drag's hit stores for the place, when it takes it: the change's tree, or the difference.
          hit: after.refusal != null ? "refused" : shape(after.tree.layout) === shape(committed) ? "same" : shape(after.tree.layout),
        };
      }
      out[`${subject}/${ratio}`] = edges;
    }
  }
  return out;
}

/**
 * The held pane against the stage, recorded from 26.11.9: for every leaf of every tree, held by its center at seeded
 * pointer points in and well past each stage, the rect it is drawn at (`clampHeldRectToStage`).
 */
export function dragStageCases(): Record<string, number[][]> {
  const out: Record<string, number[][]> = {};
  for (const { name, tree } of goldenTrees().slice(0, 12)) {
    for (const area of AREAS) {
      const stage = { width: area.width, height: area.height };
      const rects = resolveLayoutGeometry(tree, { x: 0, y: 0, ...stage }, CONFIGS.default!).leaves;
      const r = seeded(Math.round(area.width * 3 + area.height));
      for (const [leafId, leaf] of rects) {
        const drawn: number[][] = [];
        for (let i = 0; i < 6; i++) {
          const pointer = { x: (r() * 3 - 1) * stage.width, y: (r() * 3 - 1) * stage.height };
          const held = { x: pointer.x - leaf.width / 2, y: pointer.y - leaf.height / 2, width: leaf.width, height: leaf.height };
          drawn.push(rectOf(clampHeldRectToStage(held, stage)));
        }
        out[`${name}/${area.width}x${area.height}/${leafId}`] = drawn;
      }
    }
  }
  return out;
}

/** Every section, by fixture file name. */
export const GOLDEN_SECTIONS: Readonly<Record<string, () => unknown>> = {
  layouts: layoutCases,
  regions: regionCases,
  drops: dropCases,
  edits: editCases,
  focus: focusCases,
  normalize: normalizeCases,
  motion: () => motionCases(false),
  "motion-flushed": () => motionCases(true),
  swipe: () => swipeCases(false),
  "swipe-fractional": () => swipeCases(true),
  "spring-load": springLoadCases,
  "drop-boundary": dropBoundaryCases,
  "drag-home": dragHomeCases,
  "drag-home-return": dragHomeReturnCases,
  "drag-home-column": dragHomeColumnCases,
  "drag-forward-column": dragForwardColumnCases,
  "drag-stage": dragStageCases,
};
