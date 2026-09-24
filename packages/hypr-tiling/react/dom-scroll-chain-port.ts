import type { ElementRef } from "../engine/element-ref";
import type {
  ScrollChainAxis,
  ScrollChainDirection,
  ScrollChainPort,
} from "../engine/wheel-touch-port";

/** Sub-pixel slack when comparing a scroll offset against its bound. */
const SCROLL_BOUND_EPSILON_PX: number = 1;

const USER_SCROLLABLE_OVERFLOW: ReadonlySet<string> = new Set<string>(["auto", "scroll", "overlay"]);

/**
 * Whether ONE element can still scroll along `axis` in `direction`: its
 * computed `overflow-{x,y}` lets the user scroll, its scroll extent exceeds
 * its client extent, and its scroll offset is not already at the bound the
 * direction heads to. On X the RTL sign convention is honoured (a `direction:
 * rtl` scroller reports `scrollLeft` in `[-(scrollWidth − clientWidth), 0]`,
 * so "visually right" is `scrollLeft → 0`).
 */
export function canElementScrollFurther(
  element: HTMLElement,
  axis: ScrollChainAxis,
  direction: ScrollChainDirection,
): boolean {
  const style: CSSStyleDeclaration = window.getComputedStyle(element);
  if (axis === "y") {
    if (!USER_SCROLLABLE_OVERFLOW.has(style.overflowY)) {
      return false;
    }
    const maxTop: number = element.scrollHeight - element.clientHeight;
    if (maxTop <= SCROLL_BOUND_EPSILON_PX) {
      return false;
    }
    return direction === 1
      ? element.scrollTop < maxTop - SCROLL_BOUND_EPSILON_PX
      : element.scrollTop > SCROLL_BOUND_EPSILON_PX;
  }
  if (!USER_SCROLLABLE_OVERFLOW.has(style.overflowX)) {
    return false;
  }
  const maxLeft: number = element.scrollWidth - element.clientWidth;
  if (maxLeft <= SCROLL_BOUND_EPSILON_PX) {
    return false;
  }
  const scrollLeft: number = element.scrollLeft;
  if (style.direction === "rtl") {
    return direction === 1
      ? scrollLeft < -SCROLL_BOUND_EPSILON_PX
      : scrollLeft > -maxLeft + SCROLL_BOUND_EPSILON_PX;
  }
  return direction === 1
    ? scrollLeft < maxLeft - SCROLL_BOUND_EPSILON_PX
    : scrollLeft > SCROLL_BOUND_EPSILON_PX;
}

/**
 * Default DOM-backed {@link ScrollChainPort}: walks from `element` up through
 * its ancestors to the viewport root (inclusive) and reports `true` as soon as
 * one of them {@link canElementScrollFurther}. Text nodes / non-HTML targets
 * start from their parent element; a target outside the root walks to the
 * document root. `false` when the root is unmounted or `element` is `null`.
 */
export function createDomScrollChainPort(
  rootRef: ElementRef<HTMLElement | null>,
): ScrollChainPort<EventTarget> {
  return {
    canScrollFurther: (
      target: EventTarget | null,
      axis: ScrollChainAxis,
      direction: ScrollChainDirection,
    ): boolean => {
      const root: HTMLElement | null = rootRef.current;
      let element: HTMLElement | null =
        target instanceof HTMLElement
          ? target
          : target instanceof Node
            ? (target.parentElement as HTMLElement | null)
            : null;
      while (element != null) {
        if (canElementScrollFurther(element, axis, direction)) {
          return true;
        }
        if (element === root) {
          return false;
        }
        element = element.parentElement;
      }
      return false;
    },
  };
}
