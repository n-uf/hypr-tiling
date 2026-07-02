import {
  DEFAULT_TILE_ACCENT,
  TILING_ACCENT_HUES,
  type TilingAccentHue,
  type TilingTheme,
  type TilingTileAccent,
} from "@n-uf/hypr-tiling";

// The CANVAS skin's theme — a light greyish "document desk" built as a genuine
// `TilingTheme` through the public theming API (the `TilingTheme` type + the
// `TILING_ACCENT_HUES` atom registry). It is the deliberate third pole between
// the dark Mosaic atlas and the warm Editorial folio: soft grey surfaces, quiet
// neutral typography, hairline low-contrast borders, and — as the ONLY saturated
// color — a small tick in each pane's accent hue plus the signature multi-color
// tick row (pink · orange · yellow · green · cyan).
//
// Library boundary (no library change): `TilingTheme.id` is the closed
// `TilingThemeId` union (`neon-terminal | clean-flat | mosaic`), so a bespoke
// "canvas" id cannot be minted without editing the library. The renderer also
// resolves its OWN internal surfaces (root/viewport/divider/ghost) from the
// `themeId` prop, overriding any outer `TilingThemeProvider`. So this theme is
// authored for and consumed by the CONSUMER surfaces — the Canvas pane chrome,
// content, and top bar import `CANVAS_THEME` directly. `id` is set to the
// neutral `clean-flat` member purely to satisfy the union; it drives nothing.

/** Resolve an accent (or the default) to its public hue atoms. */
function accentHue(accent: TilingTileAccent | undefined): TilingAccentHue {
  return TILING_ACCENT_HUES[accent ?? DEFAULT_TILE_ACCENT];
}

// The signature Canvas accent row — the row of colored ticks from the reference
// workspace. The ONLY place saturated color appears at any size; used sparingly
// as a document-desk accent mark (status bar, section rules).
export const CANVAS_TICKS: readonly string[] = [
  "bg-pink-400",
  "bg-orange-400",
  "bg-amber-400",
  "bg-emerald-400",
  "bg-cyan-400",
];

/**
 * A pane's accent hue as a solid tick swatch (e.g. `bg-cyan-400`) — the Canvas
 * "accent language" applied to pane chrome: each pane wears a small tick in its
 * own accent instead of Mosaic's colored borders or Editorial's ink rules.
 */
export function canvasAccentTick(accent: TilingTileAccent | undefined): string {
  return accentHue(accent).swatch;
}

export const CANVAS_THEME: TilingTheme = {
  // See the library-boundary note above: `clean-flat` is a placeholder for the
  // closed union; the Canvas look lives entirely in the tokens below.
  id: "clean-flat",
  label: "canvas",
  root: {
    container:
      "flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-none bg-transparent p-0 outline-none",
    viewport:
      "relative isolate min-h-0 min-w-0 flex-1 overflow-hidden bg-transparent",
  },
  paneShell: {
    surface:
      "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-24px_rgba(15,23,42,0.35)]",
    bodyText:
      "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 text-[13px] leading-[1.7] text-slate-600",
    subtitleText: "text-slate-400",
    invalidDropRing: "ring-2 ring-rose-300/70",
    dragSourceOpacity: "opacity-60",
  },
  paneHeader: {
    base: "flex min-h-[40px] shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-2.5",
    focused: "border-b-slate-200 bg-white",
    titleText:
      "truncate font-mono text-[10px] font-medium uppercase tracking-[0.18em]",
    controlIdle:
      "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
    controlActive: "border-cyan-300 bg-cyan-50 text-cyan-700",
    selected: "outline-dashed outline-1 -outline-offset-2 outline-slate-300",
    selectedBadge: "border border-slate-300 bg-white text-slate-600",
  },
  ghost: {
    surface:
      "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.5)]",
    header:
      "flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5",
    bodyText: "text-slate-600",
    subtitleText: "text-slate-400",
  },
  divider: {
    base: "shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
    visibleInteractive: "bg-slate-200 hover:bg-cyan-300",
    visibleStatic: "bg-slate-100 cursor-default",
    hidden: "bg-transparent hover:bg-transparent",
  },
  topBar: {
    container:
      "flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur",
    titleText:
      "flex shrink-0 items-center px-1 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500",
    pickerGroup:
      "flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1",
    controlGroup:
      "flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1",
    tabBase:
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
    tabInactive:
      "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800",
    switcherCard:
      "pointer-events-auto max-w-[90%] rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.5)]",
    switcherCardInactive: "border-slate-200 bg-slate-50 text-slate-500",
  },
  // Resting panes stay neutral — the only accent is the per-pane tick in chrome.
  resolvePaneAccentSurface: (): string => "",
  // Titles are quiet neutral ink; the accent is expressed as a tick, not text.
  resolveAccentText: (): string => "text-slate-600",
  // Calm focus: a hairline slate border + a single 1px ring in the pane's accent
  // hue (the solid `focusRing` atom reads well on the light canvas).
  resolveFocusFrame: (accent: TilingTileAccent | undefined): string =>
    `border border-slate-300 ring-1 ring-offset-0 ${accentHue(accent).focusRing}`,
  // Active chip: a soft cyan primary — the workspace's one interactive accent.
  resolveTabActive: (): string => "border-cyan-300 bg-cyan-50 text-cyan-700",
};
