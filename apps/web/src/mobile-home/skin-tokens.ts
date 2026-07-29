import type { HomeSkin } from "../page";

// Per-skin chrome tokens for the mobile home concepts. The mobile vocabulary is
// deliberately NOT the desktop card vocabulary: think a tiling-WM status bar —
// thin strips, hairlines, and a single overflow menu, never padded marketing
// panels. Every mode keeps chrome to one thin top row (~44px) plus, at most, one
// hairline strip, so the CONTENT owns the viewport. Accent colors still track
// the active skin (Mosaic amber, Editorial ink, Canvas cyan) so the mobile
// presentation reads as the SAME site, just compacted.
export interface MobileHomeSkinTokens {
  /** The one-row top chrome strip shell (wordmark + mode segments + skin menu). */
  readonly topStrip: string;
  /** The tiny "hypr" wordmark inside the top strip. */
  readonly wordmark: string;
  /** The "skin ▾" overflow menu button in the top strip. */
  readonly menuButton: string;
  /** The floating skin-menu panel (absolute dropdown under the button). */
  readonly menuPanel: string;
  /** A skin-menu row at rest. */
  readonly menuItem: string;
  /** The skin-menu row for the currently-active skin. */
  readonly menuItemActive: string;
  /** A compact TEXT-ONLY segmented-control group (the mode row: Master/Swipe/Grid). */
  readonly switcherGroup: string;
  /** The segmented-control's active segment. */
  readonly switcherActive: string;
  /** The segmented-control's inactive segment. */
  readonly switcherInactive: string;
  /** The hairline divider between adjacent segments (all but the last). */
  readonly switcherDivider: string;
  /** A thin hairline strip overlaid below content (Swipe's dots/counter/overview row). */
  readonly bottomStrip: string;
  /** A small text button inside the bottom strip (Overview / Focus toggle). */
  readonly overviewButton: string;
  /** A swipe-mode pane dot at rest. */
  readonly dot: string;
  /** The active swipe-mode pane dot. */
  readonly dotActive: string;
  /** A small "NN / NN" tabular-nums readout (swipe pane counter). */
  readonly counterText: string;
  /** A Master-mode stack-rail chip (single-row: ordinal + title) at rest. */
  readonly chip: string;
  /** A Master-mode stack-rail chip that currently holds focus. */
  readonly chipFocused: string;
  /** A Pocket-Grid schematic leaf rectangle at rest. */
  readonly schematicRect: string;
  /** The open Pocket-Grid schematic leaf rectangle. */
  readonly schematicRectActive: string;
  /** The Pocket-Grid schematic's outer shell (border/bg) — fills its resizable map tile. */
  readonly schematicShell: string;
}

export const MOBILE_HOME_SKIN_TOKENS: Record<HomeSkin, MobileHomeSkinTokens> = {
  mosaic: {
    topStrip:
      "relative z-30 flex h-11 shrink-0 items-center gap-2 rounded-md border border-white/[0.06] bg-[#121316]/85 px-2 backdrop-blur",
    wordmark:
      "shrink-0 px-1 font-mono text-[11px] font-semibold lowercase tracking-[0.24em] text-amber-200/70",
    menuButton:
      "flex h-8 shrink-0 items-center gap-1 rounded-[4px] border border-white/[0.08] bg-white/[0.015] px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-stone-300 transition-colors hover:border-amber-300/40 hover:text-amber-100",
    menuPanel:
      "absolute right-0 top-[calc(100%+5px)] z-50 flex min-w-[132px] flex-col gap-0.5 overflow-hidden rounded-[5px] border border-white/[0.1] bg-[#16171a] p-1 shadow-[0_22px_46px_-24px_rgba(0,0,0,0.95)] backdrop-blur",
    menuItem:
      "flex items-center justify-between gap-3 rounded-[3px] px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-stone-300 transition-colors hover:bg-white/[0.05] hover:text-stone-100",
    menuItemActive:
      "flex items-center justify-between gap-3 rounded-[3px] bg-amber-300/[0.12] px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-amber-100",
    switcherGroup:
      "flex h-8 min-w-0 items-stretch overflow-hidden rounded-[4px] border border-white/[0.08] bg-white/[0.015] font-mono text-[10px] uppercase tracking-[0.1em]",
    switcherActive:
      "flex items-center justify-center bg-amber-300/15 text-amber-100 transition-colors",
    switcherInactive:
      "flex items-center justify-center text-stone-400 transition-colors hover:bg-white/[0.04] hover:text-stone-200",
    switcherDivider: "border-r border-white/[0.06]",
    bottomStrip:
      "flex h-9 shrink-0 items-center gap-3 rounded-md border border-white/[0.06] bg-[#121316]/70 px-2.5 backdrop-blur",
    overviewButton:
      "flex h-7 shrink-0 items-center justify-center rounded-[3px] border border-white/[0.12] bg-white/[0.02] px-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-300 transition-colors hover:border-amber-300/45 hover:text-amber-100",
    dot: "bg-white/25",
    dotActive: "bg-amber-300",
    counterText: "shrink-0 font-mono text-[10px] tabular-nums text-stone-500",
    chip: "flex h-full min-w-[52px] items-center justify-center gap-1.5 rounded-[3px] border border-white/[0.08] bg-white/[0.02] px-2 font-mono text-[9px] uppercase tracking-[0.06em] text-stone-300 transition-colors",
    chipFocused:
      "flex h-full min-w-[52px] items-center justify-center gap-1.5 rounded-[3px] border border-amber-300/55 bg-amber-300/[0.08] px-2 font-mono text-[9px] uppercase tracking-[0.06em] text-amber-100 transition-colors",
    schematicRect:
      "border border-white/[0.12] bg-white/[0.03] text-stone-400 hover:border-white/25",
    schematicRectActive:
      "border border-amber-300/65 bg-amber-300/[0.12] text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]",
    schematicShell: "border-white/[0.08] bg-[#101114]/70",
  },
  editorial: {
    topStrip:
      "relative z-30 flex h-11 shrink-0 items-center gap-2 rounded-[4px] border border-[#e2dac6] bg-[#fbf9f2] px-2",
    wordmark:
      "shrink-0 px-1 font-display text-[13px] tracking-[0.02em] text-[#241f17]",
    menuButton:
      "flex h-8 shrink-0 items-center gap-1 rounded-[3px] border border-[#ddd4bf] bg-[#fbf9f2] px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#6b6250] transition-colors hover:border-[#241f17] hover:text-[#241f17]",
    menuPanel:
      "absolute right-0 top-[calc(100%+5px)] z-50 flex min-w-[132px] flex-col gap-0.5 overflow-hidden rounded-[4px] border border-[#d8cfb6] bg-[#fbf9f2] p-1 shadow-[0_18px_38px_-24px_rgba(36,31,23,0.5)]",
    menuItem:
      "flex items-center justify-between gap-3 rounded-[2px] px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-[#6b6250] transition-colors hover:bg-[#efe8d6] hover:text-[#241f17]",
    menuItemActive:
      "flex items-center justify-between gap-3 rounded-[2px] bg-[#241f17] px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-[#fbf9f2]",
    switcherGroup:
      "flex h-8 min-w-0 items-stretch overflow-hidden rounded-[3px] border border-[#ddd4bf] bg-[#fbf9f2] font-mono text-[10px] uppercase tracking-[0.1em]",
    switcherActive:
      "flex items-center justify-center bg-[#241f17] text-[#fbf9f2] transition-colors",
    switcherInactive:
      "flex items-center justify-center text-[#9c8f77] transition-colors hover:bg-[#f4eedb] hover:text-[#241f17]",
    switcherDivider: "border-r border-[#ddd4bf]",
    bottomStrip:
      "flex h-9 shrink-0 items-center gap-3 rounded-[4px] border border-[#e2dac6] bg-[#fbf9f2] px-2.5",
    overviewButton:
      "flex h-7 shrink-0 items-center justify-center rounded-[3px] border border-[#c9bd9f] bg-transparent px-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#6b6250] transition-colors hover:border-[#241f17] hover:text-[#241f17]",
    dot: "bg-[#d7ccb2]",
    dotActive: "bg-[#241f17]",
    counterText: "shrink-0 font-mono text-[10px] tabular-nums text-[#a89c83]",
    chip: "flex h-full min-w-[52px] items-center justify-center gap-1.5 rounded-[2px] border border-[#ddd4bf] bg-[#efe8d6] px-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[#6b6250] transition-colors",
    chipFocused:
      "flex h-full min-w-[52px] items-center justify-center gap-1.5 rounded-[2px] border border-[#241f17]/55 bg-[#f4eedb] px-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[#241f17] transition-colors",
    schematicRect:
      "border border-[#ddd4bf] bg-[#efe8d6] text-[#8c8069] hover:border-[#c9bd9f]",
    schematicRectActive:
      "border border-[#241f17]/65 bg-[#f4eedb] text-[#241f17] shadow-[0_0_0_1px_rgba(36,31,23,0.08)]",
    schematicShell: "border-[#e2dac6] bg-[#f4eedb]",
  },
  canvas: {
    topStrip:
      "relative z-30 flex h-11 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-2 backdrop-blur",
    wordmark:
      "shrink-0 px-1 font-mono text-[11px] font-semibold lowercase tracking-[0.24em] text-slate-500",
    menuButton:
      "flex h-8 shrink-0 items-center gap-1 rounded-[4px] border border-slate-200 bg-slate-50 px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900",
    menuPanel:
      "absolute right-0 top-[calc(100%+5px)] z-50 flex min-w-[132px] flex-col gap-0.5 overflow-hidden rounded-[5px] border border-slate-200 bg-white p-1 shadow-[0_18px_38px_-24px_rgba(15,23,42,0.35)]",
    menuItem:
      "flex items-center justify-between gap-3 rounded-[3px] px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
    menuItemActive:
      "flex items-center justify-between gap-3 rounded-[3px] bg-cyan-50 px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-700",
    switcherGroup:
      "flex h-8 min-w-0 items-stretch overflow-hidden rounded-md border border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[0.1em]",
    switcherActive:
      "flex items-center justify-center bg-white text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.06)] transition-colors",
    switcherInactive:
      "flex items-center justify-center text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-700",
    switcherDivider: "border-r border-slate-200",
    bottomStrip:
      "flex h-9 shrink-0 items-center gap-3 rounded-md border border-slate-200 bg-white/90 px-2.5 backdrop-blur",
    overviewButton:
      "flex h-7 shrink-0 items-center justify-center rounded-[3px] border border-slate-200 bg-slate-50 px-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900",
    dot: "bg-slate-300",
    dotActive: "bg-cyan-500",
    counterText: "shrink-0 font-mono text-[10px] tabular-nums text-slate-400",
    chip: "flex h-full min-w-[52px] items-center justify-center gap-1.5 rounded-[3px] border border-slate-200 bg-slate-50 px-2 font-mono text-[9px] uppercase tracking-[0.06em] text-slate-600 transition-colors",
    chipFocused:
      "flex h-full min-w-[52px] items-center justify-center gap-1.5 rounded-[3px] border border-cyan-300 bg-cyan-50 px-2 font-mono text-[9px] uppercase tracking-[0.06em] text-cyan-700 transition-colors",
    schematicRect:
      "border border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300",
    schematicRectActive:
      "border border-cyan-300 bg-cyan-50 text-cyan-700 shadow-[0_0_0_1px_rgba(6,182,212,0.12)]",
    schematicShell: "border-slate-200 bg-white",
  },
};
