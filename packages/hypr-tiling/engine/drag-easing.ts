/**
 * Consumer-configurable drag easing — the pure resolution + validation half of
 * the easing public-API surface (HT-ANIM-EASING-CONFIG).
 *
 * `DRAG_HOP_EASING` used to be a fixed module constant in the renderer
 * (parity-report §5 #9 / §7). It lives here as the default so the renderer can
 * thread a consumer-supplied CSS `<easing-function>` string into the ghost-hop
 * transit. The panes themselves move on the leaf-motion settle
 * (`leaf-motion.ts`), which has no easing to choose.
 *
 * This module is DOM-less and pure (the `node` jest environment runs it); an
 * easing STRING is a distinct rendering concern from the ghost's FLIP
 * geometry (`ghost-transit.ts`), so the resolver lives in its own module.
 *
 * Cross-ref: `_agent/command-keyboard-api-design.md` §5;
 * `_agent/comparative-analysis/parity-report.md` §5 #9 / §7 (configurable easing
 * remainder); `tiling-renderer.tsx` (`DragPaneOverlay` consumes the resolved string).
 */

/** The default ghost hop / pickup / hop-out timing function (a snappy decel). */
export const DEFAULT_DRAG_HOP_EASING: string = "cubic-bezier(0.2, 0.8, 0.2, 1)";

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
