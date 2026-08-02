/**
 * Shared "is this a real interactive control?" test for pointer-down gating.
 *
 * Two surfaces independently need it:
 *  - the renderer's header `onHandlePointerDown` (skips the native-selection
 *    guard for embedded controls so their own click/focus keeps working, and
 *    exempts them from the Alt/Opt multi-select modifier press);
 *  - `TilingPaneTitleBarContent` (only insulates ACTUAL controls in the
 *    titlebar middle slot from the surrounding `TilingDragHandle`; decorative
 *    slot content — labels, badges, a selected-case id — must NOT swallow the
 *    press, or the whole slot becomes an undraggable dead zone even though
 *    nothing inside it is interactive).
 *
 * A single selector keeps both call sites in lockstep — drifting copies would
 * silently re-open exactly the "titlebar content blocks drag" bug this module
 * exists to prevent (HT-TITLEBAR-DRAG-THRU).
 * @internal
 */
export const INTERACTIVE_CONTROL_SELECTOR: string =
  'button, a, input, textarea, select, [role="button"], [contenteditable="true"]';

/**
 * `true` when `target` is (or is nested inside) a genuine interactive control
 * — a real click/focus/type surface — rather than decorative titlebar chrome.
 * Non-`Element` targets (no live DOM node to test) are treated as
 * non-interactive.
 * @internal
 */
export function isInteractiveControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(INTERACTIVE_CONTROL_SELECTOR) != null
  );
}
