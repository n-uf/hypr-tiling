import * as React from "react";
import {
  TilingPaneRoot,
  TilingDragHandle,
  TilingPaneAction,
  TilingPaneBody,
  type TilingCommand,
  type TilingGroupNode,
  type TilingRenderTileProps,
  type TilingTile,
} from "@n-uf/hypr-tiling";
import { CANVAS_THEME } from "./canvas-theme";
import { paneContentMetrics, type PaneContentMetrics } from "./pane-metrics";
import {
  groupCommands,
  groupMemberViews,
  resolveActiveGroup,
  type GroupMemberView,
  type HomeTileProps,
} from "./group-switcher";

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
//   1. HEADER RAIL — a compact control-panel row. On the LEFT, a SINGLE squared
//      control cluster of two instrument keys (fullscreen/maximize, then
//      select-for-grouping) — squared right angles (engineering, not round
//      macOS discs), SOLID saturated hue fills with a soft hue glow at rest and
//      DEEPENED to a brighter, wider glow when the key's state is active
//      (maximized / selected). Their colors are
//      semantically mapped: emerald (go/activate) for maximize, sky (selection
//      blue) for select-for-grouping. Then a hairline column rule and a short
//      monospace label — the header carries NO second square block (the per-pane
//      status LED lives in the footer, not the header). On the RIGHT, a tabular
//      pane index and — only while a groupable multi-selection exists — the
//      squared LED-keycap Group action. This is the drag surface and owns the
//      Alt/Opt+click multi-select toggle via `TilingDragHandle`.
//   2. BODY — a flat neutral panel field (no card rounding, no shadow) that
//      renders `tile.content` through `TilingPaneBody` so the drag ghost reuses
//      the same render path.
//   3. CONTENT-METRICS FOOTER — a thin hairline readout carrying a subtle
//      per-pane LED identity dot plus the pane's real content metrics (char
//      count · word count · ~read-time), derived from the shared `./docs`
//      model via the skin-neutral `paneContentMetrics` helper, in tabular mono
//      figures. All three skins render this same metric payload, each in its own
//      footer style.
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

// The two squared control keys on the header LEFT (fullscreen · select) — the
// pane's SINGLE squared control cluster (the macOS titlebar analog, but squared
// for the engineering aesthetic, not round). This is the header's only block of
// squares: the standalone per-pane status LED has been dropped from the header
// so there is no second square block — the LED-color identity now lives solely
// in the footer LED-identity dot and the footer group LEDs.
//
// Both keys wear the SOLID saturated-hue chip treatment (the look the reference
// footer LED reads best in): a squared chip filled with its FULL saturated hue
// at all times — never a translucent/outline wash — with a soft hue glow, so it
// reads as a lit indicator, not a hollow toggle. Rest and active stay distinct
// by intensity, not by fill vs no-fill: at REST the chip is solid but slightly
// CALMER (emerald/sky-400 fill, gentler glow); when the key's state is ACTIVE
// (maximized / selected) the same chip DEEPENS to the -500 hue with a brighter,
// wider glow. Colors are semantically mapped, not arbitrary: maximize is EMERALD
// (a go/expand "activate" green that echoes the reference LED glow),
// select-for-grouping is SKY (the conventional selection blue), so the two
// controls read as purposeful rather than a random palette pair. The tiny glyph
// stays hidden on the solid field at rest and reveals (white) on hover or when
// active, mirroring the macOS "glyphs appear on hover" idiom.
const CONTROL_SQUARE_BASE: string =
  "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[1px] border font-mono text-[8px] leading-none transition-all";
const MAXIMIZE_LIGHT_REST: string =
  "border-emerald-500 bg-emerald-400 text-transparent shadow-[0_0_5px_0_rgba(52,211,153,0.6)] hover:bg-emerald-500 hover:text-white hover:shadow-[0_0_7px_0_rgba(52,211,153,0.85)]";
const MAXIMIZE_LIGHT_ACTIVE: string =
  "border-emerald-600 bg-emerald-500 text-white shadow-[0_0_8px_1px_rgba(52,211,153,0.95)]";
const SELECT_LIGHT_REST: string =
  "border-sky-500 bg-sky-400 text-transparent shadow-[0_0_5px_0_rgba(56,189,248,0.6)] hover:bg-sky-500 hover:text-white hover:shadow-[0_0_7px_0_rgba(56,189,248,0.85)]";
const SELECT_LIGHT_ACTIVE: string =
  "border-sky-600 bg-sky-500 text-white shadow-[0_0_8px_1px_rgba(56,189,248,0.95)]";

// Body field — flat neutral panel; text tokens from the consumer theme.
const PANEL_BODY: string = CANVAS_THEME.paneShell.bodyText;

// The Canvas grouped-stack representation: a row of squared LEDs in the pane
// FOOTER, one per group member, with the active member's LED lit in its hue +
// glow (the rest dim slate). Click an LED → `group-tab-jump` activates that
// member; hover a member LED → a small squared "×" reveals to eject it
// (`remove-from-group`); a trailing "ungroup" key dissolves the whole group
// (`ungroup`). All three route through the SAME `TilingCommandHandle.dispatch`
// the shortcut bar uses (passed down as `dispatch`); no public API is added.
// This replaces the library's suppressed default group tab strip for the Canvas
// skin. Only renders for a group's active member (the one pane that renders).
function CanvasGroupLeds({
  group,
  tilesById,
  dispatch,
}: {
  group: TilingGroupNode;
  tilesById: ReadonlyMap<string, TilingTile>;
  dispatch: (command: TilingCommand) => void;
}): React.ReactElement {
  const members: ReadonlyArray<GroupMemberView> = groupMemberViews(
    group,
    tilesById,
  );
  const commands = groupCommands(group.id);
  return (
    <span className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden">
      <span
        aria-hidden
        className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400"
      >
        grp
      </span>
      <span className="flex shrink items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {members.map((member: GroupMemberView): React.ReactElement => {
          const memberLed: CanvasLed = paneLed(member.memberNumber);
          return (
            <span
              key={member.memberId}
              className="group/led relative flex shrink-0 items-center"
            >
              <TilingPaneAction
                onClick={(): void => dispatch(commands.jump(member.memberNumber))}
                aria-label={`activate ${member.title}`}
                aria-pressed={member.isActive}
                title={member.title}
                className={`h-3 w-3 rounded-[1px] border transition-all ${
                  member.isActive
                    ? `border-transparent ${memberLed.bar} ${memberLed.litGlow}`
                    : "border-slate-300 bg-slate-200 hover:bg-slate-300"
                }`}
              />
              <TilingPaneAction
                onClick={(): void => dispatch(commands.remove(member.memberId))}
                aria-label={`remove ${member.title} from group`}
                title={`remove ${member.title} from group`}
                className="absolute -right-1.5 -top-1.5 hidden h-3 w-3 items-center justify-center rounded-[1px] border border-slate-300 bg-white font-mono text-[9px] leading-none text-slate-500 transition-colors hover:border-rose-400 hover:text-rose-500 group-hover/led:flex"
              >
                <span aria-hidden>{"\u00d7"}</span>
              </TilingPaneAction>
            </span>
          );
        })}
      </span>
      <TilingPaneAction
        onClick={(): void => dispatch(commands.ungroup())}
        aria-label={`ungroup ${group.id}`}
        title="ungroup this stack"
        className="shrink-0 rounded-[1px] border border-slate-300 bg-white px-1 py-0.5 font-mono text-[8px] uppercase leading-none tracking-[0.14em] text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-800"
      >
        ungroup
      </TilingPaneAction>
    </span>
  );
}

export function CanvasTile(args: HomeTileProps): React.ReactElement {
  const led: CanvasLed = paneLed(args.paneOrdinal);
  const group: TilingGroupNode | null = resolveActiveGroup(
    args.layout,
    args.leafId,
  );
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
  const metrics: PaneContentMetrics | null = paneContentMetrics(args.tile.id);
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
        {/* Left: the SINGLE squared control cluster (fullscreen · select) + a
            hairline rule + label. The header carries no second square block —
            the per-pane LED-color identity lives in the footer, not here. */}
        <span className="flex min-w-0 items-center gap-2.5 justify-self-start">
          {hasControls ? (
            <span className="flex shrink-0 items-center gap-1">
              {args.isMaximizeEnabled ? (
                <TilingPaneAction
                  onClick={(): void => args.onToggleMaximize()}
                  aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
                  aria-pressed={args.isMaximized}
                  title={args.isMaximized ? "restore pane (Esc)" : "maximize pane"}
                  className={`${CONTROL_SQUARE_BASE} ${
                    args.isMaximized ? MAXIMIZE_LIGHT_ACTIVE : MAXIMIZE_LIGHT_REST
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
                  className={`${CONTROL_SQUARE_BASE} ${
                    args.isMultiSelected
                      ? SELECT_LIGHT_ACTIVE
                      : SELECT_LIGHT_REST
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
        {group != null ? (
          <CanvasGroupLeds
            group={group}
            tilesById={args.tilesById}
            dispatch={args.dispatch}
          />
        ) : null}
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
