/**
 * `@n-uf/hypr-tiling/devtools` — the developer/telemetry surface.
 *
 * This subpath carries the observability panel and its seed defaults, which are
 * authoring/debugging tools (used to drive the showcase and to inspect live
 * drag/drop hit-zone telemetry). They are intentionally kept OFF the main `.`
 * entry so the published renderer surface stays lean: a consumer that only
 * renders `TilingRenderer` never pulls the ~2,400-line panel into its bundle.
 *
 * The debug/observability *types* (e.g. `TilingLiveHitLogState`,
 * `TilingDropIntentDebugState`, `TilingObservabilityColorConfig`,
 * `TilingPaneHitZoneOverlayDebugState`) remain on the main `.` entry because
 * they are referenced by public renderer props (`onDropIntentChange`,
 * `onLiveHitLogChange`, `renderTile`'s `paneHitZoneDebug` / `observabilityColors`).
 * Only the panel value, its ledger type, the animation-control defaults, and the
 * observability-color default palettes live here.
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
} from "./react/dynamic-tiling-renderer";
