"use client";

import * as React from "react";
import {
  ANIMATION_CONTROL_DEFAULTS,
  DynamicTilingRenderer,
  DYNAMIC_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
  type DynamicDropIntentDebugState,
  type DynamicFocusDirection,
  type DynamicGroupNode,
  type DynamicLiveHitLogState,
  type DynamicLayoutConfig,
  type DynamicLayoutNode,
  type DynamicObservabilityColorConfig,
  type DynamicObservabilityColorEnableConfig,
  type DynamicPaneFootprint,
  type DynamicSplitNode,
  type DynamicTile,
  type ResolvedTilingInteractionCapabilities,
  type TilingObservabilityLedgerEntry,
  TilingObservabilityPanel,
  collectGroups,
  collectSplitNodes,
  findLeafByDirection,
  groupLeaves,
  readTileOrderByLeaf,
  readLeafNodeIds,
  ungroupNode,
  resolveInteractionCapabilities,
  DEFAULT_DRAG_HOP_EASING,
} from "hypr-tiling";
import { resolveShowcasePaneContent, type ShowcasePaneId } from "./showcase-pane-demos";

const SHOWCASE_TILE_DEFINITIONS: ReadonlyArray<{
  id: ShowcasePaneId;
  title: string;
  description: string;
  accent: DynamicTile["accent"];
}> = [
  {
    id: "overview",
    title: "tenant overview",
    description: "capacity and queue",
    accent: "cyan",
  },
  {
    id: "events",
    title: "event stream",
    description: "rolling feed",
    accent: "violet",
  },
  {
    id: "graph",
    title: "spend graph",
    description: "hourly accumulation",
    accent: "sky",
  },
  {
    id: "alerts",
    title: "alerts",
    description: "actionable warnings",
    accent: "pink",
  },
  {
    id: "debug",
    title: "debug console",
    description: "structured trace lines",
    accent: "cyan",
  },
];

const SHOWCASE_TILES: ReadonlyArray<DynamicTile> = SHOWCASE_TILE_DEFINITIONS.map(
  (definition): DynamicTile => ({
    id: definition.id,
    title: definition.title,
    description: definition.description,
    accent: definition.accent,
    content: resolveShowcasePaneContent(definition.id),
  }),
);

const INITIAL_LAYOUT: DynamicLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.58,
  gapPx: 10,
  first: {
    kind: "split",
    id: "left-stack",
    axis: "vertical",
    ratio: 0.56,
    first: {
      kind: "leaf",
      id: "north-west",
      tileId: "overview",
    },
    second: {
      kind: "leaf",
      id: "south-west",
      tileId: "events",
    },
  },
  second: {
    kind: "split",
    id: "right-stack",
    axis: "vertical",
    ratio: 0.52,
    first: {
      kind: "split",
      id: "right-top-row",
      axis: "horizontal",
      ratio: 0.5,
      first: {
        kind: "leaf",
        id: "north-east",
        tileId: "graph",
      },
      second: {
        kind: "leaf",
        id: "north-east-2",
        tileId: "alerts",
      },
    },
    second: {
      kind: "leaf",
      id: "south-east",
      tileId: "debug",
    },
  },
};

const INITIAL_CONFIG: DynamicLayoutConfig = {
  gapPx: 10,
  minPaneSizePx: 120,
  handleSizePx: 6,
};
const DEFAULT_SHOW_DROP_PREVIEW_LANDING_SHADOWS: boolean = true;
const LIVE_LEDGER_RETENTION_LIMIT: number = 60;
/** How long the "preview all hit zones on adjustment" overlay stays up after the last geometry slider input. */
const HIT_ZONE_GEOMETRY_PREVIEW_MS: number = 1200;
const DEFAULT_OBSERVABILITY_COLORS: DynamicObservabilityColorConfig = {
  dragSourceBorderColorHex: "#f0abfc",
  dragTargetBorderColorHex: "#67e8f9",
  projectedSourceBorderColorHex: "#fde68a",
  projectedTargetBorderColorHex: "#86efac",
  projectedSuccessorBorderColorHex: "#93c5fd",
  projectedSourceFillColorHex: "#f59e0b",
  projectedTargetFillColorHex: "#10b981",
  projectedSuccessorFillColorHex: "#3b82f6",
  hitZoneLeftColorHex: "#0ea5e9",
  hitZoneRightColorHex: "#a855f7",
  hitZoneTopColorHex: "#f59e0b",
  hitZoneBottomColorHex: "#14b8a6",
  hitZoneCenterColorHex: "#10b981",
  hitZoneBlockedColorHex: "#fb7185",
};

function toTileMap(tiles: ReadonlyArray<DynamicTile>): ReadonlyMap<string, DynamicTile> {
  return new Map<string, DynamicTile>(tiles.map((tile: DynamicTile): [string, DynamicTile] => [tile.id, tile]));
}

function formatLedgerTimestamp(date: Date): string {
  return `${date.toLocaleTimeString("en-US", { hour12: false })}.${date.getMilliseconds().toString().padStart(3, "0")}`;
}

function toFixedOrNone(value: number | null | undefined, digits: number): string {
  if (value == null) {
    return "none";
  }
  return value.toFixed(digits);
}

function formatViewportCursorLabel(liveHitLog: DynamicLiveHitLogState | null): string {
  if (liveHitLog == null) {
    return "none";
  }
  return `x=${liveHitLog.cursorViewport.x.toFixed(1)} y=${liveHitLog.cursorViewport.y.toFixed(1)}`;
}

function formatPaneGeometryLabel(footprint: DynamicPaneFootprint | null | undefined): string {
  if (footprint == null) {
    return "none";
  }
  return `x=${footprint.left.toFixed(1)} y=${footprint.top.toFixed(1)} w=${footprint.width.toFixed(1)} h=${footprint.height.toFixed(1)}`;
}

export function DynamicTilingShowcase(): React.ReactElement {
  const [layout, setLayout] = React.useState<DynamicLayoutNode>(INITIAL_LAYOUT);
  const [config, setConfig] = React.useState<DynamicLayoutConfig>(INITIAL_CONFIG);
  const [focusedLeafId, setFocusedLeafId] = React.useState<string | null>(null);
  const [selectedSourceLeafId, setSelectedSourceLeafId] = React.useState<string>("north-west");
  const [selectedTargetLeafId, setSelectedTargetLeafId] = React.useState<string>("north-east");
  const [selectedSplitId, setSelectedSplitId] = React.useState<string>("root");
  const [preserveParentSplitAxis, setPreserveParentSplitAxis] = React.useState<boolean>(true);
  const [showDropPreviewOverlays, setShowDropPreviewOverlays] = React.useState<boolean>(
    DEFAULT_SHOW_DROP_PREVIEW_LANDING_SHADOWS,
  );
  const [observabilityColors, setObservabilityColors] = React.useState<DynamicObservabilityColorConfig>(
    DEFAULT_OBSERVABILITY_COLORS,
  );
  const [observabilityColorEnables, setObservabilityColorEnables] = React.useState<DynamicObservabilityColorEnableConfig>(
    DYNAMIC_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
  );
  const [projectedOverlayBgAlphaPercent, setProjectedOverlayBgAlphaPercent] = React.useState<number>(90);
  // ANIMATION group speed/bounce state. Linked (default) keeps the two party
  // speeds at parity (one slider drives both); unlinking exposes them
  // independently and gates coherent transit off. Seeded from the shared
  // ANIMATION_CONTROL_DEFAULTS so the panel's "reset to defaults" matches the
  // initial load.
  const [animationSpeedLinked, setAnimationSpeedLinked] = React.useState<boolean>(
    ANIMATION_CONTROL_DEFAULTS.speedLinked,
  );
  const [ghostTransitSpeedPercent, setGhostTransitSpeedPercent] = React.useState<number>(
    ANIMATION_CONTROL_DEFAULTS.ghostTransitSpeedPercent,
  );
  const [survivorReflowSpeedPercent, setSurvivorReflowSpeedPercent] = React.useState<number>(
    ANIMATION_CONTROL_DEFAULTS.survivorReflowSpeedPercent,
  );
  const [swapBounceMagnitudePercent, setSwapBounceMagnitudePercent] = React.useState<number>(
    ANIMATION_CONTROL_DEFAULTS.swapBounceMagnitudePercent,
  );
  // Consumer-configurable drag-hop easing (HT-ANIM-EASING-CONFIG). Threaded to
  // the renderer's `dragHopEasing` prop; the survivor reflow falls back to it.
  const [dragHopEasing, setDragHopEasing] = React.useState<string>(DEFAULT_DRAG_HOP_EASING);
  const [projectedOverlayRenderCount, setProjectedOverlayRenderCount] = React.useState<number>(0);
  const [showDropBorderHints, setShowDropBorderHints] = React.useState<boolean>(true);
  const [showDropIntentTranslucentBg, setShowDropIntentTranslucentBg] = React.useState<boolean>(true);
  const [showDropIntentDebug, setShowDropIntentDebug] = React.useState<boolean>(true);
  const [showPaneHitZones, setShowPaneHitZones] = React.useState<boolean>(false);
  const [paneHitZonesAlphaPercent, setPaneHitZonesAlphaPercent] = React.useState<number>(20);
  const [showLiveStatus, setShowLiveStatus] = React.useState<boolean>(false);
  // Per-group control state, FLAT (one independent pair per group, no
  // parent/meta toggle governing multiple groups). Each group has:
  //   - `<group>Enabled` master on/off: ONE flag that gates BOTH the panel-body
  //     collapse AND the renderer effect (computed at the renderer call-site
  //     below). Debug groups default OFF so a fresh load is clean; the
  //     per-control states underneath persist for when a group is re-enabled.
  //   - `<group>Sticky` master pin: independent boolean, default FALSE; when
  //     true the panel hoists the group into the pinned region above the scroll
  //     area instead of scrolling it normally.
  const [liveStatusSticky, setLiveStatusSticky] = React.useState<boolean>(false);
  const [previewOverlaysEnabled, setPreviewOverlaysEnabled] = React.useState<boolean>(false);
  const [previewOverlaysSticky, setPreviewOverlaysSticky] = React.useState<boolean>(false);
  const [subjectColorsEnabled, setSubjectColorsEnabled] = React.useState<boolean>(false);
  const [subjectColorsSticky, setSubjectColorsSticky] = React.useState<boolean>(false);
  const [dropIntentDebugEnabled, setDropIntentDebugEnabled] = React.useState<boolean>(false);
  const [dropIntentDebugSticky, setDropIntentDebugSticky] = React.useState<boolean>(false);
  const [hitZoneOverlaysEnabled, setHitZoneOverlaysEnabled] = React.useState<boolean>(false);
  const [hitZoneOverlaysSticky, setHitZoneOverlaysSticky] = React.useState<boolean>(false);
  // HIT-ZONE GEOMETRY group: advanced drop hit-zone geometry knobs (center swap
  // fraction, center floor, hysteresis). Gating only collapses the controls; the
  // current geometry values stay live in `interactionCapabilities` and keep
  // driving zone resolution. Advanced tuning → default OFF, matching the sibling
  // debug groups so a fresh load is clean.
  const [hitZoneGeometryEnabled, setHitZoneGeometryEnabled] = React.useState<boolean>(false);
  const [hitZoneGeometrySticky, setHitZoneGeometrySticky] = React.useState<boolean>(false);
  // ANIMATION group: live-drag motion choreography (ghost pickup-scale + bbox
  // hop morph + coherent non-intersecting transit). Default ON so the polish is
  // visible on a fresh load; OFF forces instant placement (pickup scale pinned
  // to 100%, coherent transit off) without losing the per-control values.
  const [animationControlsEnabled, setAnimationControlsEnabled] = React.useState<boolean>(true);
  const [animationControlsSticky, setAnimationControlsSticky] = React.useState<boolean>(false);
  // Transient "preview all hit zones" pulse: any drop hit-zone geometry change
  // briefly force-shows the per-pane zone overlay across EVERY pane so the
  // operator sees the new partition layout-wide, then auto-dismisses.
  const [hitZoneGeometryPreviewActive, setHitZoneGeometryPreviewActive] = React.useState<boolean>(false);
  const [interactionCapabilities, setInteractionCapabilities] = React.useState<ResolvedTilingInteractionCapabilities>(
    (): ResolvedTilingInteractionCapabilities => resolveInteractionCapabilities({ dragMode: "live" }),
  );
  const hitZoneGeometrySignatureRef = React.useRef<string>(
    `${interactionCapabilities.dropHitZoneGeometry.centerRatio}|${interactionCapabilities.dropHitZoneGeometry.centerMinPx}|${interactionCapabilities.dropHitZoneGeometry.hysteresisPx}`,
  );
  const [liveDropIntent, setLiveDropIntent] = React.useState<DynamicDropIntentDebugState | null>(null);
  const [liveHitLog, setLiveHitLog] = React.useState<DynamicLiveHitLogState | null>(null);
  const [observabilityLedgerEntries, setObservabilityLedgerEntries] = React.useState<ReadonlyArray<TilingObservabilityLedgerEntry>>([]);
  const previousLedgerSnapshotRef = React.useRef<string>("initial");
  const tilesMap: ReadonlyMap<string, DynamicTile> = React.useMemo(
    (): ReadonlyMap<string, DynamicTile> => toTileMap(SHOWCASE_TILES),
    [],
  );

  const splitCount: number = React.useMemo(
    (): number => collectSplitNodes(layout).length,
    [layout],
  );
  const leafIds: ReadonlyArray<string> = React.useMemo(
    (): ReadonlyArray<string> => readLeafNodeIds(layout),
    [layout],
  );
  const tileOrder: ReadonlyArray<string> = React.useMemo(
    (): ReadonlyArray<string> => readTileOrderByLeaf(layout),
    [layout],
  );
  const splitNodes: ReadonlyArray<DynamicSplitNode> = React.useMemo(
    (): ReadonlyArray<DynamicSplitNode> => collectSplitNodes(layout),
    [layout],
  );
  // Groups currently in the tree (HT-GROUP-TABBED-STACKING) — the source for the
  // showcase grouping toolbar's ungroup picker. The tab strip itself is rendered
  // by the renderer's group arm; clicking a tab dispatches `group-tab-jump`.
  const groups: ReadonlyArray<DynamicGroupNode> = React.useMemo(
    (): ReadonlyArray<DynamicGroupNode> => collectGroups(layout),
    [layout],
  );
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>("");

  React.useEffect((): void => {
    if (groups.length === 0) {
      if (selectedGroupId !== "") {
        setSelectedGroupId("");
      }
      return;
    }
    if (!groups.some((group: DynamicGroupNode): boolean => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const canGroupSelection: boolean =
    interactionCapabilities.grouping &&
    selectedSourceLeafId !== selectedTargetLeafId &&
    leafIds.length >= 2;

  const handleGroupSelection = React.useCallback((): void => {
    if (selectedSourceLeafId === selectedTargetLeafId) {
      return;
    }
    setLayout(
      (current: DynamicLayoutNode): DynamicLayoutNode =>
        groupLeaves(current, [selectedSourceLeafId, selectedTargetLeafId]),
    );
  }, [selectedSourceLeafId, selectedTargetLeafId]);

  const handleUngroupSelection = React.useCallback((): void => {
    if (selectedGroupId === "") {
      return;
    }
    setLayout((current: DynamicLayoutNode): DynamicLayoutNode => ungroupNode(current, selectedGroupId));
  }, [selectedGroupId]);

  React.useEffect((): void => {
    if (leafIds.length === 0) {
      setFocusedLeafId(null);
      return;
    }

    if (focusedLeafId == null || !leafIds.includes(focusedLeafId)) {
      setFocusedLeafId(leafIds[0]);
    }
  }, [focusedLeafId, leafIds]);

  React.useEffect((): void => {
    if (leafIds.length === 0) {
      return;
    }
    if (!leafIds.includes(selectedSourceLeafId)) {
      setSelectedSourceLeafId(leafIds[0]);
    }
    if (!leafIds.includes(selectedTargetLeafId)) {
      setSelectedTargetLeafId(leafIds[Math.min(1, leafIds.length - 1)]);
    }
  }, [leafIds, selectedSourceLeafId, selectedTargetLeafId]);

  React.useEffect((): void => {
    if (focusedLeafId == null || focusedLeafId === selectedSourceLeafId) {
      return;
    }
    setSelectedSourceLeafId(focusedLeafId);
  }, [focusedLeafId, selectedSourceLeafId]);

  React.useEffect((): void => {
    if (splitNodes.length === 0) {
      return;
    }
    const splitIds: ReadonlyArray<string> = splitNodes.map((splitNode: DynamicSplitNode): string => splitNode.id);
    if (!splitIds.includes(selectedSplitId)) {
      setSelectedSplitId(splitIds[0]);
    }
  }, [selectedSplitId, splitNodes]);

  React.useEffect((): void => {
    const sourceLeafId: string = liveHitLog?.sourceLeafId ?? "none";
    const dragSourceLeafId: string = liveHitLog?.dragSourceLeafId ?? "none";
    const hoveredLeafId: string = liveHitLog?.hoveredLeafId ?? "none";
    const pointerModeLabel: string = liveHitLog?.isDragging === true ? "drag" : "hover";
    const resolverZoneLabel: string = liveHitLog?.resolverZone ?? "none";
    const actionLabel: string = liveDropIntent?.action ?? liveHitLog?.intent?.action ?? "none";
    const selectedEdgeLabel: string = liveDropIntent?.finalEdge
      ?? liveDropIntent?.selectedSplitZone
      ?? liveHitLog?.intent?.finalEdge
      ?? liveHitLog?.intent?.selectedSplitZone
      ?? "none";
    const centerValidityLabel: string = liveHitLog?.centerIsValid == null ? "none" : liveHitLog.centerIsValid ? "ok" : "blocked";
    const blockedReasonLabel: string = liveHitLog?.centerBlockedReason
      ?? liveDropIntent?.blockedReason
      ?? liveHitLog?.intent?.blockedReason
      ?? "none";
    const centerDistanceLabel: string = toFixedOrNone(
      liveDropIntent?.centerDistancePx ?? liveHitLog?.intent?.centerDistancePx,
      1,
    );
    const nearestEdgeDistanceLabel: string = toFixedOrNone(
      liveDropIntent?.nearestEdgeDistancePx ?? liveHitLog?.intent?.nearestEdgeDistancePx,
      1,
    );
    const cursorViewportLabel: string = formatViewportCursorLabel(liveHitLog);
    const sourcePaneGeometryLabel: string = formatPaneGeometryLabel(liveHitLog?.sourcePaneFootprint);
    const dragSourcePaneGeometryLabel: string = formatPaneGeometryLabel(liveHitLog?.dragSourcePaneFootprint);
    const snapshotKey: string = [
      sourceLeafId,
      dragSourceLeafId,
      hoveredLeafId,
      pointerModeLabel,
      resolverZoneLabel,
      actionLabel,
      selectedEdgeLabel,
      centerValidityLabel,
      blockedReasonLabel,
      centerDistanceLabel,
      nearestEdgeDistanceLabel,
      cursorViewportLabel,
      sourcePaneGeometryLabel,
      dragSourcePaneGeometryLabel,
    ].join("|");

    if (snapshotKey === previousLedgerSnapshotRef.current) {
      return;
    }
    previousLedgerSnapshotRef.current = snapshotKey;

    const timestamp: Date = new Date();
    const nextEntry: TilingObservabilityLedgerEntry = {
      id: `${timestamp.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
      timestampLabel: formatLedgerTimestamp(timestamp),
      streamLine: `src=${sourceLeafId} dragSrc=${dragSourceLeafId} target=${hoveredLeafId} mode=${pointerModeLabel} zone=${resolverZoneLabel} action=${actionLabel} edge=${selectedEdgeLabel} center=${centerValidityLabel} centerPx=${centerDistanceLabel} edgePx=${nearestEdgeDistanceLabel} cursor=${cursorViewportLabel} sourceGeom=${sourcePaneGeometryLabel} dragSourceGeom=${dragSourcePaneGeometryLabel} blocked=${blockedReasonLabel}`,
    };

    setObservabilityLedgerEntries((previousEntries: ReadonlyArray<TilingObservabilityLedgerEntry>): ReadonlyArray<TilingObservabilityLedgerEntry> => {
      const nextEntries: ReadonlyArray<TilingObservabilityLedgerEntry> = [nextEntry, ...previousEntries];
      return nextEntries.slice(0, LIVE_LEDGER_RETENTION_LIMIT);
    });
  }, [liveDropIntent, liveHitLog]);

  const runDirectionalFocus = React.useCallback(
    (direction: DynamicFocusDirection): void => {
      const fromLeafId: string | null = focusedLeafId ?? selectedSourceLeafId;
      if (fromLeafId == null) {
        return;
      }
      const nextLeafId: string | null = findLeafByDirection(layout, fromLeafId, direction);
      if (nextLeafId == null) {
        return;
      }

      setFocusedLeafId(nextLeafId);
      setSelectedSourceLeafId(nextLeafId);
    },
    [focusedLeafId, layout, selectedSourceLeafId],
  );

  // Preview-all-hit-zones-on-adjustment: when any drop hit-zone geometry knob
  // changes, force-show the per-pane zone overlay across every pane for a short
  // window, re-armed on each slider input (so it stays up while dragging) and
  // auto-dismissed `HIT_ZONE_GEOMETRY_PREVIEW_MS` after the last change. The
  // initial mount is skipped (signature seeded from the initial geometry).
  const hitZoneGeometrySignature: string = `${interactionCapabilities.dropHitZoneGeometry.centerRatio}|${interactionCapabilities.dropHitZoneGeometry.centerMinPx}|${interactionCapabilities.dropHitZoneGeometry.hysteresisPx}`;
  React.useEffect((): (() => void) | void => {
    if (hitZoneGeometrySignature === hitZoneGeometrySignatureRef.current) {
      return;
    }
    hitZoneGeometrySignatureRef.current = hitZoneGeometrySignature;
    setHitZoneGeometryPreviewActive(true);
    const timerId: number = window.setTimeout((): void => {
      setHitZoneGeometryPreviewActive(false);
    }, HIT_ZONE_GEOMETRY_PREVIEW_MS);
    return (): void => {
      window.clearTimeout(timerId);
    };
  }, [hitZoneGeometrySignature]);

  // Arrow-key directional focus nav is now owned by the renderer itself
  // (document-level, engagement-gated, behind the keymap), so consumers inherit
  // it without re-wiring. The showcase keeps `runDirectionalFocus` only for the
  // on-screen directional focus buttons; it no longer installs a window-level
  // arrow listener (which would double-fire alongside the renderer's).

  // SUBJECT COLORS master gate: when the group is off, every subject-color
  // overlay enable (drag source/target borders + projected source/target/
  // successor borders & fills) is forced off so the renderer paints none of
  // them, regardless of the per-color states underneath (which are preserved
  // in `observabilityColorEnables` for re-enabling).
  const effectiveObservabilityColorEnables: DynamicObservabilityColorEnableConfig = React.useMemo(
    (): DynamicObservabilityColorEnableConfig =>
      subjectColorsEnabled
        ? observabilityColorEnables
        : {
            dragSourceBorderEnabled: false,
            dragTargetBorderEnabled: false,
            projectedSourceBorderEnabled: false,
            projectedTargetBorderEnabled: false,
            projectedSourceFillEnabled: false,
            projectedTargetFillEnabled: false,
            projectedSuccessorBorderEnabled: false,
            projectedSuccessorFillEnabled: false,
          },
    [observabilityColorEnables, subjectColorsEnabled],
  );

  // ANIMATION group master gate: when off, the renderer receives capabilities
  // with the motion choreography neutralized (pickup scale pinned to 100% so
  // the ghost lifts at full size, coherent transit off) — placement reads as
  // instant. The panel still binds to the true `interactionCapabilities` so the
  // per-control values are preserved for re-enabling (mirrors the
  // `effectiveObservabilityColorEnables` gate above).
  const effectiveInteractionCapabilities: ResolvedTilingInteractionCapabilities = React.useMemo(
    (): ResolvedTilingInteractionCapabilities =>
      animationControlsEnabled
        ? interactionCapabilities
        : {
            ...interactionCapabilities,
            ghostPickupScalePercent: 100,
            coherentTransit: false,
          },
    [animationControlsEnabled, interactionCapabilities],
  );

  return (
    <main className="flex h-screen max-h-screen min-h-0 overflow-hidden bg-slate-950 p-3 text-slate-100">
      <section className="flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-cyan-400/35 bg-slate-900/90 p-3 shadow-[0_0_35px_rgba(34,211,238,0.18)]">
        <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-200">
              hypr tiling showcase
            </div>
            <h1 className="text-sm font-semibold tracking-tight text-slate-100">
              pointer resize, smart insert, split rotate, reparent, focus nav
            </h1>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
            bounded viewport: active
          </div>
        </header>

        <div className="hpt-showcase-grouping mb-3 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-violet-400/25 bg-black/35 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-200">
            tabbed grouping
          </span>
          <label className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400">
            <span>source pane</span>
            <select
              value={selectedSourceLeafId}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => {
                setSelectedSourceLeafId(event.target.value);
                setFocusedLeafId(event.target.value);
              }}
              aria-label="source pane to group"
              className="rounded border border-white/15 bg-slate-950/70 px-1.5 py-1 font-mono text-[10px] text-slate-200"
            >
              {leafIds.map((leafId: string): React.ReactElement => (
                <option key={`hpt-group-src-${leafId}`} value={leafId}>{leafId}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400">
            <span>target pane</span>
            <select
              value={selectedTargetLeafId}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => {
                setSelectedTargetLeafId(event.target.value);
                setFocusedLeafId(event.target.value);
              }}
              aria-label="target pane to group with source"
              className="rounded border border-white/15 bg-slate-950/70 px-1.5 py-1 font-mono text-[10px] text-slate-200"
            >
              {leafIds.map((leafId: string): React.ReactElement => (
                <option key={`hpt-group-tgt-${leafId}`} value={leafId}>{leafId}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleGroupSelection}
            disabled={!canGroupSelection}
            title={
              canGroupSelection
                ? `Stack ${selectedSourceLeafId} and ${selectedTargetLeafId} into one tabbed group slot.`
                : "Pick two different panes first."
            }
            className="hpt-showcase-group-button rounded border border-violet-400/40 bg-violet-500/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-violet-100 transition-colors hover:border-violet-300/70 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            group
          </button>
          <div className="hpt-showcase-ungroup flex items-center gap-1">
            <select
              value={selectedGroupId}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => setSelectedGroupId(event.target.value)}
              disabled={groups.length === 0}
              aria-label="group to ungroup"
              className="rounded border border-white/15 bg-slate-950/70 px-1.5 py-1 font-mono text-[10px] text-slate-200 disabled:opacity-40"
            >
              {groups.length === 0
                ? <option value="">no groups</option>
                : groups.map((group: DynamicGroupNode): React.ReactElement => (
                    <option key={`hpt-ungroup-opt-${group.id}`} value={group.id}>
                      {group.id} ({group.members.length})
                    </option>
                  ))}
            </select>
            <button
              type="button"
              onClick={handleUngroupSelection}
              disabled={groups.length === 0 || selectedGroupId === ""}
              title="Explode the selected group back into a dwindle split of its members."
              className="hpt-showcase-ungroup-button rounded border border-white/15 bg-slate-800/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-200 transition-colors hover:border-white/30 hover:bg-slate-700/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ungroup
            </button>
          </div>
          <span className="font-mono text-[10px] text-slate-500">
            {groups.length} group{groups.length === 1 ? "" : "s"} · select two panes then Group — or drag onto a group center/tab strip · Alt+K/J tabs · × ejects one member
          </span>
        </div>

        <div className="flex h-full max-h-full min-h-0 min-w-0 max-w-full flex-1 flex-row gap-3 overflow-hidden">
          <div className="h-full max-h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-slate-950/75 p-2">
            <DynamicTilingRenderer
              layout={layout}
              tiles={tilesMap}
              config={config}
              onLayoutChange={setLayout}
              interaction={effectiveInteractionCapabilities}
              focusedLeafId={focusedLeafId}
              onFocusedLeafChange={setFocusedLeafId}
              showDropPreviewOverlays={previewOverlaysEnabled && showDropPreviewOverlays}
              observabilityColors={observabilityColors}
              observabilityColorEnables={effectiveObservabilityColorEnables}
              projectedOverlayBackgroundAlpha={projectedOverlayBgAlphaPercent / 100}
              dragAnimationEnabled={animationControlsEnabled}
              ghostTransitSpeedPercent={ghostTransitSpeedPercent}
              survivorReflowSpeedPercent={survivorReflowSpeedPercent}
              swapBounceMagnitudePercent={swapBounceMagnitudePercent}
              dragHopEasing={dragHopEasing}
              onProjectedOverlayCountChange={setProjectedOverlayRenderCount}
              showDropBorderHints={dropIntentDebugEnabled && showDropBorderHints}
              showDropIntentTranslucentBg={dropIntentDebugEnabled && showDropIntentTranslucentBg}
              showDropIntentDebug={dropIntentDebugEnabled && showDropIntentDebug}
              showPaneHitZones={(hitZoneOverlaysEnabled && showPaneHitZones) || hitZoneGeometryPreviewActive}
              paneHitZonesAlpha={paneHitZonesAlphaPercent / 100}
              paneHitZoneSourceLeafId={selectedSourceLeafId}
              onDropIntentChange={setLiveDropIntent}
              onLiveHitLogChange={setLiveHitLog}
            />
          </div>

          <TilingObservabilityPanel
            layout={layout}
            setLayout={setLayout}
            config={config}
            setConfig={setConfig}
            focusedLeafId={focusedLeafId}
            selectedSourceLeafId={selectedSourceLeafId}
            setSelectedSourceLeafId={setSelectedSourceLeafId}
            selectedTargetLeafId={selectedTargetLeafId}
            setSelectedTargetLeafId={setSelectedTargetLeafId}
            selectedSplitId={selectedSplitId}
            setSelectedSplitId={setSelectedSplitId}
            preserveParentSplitAxis={preserveParentSplitAxis}
            setPreserveParentSplitAxis={setPreserveParentSplitAxis}
            showDropPreviewOverlays={showDropPreviewOverlays}
            setShowDropPreviewOverlays={setShowDropPreviewOverlays}
            observabilityColors={observabilityColors}
            setObservabilityColors={setObservabilityColors}
            observabilityColorEnables={observabilityColorEnables}
            setObservabilityColorEnables={setObservabilityColorEnables}
            projectedOverlayBgAlphaPercent={projectedOverlayBgAlphaPercent}
            setProjectedOverlayBgAlphaPercent={setProjectedOverlayBgAlphaPercent}
            animationSpeedLinked={animationSpeedLinked}
            setAnimationSpeedLinked={setAnimationSpeedLinked}
            ghostTransitSpeedPercent={ghostTransitSpeedPercent}
            setGhostTransitSpeedPercent={setGhostTransitSpeedPercent}
            survivorReflowSpeedPercent={survivorReflowSpeedPercent}
            setSurvivorReflowSpeedPercent={setSurvivorReflowSpeedPercent}
            swapBounceMagnitudePercent={swapBounceMagnitudePercent}
            setSwapBounceMagnitudePercent={setSwapBounceMagnitudePercent}
            dragHopEasing={dragHopEasing}
            setDragHopEasing={setDragHopEasing}
            projectedOverlayRenderCount={projectedOverlayRenderCount}
            showDropBorderHints={showDropBorderHints}
            setShowDropBorderHints={setShowDropBorderHints}
            showDropIntentTranslucentBg={showDropIntentTranslucentBg}
            setShowDropIntentTranslucentBg={setShowDropIntentTranslucentBg}
            showDropIntentDebug={showDropIntentDebug}
            setShowDropIntentDebug={setShowDropIntentDebug}
            showPaneHitZones={showPaneHitZones}
            setShowPaneHitZones={setShowPaneHitZones}
            paneHitZonesAlphaPercent={paneHitZonesAlphaPercent}
            setPaneHitZonesAlphaPercent={setPaneHitZonesAlphaPercent}
            showLiveStatus={showLiveStatus}
            setShowLiveStatus={setShowLiveStatus}
            liveStatusSticky={liveStatusSticky}
            setLiveStatusSticky={setLiveStatusSticky}
            previewOverlaysEnabled={previewOverlaysEnabled}
            setPreviewOverlaysEnabled={setPreviewOverlaysEnabled}
            previewOverlaysSticky={previewOverlaysSticky}
            setPreviewOverlaysSticky={setPreviewOverlaysSticky}
            subjectColorsEnabled={subjectColorsEnabled}
            setSubjectColorsEnabled={setSubjectColorsEnabled}
            subjectColorsSticky={subjectColorsSticky}
            setSubjectColorsSticky={setSubjectColorsSticky}
            dropIntentDebugEnabled={dropIntentDebugEnabled}
            setDropIntentDebugEnabled={setDropIntentDebugEnabled}
            dropIntentDebugSticky={dropIntentDebugSticky}
            setDropIntentDebugSticky={setDropIntentDebugSticky}
            hitZoneOverlaysEnabled={hitZoneOverlaysEnabled}
            setHitZoneOverlaysEnabled={setHitZoneOverlaysEnabled}
            hitZoneOverlaysSticky={hitZoneOverlaysSticky}
            setHitZoneOverlaysSticky={setHitZoneOverlaysSticky}
            hitZoneGeometryEnabled={hitZoneGeometryEnabled}
            setHitZoneGeometryEnabled={setHitZoneGeometryEnabled}
            hitZoneGeometrySticky={hitZoneGeometrySticky}
            setHitZoneGeometrySticky={setHitZoneGeometrySticky}
            animationControlsEnabled={animationControlsEnabled}
            setAnimationControlsEnabled={setAnimationControlsEnabled}
            animationControlsSticky={animationControlsSticky}
            setAnimationControlsSticky={setAnimationControlsSticky}
            liveDropIntent={liveDropIntent}
            liveHitLog={liveHitLog}
            observabilityLedgerEntries={observabilityLedgerEntries}
            splitCount={splitCount}
            leafIds={leafIds}
            tileOrder={tileOrder}
            splitNodes={splitNodes}
            setFocusedLeafId={setFocusedLeafId}
            runDirectionalFocus={runDirectionalFocus}
            interactionCapabilities={interactionCapabilities}
            setInteractionCapabilities={setInteractionCapabilities}
          />
        </div>
      </section>
    </main>
  );
}
