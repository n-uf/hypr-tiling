import * as React from "react";
import {
  TilingPaneRoot,
  TilingDragHandle,
  TilingPaneAction,
  TilingPaneBody,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";
import { CANVAS_THEME } from "./canvas-theme";
import { canvasPaneMetrics, type CanvasPaneMetrics } from "./content-canvas";

// The CANVAS skin's pane chrome — an ENGINEERING INSTRUMENT panel, LED-lit.
// This supersedes the earlier standup desktop-window frame entirely (no
// traffic-light cluster, no floating rounded body, no window-foot base). Where
// the Mosaic (`tile.tsx`) and Editorial (`editorial-tile.tsx`) skins are
// recolored header-bar CARDS — one soft-cornered top bar over a body — the
// Canvas pane is a machined PANEL: squared right angles, hairline exact rules,
// no soft elevation, monospace/technical type, tabular indices, and a row of
// bright saturated status LEDs as its ONLY color. It reads like a control-panel
// row on a piece of lab hardware, not a window on a desk.
//
// Three exact bands, each an instrument readout — not a header + body:
//
//   1. HEADER RAIL — a compact control-panel row. On the LEFT, two squared,
//      UNIFORM-color instrument keys (fullscreen/maximize, then select-for-
//      grouping) — deliberately one neutral slate for EVERY pane, not the
//      per-pane LED hue, so the controls read as a consistent key row; then the
//      pane's own status LED (dim slate at rest, its saturated hue LIT with a
//      glow on focus), a hairline column rule, and a short monospace label. On
//      the RIGHT, a tabular pane index and — only while a groupable
//      multi-selection exists — the squared LED-keycap Group action. This is
//      the drag surface and owns the Alt/Opt+click multi-select toggle via
//      `TilingDragHandle`.
//   2. BODY — a flat neutral panel field (no card rounding, no shadow) that
//      renders `tile.content` through `TilingPaneBody` so the drag ghost reuses
//      the same render path.
//   3. CONTENT-METRICS FOOTER — a thin hairline readout carrying a subtle
//      per-pane LED identity dot plus the pane's real content metrics (char
//      count · word count · ~read-time), derived from the shared `./docs`
//      model via `canvasPaneMetrics`, in tabular mono figures.
//
// Acceptance: in greyscale with text hidden, the Canvas pane is obviously a
// different, SHARPER, DENSER frame than the Mosaic/Editorial header-bar cards —
// squared corners, hairline rules, a status-LED header dot, and a tabular LED
// readout footer. In full color the bright LED row is its defining trait.
//
// Fully interactive — drag (header rail), resize (renderer dividers), maximize
// (the left fullscreen key), select-for-grouping (the left select key),
// group (right LED keycap), focus (pane root lights its LED), multi-select
// (Alt/Opt+click header rail too) — built on ONLY the public
// `@n-uf/hypr-tiling` `.` API + the four helper primitives. Neutral interactive
// tokens (invalid-drop ring, drag-source fade, selected badge, body text) come
// from the consumer-authored `CANVAS_THEME`; the LED accent language is
// resolved locally so focus lights each pane in its own hue.

// Per-pane LED palette — the saturated indicator set from the reference panel,
// aligned to `CANVAS_TICKS`. Each pane is assigned one LED by its ordinal, so a
// tiled workspace reads as a row of distinct status lights. Full literal class
// strings so the runtime Tailwind pass resolves every hue.
interface CanvasLed {
  readonly bar: string;
  readonly litRing: string;
  readonly litText: string;
  readonly litGlow: string;
}

const CANVAS_LEDS: readonly CanvasLed[] = [
  {
    bar: "bg-pink-400",
    litRing: "ring-pink-400/60",
    litText: "text-pink-600",
    litGlow: "shadow-[0_0_5px_0_rgba(244,114,182,0.85)]",
  },
  {
    bar: "bg-orange-400",
    litRing: "ring-orange-400/60",
    litText: "text-orange-600",
    litGlow: "shadow-[0_0_5px_0_rgba(251,146,60,0.85)]",
  },
  {
    bar: "bg-amber-400",
    litRing: "ring-amber-400/60",
    litText: "text-amber-600",
    litGlow: "shadow-[0_0_5px_0_rgba(251,191,36,0.85)]",
  },
  {
    bar: "bg-emerald-400",
    litRing: "ring-emerald-400/60",
    litText: "text-emerald-600",
    litGlow: "shadow-[0_0_5px_0_rgba(52,211,153,0.85)]",
  },
  {
    bar: "bg-cyan-400",
    litRing: "ring-cyan-400/60",
    litText: "text-cyan-600",
    litGlow: "shadow-[0_0_5px_0_rgba(34,211,238,0.85)]",
  },
];

function paneLed(paneOrdinal: number): CanvasLed {
  const count: number = CANVAS_LEDS.length;
  const index: number = (((paneOrdinal - 1) % count) + count) % count;
  return CANVAS_LEDS[index] ?? CANVAS_LEDS[0];
}

// Drop-state rings — squared, hairline; cyan target aligns with the LED set,
// rose (from the theme) stays semantically distinct for an invalid drop.
const DROP_TARGET_RING: string = "ring-1 ring-inset ring-cyan-400/70";
const DROP_HOVER_RING: string = "ring-1 ring-inset ring-slate-400/60";
const DROP_ELIGIBLE_RING: string = "ring-1 ring-inset ring-dashed ring-slate-300";

function dropStateRing(args: TilingRenderTileProps): string {
  if (args.isInvalidDrop) {
    return CANVAS_THEME.paneShell.invalidDropRing;
  }
  if (args.isDropTarget) {
    return DROP_TARGET_RING;
  }
  if (args.isHoveringDropCandidate) {
    return DROP_HOVER_RING;
  }
  if (args.isDropEligible) {
    return DROP_ELIGIBLE_RING;
  }
  return "";
}

// The machined panel: squared right angles (1px hairline radius at most),
// hairline slate rim, flat neutral field, NO soft elevation. This flatness +
// the squared corners + the LED bands is what separates the Canvas silhouette
// from the rounded, softly-shadowed header-bar cards of Mosaic and Editorial.
const PANEL_SHELL: string =
  "relative flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[1px] border border-slate-300 bg-white outline-none transition-[border-color,box-shadow,opacity] duration-150";

// Header rail: a dense control-panel row resolved as a 3-column grid
// (LED + label | flex gap | index + controls). Squared, hairline, tight.
const HEADER_RAIL: string =
  "grid shrink-0 cursor-grab touch-none select-none grid-cols-[auto_1fr_auto] items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5 active:cursor-grabbing";

// A squared LED-keycap control (the Group action) in the instrument idiom.
const LED_KEYCAP: string =
  "flex h-[18px] shrink-0 items-center justify-center rounded-[1px] border border-slate-300 bg-white px-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.14em] text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-800";

// The two squared control keys on the header LEFT (fullscreen, then select).
// Their base color is ONE neutral slate shared by EVERY pane — deliberately not
// the per-pane LED hue — so the control row reads as consistent instrument keys
// across a tiled workspace. Outline at rest; filled slate when the key's state
// is active (maximized / selected).
const CONTROL_SQUARE: string =
  "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[1px] border font-mono text-[10px] leading-none transition-colors";
const CONTROL_SQUARE_REST: string =
  "border-slate-300 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-800";
const CONTROL_SQUARE_ACTIVE: string =
  "border-slate-700 bg-slate-700 text-white hover:border-slate-800";

// Body field — flat neutral panel; text tokens from the consumer theme.
const PANEL_BODY: string = CANVAS_THEME.paneShell.bodyText;

export function CanvasTile(args: TilingRenderTileProps): React.ReactElement {
  const led: CanvasLed = paneLed(args.paneOrdinal);
  const dropRing: string = dropStateRing(args);
  // Drop-state rings take precedence over the resting focus glow during a drag.
  const ring: string =
    dropRing !== ""
      ? dropRing
      : args.isFocused
        ? `ring-1 ring-inset ${led.litRing}`
        : "";
  const border: string = args.isMoveSource
    ? "border-dashed border-slate-400"
    : args.isFocused
      ? "border-slate-400"
      : "";
  const sourceFade: string = args.isDragSource
    ? CANVAS_THEME.paneShell.dragSourceOpacity
    : "";
  const index: string = String(args.paneOrdinal).padStart(2, "0");
  const metrics: CanvasPaneMetrics | null = canvasPaneMetrics(args.tile.id);
  // Whether either uniform-color control key renders (drives the divider that
  // separates the control cluster from the per-pane LED identity).
  const hasControls: boolean =
    args.isMaximizeEnabled || args.isMultiSelectGroupingEnabled;

  return (
    <TilingPaneRoot
      pane={args}
      className={`${PANEL_SHELL} ${border} ${ring} ${sourceFade}`}
    >
      <TilingDragHandle
        pane={args}
        className={`${HEADER_RAIL} ${
          args.isFocused ? "bg-white" : ""
        } ${
          args.isMultiSelected
            ? "outline-dashed outline-1 -outline-offset-2 outline-slate-400"
            : ""
        }`}
      >
        {/* Left: two uniform-color control keys (fullscreen · select) + a
            hairline rule + the per-pane status LED (lit on focus) + label. */}
        <span className="flex min-w-0 items-center gap-2.5 justify-self-start">
          {hasControls ? (
            <span className="flex shrink-0 items-center gap-1.5">
              {args.isMaximizeEnabled ? (
                <TilingPaneAction
                  onClick={(): void => args.onToggleMaximize()}
                  aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
                  aria-pressed={args.isMaximized}
                  title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
                  className={`${CONTROL_SQUARE} ${
                    args.isMaximized ? CONTROL_SQUARE_ACTIVE : CONTROL_SQUARE_REST
                  }`}
                >
                  <span aria-hidden>{args.isMaximized ? "\u2013" : "\u2922"}</span>
                </TilingPaneAction>
              ) : null}
              {args.isMultiSelectGroupingEnabled ? (
                <TilingPaneAction
                  onClick={(): void => args.onToggleMultiSelect()}
                  aria-label={
                    args.isMultiSelected
                      ? `deselect pane ${args.leafId}`
                      : `select pane ${args.leafId} for grouping`
                  }
                  aria-pressed={args.isMultiSelected}
                  title={
                    args.isMultiSelected
                      ? "selected — click to deselect (Alt/Opt+click also toggles)"
                      : "select for grouping"
                  }
                  className={`${CONTROL_SQUARE} ${
                    args.isMultiSelected
                      ? CONTROL_SQUARE_ACTIVE
                      : CONTROL_SQUARE_REST
                  }`}
                >
                  <span aria-hidden>{args.isMultiSelected ? "\u2713" : "\u25a1"}</span>
                </TilingPaneAction>
              ) : null}
            </span>
          ) : null}
          {hasControls ? (
            <span aria-hidden className="h-3 w-px shrink-0 bg-slate-200" />
          ) : null}
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-[1px] transition-all ${
              args.isFocused ? `${led.bar} ${led.litGlow}` : "bg-slate-300"
            }`}
          />
          <span aria-hidden className="h-3 w-px shrink-0 bg-slate-200" />
          <span
            className={`truncate font-mono text-[10px] font-medium uppercase tracking-[0.18em] ${
              args.isFocused ? "text-slate-800" : "text-slate-400"
            }`}
          >
            {args.tile.title}
          </span>
        </span>

        {/* Spacer column keeps the label left and the readout/controls right. */}
        <span aria-hidden />

        {/* Right: tabular index + transient move state + the Group action
            (only while a groupable multi-selection exists; the LEFT select key
            is the selection toggle that feeds it). */}
        <span className="flex shrink-0 items-center justify-end gap-2 justify-self-end">
          {args.isMoveSource ? (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-400">
              moving
            </span>
          ) : null}
          <span
            aria-hidden
            className={`shrink-0 font-mono text-[9px] tabular-nums tracking-[0.14em] ${
              args.isFocused ? led.litText : "text-slate-400"
            }`}
          >
            {index}
          </span>
          {args.isMultiSelected && args.canGroupMultiSelection ? (
            <TilingPaneAction
              onClick={(): void => args.onGroupMultiSelection(args.leafId)}
              aria-label={`group ${args.leafId} with the selected panes`}
              title="group selected panes into a tabbed group"
              className={LED_KEYCAP}
            >
              Group
            </TilingPaneAction>
          ) : null}
        </span>
      </TilingDragHandle>

      <TilingPaneBody pane={args} className={PANEL_BODY}>
        {args.tile.content}
      </TilingPaneBody>

      {/* Content-metrics footer: a subtle per-pane LED identity dot + the pane's
          real content metrics (chars · words · ~read-time), derived from the
          shared docs model. Squared, hairline, tabular mono. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-1">
        <span className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden
            className={`h-[3px] w-3.5 rounded-[1px] ${
              args.isFocused ? led.bar : "bg-slate-300"
            }`}
          />
          <span
            aria-hidden
            className="font-mono text-[9px] uppercase tabular-nums tracking-[0.16em] text-slate-400"
          >
            {index}
          </span>
        </span>
        {metrics != null ? (
          <span
            aria-label={`${metrics.chars.toLocaleString("en-US")} characters, ${metrics.words.toLocaleString(
              "en-US",
            )} words, about ${metrics.readMinutes} minute read`}
            className="flex min-w-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400"
          >
            <span className="shrink-0 tabular-nums">
              <span className="text-slate-600">
                {metrics.chars.toLocaleString("en-US")}
              </span>{" "}
              CH
            </span>
            <span aria-hidden className="h-2.5 w-px shrink-0 bg-slate-200" />
            <span className="shrink-0 tabular-nums">
              <span className="text-slate-600">
                {metrics.words.toLocaleString("en-US")}
              </span>{" "}
              W
            </span>
            <span aria-hidden className="h-2.5 w-px shrink-0 bg-slate-200" />
            <span className="shrink-0 tabular-nums text-slate-600">
              {"~"}
              {metrics.readMinutes} MIN
            </span>
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-300">
            no text metrics
          </span>
        )}
      </div>
    </TilingPaneRoot>
  );
}
