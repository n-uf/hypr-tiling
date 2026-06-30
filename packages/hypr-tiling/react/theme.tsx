"use client";

import * as React from "react";

import { cn } from "./cn";
import type {
  TilingTileAccent,
  TilingTileAccentSwatch,
  TilingThemeId,
} from "../core/types";

/**
 * hypr-tiling theme engine.
 *
 * The renderer paints every visual surface from a single resolved
 * `TilingTheme` instead of inline Tailwind class strings. A theme is a typed
 * bundle of class-string tokens (one group per surface) plus a small set of
 * accent-composition resolvers that decide HOW a pane's per-pane accent
 * (`TilingTileAccent`) tints the themed chrome. Themes are pure data +
 * pure functions — no component owns visual constants anymore.
 *
 * Why class-token strings (not CSS variables): the renderer is class-driven
 * and Tailwind's JIT must statically see every utility. Every token is a
 * literal string declared in THIS library file, so the JIT emits all of them
 * for any consumer regardless of which theme is active at runtime. CSS
 * variables would move color decisions out of the type system and defeat the
 * closed-union exhaustiveness the rest of the renderer relies on.
 */

/**
 * `TilingThemeId` (the closed built-in-theme union) is defined in `./types` as
 * the central contract; re-exported here so theme consumers can import it
 * alongside the registry. Adding a member there forces `TILING_THEME_REGISTRY`
 * to cover it (the `Record` type fails to compile until the theme is filled in).
 */
export type { TilingThemeId };

/**
 * Per-accent HUE tokens — the raw color atoms a theme composes. Decoupled from
 * the previous bundled accent theme so a calm theme can borrow an accent's hue
 * (border/text/ring) WITHOUT inheriting its heavy neon glow, and a refined
 * theme can pick the softened glow. Every field is a literal Tailwind class so
 * the JIT emits it.
 */
export interface TilingAccentHue {
  /** Human-facing palette label (also the picker swatch label). */
  readonly label: string;
  /** Solid background for a palette swatch dot. */
  readonly swatch: string;
  /** Resting pane border tint (low alpha). */
  readonly surfaceBorder: string;
  /** Resting pane colored drop-shadow tint. */
  readonly surfaceShadow: string;
  /** Accent title / metadata text. */
  readonly text: string;
  /** Strong accent text used on active chips. */
  readonly textStrong: string;
  /** Focused-pane border color. */
  readonly focusBorder: string;
  /** Focused-pane focus-ring color. */
  readonly focusRing: string;
  /** Full-intensity neon focus glow (box-shadow). */
  readonly focusGlow: string;
  /** Dialed-back focus glow for refined / calm themes (box-shadow). */
  readonly focusGlowSoft: string;
  /** Active tab/switcher chip border. */
  readonly tabBorder: string;
  /** Active tab/switcher chip translucent fill. */
  readonly tabBg: string;
  /** Subtle active-tab fill for low-contrast themes. */
  readonly tabBgSoft: string;
}

/** Renderer-root + viewport surfaces. */
export interface TilingThemeRootTokens {
  /** Outer renderer container: bg/gradient, radius, padding, outline. */
  readonly container: string;
  /** Inner viewport (where the pane tree lays out): bg + radius. */
  readonly viewport: string;
}

/** Pane host shell surfaces + interaction-state rings. */
export interface TilingThemePaneShellTokens {
  /** Pane article shell: bg/gradient, radius, shadow/rim, backdrop-filter. */
  readonly surface: string;
  /** Pane body scroll region text color/leading. */
  readonly bodyText: string;
  /** Pane subtitle text color. */
  readonly subtitleText: string;
  /** Ring on an invalid drop target. */
  readonly invalidDropRing: string;
  /** Opacity applied to the drag-source pane while it is picked up. */
  readonly dragSourceOpacity: string;
}

/** Pane header chrome — resting + focused + the per-pane control buttons. */
export interface TilingThemePaneHeaderTokens {
  /** Resting header bar: border-b, bg, inset sheen. */
  readonly base: string;
  /** Additive classes when the pane is focused. */
  readonly focused: string;
  /** Pane title base typography (accent color applied separately). */
  readonly titleText: string;
  /** Resting header control button (maximize etc.). */
  readonly controlIdle: string;
  /** Active/pressed header control button. */
  readonly controlActive: string;
  /**
   * Additive header classes when the pane is part of the Alt/Opt+click
   * multi-selection set. Deliberately NEUTRAL (no accent) so it never collides
   * with the accent focus frame — multi-selection and focus are orthogonal
   * states a pane can hold simultaneously.
   */
  readonly selected: string;
  /**
   * The small neutral "selected" check affordance rendered in the header of a
   * multi-selected pane. Neutral tone, distinct from any accent control.
   */
  readonly selectedBadge: string;
}

/** Drag-ghost shell — the lifted, portaled copy of the dragged pane. */
export interface TilingThemeGhostTokens {
  /** Ghost article shell (a touch more opaque + deeper shadow than a pane). */
  readonly surface: string;
  /** Ghost header bar. */
  readonly header: string;
  /** Ghost body text color. */
  readonly bodyText: string;
  /** Ghost subtitle text color. */
  readonly subtitleText: string;
}

/** Split-divider / gap handle chrome across visible + hidden states. */
export interface TilingThemeDividerTokens {
  /** Structural base incl. focus-visible ring color. */
  readonly base: string;
  /** Visible + resizable handle (resting + hover). */
  readonly visibleInteractive: string;
  /** Visible but resize-disabled handle. */
  readonly visibleStatic: string;
  /** Hidden handle (no chrome, hit-area only). */
  readonly hidden: string;
}

/** Top-bar / tab-strip chrome. */
export interface TilingThemeTopBarTokens {
  /** Tab-strip container: border, bg, shadow, backdrop. */
  readonly container: string;
  /** Strip title text. */
  readonly titleText: string;
  /** Accent-picker group wrapper. */
  readonly pickerGroup: string;
  /** Switcher-control group wrapper (theme picker etc.). */
  readonly controlGroup: string;
  /** Tab chip base typography/layout. */
  readonly tabBase: string;
  /** Inactive tab chip. */
  readonly tabInactive: string;
  /** Centered pane-switcher overlay card. */
  readonly switcherCard: string;
  /** Switcher card when the pane is NOT selected. */
  readonly switcherCardInactive: string;
}

/**
 * A complete theme: the static surface token groups plus the accent-composition
 * resolvers. The resolvers are the contract for "how per-pane accents compose
 * with the theme" — each theme decides how much of an accent's hue/glow it
 * spends on the resting surface, title text, focus frame, and active tab.
 */
export interface TilingTheme {
  readonly id: TilingThemeId;
  readonly label: string;
  readonly root: TilingThemeRootTokens;
  readonly paneShell: TilingThemePaneShellTokens;
  readonly paneHeader: TilingThemePaneHeaderTokens;
  readonly ghost: TilingThemeGhostTokens;
  readonly divider: TilingThemeDividerTokens;
  readonly topBar: TilingThemeTopBarTokens;
  /** Resting pane accent composition (border tint + colored shadow). */
  readonly resolvePaneAccentSurface: (
    accent: TilingTileAccent | undefined,
  ) => string;
  /** Accent title-text color. */
  readonly resolveAccentText: (accent: TilingTileAccent | undefined) => string;
  /** Full focused-pane frame (structural border/ring + accent glow). */
  readonly resolveFocusFrame: (accent: TilingTileAccent | undefined) => string;
  /** Active tab / switcher / group-member chip. */
  readonly resolveTabActive: (accent: TilingTileAccent | undefined) => string;
}

/** First palette member — the fallback when a tile omits `accent`. */
export const DEFAULT_TILE_ACCENT: TilingTileAccent = "cyan";

/**
 * Ordered, enumerable accent palette — the generic capability a consumer
 * iterates to build an accent picker.
 */
export const TILING_TILE_ACCENTS: readonly TilingTileAccent[] = [
  "cyan",
  "sky",
  "violet",
  "indigo",
  "emerald",
  "amber",
  "rose",
  "pink",
];

/**
 * The hue atoms for every accent. Keyed by the closed `TilingTileAccent`
 * union so the compiler enforces full coverage. Theme-independent: themes
 * choose which atoms to apply.
 */
export const TILING_ACCENT_HUES: Record<TilingTileAccent, TilingAccentHue> = {
  cyan: {
    label: "cyan",
    swatch: "bg-cyan-400",
    surfaceBorder: "border-cyan-400/40",
    surfaceShadow: "shadow-cyan-500/15",
    text: "text-cyan-200",
    textStrong: "text-cyan-100",
    focusBorder: "border-cyan-200",
    focusRing: "ring-cyan-300",
    focusGlow:
      "shadow-[0_0_0_1px_rgba(165,243,252,0.9),0_0_28px_rgba(34,211,238,0.45)]",
    focusGlowSoft:
      "shadow-[0_0_0_1px_rgba(165,243,252,0.55),0_0_16px_rgba(34,211,238,0.24)]",
    tabBorder: "border-cyan-300/70",
    tabBg: "bg-cyan-500/20",
    tabBgSoft: "bg-cyan-500/10",
  },
  sky: {
    label: "sky",
    swatch: "bg-sky-400",
    surfaceBorder: "border-sky-400/40",
    surfaceShadow: "shadow-sky-500/15",
    text: "text-sky-200",
    textStrong: "text-sky-100",
    focusBorder: "border-sky-200",
    focusRing: "ring-sky-300",
    focusGlow:
      "shadow-[0_0_0_1px_rgba(186,230,253,0.9),0_0_28px_rgba(14,165,233,0.45)]",
    focusGlowSoft:
      "shadow-[0_0_0_1px_rgba(186,230,253,0.55),0_0_16px_rgba(14,165,233,0.24)]",
    tabBorder: "border-sky-300/70",
    tabBg: "bg-sky-500/20",
    tabBgSoft: "bg-sky-500/10",
  },
  violet: {
    label: "violet",
    swatch: "bg-violet-400",
    surfaceBorder: "border-violet-400/40",
    surfaceShadow: "shadow-violet-500/15",
    text: "text-violet-200",
    textStrong: "text-violet-100",
    focusBorder: "border-violet-200",
    focusRing: "ring-violet-300",
    focusGlow:
      "shadow-[0_0_0_1px_rgba(196,181,253,0.9),0_0_28px_rgba(139,92,246,0.45)]",
    focusGlowSoft:
      "shadow-[0_0_0_1px_rgba(196,181,253,0.55),0_0_16px_rgba(139,92,246,0.24)]",
    tabBorder: "border-violet-300/70",
    tabBg: "bg-violet-500/20",
    tabBgSoft: "bg-violet-500/10",
  },
  indigo: {
    label: "indigo",
    swatch: "bg-indigo-400",
    surfaceBorder: "border-indigo-400/40",
    surfaceShadow: "shadow-indigo-500/15",
    text: "text-indigo-200",
    textStrong: "text-indigo-100",
    focusBorder: "border-indigo-200",
    focusRing: "ring-indigo-300",
    focusGlow:
      "shadow-[0_0_0_1px_rgba(199,210,254,0.9),0_0_28px_rgba(99,102,241,0.45)]",
    focusGlowSoft:
      "shadow-[0_0_0_1px_rgba(199,210,254,0.55),0_0_16px_rgba(99,102,241,0.24)]",
    tabBorder: "border-indigo-300/70",
    tabBg: "bg-indigo-500/20",
    tabBgSoft: "bg-indigo-500/10",
  },
  emerald: {
    label: "emerald",
    swatch: "bg-emerald-400",
    surfaceBorder: "border-emerald-400/40",
    surfaceShadow: "shadow-emerald-500/15",
    text: "text-emerald-200",
    textStrong: "text-emerald-100",
    focusBorder: "border-emerald-200",
    focusRing: "ring-emerald-300",
    focusGlow:
      "shadow-[0_0_0_1px_rgba(167,243,208,0.9),0_0_28px_rgba(16,185,129,0.45)]",
    focusGlowSoft:
      "shadow-[0_0_0_1px_rgba(167,243,208,0.55),0_0_16px_rgba(16,185,129,0.24)]",
    tabBorder: "border-emerald-300/70",
    tabBg: "bg-emerald-500/20",
    tabBgSoft: "bg-emerald-500/10",
  },
  amber: {
    label: "amber",
    swatch: "bg-amber-400",
    surfaceBorder: "border-amber-400/40",
    surfaceShadow: "shadow-amber-500/15",
    text: "text-amber-200",
    textStrong: "text-amber-100",
    focusBorder: "border-amber-200",
    focusRing: "ring-amber-300",
    focusGlow:
      "shadow-[0_0_0_1px_rgba(253,230,138,0.9),0_0_28px_rgba(245,158,11,0.45)]",
    focusGlowSoft:
      "shadow-[0_0_0_1px_rgba(253,230,138,0.55),0_0_16px_rgba(245,158,11,0.24)]",
    tabBorder: "border-amber-300/70",
    tabBg: "bg-amber-500/20",
    tabBgSoft: "bg-amber-500/10",
  },
  rose: {
    label: "rose",
    swatch: "bg-rose-400",
    surfaceBorder: "border-rose-400/40",
    surfaceShadow: "shadow-rose-500/15",
    text: "text-rose-200",
    textStrong: "text-rose-100",
    focusBorder: "border-rose-200",
    focusRing: "ring-rose-300",
    focusGlow:
      "shadow-[0_0_0_1px_rgba(254,205,211,0.9),0_0_28px_rgba(244,63,94,0.45)]",
    focusGlowSoft:
      "shadow-[0_0_0_1px_rgba(254,205,211,0.55),0_0_16px_rgba(244,63,94,0.24)]",
    tabBorder: "border-rose-300/70",
    tabBg: "bg-rose-500/20",
    tabBgSoft: "bg-rose-500/10",
  },
  pink: {
    label: "pink",
    swatch: "bg-pink-400",
    surfaceBorder: "border-pink-400/40",
    surfaceShadow: "shadow-pink-500/15",
    text: "text-pink-200",
    textStrong: "text-pink-100",
    focusBorder: "border-pink-200",
    focusRing: "ring-pink-300",
    focusGlow:
      "shadow-[0_0_0_1px_rgba(251,207,232,0.9),0_0_28px_rgba(236,72,153,0.45)]",
    focusGlowSoft:
      "shadow-[0_0_0_1px_rgba(251,207,232,0.55),0_0_16px_rgba(236,72,153,0.24)]",
    tabBorder: "border-pink-300/70",
    tabBg: "bg-pink-500/20",
    tabBgSoft: "bg-pink-500/10",
  },
};

/** Picker-ready metadata (accent + label + swatch class) for every accent. */
export const TILING_TILE_ACCENT_SWATCHES: readonly TilingTileAccentSwatch[] =
  TILING_TILE_ACCENTS.map(
    (accent: TilingTileAccent): TilingTileAccentSwatch => ({
      accent,
      label: TILING_ACCENT_HUES[accent].label,
      swatchClassName: TILING_ACCENT_HUES[accent].swatch,
    }),
  );

/** Resolve an accent (or the default fallback) to its hue atoms. */
export function accentHue(accent: TilingTileAccent | undefined): TilingAccentHue {
  return TILING_ACCENT_HUES[accent ?? DEFAULT_TILE_ACCENT];
}

/** Per-pane drag-affordance state the pane shell composes ring chrome from. */
export interface PaneDropAffordanceFlags {
  /** This pane is a drop-eligible candidate (any pane but the drag source). */
  readonly isDropEligible: boolean;
  /** The pointer is currently over this pane (the hover-target). */
  readonly isHoveringDropCandidate: boolean;
  /** This pane is the resolved, committable drop target. */
  readonly isDropTarget: boolean;
  /** This pane is an invalid drop target (e.g. the same-tile self-drop). */
  readonly isInvalidDrop: boolean;
}

/**
 * The drop-affordance ring classes a pane shell wears during a drag.
 *
 * Per the focus-follows-dragged-pane rule: during a drag the SOLE affordance
 * belongs to the dragged pane (its ghost + the seat the ghost hops into, both
 * wearing the focus frame), and the destination is conveyed by that hop-in. So
 * no other pane is highlighted: `isDropEligible`, `isHoveringDropCandidate`, and
 * `isDropTarget` are accepted (the shell still computes them) but deliberately
 * paint nothing. The faint dashed eligibility hint that used to mark every
 * candidate re-introduced a focus-like highlight on other panes and was removed.
 *
 * Retained, because it never reuses the focus color: the rose INVALID-drop ring
 * (an error color, semantically distinct).
 */
export function resolvePaneDropAffordanceClasses(
  theme: TilingTheme,
  flags: PaneDropAffordanceFlags,
): string {
  return cn(flags.isInvalidDrop ? theme.paneShell.invalidDropRing : "");
}

/**
 * Built-in theme: NEON-TERMINAL — the neon-terminal direction, REFINED and
 * dialed back from the original heavy look. Calmer glass (blur `xl`→`md`,
 * saturate `150`→`125`; ghost `2xl`→`lg`), softer drop shadows, a lower-contrast
 * focus glow (`focusGlowSoft` + a single `ring-1` instead of `ring-2`), and more
 * disciplined accent use (resting panes wear only a faint accent border — the
 * colored shadow tint is dropped). Keeps the direction; makes it tasteful.
 * Default library theme.
 */
const NEON_TERMINAL_THEME: TilingTheme = {
  id: "neon-terminal",
  label: "neon terminal",
  root: {
    container:
      "flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl bg-[linear-gradient(180deg,rgba(39,39,42,0.36),rgba(15,15,18,0.66))] p-1 outline-none",
    viewport:
      "relative isolate min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg bg-slate-950/50",
  },
  paneShell: {
    surface:
      "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-[linear-gradient(155deg,rgba(48,53,66,0.55),rgba(12,14,19,0.66))] shadow-[0_12px_30px_-16px_rgba(2,6,23,0.6),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-md backdrop-saturate-[1.25]",
    bodyText:
      "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-1.5 font-mono text-[11px] leading-5 text-slate-200",
    subtitleText: "text-slate-400",
    invalidDropRing: "ring-2 ring-rose-300/60",
    dragSourceOpacity: "opacity-70",
  },
  paneHeader: {
    base: "flex min-h-[42px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-white/[0.04] px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    focused:
      "border-b-cyan-200/25 bg-cyan-500/[0.06] shadow-[inset_0_1px_0_rgba(56,189,248,0.10)]",
    titleText:
      "truncate font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
    controlIdle:
      "border-white/20 bg-slate-950/70 text-slate-300 hover:border-cyan-200/35 hover:bg-cyan-400/10 hover:text-cyan-50",
    controlActive:
      "border-cyan-100/60 bg-cyan-400/15 text-cyan-50 shadow-[0_0_8px_rgba(34,211,238,0.20)]",
    selected: "outline-dashed outline-1 -outline-offset-2 outline-slate-300/50",
    selectedBadge: "border border-slate-300/40 bg-slate-200/10 text-slate-200",
  },
  ghost: {
    surface:
      "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-[linear-gradient(155deg,rgba(52,57,71,0.80),rgba(13,15,21,0.88))] shadow-[0_20px_48px_-20px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.10),inset_0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-lg backdrop-saturate-[1.25]",
    header:
      "flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-white/[0.05] px-3 py-2",
    bodyText: "text-slate-300",
    subtitleText: "text-slate-500",
  },
  divider: {
    base: "shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
    visibleInteractive: "bg-white/10 hover:bg-cyan-300/30",
    visibleStatic: "bg-white/[0.04] cursor-default",
    hidden: "bg-transparent hover:bg-transparent",
  },
  topBar: {
    container:
      "flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-zinc-900/70 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_14px_rgba(0,0,0,0.30)] backdrop-blur",
    titleText:
      "flex shrink-0 items-center px-1 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-300",
    pickerGroup:
      "flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-zinc-950/60 px-1.5 py-1",
    controlGroup:
      "flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-zinc-950/60 px-1.5 py-1",
    tabBase:
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors",
    tabInactive:
      "border-white/15 bg-zinc-950/80 text-slate-300 hover:border-white/30 hover:text-slate-100",
    switcherCard:
      "pointer-events-auto max-w-[90%] rounded-2xl border border-white/15 bg-slate-950/85 px-4 py-3 shadow-[0_16px_44px_rgba(2,6,23,0.6)] backdrop-blur",
    switcherCardInactive: "border-white/10 bg-slate-950/80 text-slate-400",
  },
  // Disciplined accent use: a faint accent border at rest, no colored shadow tint.
  resolvePaneAccentSurface: (accent: TilingTileAccent | undefined): string =>
    accentHue(accent).surfaceBorder,
  resolveAccentText: (accent: TilingTileAccent | undefined): string =>
    accentHue(accent).text,
  // Lower-contrast focus frame: border-2 + single ring-1 + softened glow.
  resolveFocusFrame: (accent: TilingTileAccent | undefined): string => {
    const hue: TilingAccentHue = accentHue(accent);
    return cn(
      "border-2 ring-1 ring-offset-0",
      hue.focusBorder,
      hue.focusRing,
      hue.focusGlowSoft,
    );
  },
  resolveTabActive: (accent: TilingTileAccent | undefined): string => {
    const hue: TilingAccentHue = accentHue(accent);
    return cn(hue.tabBorder, hue.tabBg, hue.textStrong);
  },
};

/**
 * Built-in theme: CLEAN-FLAT. A calm, neutral, flat alternative — the opposite
 * of the heavy-neon look. No glass blur, restrained hairline borders, subtle
 * shadows, neutral slate surfaces. Accents are spent sparingly: resting panes
 * stay neutral (no colored border), and an accent only appears on the focus
 * frame (thin 1px ring, no glow), the active tab chip (soft tint), and the
 * title text. Quiet and professional.
 */
const CLEAN_FLAT_THEME: TilingTheme = {
  id: "clean-flat",
  label: "clean flat",
  root: {
    container:
      "flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg bg-slate-950 p-1 outline-none",
    viewport:
      "relative isolate min-h-0 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-900/60",
  },
  paneShell: {
    surface:
      "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-700/50 bg-slate-800/40 shadow-sm",
    bodyText:
      "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-1.5 font-mono text-[11px] leading-5 text-slate-300",
    subtitleText: "text-slate-500",
    invalidDropRing: "ring-2 ring-rose-400/60",
    dragSourceOpacity: "opacity-60",
  },
  paneHeader: {
    base: "flex min-h-[42px] shrink-0 items-center justify-between border-b border-slate-700/50 bg-slate-800/30 px-3 py-1.5",
    focused: "border-b-slate-400/40 bg-slate-700/30",
    titleText:
      "truncate font-mono text-[11px] font-semibold uppercase tracking-[0.12em]",
    controlIdle:
      "border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-500 hover:bg-slate-700/60 hover:text-slate-100",
    controlActive: "border-slate-400/60 bg-slate-600/40 text-slate-100",
    selected: "outline-dashed outline-1 -outline-offset-2 outline-slate-400/60",
    selectedBadge: "border border-slate-400/50 bg-slate-600/40 text-slate-100",
  },
  ghost: {
    surface:
      "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-600/60 bg-slate-800 shadow-lg",
    header:
      "flex shrink-0 items-center justify-between border-b border-slate-700/60 bg-slate-800/80 px-3 py-2",
    bodyText: "text-slate-300",
    subtitleText: "text-slate-500",
  },
  divider: {
    base: "shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60",
    visibleInteractive: "bg-slate-600/40 hover:bg-slate-400/60",
    visibleStatic: "bg-slate-700/30 cursor-default",
    hidden: "bg-transparent hover:bg-transparent",
  },
  topBar: {
    container:
      "flex shrink-0 items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-900 px-2 py-1.5",
    titleText:
      "flex shrink-0 items-center px-1 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400",
    pickerGroup:
      "flex shrink-0 items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/50 px-1.5 py-1",
    controlGroup:
      "flex shrink-0 items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/50 px-1.5 py-1",
    tabBase:
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors",
    tabInactive:
      "border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-slate-500 hover:text-slate-100",
    switcherCard:
      "pointer-events-auto max-w-[90%] rounded-lg border border-slate-700/60 bg-slate-900 px-4 py-3 shadow-lg",
    switcherCardInactive: "border-slate-700/60 bg-slate-800/40 text-slate-400",
  },
  // Resting panes stay neutral — accents are spent sparingly.
  resolvePaneAccentSurface: (): string => "",
  resolveAccentText: (accent: TilingTileAccent | undefined): string =>
    accentHue(accent).text,
  // Thin 1px accent border + 1px ring, no glow.
  resolveFocusFrame: (accent: TilingTileAccent | undefined): string => {
    const hue: TilingAccentHue = accentHue(accent);
    return cn("border ring-1 ring-offset-0", hue.focusBorder, hue.focusRing);
  },
  // Soft accent fill + accent text on the active chip.
  resolveTabActive: (accent: TilingTileAccent | undefined): string => {
    const hue: TilingAccentHue = accentHue(accent);
    return cn(hue.tabBorder, hue.tabBgSoft, hue.textStrong);
  },
};

/**
 * Built-in theme: MOSAIC — an editorial "technical atlas" aesthetic and the
 * deliberate counterpoint to both neon-terminal and clean-flat. Warm graphite
 * ink (no pure black, no glass blur), flat matte pane surfaces with hairline
 * rims, restrained moderate radii, and a single confident gold (amber) accent
 * spent only on interaction — resting panes stay monochrome; focus, active
 * tabs, dividers-on-hover, and drop targets all resolve to the SAME gold so the
 * identity reads as one coherent system rather than a rainbow. The root +
 * viewport are transparent on purpose so the embedding shell's blueprint-grid
 * canvas shows through the gutters. Distinctive, content-first, print-like.
 */
const MOSAIC_THEME: TilingTheme = {
  id: "mosaic",
  label: "mosaic",
  root: {
    container:
      "flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-none bg-transparent p-0 outline-none",
    viewport:
      "relative isolate min-h-0 min-w-0 flex-1 overflow-hidden bg-transparent",
  },
  paneShell: {
    surface:
      "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-white/[0.07] bg-[#121316] shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)]",
    bodyText:
      "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 text-[13px] leading-6 text-stone-300",
    subtitleText: "text-stone-500",
    invalidDropRing: "ring-2 ring-rose-300/55",
    dragSourceOpacity: "opacity-60",
  },
  paneHeader: {
    base: "flex min-h-[40px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-white/[0.015] px-3.5 py-2",
    focused: "border-b-amber-300/30 bg-amber-300/[0.04]",
    titleText:
      "truncate font-mono text-[11px] font-medium uppercase tracking-[0.18em]",
    controlIdle:
      "border-white/[0.12] bg-white/[0.03] text-stone-400 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-100",
    controlActive: "border-amber-200/55 bg-amber-300/15 text-amber-50",
    selected: "outline-dashed outline-1 -outline-offset-2 outline-stone-300/45",
    selectedBadge: "border border-stone-300/40 bg-stone-200/10 text-stone-200",
  },
  ghost: {
    surface:
      "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-amber-300/25 bg-[#16171b] shadow-[0_30px_70px_-22px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)]",
    header:
      "flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-white/[0.04] px-3.5 py-2",
    bodyText: "text-stone-300",
    subtitleText: "text-stone-500",
  },
  divider: {
    base: "shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber-300/55",
    visibleInteractive: "bg-white/[0.06] hover:bg-amber-300/45",
    visibleStatic: "bg-white/[0.04] cursor-default",
    hidden: "bg-transparent hover:bg-transparent",
  },
  topBar: {
    container:
      "flex shrink-0 items-center gap-2 rounded-lg border border-white/[0.07] bg-[#121316]/90 px-3 py-1.5 shadow-[0_14px_36px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur",
    titleText:
      "flex shrink-0 items-center px-1 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200/70",
    pickerGroup:
      "flex shrink-0 items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.02] px-1.5 py-1",
    controlGroup:
      "flex shrink-0 items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.02] px-1.5 py-1",
    tabBase:
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
    tabInactive:
      "border-white/[0.07] bg-white/[0.02] text-stone-400 hover:border-white/20 hover:text-stone-100",
    switcherCard:
      "pointer-events-auto max-w-[90%] rounded-lg border border-white/[0.10] bg-[#121316] px-5 py-4 shadow-[0_30px_70px_-24px_rgba(0,0,0,0.95)]",
    switcherCardInactive: "border-white/[0.07] bg-white/[0.02] text-stone-400",
  },
  // Monochrome at rest: no colored resting border. Identity is the single gold
  // accent, and it appears ONLY on interaction (focus / active tab) below.
  resolvePaneAccentSurface: (): string => "",
  resolveAccentText: (accent: TilingTileAccent | undefined): string =>
    accentHue(accent).text,
  // Unified gold focus frame regardless of the per-pane accent — one coherent
  // accent across the whole surface, hairline (no neon glow).
  resolveFocusFrame: (): string =>
    "border border-amber-300/45 ring-1 ring-amber-300/35 ring-offset-0",
  // Unified gold active tab/chip.
  resolveTabActive: (): string =>
    "border-amber-300/55 bg-amber-300/10 text-amber-100",
};

/**
 * Built-in theme registry, keyed by the closed `TilingThemeId` union. Adding a
 * member to `TilingThemeId` forces a new entry here (the `Record` fails to
 * compile until filled in).
 */
export const TILING_THEME_REGISTRY: Record<TilingThemeId, TilingTheme> = {
  "neon-terminal": NEON_TERMINAL_THEME,
  "clean-flat": CLEAN_FLAT_THEME,
  mosaic: MOSAIC_THEME,
};

/** Default library theme id (preserves the prior look at the round-1 checkpoint). */
export const DEFAULT_TILING_THEME_ID: TilingThemeId = "neon-terminal";

/** Ordered, enumerable theme list — the generic capability a theme switcher iterates. */
export const TILING_THEMES: readonly TilingTheme[] = [
  TILING_THEME_REGISTRY["neon-terminal"],
  TILING_THEME_REGISTRY["clean-flat"],
  TILING_THEME_REGISTRY["mosaic"],
];

/** Resolve a theme id (or the default) to its `TilingTheme`. */
export function resolveTilingTheme(
  themeId: TilingThemeId | undefined,
): TilingTheme {
  return TILING_THEME_REGISTRY[themeId ?? DEFAULT_TILING_THEME_ID];
}

const TilingThemeContext: React.Context<TilingTheme> =
  React.createContext<TilingTheme>(
    TILING_THEME_REGISTRY[DEFAULT_TILING_THEME_ID],
  );

/** Provides the active theme to every renderer subcomponent. */
export function TilingThemeProvider({
  theme,
  children,
}: {
  theme: TilingTheme;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <TilingThemeContext.Provider value={theme}>
      {children}
    </TilingThemeContext.Provider>
  );
}

/** Reads the active theme from context (defaults to the library default). */
export function useTilingTheme(): TilingTheme {
  return React.useContext(TilingThemeContext);
}
