/**
 * Consumer-configurable drag easing — the pure resolution + validation half of
 * the easing public-API surface (HT-ANIM-EASING-CONFIG).
 *
 * `DRAG_HOP_EASING` / `DRAG_REFLOW_EASING` used to be fixed module constants in
 * the renderer (parity-report §5 #9 / §7: the one M10 remainder short of
 * Hyprland's per-leaf `bezier`/`speed` config). They live here as defaults so
 * the renderer can thread consumer-supplied CSS `<easing-function>` strings into
 * the ghost-hop transit and the survivor FLIP reflow timing functions.
 *
 * This module is DOM-less and pure (the `node` jest environment runs it),
 * mirroring how `ghost-transit.ts` / `survivor-reflow.ts` factor the FLIP
 * GEOMETRY out of the renderer — but an easing STRING is a distinct rendering
 * concern from FLIP geometry, so the resolver lives in its own module rather
 * than muddying those geometry modules.
 *
 * Cross-ref: `_agent/command-keyboard-api-design.md` §5;
 * `_agent/comparative-analysis/parity-report.md` §5 #9 / §7 (configurable easing
 * remainder); `dynamic-tiling-renderer.tsx` (`DragPaneOverlay` hop + survivor
 * FLIP effect consume the resolved strings).
 */

/** The default ghost hop / pickup / hop-out timing function (a snappy decel). */
export const DEFAULT_DRAG_HOP_EASING: string = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * The default survivor-reflow settle timing function. Equals the hop curve so
 * the ghost and the survivors read as one coordinated motion (the renderer's
 * `dragReflowEasing` prop falls back to the resolved `dragHopEasing` when
 * undefined, so this default only applies when BOTH are unset).
 */
export const DEFAULT_DRAG_REFLOW_EASING: string = DEFAULT_DRAG_HOP_EASING;

/**
 * CSS `<easing-function>` keyword set (the global timing-function keywords).
 * `step-start` / `step-end` are the keyword forms of `steps()`.
 */
const CSS_EASING_KEYWORDS: ReadonlySet<string> = new Set<string>([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
]);

/**
 * Whether `value` is a syntactically-plausible CSS `<easing-function>`: one of
 * the global keywords, or a `cubic-bezier(...)` / `linear(...)` / `steps(...)`
 * functional form. This is a SHAPE check (not a full CSS parse) — enough to keep
 * a malformed / empty string from reaching the compositor as a broken
 * `transition`, without re-implementing the CSS grammar. Leading / trailing
 * whitespace is ignored; matching is case-insensitive on the keyword / function
 * name.
 */
export function isCssEasing(value: string): boolean {
  const trimmed: string = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const lower: string = trimmed.toLowerCase();
  if (CSS_EASING_KEYWORDS.has(lower)) {
    return true;
  }
  return /^(cubic-bezier|linear|steps)\(\s*[^()]*\)$/.test(lower);
}

/**
 * Resolve a consumer-supplied easing to a usable CSS timing function: returns
 * `value` when it is a plausible easing (`isCssEasing`), else `fallback`. An
 * `undefined` / `null` / blank / malformed value collapses to the fallback, so
 * the renderer always writes a valid `transition` timing function.
 */
export function resolveDragEasing(value: string | undefined | null, fallback: string): string {
  if (value == null) {
    return fallback;
  }
  return isCssEasing(value) ? value.trim() : fallback;
}
