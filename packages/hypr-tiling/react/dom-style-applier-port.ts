import type { ElementRef } from "../engine/element-ref";
import {
  type CancelableHandle,
  type TransitionEndSource,
  stripTransientDragStyles,
} from "../engine/drag-recovery";
import type {
  FlipDipHandle,
  FlipDipOptions,
  FlipKeyframe,
  StyleApplierPort,
  StyleLeafHandle,
  StyleTransformSpec,
} from "../engine/style-applier-port";
import type { SurvivorRect } from "../engine/survivor-reflow";

/**
 * React-internal {@link StyleLeafHandle} carrying the resolved live element, so
 * every per-handle method operates on the SAME `HTMLElement` reference the
 * `collectLeafHandles` sweep found — preserving the renderer's exact
 * element-identity semantics (no re-`querySelector` of a mid-transform node).
 */
interface DomStyleLeafHandle extends StyleLeafHandle {
  readonly element: HTMLElement;
}

function toElement(handle: StyleLeafHandle): HTMLElement {
  return (handle as DomStyleLeafHandle).element;
}

function toSurvivorRect(rect: DOMRect): SurvivorRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Default DOM-backed {@link StyleApplierPort} host adapter over the survivor
 * `[data-leaf-id]` elements under the renderer's `viewportRef`. Every method is
 * a byte-for-byte wrap of the mechanic it replaces in the survivor-reflow layout
 * effect (`getBoundingClientRect`, `getComputedStyle(el).transform`,
 * `element.style.*`, `element.animate`, the `[data-leaf-id]` sweep, the forced
 * `viewport.getBoundingClientRect()` reflow, and `stripTransientDragStyles`).
 */
export function createDomStyleApplierPort(
  viewportRef: ElementRef<HTMLDivElement | null>,
): StyleApplierPort {
  const collectElements = (): ReadonlyArray<HTMLElement> => {
    const viewport: HTMLDivElement | null = viewportRef.current;
    return viewport == null
      ? []
      : Array.from(viewport.querySelectorAll<HTMLElement>("[data-leaf-id]"));
  };

  return {
    collectLeafHandles: (): ReadonlyArray<StyleLeafHandle> => {
      const handles: DomStyleLeafHandle[] = [];
      for (const element of collectElements()) {
        const leafId: string | undefined = element.dataset.leafId;
        if (leafId == null) {
          continue;
        }
        handles.push({ leafId, element });
      }
      return handles;
    },
    measureRect: (handle: StyleLeafHandle): SurvivorRect =>
      toSurvivorRect(toElement(handle).getBoundingClientRect()),
    readComputedTransform: (handle: StyleLeafHandle): string =>
      window.getComputedStyle(toElement(handle)).transform,
    applyTransform: (handle: StyleLeafHandle, spec: StyleTransformSpec): void => {
      const style: CSSStyleDeclaration = toElement(handle).style;
      if (spec.transition !== undefined) {
        style.transition = spec.transition;
      }
      if (spec.transformOrigin !== undefined) {
        style.transformOrigin = spec.transformOrigin;
      }
      if (spec.transform !== undefined) {
        style.transform = spec.transform;
      }
    },
    animateDip: (
      handle: StyleLeafHandle,
      keyframes: ReadonlyArray<FlipKeyframe>,
      options: FlipDipOptions,
    ): FlipDipHandle => {
      const animation: Animation = toElement(handle).animate(
        keyframes as unknown as Keyframe[],
        {
          duration: options.durationMs,
          easing: options.easing,
          fill: options.fill,
        },
      );
      return {
        cancel: (): void => {
          animation.cancel();
        },
        setOnFinish: (onFinish: () => void): void => {
          animation.onfinish = onFinish;
        },
      };
    },
    transitionEndSource: (handle: StyleLeafHandle): TransitionEndSource =>
      toElement(handle),
    measureClampViewport: (): SurvivorRect | null => {
      const viewport: HTMLDivElement | null = viewportRef.current;
      if (viewport == null) {
        return null;
      }
      const viewportDomRect: DOMRect = viewport.getBoundingClientRect();
      const clampLeft: number = Math.max(viewportDomRect.left, 0);
      const clampTop: number = Math.max(viewportDomRect.top, 0);
      const clampRight: number = Math.min(
        viewportDomRect.right,
        typeof window === "undefined" ? viewportDomRect.right : window.innerWidth,
      );
      const clampBottom: number = Math.min(
        viewportDomRect.bottom,
        typeof window === "undefined"
          ? viewportDomRect.bottom
          : window.innerHeight,
      );
      return {
        left: clampLeft,
        top: clampTop,
        width: Math.max(0, clampRight - clampLeft),
        height: Math.max(0, clampBottom - clampTop),
      };
    },
    forceReflow: (): void => {
      void viewportRef.current?.getBoundingClientRect();
    },
    stripTransient: (params: {
      animations: ReadonlyArray<CancelableHandle | null>;
      racedHandles: ReadonlyArray<CancelableHandle | null>;
    }): void => {
      stripTransientDragStyles({
        ghost: null,
        leaves: collectElements(),
        animations: params.animations,
        racedHandles: params.racedHandles,
      });
    },
    stripLeaf: (handle: StyleLeafHandle): void => {
      stripTransientDragStyles({ ghost: null, leaves: [toElement(handle)] });
    },
  };
}
