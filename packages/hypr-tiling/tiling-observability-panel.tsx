"use client";

import * as React from "react";
import {
  DRAG_ANIMATION_SPEED_MAX_PERCENT,
  DRAG_ANIMATION_SPEED_MIN_PERCENT,
  resolveDragAnimationDurationMs,
  usePrefersReducedMotion,
} from "./dynamic-tiling-renderer";
import {
  DEFAULT_GHOST_PICKUP_SCALE_PERCENT,
  GHOST_PICKUP_SCALE_MAX_PERCENT,
  GHOST_PICKUP_SCALE_MIN_PERCENT,
  SWAP_BOUNCE_MAX_PERCENT,
  SWAP_BOUNCE_MIN_PERCENT,
} from "./ghost-transit";
import { DEFAULT_DRAG_HOP_EASING } from "./drag-easing";
import {
  insertLeafAdjacent,
  moveLeafToRoot,
  moveLeafToSplitContainer,
  toggleSplitAxis,
} from "./state";
import type {
  TilingDropAction,
  TilingDropIntentDebugState,
  TilingFocusDirection,
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLiveHitLogState,
  TilingPaneFootprint,
  TilingSplitAxis,
  TilingSplitNode,
  TilingObservabilityColorConfig,
  TilingObservabilityColorEnableConfig,
  ResolvedTilingInteractionCapabilities,
  ResolvedTilingKeyChord,
  ResolvedTilingKeyChordModifiers,
  TilingDragMode,
  TilingResizeCapability,
  TilingSlotCommitmentMode,
} from "./types";

/**
 * ANIMATION control-group defaults — the single source of truth shared by the
 * showcase initial state and the group's "reset to defaults" affordance. Speeds
 * start linked at parity (100 % = the 170ms baseline for both parties), the swap
 * bounce starts at a visible demo magnitude (the SDK prop default is 0), pickup
 * scale + coherent transit keep their library defaults.
 */
export interface AnimationControlDefaults {
  speedLinked: boolean;
  ghostTransitSpeedPercent: number;
  survivorReflowSpeedPercent: number;
  swapBounceMagnitudePercent: number;
  ghostPickupScalePercent: number;
  coherentTransit: boolean;
}

export const ANIMATION_CONTROL_DEFAULTS: AnimationControlDefaults = {
  speedLinked: true,
  ghostTransitSpeedPercent: 100,
  survivorReflowSpeedPercent: 100,
  swapBounceMagnitudePercent: 30,
  ghostPickupScalePercent: DEFAULT_GHOST_PICKUP_SCALE_PERCENT,
  coherentTransit: true,
};

/**
 * Demo preset set for the consumer-configurable drag-hop easing SDK param
 * (HT-ANIM-EASING-CONFIG). Each is a valid CSS `<easing-function>` string fed to
 * the renderer's `dragHopEasing` prop; "snappy" equals the library default.
 */
export const DRAG_HOP_EASING_PRESETS: ReadonlyArray<{ id: string; label: string; value: string }> = [
  { id: "snappy", label: "snappy", value: DEFAULT_DRAG_HOP_EASING },
  { id: "linear", label: "linear", value: "linear" },
  { id: "ease-out", label: "ease out", value: "ease-out" },
  { id: "overshoot", label: "overshoot", value: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
];

const LIVE_LEDGER_RETENTION_LIMIT: number = 60;
const CONTROL_PANE_WIDTH_PX: number = 320;
const CONTROL_PANE_STATUS_LINE_HEIGHT_PX: number = 16;
const CONTROL_PANE_STATUS_BADGE_WIDTH_CLASS: string = "w-20";
const CONTROL_PANE_INTENT_BADGE_RESERVED_ROWS: number = 1;
const CONTROL_PANE_INTENT_BADGE_RESERVED_HEIGHT_PX: number = CONTROL_PANE_STATUS_LINE_HEIGHT_PX * CONTROL_PANE_INTENT_BADGE_RESERVED_ROWS;
const CONTROL_PANE_REASON_RESERVED_ROWS: number = 3;
const CONTROL_PANE_REASON_RESERVED_HEIGHT_PX: number = CONTROL_PANE_STATUS_LINE_HEIGHT_PX * CONTROL_PANE_REASON_RESERVED_ROWS;

export interface TilingObservabilityLedgerEntry {
  id: string;
  timestampLabel: string;
  streamLine: string;
}

interface TilingObservabilityPanelProps {
  layout: TilingLayoutNode;
  setLayout: React.Dispatch<React.SetStateAction<TilingLayoutNode>>;
  config: TilingLayoutConfig;
  setConfig: React.Dispatch<React.SetStateAction<TilingLayoutConfig>>;
  focusedLeafId: string | null;
  selectedSourceLeafId: string;
  setSelectedSourceLeafId: React.Dispatch<React.SetStateAction<string>>;
  selectedTargetLeafId: string;
  setSelectedTargetLeafId: React.Dispatch<React.SetStateAction<string>>;
  selectedSplitId: string;
  setSelectedSplitId: React.Dispatch<React.SetStateAction<string>>;
  preserveParentSplitAxis: boolean;
  setPreserveParentSplitAxis: React.Dispatch<React.SetStateAction<boolean>>;
  showDropPreviewOverlays: boolean;
  setShowDropPreviewOverlays: React.Dispatch<React.SetStateAction<boolean>>;
  observabilityColors: TilingObservabilityColorConfig;
  setObservabilityColors: React.Dispatch<React.SetStateAction<TilingObservabilityColorConfig>>;
  observabilityColorEnables: TilingObservabilityColorEnableConfig;
  setObservabilityColorEnables: React.Dispatch<React.SetStateAction<TilingObservabilityColorEnableConfig>>;
  projectedOverlayBgAlphaPercent: number;
  setProjectedOverlayBgAlphaPercent: React.Dispatch<React.SetStateAction<number>>;
  animationSpeedLinked: boolean;
  setAnimationSpeedLinked: React.Dispatch<React.SetStateAction<boolean>>;
  ghostTransitSpeedPercent: number;
  setGhostTransitSpeedPercent: React.Dispatch<React.SetStateAction<number>>;
  survivorReflowSpeedPercent: number;
  setSurvivorReflowSpeedPercent: React.Dispatch<React.SetStateAction<number>>;
  swapBounceMagnitudePercent: number;
  setSwapBounceMagnitudePercent: React.Dispatch<React.SetStateAction<number>>;
  dragHopEasing: string;
  setDragHopEasing: React.Dispatch<React.SetStateAction<string>>;
  projectedOverlayRenderCount: number;
  showDropBorderHints: boolean;
  setShowDropBorderHints: React.Dispatch<React.SetStateAction<boolean>>;
  showDropIntentTranslucentBg: boolean;
  setShowDropIntentTranslucentBg: React.Dispatch<React.SetStateAction<boolean>>;
  showDropIntentDebug: boolean;
  setShowDropIntentDebug: React.Dispatch<React.SetStateAction<boolean>>;
  showPaneHitZones: boolean;
  setShowPaneHitZones: React.Dispatch<React.SetStateAction<boolean>>;
  paneHitZonesAlphaPercent: number;
  setPaneHitZonesAlphaPercent: React.Dispatch<React.SetStateAction<number>>;
  showLiveStatus: boolean;
  setShowLiveStatus: React.Dispatch<React.SetStateAction<boolean>>;
  liveStatusSticky: boolean;
  setLiveStatusSticky: React.Dispatch<React.SetStateAction<boolean>>;
  previewOverlaysEnabled: boolean;
  setPreviewOverlaysEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  previewOverlaysSticky: boolean;
  setPreviewOverlaysSticky: React.Dispatch<React.SetStateAction<boolean>>;
  subjectColorsEnabled: boolean;
  setSubjectColorsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  subjectColorsSticky: boolean;
  setSubjectColorsSticky: React.Dispatch<React.SetStateAction<boolean>>;
  dropIntentDebugEnabled: boolean;
  setDropIntentDebugEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  dropIntentDebugSticky: boolean;
  setDropIntentDebugSticky: React.Dispatch<React.SetStateAction<boolean>>;
  hitZoneOverlaysEnabled: boolean;
  setHitZoneOverlaysEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  hitZoneOverlaysSticky: boolean;
  setHitZoneOverlaysSticky: React.Dispatch<React.SetStateAction<boolean>>;
  hitZoneGeometryEnabled: boolean;
  setHitZoneGeometryEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  hitZoneGeometrySticky: boolean;
  setHitZoneGeometrySticky: React.Dispatch<React.SetStateAction<boolean>>;
  animationControlsEnabled: boolean;
  setAnimationControlsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  animationControlsSticky: boolean;
  setAnimationControlsSticky: React.Dispatch<React.SetStateAction<boolean>>;
  liveDropIntent: TilingDropIntentDebugState | null;
  liveHitLog: TilingLiveHitLogState | null;
  observabilityLedgerEntries: ReadonlyArray<TilingObservabilityLedgerEntry>;
  splitCount: number;
  leafIds: ReadonlyArray<string>;
  tileOrder: ReadonlyArray<string>;
  splitNodes: ReadonlyArray<TilingSplitNode>;
  setFocusedLeafId: React.Dispatch<React.SetStateAction<string | null>>;
  runDirectionalFocus: (direction: TilingFocusDirection) => void;
  interactionCapabilities: ResolvedTilingInteractionCapabilities;
  setInteractionCapabilities: React.Dispatch<React.SetStateAction<ResolvedTilingInteractionCapabilities>>;
}

interface ResizeCapabilityOption {
  value: TilingResizeCapability;
  label: string;
  title: string;
}

/**
 * Segmented-control options for divider resize. The label uses the operator's
 * shorthand ("entire | hor | ver | none"); the value uses the precise domain
 * token (`both | horizontal | vertical | none`) per the documented axis
 * convention (horizontal = width dividers, vertical = height dividers).
 */
const RESIZE_CAPABILITY_OPTIONS: ReadonlyArray<ResizeCapabilityOption> = [
  { value: "both", label: "entire", title: "Resize every divider (width + height)" },
  { value: "horizontal", label: "hor", title: "Resize only width dividers (side-by-side panes, x-axis)" },
  { value: "vertical", label: "ver", title: "Resize only height dividers (stacked panes, y-axis)" },
  { value: "none", label: "none", title: "Disable all divider resizing" },
];

interface DragModeOption {
  value: TilingDragMode;
  label: string;
  title: string;
}

/**
 * Segmented-control options for the drag-to-rearrange feedback mode. "preview"
 * paints the non-committing projected landing overlays over the unchanged tree;
 * "live" detaches the dragged source on pickup (Hyprland-style), reflows the
 * remaining tree once to close the gap, follows the cursor with a ghost, and
 * commits once on release. "projected" is the rendering technique for the
 * preview overlays — it is NOT a mode value here.
 */
const DRAG_MODE_OPTIONS: ReadonlyArray<DragModeOption> = [
  { value: "live", label: "live", title: "Hyprland-style detach: source leaf is detached on pickup, the remaining tree reflows once to close the gap, a ghost follows the cursor, and the drop commits once on release (reverts on cancel/Escape)" },
  { value: "preview", label: "preview", title: "Non-committing preview via translucent projected landing overlays (S' / T' / successor); layout tree untouched until drop" },
];

interface SlotCommitmentOption {
  value: TilingSlotCommitmentMode;
  label: string;
  title: string;
}

/**
 * Segmented-control options for the live-drag slot re-resolution policy after
 * the single ghost hops INTO and FILLS a slot. "delta-responsive" (default)
 * re-aims once the cursor travels past the delta threshold; "zone-exit-hold"
 * pins the seated slot until the cursor leaves the seated pane (sticky).
 */
const SLOT_COMMITMENT_OPTIONS: ReadonlyArray<SlotCommitmentOption> = [
  { value: "delta-responsive", label: "delta", title: "Delta-responsive (default): after the ghost hops into a slot, it re-evaluates the target eagerly once the cursor travels beyond the re-aim delta (24px) from the seat anchor — re-aim without fully exiting the pane" },
  { value: "zone-exit-hold", label: "hold", title: "Zone-exit hold (anchored / sticky): after the ghost hops into a slot it stays pinned through small cursor movements; the target re-resolves only when the cursor crosses OUT of the seated pane's hit zone" },
];

interface LiveStatusVisibilityOption {
  value: boolean;
  label: string;
  title: string;
}

/**
 * Head-of-pane segmented control governing the LIVE STATUS readout. The panel
 * keeps LIVE STATUS hidden by default ("off") so the readout is opt-in rather
 * than always-pinned; "on" reveals the mode / drag mode / ghost / source /
 * target / intent / validity / telemetry / blocked-reason section below.
 */
const LIVE_STATUS_VISIBILITY_OPTIONS: ReadonlyArray<LiveStatusVisibilityOption> = [
  { value: false, label: "off", title: "Hide the live status readout (default)" },
  { value: true, label: "on", title: "Show the live status readout (mode / drag mode / ghost / source / target / intent / validity / telemetry / blocked reason)" },
];

function keyChordModifierPrefix(modifiers: ResolvedTilingKeyChordModifiers): string {
  const parts: ReadonlyArray<string> = [
    modifiers.ctrl ? "Ctrl" : null,
    modifiers.alt ? "Alt" : null,
    modifiers.shift ? "Shift" : null,
    modifiers.meta ? "Meta" : null,
  ].filter((part: string | null): part is string => part != null);
  return parts.join("+");
}

function formatKeyModifiersLabel(modifiers: ResolvedTilingKeyChordModifiers): string {
  const prefix: string = keyChordModifierPrefix(modifiers);
  return prefix.length === 0 ? "(none)" : prefix;
}

/**
 * Map a physical `KeyboardEvent.code` to a human-readable key label for the
 * read-only keymap display (the chord now matches on `code`, not the produced
 * character). Unknown codes pass through verbatim.
 */
function formatKeyCodeLabel(code: string): string {
  if (code === "BracketLeft") {
    return "[";
  }
  if (code === "BracketRight") {
    return "]";
  }
  if (code === "Escape") {
    return "Esc";
  }
  const digitMatch: RegExpExecArray | null = /^Digit([0-9])$/.exec(code);
  if (digitMatch != null) {
    return digitMatch[1];
  }
  return code;
}

function formatKeyChordLabel(chord: ResolvedTilingKeyChord): string {
  const prefix: string = keyChordModifierPrefix(chord);
  const keyLabel: string = formatKeyCodeLabel(chord.code);
  return prefix.length === 0 ? keyLabel : `${prefix}+${keyLabel}`;
}

function axisPathLabel(axisPath: ReadonlyArray<TilingSplitAxis>): string {
  if (axisPath.length === 0) {
    return "none";
  }
  return axisPath.join(" -> ");
}

function normalizeReasonToken(reason: string | null | undefined): string {
  if (reason == null || reason.trim().length === 0) {
    return "none";
  }
  if (reason === "none") {
    return "none";
  }
  return reason.replace(/[-_]+/g, " ").toLowerCase();
}

function normalizeReasonList(reasons: ReadonlyArray<string>): string {
  if (reasons.length === 0) {
    return "none";
  }
  return reasons.map((reason: string): string => normalizeReasonToken(reason)).join(" | ");
}

type TilingIntentToken = "swap" | "left" | "right" | "top" | "bottom" | "split" | "none" | "blocked";

function readIntentToken(input: {
  action: TilingDropAction;
  edgeLabel: string;
  blockedReasonLabel: string;
  validityLabel: string;
}): TilingIntentToken {
  const isBlocked: boolean = input.validityLabel === "blocked" || (input.action === "none" && input.blockedReasonLabel !== "none");
  if (isBlocked) {
    return "blocked";
  }
  if (input.action === "swap") {
    return "swap";
  }
  if (input.action === "edge-insert") {
    if (input.edgeLabel === "left") {
      return "left";
    }
    if (input.edgeLabel === "right") {
      return "right";
    }
    if (input.edgeLabel === "top") {
      return "top";
    }
    if (input.edgeLabel === "bottom") {
      return "bottom";
    }
    return "split";
  }
  if (input.action === "split-container-insert") {
    return "split";
  }
  return "none";
}

function readIntentBadgeClass(intentToken: TilingIntentToken): string {
  if (intentToken === "blocked") {
    return "bg-rose-500";
  }
  if (intentToken === "swap") {
    return "bg-emerald-500";
  }
  if (intentToken === "left") {
    return "bg-sky-500";
  }
  if (intentToken === "right") {
    return "bg-violet-500";
  }
  if (intentToken === "top") {
    return "bg-amber-500";
  }
  if (intentToken === "bottom") {
    return "bg-teal-500";
  }
  if (intentToken === "split") {
    return "bg-cyan-500";
  }
  return "bg-slate-500";
}

interface GroupToggleOption {
  value: boolean;
  label: string;
}

/**
 * Master on/off values for a control group header. "off" collapses the group
 * body (the controls are fully unrendered, not visually pinned) AND gates the
 * group's whole render effect off at the renderer call-site — the per-control
 * states underneath are preserved for when the group is re-enabled. "on"
 * expands the body and lets the group's effect render.
 */
const GROUP_TOGGLE_OPTIONS: ReadonlyArray<GroupToggleOption> = [
  { value: false, label: "off" },
  { value: true, label: "on" },
];

interface SegmentedToggleProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  ariaLabel: string;
  offTitle: string;
  onTitle: string;
}

/**
 * Two-button segmented off/on control matching the LIVE STATUS head-of-pane
 * segmented control. Used as the master on/off for a group header and for the
 * LIVE STATUS visibility control.
 */
function SegmentedToggle(props: SegmentedToggleProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-1" role="group" aria-label={props.ariaLabel}>
      {GROUP_TOGGLE_OPTIONS.map((option: GroupToggleOption): React.ReactElement => {
        const isActive: boolean = props.enabled === option.value;
        return (
          <button
            key={`${props.ariaLabel}-${option.label}`}
            type="button"
            aria-pressed={isActive}
            title={option.value ? props.onTitle : props.offTitle}
            onClick={(): void => props.onEnabledChange(option.value)}
            className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/55 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 motion-reduce:transition-none ${
              isActive
                ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                : "border-white/10 bg-slate-950 text-slate-400 hover:border-white/25"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface StickyPinToggleProps {
  sticky: boolean;
  onStickyChange: (sticky: boolean) => void;
  ariaLabel: string;
}

/**
 * Per-group "pin" toggle (sticky). Default OFF: the group scrolls normally in
 * the control list. ON: the group is hoisted into the pinned region above the
 * scroll area so it stays visible while the rest of the list scrolls. Sticky is
 * independent of the master on/off — a pinned group can still be collapsed.
 */
function StickyPinToggle(props: StickyPinToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={props.sticky}
      aria-label={props.ariaLabel}
      title="Pin this section above the scroll area so it stays visible (sticky). Off by default; toggles independently of on/off."
      onClick={(): void => props.onStickyChange(!props.sticky)}
      className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/55 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 motion-reduce:transition-none ${
        props.sticky
          ? "border-amber-300/70 bg-amber-500/20 text-amber-100"
          : "border-white/10 bg-slate-950 text-slate-400 hover:border-white/25"
      }`}
    >
      pin
    </button>
  );
}

interface GroupToggleHeaderProps {
  label: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  sticky: boolean;
  onStickyChange: (sticky: boolean) => void;
  ariaLabel: string;
  offTitle: string;
  onTitle: string;
}

/**
 * Flat caps-header row for a control group: the group label plus two
 * independent controls — a "pin" (sticky) toggle and a segmented on/off
 * (master) toggle. There is no hierarchy: every group owns its own pair of
 * controls; no parent/meta toggle governs multiple groups.
 */
function GroupToggleHeader(props: GroupToggleHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.13em] text-slate-500">
        {props.label}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <StickyPinToggle
          sticky={props.sticky}
          onStickyChange={props.onStickyChange}
          ariaLabel={`${props.ariaLabel} sticky`}
        />
        <SegmentedToggle
          enabled={props.enabled}
          onEnabledChange={props.onEnabledChange}
          ariaLabel={props.ariaLabel}
          offTitle={props.offTitle}
          onTitle={props.onTitle}
        />
      </div>
    </div>
  );
}

/**
 * Scoped CSS for the styled range sliders. The track / filled portion / thumb
 * pseudo-elements (`::-webkit-slider-runnable-track`, `::-webkit-slider-thumb`,
 * `::-moz-range-track`, `::-moz-range-progress`, `::-moz-range-thumb`) cannot be
 * reached by Tailwind utilities, so they live in a single co-located style block
 * scoped under `.hypr-range-scope`. WebKit paints the filled portion via a track
 * gradient driven by the `--hypr-range-fill` custom property (set per-slider in
 * `RangeSlider`); Firefox paints it natively through `::-moz-range-progress`.
 * Thumb hover/active scale + focus-visible ring match the cyan accent; all
 * transitions are disabled under `prefers-reduced-motion: reduce`.
 */
const RANGE_SLIDER_STYLE: string = `
.hypr-range-scope input[type="range"].hypr-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 16px;
  background: transparent;
  cursor: pointer;
}
.hypr-range-scope input[type="range"].hypr-range:focus {
  outline: none;
}
.hypr-range-scope input[type="range"].hypr-range::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(
    to right,
    rgba(34, 211, 238, 0.9) 0%,
    rgba(34, 211, 238, 0.9) var(--hypr-range-fill, 0%),
    rgba(148, 163, 184, 0.22) var(--hypr-range-fill, 0%),
    rgba(148, 163, 184, 0.22) 100%
  );
}
.hypr-range-scope input[type="range"].hypr-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  margin-top: -7px;
  height: 16px;
  width: 16px;
  border-radius: 9999px;
  background: #cffafe;
  border: 2px solid rgba(34, 211, 238, 0.95);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45), 0 1px 3px rgba(0, 0, 0, 0.55);
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.hypr-range-scope input[type="range"].hypr-range:hover::-webkit-slider-thumb {
  transform: scale(1.15);
}
.hypr-range-scope input[type="range"].hypr-range:active::-webkit-slider-thumb {
  transform: scale(1.25);
  background: #ffffff;
}
.hypr-range-scope input[type="range"].hypr-range:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.45);
}
.hypr-range-scope input[type="range"].hypr-range::-moz-range-track {
  height: 6px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(148, 163, 184, 0.22);
}
.hypr-range-scope input[type="range"].hypr-range::-moz-range-progress {
  height: 6px;
  border-radius: 9999px;
  background: rgba(34, 211, 238, 0.9);
}
.hypr-range-scope input[type="range"].hypr-range::-moz-range-thumb {
  height: 16px;
  width: 16px;
  border-radius: 9999px;
  background: #cffafe;
  border: 2px solid rgba(34, 211, 238, 0.95);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.hypr-range-scope input[type="range"].hypr-range:hover::-moz-range-thumb {
  transform: scale(1.15);
}
.hypr-range-scope input[type="range"].hypr-range:active::-moz-range-thumb {
  transform: scale(1.25);
  background: #ffffff;
}
.hypr-range-scope input[type="range"].hypr-range:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.45);
}
.hypr-range-scope input[type="range"].hypr-range:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.hypr-range-scope input[type="range"].hypr-range:disabled::-webkit-slider-thumb {
  transform: none;
}
.hypr-range-scope input[type="range"].hypr-range:disabled::-moz-range-thumb {
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  .hypr-range-scope input[type="range"].hypr-range::-webkit-slider-thumb,
  .hypr-range-scope input[type="range"].hypr-range::-moz-range-thumb {
    transition: none;
  }
}
`;

interface StyledCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}

const STYLED_CHECKBOX_STYLE_HREF: string = "hypr-tiling-styled-checkbox";

// ---------------------------------------------------------------------------
// Styled-checkbox stylesheet — self-contained scoped raw CSS.
//
// WHY raw CSS and not Tailwind `checked:` utilities (this bug recurred twice
// with the utility approach):
//   1. Content-glob fragility. These `checked:`/`peer-checked:` utilities only
//      exist in the host app's compiled CSS while this package sits in
//      `apps/web/tailwind.config.ts`'s `content` glob — an entry that has been
//      added and removed repeatedly across workers. When absent, the
//      checked-state rules are never generated and the control silently loses
//      its checked appearance. Scoped raw CSS is independent of Tailwind's
//      content scan.
//   2. Global `!important` focus resets win the cascade. The host's
//      `apps/web/app/globals.css` carries, in `@layer base`,
//      `*:focus-visible { outline: none !important }` and
//      `input:focus { outline: none !important; box-shadow: none !important }`.
//      The moment a checkbox is clicked it is focused, so any
//      `checked:shadow-[…]` ring channel and any focus ring are stripped by
//      `!important` — channels a plain utility (no `!important`) cannot win.
//
// The control distinguishes checked from unchecked on FOUR redundant channels
// so a single failing channel can never make the two states identical:
//   - fill          : hollow `slate-950` box (off) → solid `cyan-400` box (on)
//   - border        : `white/25` hairline (off) → bright `cyan-300` (on)
//   - checkmark glyph: hidden (off) → dark tick painted on the cyan fill (on)
//   - inset shadow  : recessed well (off) → flat accent surface (on)
//
// Cascade math: the load-bearing selector `.hpt-checkbox:checked`
// (specificity 0,2,0 — one class + one pseudo-class) beats every global input
// reset in the host (all are 0,1,1 or lower and none mark fill/border
// `!important`), so the checked fill/border ALWAYS win. The checkmark uses the
// sibling combinator `.hpt-checkbox:checked ~ .hpt-checkbox-tick` (also 0,2,0).
// The ONLY channel a global `!important` can still touch is the focus ring, so
// the focus-visible ring is the single declaration that uses `!important` —
// `!important` is required here because specificity alone cannot defeat an
// `!important` declaration; everywhere else specificity suffices.
const CHECKBOX_STYLE: string = `
.hpt-checkbox-box {
  position: relative;
  display: inline-flex;
  height: 16px;
  width: 16px;
  flex: none;
  align-items: center;
  justify-content: center;
}
.hpt-checkbox {
  position: absolute;
  inset: 0;
  margin: 0;
  height: 100%;
  width: 100%;
  cursor: pointer;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  border-radius: 4px;
  border: 1px solid rgb(255 255 255 / 0.25);
  background-color: rgb(2 6 23);
  box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.45);
  color-scheme: dark;
  transition: background-color 150ms, border-color 150ms, box-shadow 150ms;
}
.hpt-checkbox:hover {
  border-color: rgb(103 232 249 / 0.6);
}
.hpt-checkbox:checked {
  background-color: rgb(34 211 238);
  border-color: rgb(103 232 249);
  box-shadow: 0 0 0 1px rgb(34 211 238 / 0.45);
}
.hpt-checkbox:focus-visible {
  box-shadow: 0 0 0 2px rgb(34 211 238 / 0.65) !important;
}
.hpt-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.hpt-checkbox-tick {
  position: relative;
  height: 14px;
  width: 14px;
  color: rgb(2 6 23);
  pointer-events: none;
  opacity: 0;
  transform: scale(0.5);
  transition: opacity 150ms, transform 150ms;
}
.hpt-checkbox:checked ~ .hpt-checkbox-tick {
  opacity: 1;
  transform: scale(1);
}
@media (prefers-reduced-motion: reduce) {
  .hpt-checkbox,
  .hpt-checkbox-tick {
    transition: none;
  }
}
`;

/**
 * Styled checkbox sharing the panel's cyan accent, implemented as self-contained
 * scoped raw CSS (`.hpt-checkbox*`). The native `<input type="checkbox">` keeps
 * its semantics, keyboard operability and focus handling; `appearance: none`
 * removes the default glyph (not the control) and the sibling SVG tick reveals
 * on `:checked`. Checked vs unchecked differs on four redundant channels (fill,
 * border, checkmark, inset shadow) so the states can never collapse to identical.
 * The co-located `<style>` is hoisted+deduped by React 19 via `href`+`precedence`,
 * so it lands once in the document head regardless of how many checkboxes mount.
 * Drop-in replacement for a bare `<input type="checkbox">` inside an existing
 * `<label>` (the label text follows as a sibling). See `CHECKBOX_STYLE` for the
 * cascade rationale (why utilities recurred-broke and why scoped CSS wins).
 */
function StyledCheckbox(props: StyledCheckboxProps): React.ReactElement {
  return (
    <span className="hpt-checkbox-box">
      <style href={STYLED_CHECKBOX_STYLE_HREF} precedence="default">
        {CHECKBOX_STYLE}
      </style>
      <input
        type="checkbox"
        className="hpt-checkbox"
        checked={props.checked}
        disabled={props.disabled}
        title={props.title}
        aria-label={props.ariaLabel}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => props.onChange(event.target.checked)}
      />
      <svg className="hpt-checkbox-tick" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3.5 8.5l3 3 6-7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

interface RangeFillStyle extends React.CSSProperties {
  "--hypr-range-fill": string;
}

interface RangeSliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}

/**
 * Styled range slider used for every numeric knob in the control pane. The
 * filled-portion percentage is derived from `min` / `max` / `value` and exposed
 * to the scoped CSS (see `RANGE_SLIDER_STYLE`) via the `--hypr-range-fill`
 * custom property so WebKit paints the track gradient correctly (Firefox uses
 * its native `::-moz-range-progress`). Callers keep any domain transform at the
 * call-site (e.g. percent <-> ratio) and receive the raw numeric value.
 */
function RangeSlider(props: RangeSliderProps): React.ReactElement {
  const span: number = props.max - props.min;
  const ratio: number = span <= 0 ? 0 : (props.value - props.min) / span;
  const clamped: number = Math.min(1, Math.max(0, ratio));
  const fillStyle: RangeFillStyle = { "--hypr-range-fill": `${clamped * 100}%` };
  return (
    <input
      type="range"
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      disabled={props.disabled}
      title={props.title}
      aria-label={props.ariaLabel}
      style={fillStyle}
      onChange={(event: React.ChangeEvent<HTMLInputElement>): void => props.onChange(Number(event.target.value))}
      className="hypr-range w-full"
    />
  );
}

interface SubjectColorRowProps {
  label: string;
  enabled: boolean;
  color: string;
  onEnabledChange: (enabled: boolean) => void;
  onColorChange: (color: string) => void;
}

function SubjectColorRow(props: SubjectColorRowProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <StyledCheckbox
          checked={props.enabled}
          onChange={props.onEnabledChange}
          title={`Enable ${props.label} overlay`}
        />
        <span className="truncate">{props.label}</span>
      </label>
      <input
        type="color"
        value={props.color}
        disabled={!props.enabled}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          props.onColorChange(event.target.value)}
        className="h-7 w-12 shrink-0 rounded border border-white/15 bg-slate-950 disabled:opacity-40"
      />
    </div>
  );
}

function hasEnabledProjectedFill(enables: TilingObservabilityColorEnableConfig): boolean {
  return enables.projectedSourceFillEnabled
    || enables.projectedTargetFillEnabled
    || enables.projectedSuccessorFillEnabled;
}

export function TilingObservabilityPanel(props: TilingObservabilityPanelProps): React.ReactElement {
  const isLiveDragModeActive: boolean = props.interactionCapabilities.dragMode === "live";
  const isDraggingActive: boolean =
    props.liveHitLog?.isDragging === true || props.liveDropIntent != null;
  const isHoveringActive: boolean = props.liveHitLog != null && !isDraggingActive;
  const isLiveStatusIdle: boolean = !isDraggingActive && !isHoveringActive;

  const liveModeLabel: string = isLiveStatusIdle
    ? "idle"
    : isDraggingActive
      ? "dragging"
      : "hovering";
  const liveGhostLabel: string = !isLiveDragModeActive
    ? "n/a (preview)"
    : isDraggingActive && props.liveHitLog?.dragSourceLeafId != null
      ? `detached ${props.liveHitLog.dragSourceLeafId}`
      : "idle";
  const liveSourceLabel: string = isLiveStatusIdle
    ? "none"
    : isDraggingActive
      ? props.liveHitLog?.sourceLeafId ?? "none"
      : props.liveHitLog?.sourceLeafId ?? "none";
  const liveTargetLabel: string = isLiveStatusIdle
    ? "none"
    : isDraggingActive
      ? props.liveDropIntent?.leafId ?? props.liveHitLog?.hoveredLeafId ?? "none"
      : props.liveHitLog?.hoveredLeafId ?? "none";
  const liveIntentAction: TilingDropAction = isLiveStatusIdle
    ? "none"
    : props.liveDropIntent?.action ?? props.liveHitLog?.intent?.action ?? "none";
  const liveIntentEdgeLabel: string = isLiveStatusIdle
    ? "none"
    : props.liveDropIntent?.finalEdge
      ?? props.liveDropIntent?.selectedSplitZone
      ?? props.liveHitLog?.intent?.finalEdge
      ?? props.liveHitLog?.intent?.selectedSplitZone
      ?? "none";
  const liveValidityLabel: string = isLiveStatusIdle
    ? "none"
    : props.liveHitLog?.centerIsValid == null
      ? (liveIntentAction === "none" ? "none" : "unknown")
      : props.liveHitLog.centerIsValid
        ? "valid"
        : "blocked";
  const liveBlockedReasonLabel: string = isLiveStatusIdle
    ? "none"
    : props.liveHitLog?.centerBlockedReason
      ?? props.liveDropIntent?.blockedReason
      ?? props.liveHitLog?.intent?.blockedReason
      ?? "none";
  const liveIntentToken: TilingIntentToken = readIntentToken({
    action: liveIntentAction,
    edgeLabel: liveIntentEdgeLabel,
    blockedReasonLabel: liveBlockedReasonLabel,
    validityLabel: liveValidityLabel,
  });
  const liveIntentBadgeClass: string = readIntentBadgeClass(liveIntentToken);
  const liveCursorXLabel: string = props.liveHitLog == null ? "none" : props.liveHitLog.cursorViewport.x.toFixed(1);
  const liveCursorYLabel: string = props.liveHitLog == null ? "none" : props.liveHitLog.cursorViewport.y.toFixed(1);
  const sourcePaneFootprint: TilingPaneFootprint | null = props.liveHitLog?.sourcePaneFootprint ?? null;
  const liveSourceXLabel: string = sourcePaneFootprint == null ? "none" : sourcePaneFootprint.left.toFixed(1);
  const liveSourceYLabel: string = sourcePaneFootprint == null ? "none" : sourcePaneFootprint.top.toFixed(1);
  const liveSourceXPlusWLabel: string = sourcePaneFootprint == null
    ? "none"
    : (sourcePaneFootprint.left + sourcePaneFootprint.width).toFixed(1);
  const liveSourceYPlusHLabel: string = sourcePaneFootprint == null
    ? "none"
    : (sourcePaneFootprint.top + sourcePaneFootprint.height).toFixed(1);
  const updateObservabilityColor = React.useCallback(
    (field: keyof TilingObservabilityColorConfig, value: string): void => {
      props.setObservabilityColors((previous: TilingObservabilityColorConfig): TilingObservabilityColorConfig => ({
        ...previous,
        [field]: value,
      }));
    },
    [props],
  );
  const updateObservabilityColorEnable = React.useCallback(
    (field: keyof TilingObservabilityColorEnableConfig, value: boolean): void => {
      props.setObservabilityColorEnables(
        (previous: TilingObservabilityColorEnableConfig): TilingObservabilityColorEnableConfig => ({
          ...previous,
          [field]: value,
        }),
      );
    },
    [props],
  );
  const projectedFillAlphaEnabled: boolean = hasEnabledProjectedFill(props.observabilityColorEnables);
  const prefersReducedMotion: boolean = usePrefersReducedMotion();
  const resolvedGhostTransitDurationMs: number = resolveDragAnimationDurationMs(props.ghostTransitSpeedPercent);
  const resolvedSurvivorReflowDurationMs: number = resolveDragAnimationDurationMs(props.survivorReflowSpeedPercent);

  const liveStatusReadout: React.ReactElement = (
    <section className="shrink-0 min-w-0 max-w-full overflow-hidden rounded border border-cyan-300/40 bg-slate-900/90 p-1.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-cyan-200">
        live status
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.12em]">
        <div className="text-slate-500">mode</div>
        <div className="text-slate-200">{liveModeLabel}</div>
        <div className="text-slate-500" title="Drag feedback mode: preview (projected S'/T'/successor overlays) vs live (Hyprland detach: source detached on pickup, ghost follows cursor, commit on release)">drag mode</div>
        <div className={isLiveDragModeActive ? "text-cyan-200" : "text-slate-200"}>
          {props.interactionCapabilities.dragMode}
        </div>
        <div className="text-slate-500" title="Live (Hyprland) ghost: the dragged source detached from the frozen tree and following the cursor">ghost</div>
        <div
          className={isLiveDragModeActive && isDraggingActive && props.liveHitLog?.dragSourceLeafId != null ? "text-cyan-200" : "text-slate-200"}
          title="Live (Hyprland) ghost: the dragged source detached from the frozen tree and following the cursor"
        >
          {liveGhostLabel}
        </div>
        <div className="text-slate-500" title="Pane currently under the cursor">source</div>
        <div className="text-slate-200" title="Pane currently under the cursor">{liveSourceLabel}</div>
        <div className="text-slate-500" title="Drop resolver hover target">target</div>
        <div className="text-slate-200" title="Drop resolver hover target">{liveTargetLabel}</div>
        <div className="text-slate-500">intent</div>
        <div
          className="min-w-0 max-w-full overflow-hidden"
          style={{
            height: CONTROL_PANE_INTENT_BADGE_RESERVED_HEIGHT_PX,
            minHeight: CONTROL_PANE_INTENT_BADGE_RESERVED_HEIGHT_PX,
            maxHeight: CONTROL_PANE_INTENT_BADGE_RESERVED_HEIGHT_PX,
            lineHeight: CONTROL_PANE_STATUS_LINE_HEIGHT_PX / 16,
          }}
        >
          <span
            className={`${CONTROL_PANE_STATUS_BADGE_WIDTH_CLASS} ${liveIntentBadgeClass} inline-flex max-w-full items-center justify-center rounded px-2 py-0.5 font-semibold uppercase tracking-[0.12em] text-white whitespace-nowrap`}
          >
            {liveIntentToken}
          </span>
        </div>
        <div className="text-slate-500">validity</div>
        <div className={liveValidityLabel === "blocked" ? "text-rose-200" : "text-emerald-200"}>{liveValidityLabel}</div>
      </div>
      <div className="mt-1.5 min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/70 px-1.5 py-0.5 text-slate-200">
        <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.11em] text-slate-500">telemetry</div>
        <div
          className="grid w-full min-w-0 max-w-full gap-1"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
          }}
        >
          <div className="min-w-0 w-full rounded border border-white/10 bg-slate-900/80 px-1.5 py-0.5">
            <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-slate-500">cursor</div>
            <div className="mt-0.5 space-y-0.5">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="shrink-0 text-slate-500">x</span>
                <span className="min-w-0 overflow-x-auto whitespace-nowrap text-right text-[10px] tabular-nums">{liveCursorXLabel}</span>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="shrink-0 text-slate-500">y</span>
                <span className="min-w-0 overflow-x-auto whitespace-nowrap text-right text-[10px] tabular-nums">{liveCursorYLabel}</span>
              </div>
            </div>
          </div>
          <div className="min-w-0 w-full rounded border border-white/10 bg-slate-900/80 px-1.5 py-0.5">
            <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-slate-500">source pane</div>
            <div className="mt-0.5 space-y-0.5">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="shrink-0 text-slate-500">x</span>
                <span className="min-w-0 overflow-x-auto whitespace-nowrap text-right text-[10px] tabular-nums">{liveSourceXLabel}</span>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="shrink-0 text-slate-500">y</span>
                <span className="min-w-0 overflow-x-auto whitespace-nowrap text-right text-[10px] tabular-nums">{liveSourceYLabel}</span>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="shrink-0 text-slate-500">x+w</span>
                <span className="min-w-0 overflow-x-auto whitespace-nowrap text-right text-[10px] tabular-nums">{liveSourceXPlusWLabel}</span>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="shrink-0 text-slate-500">y+h</span>
                <span className="min-w-0 overflow-x-auto whitespace-nowrap text-right text-[10px] tabular-nums">{liveSourceYPlusHLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        className="mt-1.5 min-w-0 max-w-full rounded border border-white/10 bg-slate-950/70 px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-slate-300"
        style={{
          height: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
          minHeight: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
          maxHeight: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
          lineHeight: CONTROL_PANE_STATUS_LINE_HEIGHT_PX / 16,
        }}
      >
        <div className="text-slate-500 uppercase">blocked reason:</div>
        <div className="mt-0.5 overflow-x-auto whitespace-nowrap normal-case">
          {normalizeReasonToken(liveBlockedReasonLabel)}
        </div>
      </div>
    </section>
  );

  const previewOverlaysGroup: React.ReactElement = (
    <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
      <GroupToggleHeader
        label="preview overlays"
        enabled={props.previewOverlaysEnabled}
        onEnabledChange={props.setPreviewOverlaysEnabled}
        sticky={props.previewOverlaysSticky}
        onStickyChange={props.setPreviewOverlaysSticky}
        ariaLabel="preview overlays group"
        offTitle="Disable the projected overlay layers (S' / T' / successor landing geometry) and collapse the controls. Per-control states are preserved for re-enabling. Debugging aid: off by default."
        onTitle="Enable the projected overlay layers and expand the controls (projected geometry layers + shared fill alpha)."
      />
      {props.previewOverlaysEnabled ? (
        <div className="mt-2">
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300" title="Show projected geometry overlays from reducer projection">
            <StyledCheckbox
              checked={props.showDropPreviewOverlays}
              onChange={props.setShowDropPreviewOverlays}
            />
            show projected overlay layers
          </label>
          <div className="mt-2 min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/70 p-2">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              projected overlay fill alpha (shared): {projectedFillAlphaEnabled ? `${props.projectedOverlayBgAlphaPercent}%` : "off (no fill enabled)"}
            </label>
            <RangeSlider
              min={0}
              max={100}
              step={1}
              disabled={!projectedFillAlphaEnabled}
              value={props.projectedOverlayBgAlphaPercent}
              onChange={props.setProjectedOverlayBgAlphaPercent}
              title="Shared fill transparency for enabled projected source/target/successor fills"
            />
          </div>
        </div>
      ) : null}
    </div>
  );

  const subjectColorsGroup: React.ReactElement = (
    <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
      <GroupToggleHeader
        label="subject colors"
        enabled={props.subjectColorsEnabled}
        onEnabledChange={props.setSubjectColorsEnabled}
        sticky={props.subjectColorsSticky}
        onStickyChange={props.setSubjectColorsSticky}
        ariaLabel="subject colors group"
        offTitle="Disable all subject-color overlays (drag source/target borders and projected source/target/successor borders & fills) and collapse the controls. Per-color states are preserved for re-enabling. Debugging aid: off by default."
        onTitle="Enable the subject-color overlays and expand the per-subject color/enable rows."
      />
      {props.subjectColorsEnabled ? (
        <div className="mt-2 space-y-2">
          <SubjectColorRow
            label="drag source border"
            enabled={props.observabilityColorEnables.dragSourceBorderEnabled}
            color={props.observabilityColors.dragSourceBorderColorHex}
            onEnabledChange={(enabled: boolean): void =>
              updateObservabilityColorEnable("dragSourceBorderEnabled", enabled)}
            onColorChange={(color: string): void =>
              updateObservabilityColor("dragSourceBorderColorHex", color)}
          />
          <SubjectColorRow
            label="drag target border"
            enabled={props.observabilityColorEnables.dragTargetBorderEnabled}
            color={props.observabilityColors.dragTargetBorderColorHex}
            onEnabledChange={(enabled: boolean): void =>
              updateObservabilityColorEnable("dragTargetBorderEnabled", enabled)}
            onColorChange={(color: string): void =>
              updateObservabilityColor("dragTargetBorderColorHex", color)}
          />
          <SubjectColorRow
            label="projected source border"
            enabled={props.observabilityColorEnables.projectedSourceBorderEnabled}
            color={props.observabilityColors.projectedSourceBorderColorHex}
            onEnabledChange={(enabled: boolean): void =>
              updateObservabilityColorEnable("projectedSourceBorderEnabled", enabled)}
            onColorChange={(color: string): void =>
              updateObservabilityColor("projectedSourceBorderColorHex", color)}
          />
          <SubjectColorRow
            label="projected target border"
            enabled={props.observabilityColorEnables.projectedTargetBorderEnabled}
            color={props.observabilityColors.projectedTargetBorderColorHex}
            onEnabledChange={(enabled: boolean): void =>
              updateObservabilityColorEnable("projectedTargetBorderEnabled", enabled)}
            onColorChange={(color: string): void =>
              updateObservabilityColor("projectedTargetBorderColorHex", color)}
          />
          <SubjectColorRow
            label="projected source fill"
            enabled={props.observabilityColorEnables.projectedSourceFillEnabled}
            color={props.observabilityColors.projectedSourceFillColorHex}
            onEnabledChange={(enabled: boolean): void =>
              updateObservabilityColorEnable("projectedSourceFillEnabled", enabled)}
            onColorChange={(color: string): void =>
              updateObservabilityColor("projectedSourceFillColorHex", color)}
          />
          <SubjectColorRow
            label="projected target fill"
            enabled={props.observabilityColorEnables.projectedTargetFillEnabled}
            color={props.observabilityColors.projectedTargetFillColorHex}
            onEnabledChange={(enabled: boolean): void =>
              updateObservabilityColorEnable("projectedTargetFillEnabled", enabled)}
            onColorChange={(color: string): void =>
              updateObservabilityColor("projectedTargetFillColorHex", color)}
          />
          <SubjectColorRow
            label="projected successor border"
            enabled={props.observabilityColorEnables.projectedSuccessorBorderEnabled}
            color={props.observabilityColors.projectedSuccessorBorderColorHex}
            onEnabledChange={(enabled: boolean): void =>
              updateObservabilityColorEnable("projectedSuccessorBorderEnabled", enabled)}
            onColorChange={(color: string): void =>
              updateObservabilityColor("projectedSuccessorBorderColorHex", color)}
          />
          <SubjectColorRow
            label="projected successor fill"
            enabled={props.observabilityColorEnables.projectedSuccessorFillEnabled}
            color={props.observabilityColors.projectedSuccessorFillColorHex}
            onEnabledChange={(enabled: boolean): void =>
              updateObservabilityColorEnable("projectedSuccessorFillEnabled", enabled)}
            onColorChange={(color: string): void =>
              updateObservabilityColor("projectedSuccessorFillColorHex", color)}
          />
        </div>
      ) : null}
    </div>
  );

  const dropIntentDebugGroup: React.ReactElement = (
    <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
      <GroupToggleHeader
        label="drop intent debug"
        enabled={props.dropIntentDebugEnabled}
        onEnabledChange={props.setDropIntentDebugEnabled}
        sticky={props.dropIntentDebugSticky}
        onStickyChange={props.setDropIntentDebugSticky}
        ariaLabel="drop intent debug group"
        offTitle="Disable the in-pane drop-intent debug visuals (directional border hints, hint background, debug labels) and collapse the controls. Per-control states are preserved for re-enabling. Debugging aid: off by default."
        onTitle="Enable the in-pane drop-intent debug visuals and expand the controls (border hints, hint background, debug labels)."
      />
      {props.dropIntentDebugEnabled ? (
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300" title="In-pane directional border hints (left/right/top/bottom/center). Requires drag target border enabled.">
            <StyledCheckbox
              checked={props.showDropBorderHints}
              onChange={props.setShowDropBorderHints}
            />
            show drop intent border hints
          </label>
          <label
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
            title="Enable translucent fill for in-pane drop intent hints only (left/right/top/bottom/center)"
          >
            <StyledCheckbox
              checked={props.showDropIntentTranslucentBg}
              onChange={props.setShowDropIntentTranslucentBg}
            />
            show drop intent hint background
          </label>
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300" title="Debug labels for drag source, drop target, and drop intent">
            <StyledCheckbox
              checked={props.showDropIntentDebug}
              onChange={props.setShowDropIntentDebug}
            />
            show drop intent debug labels
          </label>
        </div>
      ) : null}
    </div>
  );

  const hitZoneOverlaysGroup: React.ReactElement = (
    <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
      <GroupToggleHeader
        label="hit-zone overlays"
        enabled={props.hitZoneOverlaysEnabled}
        onEnabledChange={props.setHitZoneOverlaysEnabled}
        sticky={props.hitZoneOverlaysSticky}
        onStickyChange={props.setHitZoneOverlaysSticky}
        ariaLabel="hit-zone overlays group"
        offTitle="Disable the persistent pane hit-zone debug overlay (center swap / edge split zones) and collapse the controls. Per-control states (alpha, subject colors) are preserved for re-enabling. Transient geometry-adjustment previews still fire. Debugging aid: off by default."
        onTitle="Enable the persistent pane hit-zone debug overlay across every pane and expand the controls (alpha, subject colors)."
      />
      {props.hitZoneOverlaysEnabled ? (
        <div className="mt-2">
          <label
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
            title="Always show center swap and edge split hit zones for every pane"
          >
            <StyledCheckbox
              checked={props.showPaneHitZones}
              onChange={props.setShowPaneHitZones}
            />
            show pane hit zones
          </label>
          <div className="mt-2 min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/70 p-2">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              pane hit-zone alpha: {props.paneHitZonesAlphaPercent}%
            </label>
            <RangeSlider
              min={0}
              max={100}
              step={1}
              value={props.paneHitZonesAlphaPercent}
              onChange={props.setPaneHitZonesAlphaPercent}
              title="Hit-zone overlay transparency"
            />
          </div>
          <div className="mt-2 min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/70 p-2">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              hit-zone subject colors
            </div>
            <div className="space-y-2">
              <label className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">
                left edge
                <input
                  type="color"
                  value={props.observabilityColors.hitZoneLeftColorHex}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                    updateObservabilityColor("hitZoneLeftColorHex", event.target.value)}
                  className="h-7 w-12 shrink-0 rounded border border-white/15 bg-slate-950"
                />
              </label>
              <label className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">
                right edge
                <input
                  type="color"
                  value={props.observabilityColors.hitZoneRightColorHex}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                    updateObservabilityColor("hitZoneRightColorHex", event.target.value)}
                  className="h-7 w-12 shrink-0 rounded border border-white/15 bg-slate-950"
                />
              </label>
              <label className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">
                top edge
                <input
                  type="color"
                  value={props.observabilityColors.hitZoneTopColorHex}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                    updateObservabilityColor("hitZoneTopColorHex", event.target.value)}
                  className="h-7 w-12 shrink-0 rounded border border-white/15 bg-slate-950"
                />
              </label>
              <label className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">
                bottom edge
                <input
                  type="color"
                  value={props.observabilityColors.hitZoneBottomColorHex}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                    updateObservabilityColor("hitZoneBottomColorHex", event.target.value)}
                  className="h-7 w-12 shrink-0 rounded border border-white/15 bg-slate-950"
                />
              </label>
              <label className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">
                center zone
                <input
                  type="color"
                  value={props.observabilityColors.hitZoneCenterColorHex}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                    updateObservabilityColor("hitZoneCenterColorHex", event.target.value)}
                  className="h-7 w-12 shrink-0 rounded border border-white/15 bg-slate-950"
                />
              </label>
              <label className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">
                blocked zone
                <input
                  type="color"
                  value={props.observabilityColors.hitZoneBlockedColorHex}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                    updateObservabilityColor("hitZoneBlockedColorHex", event.target.value)}
                  className="h-7 w-12 shrink-0 rounded border border-white/15 bg-slate-950"
                />
              </label>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  const hitZoneGeometryGroup: React.ReactElement = (
    <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
      <GroupToggleHeader
        label="hit-zone geometry"
        enabled={props.hitZoneGeometryEnabled}
        onEnabledChange={props.setHitZoneGeometryEnabled}
        sticky={props.hitZoneGeometrySticky}
        onStickyChange={props.setHitZoneGeometrySticky}
        ariaLabel="hit-zone geometry group"
        offTitle="Collapse the drop hit-zone geometry knobs (center swap fraction, center floor, hysteresis). The current geometry values stay live and keep driving zone resolution; only the controls are hidden. Advanced tuning: off by default."
        onTitle="Expand the drop hit-zone geometry knobs (center swap fraction, center floor, hysteresis). Adjusting any knob briefly previews the resolved zones across EVERY pane."
      />
      {props.hitZoneGeometryEnabled ? (
        <div className="mt-2 space-y-2">
          <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/70 p-2">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              center swap X: {Math.round(props.interactionCapabilities.dropHitZoneGeometry.centerRatioX * 100)}% (edge band {Math.round(((1 - props.interactionCapabilities.dropHitZoneGeometry.centerRatioX) / 2) * 100)}%)
            </label>
            <RangeSlider
              min={5}
              max={95}
              step={1}
              value={Math.round(props.interactionCapabilities.dropHitZoneGeometry.centerRatioX * 100)}
              onChange={(value: number): void => props.setInteractionCapabilities(
                (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                  ...previous,
                  dropHitZoneGeometry: {
                    ...previous.dropHitZoneGeometry,
                    // X axis drives the left/right swap-zone boundary; keep the
                    // representative `centerRatio` synced to X for the telemetry readouts.
                    centerRatio: value / 100,
                    centerRatioX: value / 100,
                  },
                }),
              )}
              title="HORIZONTAL fraction of the pane spanned by the central SWAP rectangle (drives the left/right swap-zone boundary). Independent of the vertical axis so a non-square pane can carry an axis-specific swap-zone proportion."
            />
          </div>
          <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/70 p-2">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              center swap Y: {Math.round(props.interactionCapabilities.dropHitZoneGeometry.centerRatioY * 100)}% (edge band {Math.round(((1 - props.interactionCapabilities.dropHitZoneGeometry.centerRatioY) / 2) * 100)}%)
            </label>
            <RangeSlider
              min={5}
              max={95}
              step={1}
              value={Math.round(props.interactionCapabilities.dropHitZoneGeometry.centerRatioY * 100)}
              onChange={(value: number): void => props.setInteractionCapabilities(
                (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                  ...previous,
                  dropHitZoneGeometry: {
                    ...previous.dropHitZoneGeometry,
                    centerRatioY: value / 100,
                  },
                }),
              )}
              title="VERTICAL fraction of the pane spanned by the central SWAP rectangle (drives the top/bottom swap-zone boundary). Independent of the horizontal axis (per-axis centerRatio)."
            />
          </div>
          <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/70 p-2">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              center floor: {props.interactionCapabilities.dropHitZoneGeometry.centerMinPx}px
            </label>
            <RangeSlider
              min={0}
              max={80}
              step={1}
              value={props.interactionCapabilities.dropHitZoneGeometry.centerMinPx}
              onChange={(value: number): void => props.setInteractionCapabilities(
                (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                  ...previous,
                  dropHitZoneGeometry: {
                    ...previous.dropHitZoneGeometry,
                    centerMinPx: value,
                  },
                }),
              )}
              title="Floor (CSS px) for the center rectangle extent so tiny panes keep a usable swap target when width * centerRatio would collapse it."
            />
          </div>
          <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/70 p-2">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              hysteresis: {props.interactionCapabilities.dropHitZoneGeometry.hysteresisPx}px
            </label>
            <RangeSlider
              min={0}
              max={24}
              step={1}
              value={props.interactionCapabilities.dropHitZoneGeometry.hysteresisPx}
              onChange={(value: number): void => props.setInteractionCapabilities(
                (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                  ...previous,
                  dropHitZoneGeometry: {
                    ...previous.dropHitZoneGeometry,
                    hysteresisPx: value,
                  },
                }),
              )}
              title="Boundary stickiness (pane-local CSS px): once the cursor is in a zone it must cross the boundary by this much before the classification switches. 0 disables hysteresis."
            />
          </div>
        </div>
      ) : null}
    </div>
  );

  const animationGroup: React.ReactElement = (
    <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
      <GroupToggleHeader
        label="animation"
        enabled={props.animationControlsEnabled}
        onEnabledChange={props.setAnimationControlsEnabled}
        sticky={props.animationControlsSticky}
        onStickyChange={props.setAnimationControlsSticky}
        ariaLabel="animation group"
        offTitle="Disable the live-drag motion choreography (split transit/reflow speeds, swap bounce, ghost pickup-scale, coherent non-intersecting transit) and collapse the controls. Placement becomes instant; per-control values are preserved for re-enabling."
        onTitle="Enable the live-drag motion choreography and expand the controls (link toggle, transit + reflow speeds, swap bounce magnitude, ghost pickup scale, coherent non-intersecting transit)."
      />
      {props.animationControlsEnabled ? (
        <div className="mt-2 space-y-2">
          {prefersReducedMotion ? (
            <div className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-amber-200">
              reduced motion active — drag choreography is suppressed; these knobs have no visible effect until the OS setting is cleared
            </div>
          ) : null}
          <label
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
            title="Link the ghost transit speed and the survivor reflow speed. Linked (default): one slider drives both at equal (parity) timing — the only regime where coherent non-intersecting transit is geometrically valid. Unlinked: two independent sliders; coherent transit is gated off while speeds can diverge."
          >
            <StyledCheckbox
              checked={props.animationSpeedLinked}
              onChange={(checked: boolean): void => {
                props.setAnimationSpeedLinked(checked);
                if (checked) {
                  // Re-link to parity: survivor reflow adopts the ghost transit speed.
                  props.setSurvivorReflowSpeedPercent(props.ghostTransitSpeedPercent);
                }
              }}
            />
            link transit + reflow speed
          </label>
          {props.animationSpeedLinked ? (
            <div className="pl-0.5">
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                drag animation speed: {props.ghostTransitSpeedPercent}% ({resolvedGhostTransitDurationMs}ms transit + reflow)
              </label>
              <RangeSlider
                min={DRAG_ANIMATION_SPEED_MIN_PERCENT}
                max={DRAG_ANIMATION_SPEED_MAX_PERCENT}
                step={5}
                value={props.ghostTransitSpeedPercent}
                onChange={(value: number): void => {
                  props.setGhostTransitSpeedPercent(value);
                  props.setSurvivorReflowSpeedPercent(value);
                }}
                title="Linked speed for both the ghost transit (hop) and the survivor reflow, scaled from the 170ms baseline (100% = default). Slowest 10% ≈ 1700ms."
              />
            </div>
          ) : (
            <>
              <div className="pl-0.5">
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  ghost transit speed: {props.ghostTransitSpeedPercent}% ({resolvedGhostTransitDurationMs}ms hop)
                </label>
                <RangeSlider
                  min={DRAG_ANIMATION_SPEED_MIN_PERCENT}
                  max={DRAG_ANIMATION_SPEED_MAX_PERCENT}
                  step={5}
                  value={props.ghostTransitSpeedPercent}
                  onChange={props.setGhostTransitSpeedPercent}
                  title="Speed of the dragged ghost's hop-in/out + pickup entrance, scaled from the 170ms baseline (100% = default)."
                />
              </div>
              <div className="pl-0.5">
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  survivor reflow speed: {props.survivorReflowSpeedPercent}% ({resolvedSurvivorReflowDurationMs}ms reflow)
                </label>
                <RangeSlider
                  min={DRAG_ANIMATION_SPEED_MIN_PERCENT}
                  max={DRAG_ANIMATION_SPEED_MAX_PERCENT}
                  step={5}
                  value={props.survivorReflowSpeedPercent}
                  onChange={props.setSurvivorReflowSpeedPercent}
                  title="Speed of the affected (survivor / displaced) panes' reflow transform, scaled from the 170ms baseline (100% = default)."
                />
              </div>
            </>
          )}
          <div className="pl-0.5">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              swap bounce magnitude: {props.swapBounceMagnitudePercent}% {props.swapBounceMagnitudePercent === 0 ? "(no overshoot)" : "(overshoot)"}
            </label>
            <RangeSlider
              min={SWAP_BOUNCE_MIN_PERCENT}
              max={SWAP_BOUNCE_MAX_PERCENT}
              step={5}
              value={props.swapBounceMagnitudePercent}
              onChange={props.setSwapBounceMagnitudePercent}
              title="Landing overshoot amplitude for the ghost seated hop-in + survivor settle (easeOutBack). 0% = today's monotonic settle. Per-element, so it is valid under split (unlinked) speeds; inert while the coherent-transit dip owns the swap landing. Skipped under prefers-reduced-motion."
            />
          </div>
          <div className="pl-0.5">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              hop easing: {DRAG_HOP_EASING_PRESETS.find((preset): boolean => preset.value === props.dragHopEasing)?.label ?? "custom"}
            </label>
            <div className="flex flex-wrap gap-1" role="group" aria-label="drag hop easing preset">
              {DRAG_HOP_EASING_PRESETS.map((preset): React.ReactElement => {
                const isActive: boolean = preset.value === props.dragHopEasing;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={(): void => props.setDragHopEasing(preset.value)}
                    title={`Set the ghost hop + cursor transit timing function to ${preset.value} (the survivor reflow falls back to this curve).`}
                    className={`rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors ${
                      isActive
                        ? "border-sky-400/70 bg-sky-500/20 text-sky-200"
                        : "border-white/10 bg-slate-950/70 text-slate-400 hover:border-white/20 hover:text-slate-200"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="pl-0.5">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
              ghost pickup scale: {props.interactionCapabilities.ghostPickupScalePercent}% (of source bbox)
            </label>
            <RangeSlider
              min={GHOST_PICKUP_SCALE_MIN_PERCENT}
              max={GHOST_PICKUP_SCALE_MAX_PERCENT}
              step={5}
              value={props.interactionCapabilities.ghostPickupScalePercent}
              onChange={(value: number): void => props.setInteractionCapabilities(
                (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                  ...previous,
                  ghostPickupScalePercent: value,
                }),
              )}
              title="Size the lifted ghost relative to the source pane's full bbox on drag start. <100% reads as lifted/shrunk; the ghost morphs from this size toward the resolved slot's bbox on hop-in. Skipped under prefers-reduced-motion."
            />
          </div>
          <label
            className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] ${props.animationSpeedLinked ? "text-slate-300" : "text-slate-600"}`}
            title="Coherent non-intersecting transit. On a SWAP the moving ghost and the displaced target dip toward ~70% mid-transit so their crossing paths never visually overlap, then scale back into place. Only valid at equal (parity) timing, so it is disabled while the transit + reflow speeds are unlinked."
          >
            <StyledCheckbox
              checked={props.animationSpeedLinked && props.interactionCapabilities.coherentTransit}
              disabled={!props.animationSpeedLinked}
              onChange={(checked: boolean): void => props.setInteractionCapabilities(
                (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                  ...previous,
                  coherentTransit: checked,
                }),
              )}
            />
            coherent non-intersecting transit
          </label>
          {props.animationSpeedLinked ? null : (
            <div className="pl-6 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
              requires linked transit + reflow speed
            </div>
          )}
          <button
            type="button"
            onClick={(): void => {
              props.setAnimationSpeedLinked(ANIMATION_CONTROL_DEFAULTS.speedLinked);
              props.setGhostTransitSpeedPercent(ANIMATION_CONTROL_DEFAULTS.ghostTransitSpeedPercent);
              props.setSurvivorReflowSpeedPercent(ANIMATION_CONTROL_DEFAULTS.survivorReflowSpeedPercent);
              props.setSwapBounceMagnitudePercent(ANIMATION_CONTROL_DEFAULTS.swapBounceMagnitudePercent);
              props.setDragHopEasing(DEFAULT_DRAG_HOP_EASING);
              props.setInteractionCapabilities(
                (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                  ...previous,
                  ghostPickupScalePercent: ANIMATION_CONTROL_DEFAULTS.ghostPickupScalePercent,
                  coherentTransit: ANIMATION_CONTROL_DEFAULTS.coherentTransit,
                }),
              );
            }}
            className="mt-1 w-full rounded border border-white/15 bg-slate-900/80 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-300 transition-colors hover:border-cyan-300/50 hover:text-cyan-100"
            title="Restore the ANIMATION group to its defaults: linked speeds at 100%, swap bounce 30%, ghost pickup scale 90%, coherent transit on."
          >
            reset group to defaults
          </button>
        </div>
      ) : null}
    </div>
  );

  const isLiveStatusPinned: boolean = props.showLiveStatus && props.liveStatusSticky;
  const anyGroupPinned: boolean =
    isLiveStatusPinned
    || props.previewOverlaysSticky
    || props.subjectColorsSticky
    || props.dropIntentDebugSticky
    || props.hitZoneOverlaysSticky
    || props.hitZoneGeometrySticky
    || props.animationControlsSticky;

  return (
    <aside
      className="hypr-range-scope h-full min-h-0 shrink-0 overflow-hidden rounded-xl border border-cyan-100/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.84),rgba(2,6,23,0.94))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_22px_rgba(34,211,238,0.12)] backdrop-blur"
      style={{
        width: CONTROL_PANE_WIDTH_PX,
        minWidth: CONTROL_PANE_WIDTH_PX,
        maxWidth: CONTROL_PANE_WIDTH_PX,
      }}
    >
      <style>{RANGE_SLIDER_STYLE}</style>
      <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
        <section className="shrink-0 min-w-0 max-w-full overflow-hidden rounded-lg border border-cyan-100/20 bg-slate-900/80 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex items-center justify-between gap-2">
            <div
              className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.13em] text-slate-400"
              title="Show or hide the live status readout. Hidden by default so it is opt-in rather than always pinned to the top of the pane. Pin keeps it above the scroll area when shown."
            >
              live status panel
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <StickyPinToggle
                sticky={props.liveStatusSticky}
                onStickyChange={props.setLiveStatusSticky}
                ariaLabel="live status panel sticky"
              />
              <div className="grid grid-cols-2 gap-1" role="group" aria-label="live status panel visibility">
                {LIVE_STATUS_VISIBILITY_OPTIONS.map((option: LiveStatusVisibilityOption): React.ReactElement => {
                  const isActive: boolean = props.showLiveStatus === option.value;
                  return (
                    <button
                      key={`live-status-${option.label}`}
                      type="button"
                      aria-pressed={isActive}
                      title={option.title}
                      onClick={(): void => props.setShowLiveStatus(option.value)}
                      className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/55 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 motion-reduce:transition-none ${
                        isActive
                          ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                          : "border-white/10 bg-slate-950 text-slate-400 hover:border-white/25"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {anyGroupPinned ? (
          <div className="mt-3 shrink-0 min-w-0 max-w-full space-y-3 overflow-hidden">
            {isLiveStatusPinned ? liveStatusReadout : null}
            {props.animationControlsSticky ? animationGroup : null}
            {props.previewOverlaysSticky ? previewOverlaysGroup : null}
            {props.subjectColorsSticky ? subjectColorsGroup : null}
            {props.dropIntentDebugSticky ? dropIntentDebugGroup : null}
            {props.hitZoneOverlaysSticky ? hitZoneOverlaysGroup : null}
            {props.hitZoneGeometrySticky ? hitZoneGeometryGroup : null}
          </div>
        ) : null}

        <div className="mt-3 min-h-0 min-w-0 max-w-full flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
          {props.showLiveStatus && !props.liveStatusSticky ? liveStatusReadout : null}

          {props.animationControlsSticky ? null : animationGroup}

          <section className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-lg border border-cyan-100/15 bg-slate-900/65 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200">
              primary controls
            </div>

            <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-cyan-200/25 bg-slate-950/65 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-slate-500">
                interaction capabilities
              </div>
              <div className="space-y-2">
                <div>
                  <div
                    className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400"
                    title="Divider resize axis: horizontal = width dividers (side-by-side), vertical = height dividers (stacked)"
                  >
                    resize dividers
                  </div>
                  <div className="grid grid-cols-4 gap-1" role="group" aria-label="resize capability">
                    {RESIZE_CAPABILITY_OPTIONS.map((option: ResizeCapabilityOption): React.ReactElement => {
                      const isActive: boolean = props.interactionCapabilities.resize === option.value;
                      return (
                        <button
                          key={`resize-${option.value}`}
                          type="button"
                          aria-pressed={isActive}
                          title={option.title}
                          onClick={(): void => props.setInteractionCapabilities(
                            (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                              ...previous,
                              resize: option.value,
                            }),
                          )}
                          className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/55 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 motion-reduce:transition-none ${
                            isActive
                              ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                              : "border-white/10 bg-slate-950 text-slate-400 hover:border-white/25"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label
                  className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
                  title="Render split-divider handle chrome between panes. Off hides separator paint/hover affordance but keeps divider hit-targets and resize capability behavior."
                >
                  <StyledCheckbox
                    checked={props.interactionCapabilities.resizeHandlesVisible}
                    onChange={(checked: boolean): void => props.setInteractionCapabilities(
                      (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                        ...previous,
                        resizeHandlesVisible: checked,
                      }),
                    )}
                  />
                  show resize handles
                </label>

                <label
                  className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
                  title="Live-drag slot hop-in. On (default): the single ghost hops INTO and FILLS the resolved slot as the single instance — no separate empty reservation lingers. Off: the ghost free-follows the cursor and the in-tree content-less reservation slot stays shown (reservation-plus-ghost duality)."
                >
                  <StyledCheckbox
                    disabled={
                      !props.interactionCapabilities.rearrange
                      || props.interactionCapabilities.dragMode !== "live"
                    }
                    checked={props.interactionCapabilities.slotHopInEnabled}
                    onChange={(checked: boolean): void => props.setInteractionCapabilities(
                      (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                        ...previous,
                        slotHopInEnabled: checked,
                      }),
                    )}
                  />
                  slot hop-in
                </label>

                <label
                  className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
                  title="Drag-to-rearrange (move / swap / edge-insert). When off, panes are not draggable and no drop overlays activate."
                >
                  <StyledCheckbox
                    checked={props.interactionCapabilities.rearrange}
                    onChange={(checked: boolean): void => props.setInteractionCapabilities(
                      (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                        ...previous,
                        rearrange: checked,
                      }),
                    )}
                  />
                  drag rearrange
                </label>

                <div className="pl-5">
                  <div
                    className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400"
                    title="Drag feedback mode: preview = non-committing projected overlays; live = Hyprland detach (source detached on pickup, frozen tree, ghost follows cursor, commit on release)"
                  >
                    drag mode
                  </div>
                  <div className="grid grid-cols-2 gap-1" role="group" aria-label="drag mode">
                    {DRAG_MODE_OPTIONS.map((option: DragModeOption): React.ReactElement => {
                      const isActive: boolean = props.interactionCapabilities.dragMode === option.value;
                      return (
                        <button
                          key={`drag-mode-${option.value}`}
                          type="button"
                          aria-pressed={isActive}
                          disabled={!props.interactionCapabilities.rearrange}
                          title={option.title}
                          onClick={(): void => props.setInteractionCapabilities(
                            (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                              ...previous,
                              dragMode: option.value,
                            }),
                          )}
                          className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/55 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 motion-reduce:transition-none ${
                            isActive
                              ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                              : "border-white/10 bg-slate-950 text-slate-400 hover:border-white/25"
                          } ${props.interactionCapabilities.rearrange ? "" : "opacity-40"}`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pl-5">
                  <div
                    className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400"
                    title="Live-drag slot re-resolution after the single ghost hops INTO and FILLS a slot: delta-responsive (default) re-aims once the cursor moves past the 24px delta; zone-exit-hold pins the seated slot until the cursor leaves the seated pane."
                  >
                    slot commitment
                  </div>
                  <div className="grid grid-cols-2 gap-1" role="group" aria-label="slot commitment">
                    {SLOT_COMMITMENT_OPTIONS.map((option: SlotCommitmentOption): React.ReactElement => {
                      const isActive: boolean = props.interactionCapabilities.slotCommitment.mode === option.value;
                      const isDisabled: boolean =
                        !props.interactionCapabilities.rearrange
                        || props.interactionCapabilities.dragMode !== "live";
                      return (
                        <button
                          key={`slot-commitment-${option.value}`}
                          type="button"
                          aria-pressed={isActive}
                          disabled={isDisabled}
                          title={option.title}
                          onClick={(): void => props.setInteractionCapabilities(
                            (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                              ...previous,
                              slotCommitment: { ...previous.slotCommitment, mode: option.value },
                            }),
                          )}
                          className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/55 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 motion-reduce:transition-none ${
                            isActive
                              ? "border-cyan-300/70 bg-cyan-500/20 text-cyan-100"
                              : "border-white/10 bg-slate-950 text-slate-400 hover:border-white/25"
                          } ${isDisabled ? "opacity-40" : ""}`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label
                  className="flex items-center gap-2 pl-5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
                  title="Allow touch pointers to start a drag. When off, touch is reserved for tap/scroll and only mouse/pen can drag. The drag FSM runs on Pointer Events, so touch shares the same pickup/drop machinery as mouse."
                >
                  <StyledCheckbox
                    disabled={!props.interactionCapabilities.rearrange}
                    checked={props.interactionCapabilities.touchDrag.enable}
                    onChange={(checked: boolean): void => props.setInteractionCapabilities(
                      (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                        ...previous,
                        touchDrag: { ...previous.touchDrag, enable: checked },
                      }),
                    )}
                  />
                  touch drag
                </label>

                <div className="pl-5">
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                    touch long-press: {props.interactionCapabilities.touchDrag.longPressMs}ms
                  </label>
                  <RangeSlider
                    min={0}
                    max={600}
                    step={10}
                    value={props.interactionCapabilities.touchDrag.longPressMs}
                    disabled={!props.interactionCapabilities.rearrange || !props.interactionCapabilities.touchDrag.enable}
                    onChange={(value: number): void => props.setInteractionCapabilities(
                      (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                        ...previous,
                        touchDrag: { ...previous.touchDrag, longPressMs: value },
                      }),
                    )}
                    title="How long a finger must be held before a touch press becomes a drag (the tap/scroll-vs-drag disambiguator). A pre-long-press scroll-axis flick releases to the page. Mouse/pen ignore this delay (immediate threshold pickup). 0 = a held touch picks up at once."
                    ariaLabel="touch long-press delay in milliseconds"
                  />
                </div>

                <label
                  className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
                  title="Pane focus selection. When off, clicking / focusing a pane does not select it."
                >
                  <StyledCheckbox
                    checked={props.interactionCapabilities.focus}
                    onChange={(checked: boolean): void => props.setInteractionCapabilities(
                      (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                        ...previous,
                        focus: checked,
                      }),
                    )}
                  />
                  pane focus selection
                </label>

                <label
                  className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
                  title="Maximize-to-viewport. Adds a per-pane maximize/restore header button and binds Alt+Enter / Esc. Non-destructive render-mode (layout tree untouched)."
                >
                  <StyledCheckbox
                    checked={props.interactionCapabilities.maximize.enable}
                    onChange={(checked: boolean): void => props.setInteractionCapabilities(
                      (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                        ...previous,
                        maximize: { ...previous.maximize, enable: checked },
                      }),
                    )}
                  />
                  maximize (Alt+Enter / Esc)
                </label>

                <label
                  className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
                  title="Tab-like pane switching. Binds Alt+[ / Alt+] cycle and Alt+1..9 jump. When maximized, switching also switches which pane is maximized."
                >
                  <StyledCheckbox
                    checked={props.interactionCapabilities.paneSwitching.enable}
                    onChange={(checked: boolean): void => props.setInteractionCapabilities(
                      (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                        ...previous,
                        paneSwitching: { ...previous.paneSwitching, enable: checked },
                      }),
                    )}
                  />
                  pane switching (Alt+[ / Alt+] / Alt+1..9)
                </label>

                <label
                  className="flex items-center gap-2 pl-5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
                  title="Render the tab strip above the tiling region. Cycle/jump shortcuts still work when off."
                >
                  <StyledCheckbox
                    disabled={!props.interactionCapabilities.paneSwitching.enable}
                    checked={props.interactionCapabilities.paneSwitching.showTabStrip}
                    onChange={(checked: boolean): void => props.setInteractionCapabilities(
                      (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                        ...previous,
                        paneSwitching: { ...previous.paneSwitching, showTabStrip: checked },
                      }),
                    )}
                  />
                  tab strip visible
                </label>

                <label
                  className="flex items-center gap-2 pl-5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300"
                  title="macOS Cmd+Tab-style visual switcher overlay while cycling panes with Alt held. Release Alt to commit, Esc to cancel. Cycle/jump shortcuts still work when off (they activate immediately)."
                >
                  <StyledCheckbox
                    disabled={!props.interactionCapabilities.paneSwitching.enable}
                    checked={props.interactionCapabilities.paneSwitching.showSwitcherOverlay}
                    onChange={(checked: boolean): void => props.setInteractionCapabilities(
                      (previous: ResolvedTilingInteractionCapabilities): ResolvedTilingInteractionCapabilities => ({
                        ...previous,
                        paneSwitching: { ...previous.paneSwitching, showSwitcherOverlay: checked },
                      }),
                    )}
                  />
                  cmd-tab switcher overlay
                </label>

                <div className="rounded border border-white/10 bg-slate-950/60 p-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
                  <div className="mb-0.5 text-slate-400">keymap</div>
                  <div className="grid grid-cols-1 gap-0.5 normal-case tracking-normal">
                    <span>maximize: {formatKeyChordLabel(props.interactionCapabilities.keymap.toggleMaximize)} | restore: {formatKeyChordLabel(props.interactionCapabilities.keymap.restore)}</span>
                    <span>prev: {formatKeyChordLabel(props.interactionCapabilities.keymap.previousPane)} | next: {formatKeyChordLabel(props.interactionCapabilities.keymap.nextPane)} | jump: {formatKeyModifiersLabel(props.interactionCapabilities.keymap.jumpToPane)}+1..9</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-slate-500">
                source and target routing
              </div>
              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  drag source pane
                </label>
                <select
                  value={props.selectedSourceLeafId}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => {
                    props.setSelectedSourceLeafId(event.target.value);
                    props.setFocusedLeafId(event.target.value);
                  }}
                  className="w-full min-w-0 max-w-full rounded border border-white/10 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-200"
                >
                  {props.leafIds.map((leafId: string): React.ReactElement => (
                    <option key={`source-${leafId}`} value={leafId}>{leafId}</option>
                  ))}
                </select>

                <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  drop target pane
                </label>
                <select
                  value={props.selectedTargetLeafId}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => {
                    props.setSelectedTargetLeafId(event.target.value);
                    props.setFocusedLeafId(event.target.value);
                  }}
                  className="w-full min-w-0 max-w-full rounded border border-white/10 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-200"
                >
                  {props.leafIds.map((leafId: string): React.ReactElement => (
                    <option key={`target-${leafId}`} value={leafId}>{leafId}</option>
                  ))}
                </select>

                <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  destination split container
                </label>
                <select
                  value={props.selectedSplitId}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => props.setSelectedSplitId(event.target.value)}
                  className="w-full min-w-0 max-w-full rounded border border-white/10 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-200"
                >
                  {props.splitNodes.map((splitNode: TilingSplitNode): React.ReactElement => (
                    <option key={`split-${splitNode.id}`} value={splitNode.id}>
                      {splitNode.id} ({splitNode.axis})
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300">
                  <StyledCheckbox
                    checked={props.preserveParentSplitAxis}
                    onChange={props.setPreserveParentSplitAxis}
                  />
                  preserve parent split axis
                </label>
              </div>
            </div>

            <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-slate-500">
                pane move and insert actions
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={(): void => props.setLayout((previous: TilingLayoutNode): TilingLayoutNode =>
                    insertLeafAdjacent(
                      previous,
                      props.selectedSourceLeafId,
                      props.selectedTargetLeafId,
                      "left",
                      { preserveParentSplitAxis: props.preserveParentSplitAxis, splitRatio: 0.5 },
                    ))}
                  className="rounded border border-cyan-300/35 bg-cyan-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-cyan-100"
                >
                  insert left
                </button>
                <button
                  type="button"
                  onClick={(): void => props.setLayout((previous: TilingLayoutNode): TilingLayoutNode =>
                    insertLeafAdjacent(
                      previous,
                      props.selectedSourceLeafId,
                      props.selectedTargetLeafId,
                      "right",
                      { preserveParentSplitAxis: props.preserveParentSplitAxis, splitRatio: 0.5 },
                    ))}
                  className="rounded border border-cyan-300/35 bg-cyan-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-cyan-100"
                >
                  insert right
                </button>
                <button
                  type="button"
                  onClick={(): void => props.setLayout((previous: TilingLayoutNode): TilingLayoutNode =>
                    insertLeafAdjacent(
                      previous,
                      props.selectedSourceLeafId,
                      props.selectedTargetLeafId,
                      "top",
                      { preserveParentSplitAxis: props.preserveParentSplitAxis, splitRatio: 0.5 },
                    ))}
                  className="rounded border border-cyan-300/35 bg-cyan-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-cyan-100"
                >
                  insert top
                </button>
                <button
                  type="button"
                  onClick={(): void => props.setLayout((previous: TilingLayoutNode): TilingLayoutNode =>
                    insertLeafAdjacent(
                      previous,
                      props.selectedSourceLeafId,
                      props.selectedTargetLeafId,
                      "bottom",
                      { preserveParentSplitAxis: props.preserveParentSplitAxis, splitRatio: 0.5 },
                    ))}
                  className="rounded border border-cyan-300/35 bg-cyan-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-cyan-100"
                >
                  insert bottom
                </button>
                <button
                  type="button"
                  onClick={(): void => props.setLayout((previous: TilingLayoutNode): TilingLayoutNode =>
                    moveLeafToRoot(previous, props.selectedSourceLeafId, "first", { splitRatio: 0.5 }))}
                  className="rounded border border-violet-300/35 bg-violet-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-violet-100"
                >
                  move root first
                </button>
                <button
                  type="button"
                  onClick={(): void => props.setLayout((previous: TilingLayoutNode): TilingLayoutNode =>
                    moveLeafToRoot(previous, props.selectedSourceLeafId, "second", { splitRatio: 0.5 }))}
                  className="rounded border border-violet-300/35 bg-violet-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-violet-100"
                >
                  move root second
                </button>
                <button
                  type="button"
                  onClick={(): void => props.setLayout((previous: TilingLayoutNode): TilingLayoutNode =>
                    moveLeafToSplitContainer(
                      previous,
                      props.selectedSourceLeafId,
                      props.selectedSplitId,
                      "first",
                      { preserveParentSplitAxis: true, splitRatio: 0.5 },
                    ))}
                  className="rounded border border-sky-300/35 bg-sky-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-sky-100"
                >
                  move to split first
                </button>
                <button
                  type="button"
                  onClick={(): void => props.setLayout((previous: TilingLayoutNode): TilingLayoutNode =>
                    moveLeafToSplitContainer(
                      previous,
                      props.selectedSourceLeafId,
                      props.selectedSplitId,
                      "second",
                      { preserveParentSplitAxis: true, splitRatio: 0.5 },
                    ))}
                  className="rounded border border-sky-300/35 bg-sky-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-sky-100"
                >
                  move to split second
                </button>
                <button
                  type="button"
                  onClick={(): void => props.setLayout((previous: TilingLayoutNode): TilingLayoutNode =>
                    toggleSplitAxis(previous, props.selectedSplitId))}
                  className="col-span-2 rounded border border-pink-300/35 bg-pink-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-pink-100"
                >
                  toggle split axis
                </button>
              </div>
            </div>

            <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-slate-500">
                focus controls
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={(): void => props.runDirectionalFocus("left")}
                  className="rounded border border-white/15 bg-black/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-200"
                >
                  left
                </button>
                <button
                  type="button"
                  onClick={(): void => props.runDirectionalFocus("right")}
                  className="rounded border border-white/15 bg-black/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-200"
                >
                  right
                </button>
                <button
                  type="button"
                  onClick={(): void => props.runDirectionalFocus("up")}
                  className="rounded border border-white/15 bg-black/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-200"
                >
                  up
                </button>
                <button
                  type="button"
                  onClick={(): void => props.runDirectionalFocus("down")}
                  className="rounded border border-white/15 bg-black/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-200"
                >
                  down
                </button>
              </div>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                arrows also drive focus navigation
              </p>
            </div>

            {props.previewOverlaysSticky ? null : previewOverlaysGroup}
            {props.subjectColorsSticky ? null : subjectColorsGroup}
            {props.dropIntentDebugSticky ? null : dropIntentDebugGroup}
            {props.hitZoneOverlaysSticky ? null : hitZoneOverlaysGroup}
            {props.hitZoneGeometrySticky ? null : hitZoneGeometryGroup}

            <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-slate-500">
                basic layout tuning
              </div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400">
                gap px: {props.config.gapPx}
              </label>
              <RangeSlider
                min={4}
                max={24}
                step={1}
                value={props.config.gapPx}
                onChange={(value: number): void =>
                  props.setConfig((previous: TilingLayoutConfig): TilingLayoutConfig => ({
                    ...previous,
                    gapPx: value,
                  }))}
              />
              <label className="mt-3 block font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400">
                min pane px: {props.config.minPaneSizePx}
              </label>
              <RangeSlider
                min={80}
                max={260}
                step={10}
                value={props.config.minPaneSizePx}
                onChange={(value: number): void =>
                  props.setConfig((previous: TilingLayoutConfig): TilingLayoutConfig => ({
                    ...previous,
                    minPaneSizePx: value,
                  }))}
              />
            </div>
          </section>

          <section className="mt-3 min-w-0 max-w-full space-y-2 overflow-hidden rounded border border-white/10 bg-slate-900/70 p-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200">
              diagnostics
            </div>

            <details className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
              <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.13em] text-slate-300">
                stream ledger ({props.observabilityLedgerEntries.length}/{LIVE_LEDGER_RETENTION_LIMIT})
              </summary>
              <div className="mt-2 max-h-[180px] min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-hidden rounded border border-white/10 bg-slate-950/85 p-2">
                {props.observabilityLedgerEntries.length === 0
                  ? (
                    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      waiting for hover or drag activity
                    </div>
                  )
                  : (
                    <div className="min-w-0 space-y-1">
                      {props.observabilityLedgerEntries.map((ledgerEntry: TilingObservabilityLedgerEntry): React.ReactElement => (
                        <div
                          key={ledgerEntry.id}
                          className="w-full min-w-0 overflow-x-auto overflow-y-hidden font-mono text-[10px] leading-4 tracking-[0.08em] text-slate-200"
                        >
                          <div className="inline-block min-w-max whitespace-nowrap">
                            <span className="text-cyan-200">{ledgerEntry.timestampLabel}</span> {ledgerEntry.streamLine}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </details>

            <details className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
              <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.13em] text-slate-300">
                hit resolver snapshot
              </summary>
              <div className="mt-2 min-w-0 max-w-full space-y-1 overflow-x-auto overflow-y-hidden font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">
                <div>hovered pane id: {props.liveHitLog?.hoveredLeafId ?? "none"}</div>
                <div>source leaf id (hovered pane): {props.liveHitLog?.sourceLeafId ?? "none"}</div>
                <div>drag source leaf id (drag origin): {props.liveHitLog?.dragSourceLeafId ?? "none"}</div>
                <div>pointer mode: {props.liveHitLog?.isDragging ? "dragging" : "hover/move"}</div>
                <div>resolver zone: {props.liveHitLog?.resolverZone ?? "none"}</div>
                <div>center ratio: {props.liveHitLog?.centerRatio?.toFixed(2) ?? "none"}</div>
                <div>edge threshold ratio: {props.liveHitLog?.edgeThresholdRatio?.toFixed(2) ?? "none"}</div>
                <div>center rect px: {props.liveHitLog == null ? "none" : `${props.liveHitLog.centerRectWidthPx.toFixed(1)} × ${props.liveHitLog.centerRectHeightPx.toFixed(1)}`}</div>
                <div>center valid: {props.liveHitLog?.centerIsValid == null ? "none" : props.liveHitLog.centerIsValid ? "valid" : "blocked"}</div>
                <div
                  className="overflow-y-auto overflow-x-auto whitespace-nowrap normal-case"
                  style={{
                    height: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    minHeight: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    maxHeight: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    lineHeight: CONTROL_PANE_STATUS_LINE_HEIGHT_PX / 16,
                  }}
                >
                  center blocked reason: {normalizeReasonToken(props.liveHitLog?.centerBlockedReason)}
                </div>
                <div>center distance px: {props.liveHitLog?.intent?.centerDistancePx?.toFixed(1) ?? "none"}</div>
                <div>nearest edge distance px: {props.liveHitLog?.intent?.nearestEdgeDistancePx?.toFixed(1) ?? "none"}</div>
                <div>selected edge distance px: {props.liveHitLog?.intent?.selectedSplitDistancePx?.toFixed(1) ?? "none"}</div>
                <div>selected edge candidate: {props.liveHitLog?.intent?.selectedSplitZone ?? "none"}</div>
                <div>edge validity:</div>
                {props.liveHitLog == null || props.liveHitLog.edgeDiagnostics.length === 0
                  ? <div className="pl-2 text-slate-500">none</div>
                  : props.liveHitLog.edgeDiagnostics.map((edgeDiagnostic): React.ReactElement => (
                    <div key={`live-hit-edge-${edgeDiagnostic.zone}`} className="pl-2 text-slate-200">
                      {edgeDiagnostic.zone}: {edgeDiagnostic.isValid ? "valid" : "blocked"} | reason{" "}
                      {edgeDiagnostic.rejectionReason ?? "none"}
                    </div>
                  ))}
              </div>
            </details>

            <details className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
              <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.13em] text-slate-300">
                drop intent internals
              </summary>
              <div className="mt-2 min-w-0 max-w-full space-y-1 overflow-x-auto overflow-y-hidden font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">
                <div>resolved action: {props.liveDropIntent?.action ?? "none"}</div>
                <div>dominant edge: {props.liveDropIntent?.dominantEdge ?? "none"}</div>
                <div>selected final edge: {props.liveDropIntent?.finalEdge ?? "none"}</div>
                <div
                  className="overflow-y-auto overflow-x-auto whitespace-nowrap normal-case"
                  style={{
                    height: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    minHeight: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    maxHeight: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    lineHeight: CONTROL_PANE_STATUS_LINE_HEIGHT_PX / 16,
                  }}
                >
                  fallback reason: {normalizeReasonToken(props.liveDropIntent?.fallbackReason)}
                </div>
                <div
                  className="overflow-y-auto overflow-x-auto whitespace-nowrap normal-case"
                  style={{
                    height: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    minHeight: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    maxHeight: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    lineHeight: CONTROL_PANE_STATUS_LINE_HEIGHT_PX / 16,
                  }}
                >
                  blocked reason: {normalizeReasonToken(props.liveDropIntent?.blockedReason)}
                </div>
                <div>axis path / depth: {props.liveDropIntent == null ? "none" : `${axisPathLabel(props.liveDropIntent.axisPath)} (d=${props.liveDropIntent.axisPath.length})`}</div>
                <div>edge threshold ratio: {props.liveDropIntent?.edgeThresholdRatio?.toFixed(2) ?? "none"}</div>
                <div>center rect px: {props.liveDropIntent == null ? "none" : `${props.liveDropIntent.centerRectWidthPx?.toFixed(1) ?? "none"} × ${props.liveDropIntent.centerRectHeightPx?.toFixed(1) ?? "none"}`}</div>
                <div>pane-local cursor px: {props.liveDropIntent == null ? "none" : `${props.liveDropIntent.paneLocalX?.toFixed(1) ?? "none"}, ${props.liveDropIntent.paneLocalY?.toFixed(1) ?? "none"}`}</div>
                <div>center distance px: {props.liveDropIntent?.centerDistancePx?.toFixed(1) ?? "none"}</div>
                <div>nearest edge distance px: {props.liveDropIntent?.nearestEdgeDistancePx?.toFixed(1) ?? "none"}</div>
                <div>selected split candidate: {props.liveDropIntent?.selectedSplitZone ?? "none"}</div>
                <div>selected split distance px: {props.liveDropIntent?.selectedSplitDistancePx?.toFixed(1) ?? "none"}</div>
                <div>center ratio: {props.liveDropIntent?.tuning.centerRatio?.toFixed(2) ?? "none"}</div>
                <div>hysteresis px: {props.liveDropIntent?.tuning.hysteresisPx?.toFixed(1) ?? "none"}</div>
                <div>device pixel ratio: {props.liveDropIntent?.tuning.devicePixelRatio?.toFixed(2) ?? "none"}</div>
                <div>target split id: {props.liveDropIntent?.targetSplitId ?? "none"}</div>
                <div
                  className="overflow-y-auto overflow-x-auto whitespace-nowrap normal-case"
                  style={{
                    height: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    minHeight: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    maxHeight: CONTROL_PANE_REASON_RESERVED_HEIGHT_PX,
                    lineHeight: CONTROL_PANE_STATUS_LINE_HEIGHT_PX / 16,
                  }}
                >
                  rejected split reasons:{" "}
                  {props.liveDropIntent == null
                    ? "none"
                    : normalizeReasonList(props.liveDropIntent.rejectedSplitReasons)}
                </div>
              </div>
            </details>

            <details className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-950/60 p-2">
              <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.13em] text-slate-300">
                layout state snapshot
              </summary>
              <div className="mt-2 min-w-0 max-w-full space-y-2 overflow-hidden">
                <div className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-[0.13em]">
                  <div className="rounded border border-white/10 bg-slate-900/80 p-2">
                    <div className="text-slate-500">split nodes</div>
                    <div className="mt-1 text-cyan-200">{props.splitCount}</div>
                  </div>
                  <div className="rounded border border-white/10 bg-slate-900/80 p-2">
                    <div className="text-slate-500">leaf nodes</div>
                    <div className="mt-1 text-cyan-200">{props.leafIds.length}</div>
                  </div>
                </div>
                <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded border border-white/10 bg-slate-900/80 p-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.13em] text-slate-500">
                    tile order by leaf traversal
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-200">
                    {props.tileOrder.join(" -> ")}
                  </div>
                </div>
                <div className="min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-slate-900/80 p-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.13em] text-slate-500">
                    active focus leaf
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-violet-100">
                    <span
                      className={`${CONTROL_PANE_STATUS_BADGE_WIDTH_CLASS} inline-flex items-center justify-center rounded-full border border-violet-200/60 bg-violet-500/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-100`}
                    >
                      focused
                    </span>
                    {props.focusedLeafId ?? "none"}
                  </div>
                </div>
                <div className="max-h-[45vh] min-h-[180px] min-w-0 max-w-full overflow-y-auto overflow-x-auto rounded border border-white/10 bg-slate-950/80 p-2">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    live layout json
                  </div>
                  <pre className="w-max min-w-full font-mono text-[10px] leading-4 text-slate-300">
                    {JSON.stringify(props.layout, null, 2)}
                  </pre>
                </div>
                <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded border border-white/10 bg-slate-950/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-slate-300">
                  projected overlays rendered: {props.projectedOverlayRenderCount}
                </div>
                <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded border border-white/10 bg-slate-950/70 px-2 py-1 font-mono text-[9px] tracking-[0.08em] text-slate-300">
                  <div className="uppercase text-slate-500">overlay border legend</div>
                  <div className="mt-1">
                    drag source:{" "}
                    <span className="inline-block rounded border px-1" style={{ borderColor: props.observabilityColors.dragSourceBorderColorHex }}>custom</span>{" "}
                    | drop target:{" "}
                    <span className="inline-block rounded border px-1" style={{ borderColor: props.observabilityColors.dragTargetBorderColorHex }}>custom</span>
                  </div>
                  <div>
                    projected S&apos; (source landing):{" "}
                    <span className="inline-block rounded border px-1" style={{ borderColor: props.observabilityColors.projectedSourceBorderColorHex }}>custom</span>{" "}
                    | projected T&apos; (target landing, swap only):{" "}
                    <span className="inline-block rounded border px-1" style={{ borderColor: props.observabilityColors.projectedTargetBorderColorHex }}>custom</span>
                  </div>
                  <div>
                    projected Su&apos; (successor promotion, insert/move):{" "}
                    <span className="inline-block rounded border px-1" style={{ borderColor: props.observabilityColors.projectedSuccessorBorderColorHex }}>custom</span>
                  </div>
                </div>
                {props.showPaneHitZones
                  ? (
                    <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded border border-white/10 bg-slate-950/70 px-2 py-1 font-mono text-[9px] tracking-[0.08em] text-slate-300">
                      <div className="uppercase text-slate-500">pane hit-zone legend</div>
                      <div className="mt-1">
                        edge split zones:{" "}
                        <span className="rounded border px-1 text-sky-100" style={{ borderColor: props.observabilityColors.hitZoneLeftColorHex, backgroundColor: `${props.observabilityColors.hitZoneLeftColorHex}33` }}>left</span>{" "}
                        <span className="rounded border px-1 text-violet-100" style={{ borderColor: props.observabilityColors.hitZoneRightColorHex, backgroundColor: `${props.observabilityColors.hitZoneRightColorHex}33` }}>right</span>{" "}
                        <span className="rounded border px-1 text-amber-100" style={{ borderColor: props.observabilityColors.hitZoneTopColorHex, backgroundColor: `${props.observabilityColors.hitZoneTopColorHex}33` }}>top</span>{" "}
                        <span className="rounded border px-1 text-teal-100" style={{ borderColor: props.observabilityColors.hitZoneBottomColorHex, backgroundColor: `${props.observabilityColors.hitZoneBottomColorHex}33` }}>bottom</span>
                      </div>
                      <div>
                        center swap zone: <span className="rounded border px-1 text-emerald-100" style={{ borderColor: props.observabilityColors.hitZoneCenterColorHex, backgroundColor: `${props.observabilityColors.hitZoneCenterColorHex}33` }}>center rect</span>
                      </div>
                      <div>
                        blocked edge/center: <span className="rounded border px-1 text-rose-100" style={{ borderColor: props.observabilityColors.hitZoneBlockedColorHex, backgroundColor: `${props.observabilityColors.hitZoneBlockedColorHex}33` }}>blocked</span>
                      </div>
                      <div className="text-slate-400">
                        validity source leaf: {props.selectedSourceLeafId}
                      </div>
                    </div>
                  )
                  : null}
              </div>
            </details>
          </section>
        </div>
      </div>
    </aside>
  );
}
