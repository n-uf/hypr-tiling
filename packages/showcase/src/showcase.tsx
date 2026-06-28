"use client";

import {
  ANIMATION_CONTROL_DEFAULTS,
  DEFAULT_DRAG_HOP_EASING,
  DEFAULT_TILING_LAYOUT_CONFIG,
  DYNAMIC_OBSERVABILITY_COLOR_DEFAULTS,
  DYNAMIC_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
  DynamicTilingRenderer,
  TilingObservabilityPanel,
  collectSplitNodes,
  findLeafByDirection,
  readLeafNodeIds,
  readTileOrderByLeaf,
  resolveInteractionCapabilities,
  type DynamicDropIntentDebugState,
  type DynamicFocusDirection,
  type DynamicLayoutConfig,
  type DynamicLayoutNode,
  type DynamicLiveHitLogState,
  type DynamicObservabilityColorConfig,
  type DynamicObservabilityColorEnableConfig,
  type DynamicPaneFootprint,
  type DynamicSplitNode,
  type DynamicTile,
  type ResolvedTilingInteractionCapabilities,
  type ResolvedTilingKeyChord,
  type ResolvedTilingKeyChordModifiers,
  type ResolvedTilingKeymap,
  type TilingCommand,
  type TilingCommandHandle,
  type TilingObservabilityLedgerEntry,
} from "hypr-tiling";
import * as React from "react";
import {
  resolveShowcasePaneContent,
  type ShowcasePaneId,
} from "./showcase-pane-demos";

const SHOWCASE_TILE_DEFINITIONS: ReadonlyArray<{
  id: ShowcasePaneId;
  title: string;
  description: string;
  accent: DynamicTile["accent"];
}> = [
  {
    id: "overview",
    title: "overview",
    description: "status",
    accent: "cyan",
  },
  {
    id: "events",
    title: "events",
    description: "feed",
    accent: "violet",
  },
  {
    id: "graph",
    title: "spend",
    description: "trend",
    accent: "sky",
  },
  {
    id: "alerts",
    title: "alerts",
    description: "items",
    accent: "pink",
  },
  {
    id: "debug",
    title: "debug console",
    description: "trace",
    accent: "cyan",
  },
];

const SHOWCASE_TILES: ReadonlyArray<DynamicTile> =
  SHOWCASE_TILE_DEFINITIONS.map(
    (definition): DynamicTile => ({
      id: definition.id,
      title: definition.title,
      description: definition.description,
      accent: definition.accent,
      content: resolveShowcasePaneContent(definition.id),
    }),
  );

interface ShowcaseControlShortcut {
  id: string;
  combo: string;
  tooltip: string;
  command: TilingCommand;
}

function keyCodeLabel(code: string): string {
  if (code === "Enter") {
    return "Enter";
  }
  if (code === "Escape") {
    return "Esc";
  }
  if (code === "BracketLeft") {
    return "[";
  }
  if (code === "BracketRight") {
    return "]";
  }
  if (code === "Backquote") {
    return "`";
  }
  if (code === "ArrowLeft") {
    return "←";
  }
  if (code === "ArrowRight") {
    return "→";
  }
  if (code === "ArrowUp") {
    return "↑";
  }
  if (code === "ArrowDown") {
    return "↓";
  }
  if (code === "Equal") {
    return "+";
  }
  if (code === "Minus") {
    return "-";
  }
  if (code === "Comma") {
    return ",";
  }
  if (code === "Period") {
    return ".";
  }
  if (code.startsWith("Key")) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith("Digit")) {
    return code.slice(5);
  }
  return code;
}

function keyChordModifierPrefix(
  modifiers: ResolvedTilingKeyChordModifiers,
): string {
  const tokens: Array<string> = [];
  if (modifiers.ctrl) {
    tokens.push("Ctrl");
  }
  if (modifiers.meta) {
    tokens.push("Meta");
  }
  if (modifiers.alt) {
    tokens.push("Alt");
  }
  if (modifiers.shift) {
    tokens.push("Shift");
  }
  return tokens.join("+");
}

function formatKeyChordLabel(chord: ResolvedTilingKeyChord): string {
  const modifierPrefix: string = keyChordModifierPrefix(chord);
  if (modifierPrefix.length === 0) {
    return keyCodeLabel(chord.code);
  }
  return `${modifierPrefix}+${keyCodeLabel(chord.code)}`;
}

interface ShortcutComboRows {
  modifiers: string;
  primaryKey: string;
}

function compactModifierToken(token: string): string {
  if (token === "Ctrl") {
    return "C";
  }
  if (token === "Meta") {
    return "M";
  }
  if (token === "Alt") {
    return "A";
  }
  if (token === "Shift") {
    return "S";
  }
  return token.toUpperCase();
}

function formatShortcutComboRows(combo: string): ShortcutComboRows {
  const parts: Array<string> = combo.split("+");
  if (parts.length <= 1) {
    return { modifiers: "", primaryKey: parts[0] ?? "" };
  }
  const modifierTokens: Array<string> = parts
    .slice(0, -1)
    .map((part: string): string => compactModifierToken(part));
  return {
    modifiers: modifierTokens.join("+"),
    primaryKey: parts[parts.length - 1] ?? "",
  };
}

function buildControlPaneShortcuts(
  keymap: ResolvedTilingKeymap,
): ReadonlyArray<ShowcaseControlShortcut> {
  const jumpModifierPrefix: string = keyChordModifierPrefix(keymap.jumpToPane);
  const jumpShortcuts: ReadonlyArray<ShowcaseControlShortcut> = Array.from(
    { length: 9 },
    (_, index: number): ShowcaseControlShortcut => {
      const paneNumber: number = index + 1;
      const combo: string =
        jumpModifierPrefix.length === 0
          ? `${paneNumber}`
          : `${jumpModifierPrefix}+${paneNumber}`;
      return {
        id: `jump-${paneNumber}`,
        combo,
        tooltip: `Focus pane ${paneNumber}`,
        command: { kind: "focus-jump", paneNumber },
      };
    },
  );

  return [
    {
      id: "toggle-maximize",
      combo: formatKeyChordLabel(keymap.toggleMaximize),
      tooltip: "Toggle maximize focused pane",
      command: { kind: "toggle-maximize" },
    },
    {
      id: "restore",
      combo: formatKeyChordLabel(keymap.restore),
      tooltip: "Restore maximized pane",
      command: { kind: "restore" },
    },
    {
      id: "focus-previous",
      combo: formatKeyChordLabel(keymap.previousPane),
      tooltip: "Focus previous pane",
      command: { kind: "focus-cycle", direction: "previous" },
    },
    {
      id: "focus-next",
      combo: formatKeyChordLabel(keymap.nextPane),
      tooltip: "Focus next pane",
      command: { kind: "focus-cycle", direction: "next" },
    },
    {
      id: "focus-current-or-last",
      combo: formatKeyChordLabel(keymap.focusCurrentOrLast),
      tooltip: "Focus current or last pane",
      command: { kind: "focus-current-or-last" },
    },
    {
      id: "focus-left",
      combo: formatKeyChordLabel(keymap.focusLeft),
      tooltip: "Focus pane to the left",
      command: { kind: "focus-direction", direction: "left" },
    },
    {
      id: "focus-up",
      combo: formatKeyChordLabel(keymap.focusUp),
      tooltip: "Focus pane above",
      command: { kind: "focus-direction", direction: "up" },
    },
    {
      id: "focus-down",
      combo: formatKeyChordLabel(keymap.focusDown),
      tooltip: "Focus pane below",
      command: { kind: "focus-direction", direction: "down" },
    },
    {
      id: "focus-right",
      combo: formatKeyChordLabel(keymap.focusRight),
      tooltip: "Focus pane to the right",
      command: { kind: "focus-direction", direction: "right" },
    },
    {
      id: "move-mode",
      combo: formatKeyChordLabel(keymap.enterMoveMode),
      tooltip: "Enter move mode",
      command: { kind: "enter-move-mode" },
    },
    {
      id: "layout-cycle",
      combo: formatKeyChordLabel(keymap.cycleLayoutMode),
      tooltip: "Cycle layout mode",
      command: { kind: "cycle-layout-mode" },
    },
    {
      id: "master-orientation",
      combo: formatKeyChordLabel(keymap.cycleMasterOrientation),
      tooltip: "Cycle master orientation",
      command: { kind: "cycle-master-orientation" },
    },
    {
      id: "master-count-inc",
      combo: formatKeyChordLabel(keymap.incrementMasterCount),
      tooltip: "Increase master count",
      command: { kind: "adjust-master-count", delta: 1 },
    },
    {
      id: "master-count-dec",
      combo: formatKeyChordLabel(keymap.decrementMasterCount),
      tooltip: "Decrease master count",
      command: { kind: "adjust-master-count", delta: -1 },
    },
    {
      id: "master-ratio-inc",
      combo: formatKeyChordLabel(keymap.incrementMasterRatio),
      tooltip: "Increase master ratio",
      command: { kind: "adjust-master-ratio", delta: 0.05 },
    },
    {
      id: "master-ratio-dec",
      combo: formatKeyChordLabel(keymap.decrementMasterRatio),
      tooltip: "Decrease master ratio",
      command: { kind: "adjust-master-ratio", delta: -0.05 },
    },
    {
      id: "toggle-group",
      combo: formatKeyChordLabel(keymap.toggleGroup),
      tooltip: "Toggle group for focused pane",
      command: { kind: "toggle-group" },
    },
    {
      id: "group-tab-next",
      combo: formatKeyChordLabel(keymap.groupTabNext),
      tooltip: "Focus next tab in group",
      command: { kind: "group-tab-cycle", direction: "next" },
    },
    {
      id: "group-tab-previous",
      combo: formatKeyChordLabel(keymap.groupTabPrevious),
      tooltip: "Focus previous tab in group",
      command: { kind: "group-tab-cycle", direction: "previous" },
    },
    ...jumpShortcuts,
  ];
}

const INITIAL_LAYOUT: DynamicLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.58,
  // No per-node `gapPx` override: every split boundary inherits the live
  // `config.gapPx` so the top-bar gap control tunes ALL gutters uniformly. A
  // per-node `gapPx` is a legitimate library capability (`node.gapPx ??
  // config.gapPx`), but pinning the root here made the root gutter ignore the
  // control while nested boundaries widened — the gap-inconsistency bug.
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

const INITIAL_CONFIG: DynamicLayoutConfig = { ...DEFAULT_TILING_LAYOUT_CONFIG };
const DEFAULT_SHOW_DROP_PREVIEW_LANDING_SHADOWS: boolean = true;
const LIVE_LEDGER_RETENTION_LIMIT: number = 60;
/** How long the "preview all hit zones on adjustment" overlay stays up after the last geometry slider input. */
const HIT_ZONE_GEOMETRY_PREVIEW_MS: number = 1200;
// Debug-overlay color palette seeded from the library default (single source of
// truth) — the panel's sliders tune it from here and "reset to defaults" lands
// back on the same library baseline.
const DEFAULT_OBSERVABILITY_COLORS: DynamicObservabilityColorConfig =
  DYNAMIC_OBSERVABILITY_COLOR_DEFAULTS;

function toTileMap(
  tiles: ReadonlyArray<DynamicTile>,
): ReadonlyMap<string, DynamicTile> {
  return new Map<string, DynamicTile>(
    tiles.map((tile: DynamicTile): [string, DynamicTile] => [tile.id, tile]),
  );
}

function formatLedgerTimestamp(date: Date): string {
  return `${date.toLocaleTimeString("en-US", { hour12: false })}.${date.getMilliseconds().toString().padStart(3, "0")}`;
}

function toFixedOrNone(
  value: number | null | undefined,
  digits: number,
): string {
  if (value == null) {
    return "none";
  }
  return value.toFixed(digits);
}

function formatViewportCursorLabel(
  liveHitLog: DynamicLiveHitLogState | null,
): string {
  if (liveHitLog == null) {
    return "none";
  }
  return `x=${liveHitLog.cursorViewport.x.toFixed(1)} y=${liveHitLog.cursorViewport.y.toFixed(1)}`;
}

function formatPaneGeometryLabel(
  footprint: DynamicPaneFootprint | null | undefined,
): string {
  if (footprint == null) {
    return "none";
  }
  return `x=${footprint.left.toFixed(1)} y=${footprint.top.toFixed(1)} w=${footprint.width.toFixed(1)} h=${footprint.height.toFixed(1)}`;
}

export function DynamicTilingShowcase(): React.ReactElement {
  const [layout, setLayout] = React.useState<DynamicLayoutNode>(INITIAL_LAYOUT);
  const [config, setConfig] =
    React.useState<DynamicLayoutConfig>(INITIAL_CONFIG);
  const [focusedLeafId, setFocusedLeafId] = React.useState<string | null>(null);
  const [isControlPaneCollapsed, setIsControlPaneCollapsed] =
    React.useState<boolean>(true);
  const rendererCommandHandleRef = React.useRef<TilingCommandHandle | null>(
    null,
  );
  const [selectedSourceLeafId, setSelectedSourceLeafId] =
    React.useState<string>("north-west");
  const [selectedTargetLeafId, setSelectedTargetLeafId] =
    React.useState<string>("north-east");
  const [selectedSplitId, setSelectedSplitId] = React.useState<string>("root");
  const [preserveParentSplitAxis, setPreserveParentSplitAxis] =
    React.useState<boolean>(true);
  const [showDropPreviewOverlays, setShowDropPreviewOverlays] =
    React.useState<boolean>(DEFAULT_SHOW_DROP_PREVIEW_LANDING_SHADOWS);
  const [observabilityColors, setObservabilityColors] =
    React.useState<DynamicObservabilityColorConfig>(
      DEFAULT_OBSERVABILITY_COLORS,
    );
  const [observabilityColorEnables, setObservabilityColorEnables] =
    React.useState<DynamicObservabilityColorEnableConfig>(
      DYNAMIC_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
    );
  const [projectedOverlayBgAlphaPercent, setProjectedOverlayBgAlphaPercent] =
    React.useState<number>(90);
  // ANIMATION group speed/bounce state. Linked (default) keeps the two party
  // speeds at parity (one slider drives both); unlinking exposes them
  // independently and gates coherent transit off. Seeded from the shared
  // ANIMATION_CONTROL_DEFAULTS so the panel's "reset to defaults" matches the
  // initial load.
  const [animationSpeedLinked, setAnimationSpeedLinked] =
    React.useState<boolean>(ANIMATION_CONTROL_DEFAULTS.speedLinked);
  const [ghostTransitSpeedPercent, setGhostTransitSpeedPercent] =
    React.useState<number>(ANIMATION_CONTROL_DEFAULTS.ghostTransitSpeedPercent);
  const [survivorReflowSpeedPercent, setSurvivorReflowSpeedPercent] =
    React.useState<number>(
      ANIMATION_CONTROL_DEFAULTS.survivorReflowSpeedPercent,
    );
  const [swapBounceMagnitudePercent, setSwapBounceMagnitudePercent] =
    React.useState<number>(
      ANIMATION_CONTROL_DEFAULTS.swapBounceMagnitudePercent,
    );
  // Consumer-configurable drag-hop easing (HT-ANIM-EASING-CONFIG). Threaded to
  // the renderer's `dragHopEasing` prop; the survivor reflow falls back to it.
  const [dragHopEasing, setDragHopEasing] = React.useState<string>(
    DEFAULT_DRAG_HOP_EASING,
  );
  const [projectedOverlayRenderCount, setProjectedOverlayRenderCount] =
    React.useState<number>(0);
  const [showDropBorderHints, setShowDropBorderHints] =
    React.useState<boolean>(true);
  const [showDropIntentTranslucentBg, setShowDropIntentTranslucentBg] =
    React.useState<boolean>(true);
  const [showDropIntentDebug, setShowDropIntentDebug] =
    React.useState<boolean>(true);
  const [showPaneHitZones, setShowPaneHitZones] =
    React.useState<boolean>(false);
  const [paneHitZonesAlphaPercent, setPaneHitZonesAlphaPercent] =
    React.useState<number>(20);
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
  const [liveStatusSticky, setLiveStatusSticky] =
    React.useState<boolean>(false);
  const [previewOverlaysEnabled, setPreviewOverlaysEnabled] =
    React.useState<boolean>(false);
  const [previewOverlaysSticky, setPreviewOverlaysSticky] =
    React.useState<boolean>(false);
  const [subjectColorsEnabled, setSubjectColorsEnabled] =
    React.useState<boolean>(false);
  const [subjectColorsSticky, setSubjectColorsSticky] =
    React.useState<boolean>(false);
  const [dropIntentDebugEnabled, setDropIntentDebugEnabled] =
    React.useState<boolean>(false);
  const [dropIntentDebugSticky, setDropIntentDebugSticky] =
    React.useState<boolean>(false);
  const [hitZoneOverlaysEnabled, setHitZoneOverlaysEnabled] =
    React.useState<boolean>(false);
  const [hitZoneOverlaysSticky, setHitZoneOverlaysSticky] =
    React.useState<boolean>(false);
  // HIT-ZONE GEOMETRY group: advanced drop hit-zone geometry knobs (center swap
  // fraction, center floor, hysteresis). Gating only collapses the controls; the
  // current geometry values stay live in `interactionCapabilities` and keep
  // driving zone resolution. Advanced tuning → default OFF, matching the sibling
  // debug groups so a fresh load is clean.
  const [hitZoneGeometryEnabled, setHitZoneGeometryEnabled] =
    React.useState<boolean>(false);
  const [hitZoneGeometrySticky, setHitZoneGeometrySticky] =
    React.useState<boolean>(false);
  // ANIMATION group: live-drag motion choreography (ghost pickup-scale + bbox
  // hop morph + coherent non-intersecting transit). Default ON so the polish is
  // visible on a fresh load; OFF forces instant placement (pickup scale pinned
  // to 100%, coherent transit off) without losing the per-control values.
  const [animationControlsEnabled, setAnimationControlsEnabled] =
    React.useState<boolean>(true);
  const [animationControlsSticky, setAnimationControlsSticky] =
    React.useState<boolean>(false);
  // Transient "preview all hit zones" pulse: any drop hit-zone geometry change
  // briefly force-shows the per-pane zone overlay across EVERY pane so the
  // operator sees the new partition layout-wide, then auto-dismisses.
  const [hitZoneGeometryPreviewActive, setHitZoneGeometryPreviewActive] =
    React.useState<boolean>(false);
  const [interactionCapabilities, setInteractionCapabilities] =
    React.useState<ResolvedTilingInteractionCapabilities>(
      (): ResolvedTilingInteractionCapabilities =>
        resolveInteractionCapabilities({
          dragMode: "live",
          resizeHandlesVisible: false,
          paneSwitching: {
            enable: true,
            showTabStrip: true,
            showSwitcherOverlay: false,
          },
        }),
    );
  const hitZoneGeometrySignatureRef = React.useRef<string>(
    `${interactionCapabilities.dropHitZoneGeometry.centerRatio}|${interactionCapabilities.dropHitZoneGeometry.centerMinPx}|${interactionCapabilities.dropHitZoneGeometry.hysteresisPx}`,
  );
  const [liveDropIntent, setLiveDropIntent] =
    React.useState<DynamicDropIntentDebugState | null>(null);
  const [liveHitLog, setLiveHitLog] =
    React.useState<DynamicLiveHitLogState | null>(null);
  const [observabilityLedgerEntries, setObservabilityLedgerEntries] =
    React.useState<ReadonlyArray<TilingObservabilityLedgerEntry>>([]);
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
  const controlPaneShortcuts: ReadonlyArray<ShowcaseControlShortcut> =
    React.useMemo(
      (): ReadonlyArray<ShowcaseControlShortcut> =>
        buildControlPaneShortcuts(interactionCapabilities.keymap),
      [interactionCapabilities.keymap],
    );
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
    const splitIds: ReadonlyArray<string> = splitNodes.map(
      (splitNode: DynamicSplitNode): string => splitNode.id,
    );
    if (!splitIds.includes(selectedSplitId)) {
      setSelectedSplitId(splitIds[0]);
    }
  }, [selectedSplitId, splitNodes]);

  React.useEffect((): void => {
    const sourceLeafId: string = liveHitLog?.sourceLeafId ?? "none";
    const dragSourceLeafId: string = liveHitLog?.dragSourceLeafId ?? "none";
    const hoveredLeafId: string = liveHitLog?.hoveredLeafId ?? "none";
    const pointerModeLabel: string =
      liveHitLog?.isDragging === true ? "drag" : "hover";
    const resolverZoneLabel: string = liveHitLog?.resolverZone ?? "none";
    const actionLabel: string =
      liveDropIntent?.action ?? liveHitLog?.intent?.action ?? "none";
    const selectedEdgeLabel: string =
      liveDropIntent?.finalEdge ??
      liveDropIntent?.selectedSplitZone ??
      liveHitLog?.intent?.finalEdge ??
      liveHitLog?.intent?.selectedSplitZone ??
      "none";
    const centerValidityLabel: string =
      liveHitLog?.centerIsValid == null
        ? "none"
        : liveHitLog.centerIsValid
          ? "ok"
          : "blocked";
    const blockedReasonLabel: string =
      liveHitLog?.centerBlockedReason ??
      liveDropIntent?.blockedReason ??
      liveHitLog?.intent?.blockedReason ??
      "none";
    const centerDistanceLabel: string = toFixedOrNone(
      liveDropIntent?.centerDistancePx ?? liveHitLog?.intent?.centerDistancePx,
      1,
    );
    const nearestEdgeDistanceLabel: string = toFixedOrNone(
      liveDropIntent?.nearestEdgeDistancePx ??
        liveHitLog?.intent?.nearestEdgeDistancePx,
      1,
    );
    const cursorViewportLabel: string = formatViewportCursorLabel(liveHitLog);
    const sourcePaneGeometryLabel: string = formatPaneGeometryLabel(
      liveHitLog?.sourcePaneFootprint,
    );
    const dragSourcePaneGeometryLabel: string = formatPaneGeometryLabel(
      liveHitLog?.dragSourcePaneFootprint,
    );
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

    setObservabilityLedgerEntries(
      (
        previousEntries: ReadonlyArray<TilingObservabilityLedgerEntry>,
      ): ReadonlyArray<TilingObservabilityLedgerEntry> => {
        const nextEntries: ReadonlyArray<TilingObservabilityLedgerEntry> = [
          nextEntry,
          ...previousEntries,
        ];
        return nextEntries.slice(0, LIVE_LEDGER_RETENTION_LIMIT);
      },
    );
  }, [liveDropIntent, liveHitLog]);

  const runDirectionalFocus = React.useCallback(
    (direction: DynamicFocusDirection): void => {
      const fromLeafId: string | null = focusedLeafId ?? selectedSourceLeafId;
      if (fromLeafId == null) {
        return;
      }
      const nextLeafId: string | null = findLeafByDirection(
        layout,
        fromLeafId,
        direction,
      );
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
  const effectiveObservabilityColorEnables: DynamicObservabilityColorEnableConfig =
    React.useMemo(
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
  const effectiveInteractionCapabilities: ResolvedTilingInteractionCapabilities =
    React.useMemo(
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
    <main
      className="flex h-screen max-h-screen min-h-0 overflow-hidden bg-[#0b0d12] bg-cover bg-center bg-no-repeat p-1.5 text-slate-100"
      style={{ backgroundImage: "url('/src/showcase-bg-simple.svg')" }}
    >
      <section className="flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-zinc-950/45 p-0.5 backdrop-blur-[1px]">
        <div className="flex h-full max-h-full min-h-0 min-w-0 max-w-full flex-1 flex-row gap-1.5 overflow-hidden">
          <div className="h-full max-h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl bg-transparent p-0">
            <DynamicTilingRenderer
              ref={rendererCommandHandleRef}
              layout={layout}
              tiles={tilesMap}
              config={config}
              onLayoutChange={setLayout}
              interaction={effectiveInteractionCapabilities}
              focusedLeafId={focusedLeafId}
              onFocusedLeafChange={setFocusedLeafId}
              showDropPreviewOverlays={
                previewOverlaysEnabled && showDropPreviewOverlays
              }
              observabilityColors={observabilityColors}
              observabilityColorEnables={effectiveObservabilityColorEnables}
              projectedOverlayBackgroundAlpha={
                projectedOverlayBgAlphaPercent / 100
              }
              dragAnimationEnabled={animationControlsEnabled}
              ghostTransitSpeedPercent={ghostTransitSpeedPercent}
              survivorReflowSpeedPercent={survivorReflowSpeedPercent}
              swapBounceMagnitudePercent={swapBounceMagnitudePercent}
              dragHopEasing={dragHopEasing}
              onProjectedOverlayCountChange={setProjectedOverlayRenderCount}
              showDropBorderHints={
                dropIntentDebugEnabled && showDropBorderHints
              }
              showDropIntentTranslucentBg={
                dropIntentDebugEnabled && showDropIntentTranslucentBg
              }
              showDropIntentDebug={
                dropIntentDebugEnabled && showDropIntentDebug
              }
              showPaneHitZones={
                (hitZoneOverlaysEnabled && showPaneHitZones) ||
                hitZoneGeometryPreviewActive
              }
              paneHitZonesAlpha={paneHitZonesAlphaPercent / 100}
              paneHitZoneSourceLeafId={selectedSourceLeafId}
              onDropIntentChange={setLiveDropIntent}
              onLiveHitLogChange={setLiveHitLog}
            />
          </div>

          <div
            className={`h-full max-h-full min-h-0 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.74),rgba(10,10,12,0.9))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_24px_rgba(15,23,42,0.24)] transition-[width] duration-200 ease-out ${
              isControlPaneCollapsed ? "w-16" : "w-[352px]"
            }`}
            data-control-pane-state={
              isControlPaneCollapsed ? "collapsed" : "expanded"
            }
          >
            <div className="flex h-full min-h-0 flex-col p-2">
              <button
                type="button"
                onClick={(): void =>
                  setIsControlPaneCollapsed(
                    (previous: boolean): boolean => !previous,
                  )
                }
                aria-expanded={!isControlPaneCollapsed}
                aria-label={
                  isControlPaneCollapsed
                    ? "expand control panel"
                    : "collapse control panel"
                }
                title={
                  isControlPaneCollapsed
                    ? "Expand control panel"
                    : "Collapse control panel"
                }
                className={`
                  mb-1.5 flex shrink-0 items-center rounded-lg border border-cyan-200/55 bg-cyan-500/12 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.2)] transition-colors hover:border-cyan-100/80 hover:bg-cyan-500/20
                  ${isControlPaneCollapsed ? "justify-center px-0" : "justify-between px-2.5"}
                `}
              >
                {isControlPaneCollapsed ? (
                  <span aria-hidden>{">>"}</span>
                ) : (
                  <>
                    <span>collapse</span>
                    <span aria-hidden>{"<<"}</span>
                  </>
                )}
              </button>
              {isControlPaneCollapsed ? (
                <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
                  <div className="flex flex-col gap-0.5">
                    {controlPaneShortcuts.map(
                      (
                        shortcut: ShowcaseControlShortcut,
                      ): React.ReactElement => {
                        const comboRows: ShortcutComboRows =
                          formatShortcutComboRows(shortcut.combo);
                        return (
                          <button
                            key={shortcut.id}
                            type="button"
                            title={`${shortcut.tooltip} (${shortcut.combo})`}
                            aria-label={`${shortcut.tooltip} (${shortcut.combo})`}
                            onClick={(): void => {
                              rendererCommandHandleRef.current?.dispatch(
                                shortcut.command,
                              );
                            }}
                            className="w-full rounded-md bg-[linear-gradient(180deg,rgba(39,39,42,0.78),rgba(17,17,20,0.9))] px-1 py-1 text-center font-mono uppercase text-slate-200 transition-colors hover:bg-[linear-gradient(180deg,rgba(63,63,70,0.85),rgba(24,24,27,0.95))] hover:text-slate-50"
                          >
                            <span className="block text-[7px] leading-none tracking-[0.12em] text-slate-400">
                              {comboRows.modifiers.length > 0
                                ? comboRows.modifiers
                                : "key"}
                            </span>
                            <span className="mt-0.5 block text-[9px] font-semibold leading-none tracking-[0.1em]">
                              {comboRows.primaryKey}
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-hidden">
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
                    projectedOverlayBgAlphaPercent={
                      projectedOverlayBgAlphaPercent
                    }
                    setProjectedOverlayBgAlphaPercent={
                      setProjectedOverlayBgAlphaPercent
                    }
                    animationSpeedLinked={animationSpeedLinked}
                    setAnimationSpeedLinked={setAnimationSpeedLinked}
                    ghostTransitSpeedPercent={ghostTransitSpeedPercent}
                    setGhostTransitSpeedPercent={setGhostTransitSpeedPercent}
                    survivorReflowSpeedPercent={survivorReflowSpeedPercent}
                    setSurvivorReflowSpeedPercent={
                      setSurvivorReflowSpeedPercent
                    }
                    swapBounceMagnitudePercent={swapBounceMagnitudePercent}
                    setSwapBounceMagnitudePercent={
                      setSwapBounceMagnitudePercent
                    }
                    dragHopEasing={dragHopEasing}
                    setDragHopEasing={setDragHopEasing}
                    projectedOverlayRenderCount={projectedOverlayRenderCount}
                    showDropBorderHints={showDropBorderHints}
                    setShowDropBorderHints={setShowDropBorderHints}
                    showDropIntentTranslucentBg={showDropIntentTranslucentBg}
                    setShowDropIntentTranslucentBg={
                      setShowDropIntentTranslucentBg
                    }
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
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
