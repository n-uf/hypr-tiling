/**
 * Accent palette — the per-pane accent union's enumerable members, the raw
 * Tailwind hue atoms every theme composes from, and the `accentHue` resolver.
 *
 * Pure data + a pure lookup: no React, no DOM. Lives in the engine layer so the
 * `./engine` entry can expose `accentHue` without pulling the React theme
 * engine (`react/theme.tsx`, which owns `TilingThemeProvider` / `createContext`)
 * into a server / react-server bundle. The theme engine imports from here and
 * composes these atoms into the themed chrome.
 *
 * Every field is a literal Tailwind class so the JIT emits it regardless of
 * which theme is active at runtime (see `react/theme.tsx` for the rationale).
 */

import type { TilingTileAccent, TilingTileAccentSwatch } from "./types";


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
