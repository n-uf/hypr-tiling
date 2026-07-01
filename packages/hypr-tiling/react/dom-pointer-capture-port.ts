import type { ElementRef } from "../core/element-ref";
import type { PointerCapturePort } from "../core/pointer-capture-port";

/**
 * Default DOM-backed {@link PointerCapturePort} host adapter, bound to the
 * renderer's drag-root `rootRef`. Each method reproduces — byte-for-byte — the
 * inline `setPointerCapture` / `releasePointerCapture` / `hasPointerCapture`
 * glue it replaces:
 *
 *   - `capture`  ← `rootRef.current.setPointerCapture(id)` inside `try/catch`,
 *     guarded by `setPointerCapture != null`; returns `true` only when it ran.
 *   - `release`  ← `releasePointerCapture(id)` inside `try/catch`, guarded by
 *     `releasePointerCapture != null && hasPointerCapture(id)` (release only
 *     when the root actually holds capture for that pointer).
 *   - `has`      ← `rootRef.current.hasPointerCapture?.(id) ?? false`.
 */
export function createDomPointerCapturePort(
  rootRef: ElementRef<HTMLDivElement | null>,
): PointerCapturePort {
  return {
    capture: (pointerId: number): boolean => {
      const rootElement: HTMLDivElement | null = rootRef.current;
      if (rootElement?.setPointerCapture == null) {
        return false;
      }
      try {
        rootElement.setPointerCapture(pointerId);
        return true;
      } catch {
        // Capture is best-effort; window listeners still receive events.
        return false;
      }
    },
    release: (pointerId: number): void => {
      const rootElement: HTMLDivElement | null = rootRef.current;
      if (
        rootElement != null &&
        rootElement.releasePointerCapture != null &&
        rootElement.hasPointerCapture?.(pointerId)
      ) {
        try {
          rootElement.releasePointerCapture(pointerId);
        } catch {
          // Already released.
        }
      }
    },
    has: (pointerId: number): boolean =>
      rootRef.current?.hasPointerCapture?.(pointerId) ?? false,
  };
}
