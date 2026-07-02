/**
 * `@n-uf/hypr-tiling/devtools` — the developer/telemetry surface.
 *
 * This subpath carries the observability panel and its seed defaults, which are
 * authoring/debugging tools (used to drive the showcase and to inspect live
 * drag/drop hit-zone telemetry). They are intentionally kept OFF the main `.`
 * entry so the published renderer surface stays lean: a consumer that only
 * renders `TilingRenderer` never pulls the ~2,400-line panel into its bundle.
 *
 * The debug/observability inputs and *types* live here too. The renderer's
 * observability inputs ({@link TilingRendererObservabilityProps} — overlay
 * colors, hit-zone/debug flags, and the `onDropIntentChange` /
 * `onLiveHitLogChange` telemetry hooks) are deliberately OFF the consumer
 * {@link TilingRendererProps} contract, so the debug/observability snapshot
 * types they reference (`TilingLiveHitLogState`, `TilingDropIntentDebugState`,
 * `TilingObservabilityColorConfig`, `TilingPaneHitZoneOverlayDebugState`, …)
 * also belong to this devtools surface rather than `.`. To drive them, use
 * {@link TilingRenderer} exported HERE — the same renderer component typed to
 * also accept the observability props (the `.` export stays debug-free).
 */
export {
  ANIMATION_CONTROL_DEFAULTS,
  TilingObservabilityPanel,
  type AnimationControlDefaults,
  type TilingObservabilityLedgerEntry,
} from "./react/tiling-observability-panel";
export {
  TILING_OBSERVABILITY_COLOR_DEFAULTS,
  TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS,
} from "./react/tiling-renderer";

// ── Observability-instrumented renderer ──────────────────────────────────────
// The SAME `TilingRenderer` component, typed to also accept the observability
// inputs. Exported under the `TilingRenderer` name so devtools/showcase code
// reads naturally; the clean `.` renderer stays free of debug props.
export { TilingRendererWithObservability as TilingRenderer } from "./react/tiling-renderer";

// ── Observability input + snapshot types ──────────────────────────────────────
// The renderer's debug/observability prop set, plus the transitive type closure
// of the telemetry hooks and overlay-color config it references.
export type {
  TilingRendererObservabilityProps,
  TilingObservabilityColorConfig,
  TilingObservabilityColorEnableConfig,
  TilingDropIntentDebugState,
  TilingDropIntentTuningState,
  TilingLiveHitLogState,
  TilingLiveHitEdgeDebugState,
  TilingViewportCursorState,
  TilingPaneFootprint,
  TilingPaneHitZoneOverlayDebugState,
  TilingPaneHitZoneCandidateDebugState,
} from "./engine/types";
