"use client";

import * as React from "react";

import { cn } from "./cn";
import {
  DEFAULT_TILE_ACCENT,
  accentHue,
  type TilingAccentHue,
} from "../engine/accent-hues";
import type {
  TilingGhostChipContext,
  TilingTileAccent,
  TilingThemeId,
} from "../engine/types";
import {
  DEFAULT_WORKSPACE_TRANSITION_DURATION_MS,
  DEFAULT_WORKSPACE_TRANSITION_EASING,
} from "../engine/workspace-transition";

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
 *
 * That JIT constraint is independent of where the drag ghost mounts. Host
 * CSS that scopes tokens via CSS variables, `data-theme`, or a scoped
 * `dark` class must redirect the overlay portal container
 * (`TilingRendererProps.overlayPortalContainer`) so those inherited values
 * reach the ghost / cursor / cancel overlays. Default remains
 * `document.body`.
 */

/**
 * `TilingThemeId` (the closed built-in-theme union) is defined in `./types` as
 * the central contract; re-exported here so theme consumers can import it
 * alongside the registry. Adding a member there forces `TILING_THEME_REGISTRY`
 * to cover it (the `Record` type fails to compile until the theme is filled in).
 */
export type { TilingThemeId };

/**
 * Renderer-root + viewport surfaces.
 *
 * Gap flanks (divider margins / static spacers) and rounded-pane corner
 * gutters show whatever paints here. Prefer `bg-transparent` so the host
 * chrome shows through; set an opaque bg only when the tiling surface is a
 * self-contained canvas (neon-terminal). Consumers can override via the
 * `theme` prop without forking the library.
 */
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

/**
 * Drag-state chrome — how the rearrange drag LOOKS around the pane shell: the
 * ghost wrapper's elevation delta, the content-less seat the ghost hops into,
 * the picked-up source pane's dimming, the drop-target highlight, and the
 * pointer-pinned drag-cursor badge. Every renderer-painted drag surface reads
 * these tokens (never an inline class string), so a host can make the drag
 * state read exactly like its at-rest pane — square, flat, hairline — without
 * CSS overrides against `[data-drag-ghost]` / `[data-drag-source-reservation]`.
 *
 * `TilingTheme.dragChrome` is OPTIONAL and PARTIAL: `resolveDragChrome(theme)`
 * fills every omitted token from a pane-shell-inheriting default derived from
 * the theme itself (the seat wears `paneShell.surface`, the seat frame reuses
 * `resolveFocusFrame`, the ghost carries a small neutral elevation/opacity
 * delta). A theme that passes nothing therefore drags with its own resting
 * chrome; the built-in neon-terminal look is expressed purely through this slot.
 * Tokens stay literal class strings (Tailwind JIT) — that is not a portal
 * constraint. Scoped host CSS vars still need `overlayPortalContainer`.
 */
export interface TilingThemeDragChromeTokens {
  /**
   * Ghost WRAPPER while the ghost free-follows the pointer (lifted): the
   * elevation / scale / opacity / tint delta layered OUTSIDE the pane shell
   * (`theme.ghost.surface` for the default tile, the host's own chrome for a
   * custom `renderTile`). Keep it a small delta from the at-rest pane.
   */
  readonly ghostLifted: string;
  /**
   * Ghost wrapper while the ghost is SEATED in the hop-in slot (and under
   * `prefers-reduced-motion`, where the lifted look is dropped).
   */
  readonly ghostSeated: string;
  /**
   * Ghost wrapper transition between the lifted and seated looks. Omitted
   * entirely under `prefers-reduced-motion`.
   */
  readonly ghostTransition: string;
  /** Cancel fly-back wrapper (the pane gliding back to its origin). */
  readonly cancelFlyBack: string;
  /**
   * The content-less SEAT the single ghost hops into (`DragSourceSlotReservation`):
   * the FULL surface class set — background, border, radius, shadow. Fully
   * covered once the ghost seats, visible only during the hop-in flight. The
   * default inherits `paneShell.surface` so the seat reads as the at-rest pane.
   */
  readonly sourceReservation: string;
  /**
   * The picked-up SOURCE pane as a whole (applied by the renderer to the leaf
   * wrapper, so it dims a custom `renderTile` and the default tile alike): a
   * single opacity, never a per-part (title-only) dim. Preview drag mode only —
   * in live mode the source slot is the reservation.
   */
  readonly sourcePane: string;
  /**
   * The resolved DROP-TARGET leaf wrapper. Default `""`: per the
   * focus-follows-dragged-pane rule the destination is conveyed by the ghost
   * hop-in, so no other pane is highlighted. A host may opt into a highlight.
   */
  readonly dropTarget: string;
  /**
   * The default tile's drop-intent overlay FRAME (edge/center zone hints): its
   * radius + border width. Colors come from the observability layer.
   */
  readonly dropIntentLayer: string;
  /**
   * Drag-cursor badge (the pointer-pinned drop-validity affordance — insert /
   * swap / invalid / grab glyph) shape + base: radius, border width, backdrop.
   */
  readonly cursorBadge: string;
  /** Cursor badge surface / border / glyph color over a committable target. */
  readonly cursorBadgeValid: string;
  /** Cursor badge surface / border / glyph color over a blocked target. */
  readonly cursorBadgeInvalid: string;
  /** Cursor badge surface / border / glyph color while free-following (grip). */
  readonly cursorBadgeNeutral: string;
  /**
   * The frame the seat wears during the hop-in flight, composed from the
   * DRAGGED pane's accent (focus follows the dragged pane). Default: the
   * theme's `resolveFocusFrame`. Return `""` for a frameless seat.
   */
  readonly resolveSeatFrame: (accent: TilingTileAccent | undefined) => string;
}

/**
 * Workspace-switch motion tokens (N2). Optional + partial — omitted fields
 * resolve through {@link resolveWorkspaceTransition} to the library defaults
 * (200 ms, drag-hop easing). Same additive slot pattern as `dragChrome` /
 * `ghostChip`.
 */
export interface TilingThemeWorkspaceTransitionTokens {
  /** Timed commit / cancel duration in milliseconds. Default 200. */
  readonly durationMs: number;
  /** CSS `<easing-function>` for the timed curve. */
  readonly easing: string;
}

/** Split-divider / gap handle chrome across visible + hidden states. */
export interface TilingThemeDividerTokens {
  /**
   * Structural base incl. focus-visible ring color. Include `box-border` +
   * `bg-clip-content` so the renderer can pad the full gutter hit-target while
   * chrome paints only the center `handleSizePx` content box.
   */
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
  /**
   * The theme's id. A built-in theme uses a `TilingThemeId` member; a
   * consumer-authored theme mints its own id string (the `string & {}`
   * widening keeps built-in ids autocompletable while admitting any id).
   * `TILING_THEME_REGISTRY` stays keyed by the closed `TilingThemeId` union,
   * so the compile-time built-in coverage guarantee is unaffected.
   */
  readonly id: TilingThemeId | (string & {});
  /** Human-readable theme label (e.g. for a theme picker). */
  readonly label: string;
  /** Renderer-root + viewport surface tokens. */
  readonly root: TilingThemeRootTokens;
  /** Pane host shell surface + interaction-state tokens. */
  readonly paneShell: TilingThemePaneShellTokens;
  /** Pane header chrome tokens. */
  readonly paneHeader: TilingThemePaneHeaderTokens;
  /** Drag-ghost shell tokens. */
  readonly ghost: TilingThemeGhostTokens;
  /**
   * Drag-state chrome tokens (ghost wrapper delta, seat, source dim, drop
   * target, cursor badge). Optional + partial — omitted tokens resolve through
   * `resolveDragChrome(theme)` to a pane-shell-inheriting default.
   */
  readonly dragChrome?: Partial<TilingThemeDragChromeTokens>;
  /**
   * Compact-ghost chip CONTENTS. The renderer wraps the return in the
   * cursor-anchored chip shell (`data-drag-ghost-chip`); this slot paints
   * the label. Default is a minimal neutral chip (tile title, else leaf id).
   * Optional — omitted themes keep the built-in chip.
   */
  readonly ghostChip?: (ctx: TilingGhostChipContext) => React.ReactNode;
  /**
   * Workspace-switch slide / fade timing. Optional + partial — omitted
   * tokens resolve through `resolveWorkspaceTransition` to 200 ms and the
   * drag-hop easing. Built-in themes omit the slot (library defaults).
   */
  readonly workspaceTransition?: Partial<TilingThemeWorkspaceTransitionTokens>;
  /**
   * Workspace tab-strip `tablist` element classes, consumed by the headless
   * `useTilingWorkspaceTabs` / `TilingWorkspaceTabs` (`tablistProps.className`).
   * Optional — the strip is UNSTYLED until a theme (or the host) supplies the
   * `workspaceTab*` tokens, so a theme that omits them never shows a look it
   * did not author.
   */
  readonly workspaceTabs?: string;
  /** Every workspace `tab` element's resting classes (`tabProps.className`). */
  readonly workspaceTab?: string;
  /** Composed onto the ACTIVE workspace tab (`aria-selected="true"`). */
  readonly workspaceTabActive?: string;
  /** Composed onto the tab a dragged leaf is hovering (`data-drop-target`). */
  readonly workspaceTabDropTarget?: string;
  /** Split-divider / gap handle tokens. */
  readonly divider: TilingThemeDividerTokens;
  /** Top-bar / tab-strip chrome tokens. */
  readonly topBar: TilingThemeTopBarTokens;
  /** Resting pane accent composition (border tint + colored shadow). */
  readonly resolvePaneAccentSurface: (
    accent: TilingTileAccent | undefined,
  ) => string;
  /** Accent title-text color. */
  readonly resolveAccentText: (accent: TilingTileAccent | undefined) => string;
  /**
   * Full focused-pane frame. Prefer a SINGLE radius-following stroke
   * (`box-shadow` / one `border-*` recolor) — stacking `border` + `ring` (or
   * `outline`) at the corners produces square tick artifacts on rounded panes.
   */
  readonly resolveFocusFrame: (accent: TilingTileAccent | undefined) => string;
  /** Active tab / switcher / group-member chip. */
  readonly resolveTabActive: (accent: TilingTileAccent | undefined) => string;
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
 * focus glow (`focusGlowSoft` alone — a 1px box-shadow ring + soft bloom, no
 * stacked `border`/`ring`), and more disciplined accent use (resting panes wear
 * only a faint accent border — the colored shadow tint is dropped). Keeps the
 * direction; makes it tasteful. Default library theme.
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
  // The neon-terminal drag look — lifted glass ghost with a deep slate drop
  // shadow, a `rounded-xl` seat, cyan/rose/slate cursor badge — is expressed
  // ENTIRELY through this slot (the renderer paints no drag chrome of its own),
  // so a host theme is pixel-identical to the pre-`dragChrome` renderer.
  dragChrome: {
    ghostLifted:
      "scale-[1.01] opacity-90 shadow-[0_30px_60px_rgba(2,6,23,0.72)]",
    ghostSeated:
      "scale-[1.01] opacity-95 shadow-[0_22px_44px_rgba(2,6,23,0.62)]",
    ghostTransition: "transition-[opacity,box-shadow] duration-150",
    cancelFlyBack: "shadow-[0_18px_34px_rgba(2,6,23,0.5)]",
    sourceReservation: "rounded-xl",
    sourcePane: "opacity-70",
    dropTarget: "",
    dropIntentLayer: "rounded-lg border",
    cursorBadge: "rounded-full border backdrop-blur-[1px]",
    cursorBadgeValid:
      "border-cyan-300/80 bg-cyan-500/20 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.55)]",
    cursorBadgeInvalid:
      "border-rose-400/80 bg-rose-500/20 text-rose-100 shadow-[0_0_14px_rgba(244,63,94,0.5)]",
    cursorBadgeNeutral:
      "border-slate-300/70 bg-slate-900/70 text-slate-100 shadow-[0_4px_12px_rgba(2,6,23,0.55)]",
  },
  divider: {
    base: "box-border shrink-0 rounded bg-clip-content outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
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
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] outline-none transition-colors",
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
  // Single box-shadow frame (1px ring + soft bloom). No border/ring stack —
  // those fight the pane's rounded corners and leave square corner ticks.
  resolveFocusFrame: (accent: TilingTileAccent | undefined): string =>
    accentHue(accent).focusGlowSoft,
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
 * frame (recolor the resting hairline — no outer ring), the active tab chip
 * (soft tint), and the title text. Quiet and professional.
 *
 * Root + viewport are TRANSPARENT on purpose (same contract as mosaic): gap
 * flanks and corner gutters inherit the host chrome. An opaque slate fill here
 * used to peek navy/blue through every inter-pane gap when embedders painted
 * charcoal panels — consumers that want a self-contained canvas can inject a
 * `theme` with opaque `root.container` / `root.viewport` tokens.
 */
const CLEAN_FLAT_THEME: TilingTheme = {
  id: "clean-flat",
  label: "clean flat",
  root: {
    container:
      "flex h-full max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg bg-transparent p-0 outline-none",
    viewport:
      "relative isolate min-h-0 min-w-0 flex-1 overflow-hidden bg-transparent",
  },
  paneShell: {
    surface:
      "relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-700/50 bg-slate-800/40 shadow-sm",
    bodyText:
      "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-1.5 font-mono text-[11px] leading-5 text-slate-300",
    subtitleText: "text-slate-500",
    invalidDropRing: "ring-2 ring-rose-400/60",
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
    base: "box-border shrink-0 rounded bg-clip-content outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60",
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
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] outline-none transition-colors",
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
  // Recolor the resting 1px border — one stroke, follows border-radius.
  resolveFocusFrame: (accent: TilingTileAccent | undefined): string =>
    accentHue(accent).focusBorder,
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
    base: "box-border shrink-0 rounded-full bg-clip-content outline-none focus-visible:ring-2 focus-visible:ring-amber-300/55",
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
      "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] outline-none transition-colors",
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
  // accent across the whole surface. Recolor the resting hairline only (no
  // outer ring stack that squares the rounded corners).
  resolveFocusFrame: (): string => "border-amber-300/45",
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

/**
 * Resolve a theme's drag-state chrome: every `theme.dragChrome` token a theme
 * omits is filled from the PANE-SHELL-INHERITING default. The default drags
 * with the theme's own resting chrome — the seat wears `paneShell.surface`
 * (same radius / border / background / shadow as the at-rest pane), the seat
 * frame reuses `resolveFocusFrame`, the ghost wrapper carries only a small
 * neutral elevation + opacity delta, and no drop-target highlight is painted
 * (focus follows the dragged pane). A theme that passes no `dragChrome` at all
 * therefore never shows a look it did not author. Pure + referentially cheap
 * (no memo needed; callers may still `useMemo` on `theme`). Tokens are
 * Tailwind-JIT literals, not portal-scoped; a host that paints the ghost
 * with inherited CSS variables must still pass
 * `TilingRendererProps.overlayPortalContainer`.
 */
export function resolveDragChrome(
  theme: TilingTheme,
): TilingThemeDragChromeTokens {
  const overrides: Partial<TilingThemeDragChromeTokens> =
    theme.dragChrome ?? {};
  return {
    ghostLifted:
      overrides.ghostLifted ??
      "opacity-95 shadow-[0_14px_32px_-14px_rgba(0,0,0,0.5)]",
    ghostSeated: overrides.ghostSeated ?? "opacity-100",
    ghostTransition:
      overrides.ghostTransition ??
      "transition-[opacity,box-shadow] duration-150",
    cancelFlyBack: overrides.cancelFlyBack ?? "",
    sourceReservation: overrides.sourceReservation ?? theme.paneShell.surface,
    sourcePane: overrides.sourcePane ?? "opacity-60",
    dropTarget: overrides.dropTarget ?? "",
    dropIntentLayer: overrides.dropIntentLayer ?? "rounded-lg border",
    cursorBadge:
      overrides.cursorBadge ?? "rounded-full border backdrop-blur-[1px]",
    cursorBadgeValid:
      overrides.cursorBadgeValid ??
      "border-cyan-300/80 bg-cyan-500/20 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.55)]",
    cursorBadgeInvalid:
      overrides.cursorBadgeInvalid ??
      "border-rose-400/80 bg-rose-500/20 text-rose-100 shadow-[0_0_14px_rgba(244,63,94,0.5)]",
    cursorBadgeNeutral:
      overrides.cursorBadgeNeutral ??
      "border-slate-300/70 bg-slate-900/70 text-slate-100 shadow-[0_4px_12px_rgba(2,6,23,0.55)]",
    resolveSeatFrame: overrides.resolveSeatFrame ?? theme.resolveFocusFrame,
  };
}

/**
 * Resolve a theme's workspace-switch motion tokens. Omitted fields fall
 * back to 200 ms and the drag-hop easing so a theme that passes nothing
 * never invents a look it did not author. Pure.
 */
export function resolveWorkspaceTransition(
  theme: TilingTheme,
): TilingThemeWorkspaceTransitionTokens {
  const overrides: Partial<TilingThemeWorkspaceTransitionTokens> =
    theme.workspaceTransition ?? {};
  return {
    durationMs:
      overrides.durationMs ?? DEFAULT_WORKSPACE_TRANSITION_DURATION_MS,
    easing: overrides.easing ?? DEFAULT_WORKSPACE_TRANSITION_EASING,
  };
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
