/**
 * @jest-environment jsdom
 *
 * `useWorkspaceSwipeDriver` forwards the port's modifier flags on every
 * `WHEEL` event it sends to the swipe store.
 */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  TILING_WORKSPACE_SWIPE_DEFAULTS,
  type TilingWorkspaceSwipeEvent,
} from "../engine/workspace-navigation";
import {
  createWorkspaceSwipeStore,
  useWorkspaceSwipeDriver,
  type TilingWorkspaceSwipeStore,
} from "../react/use-workspace-swipe";

afterEach((): void => {
  cleanup();
});

describe("useWorkspaceSwipeDriver — WHEEL modifier flags", (): void => {
  it("forwards metaKey / altKey / shiftKey from the port sample onto the WHEEL event", (): void => {
    const store: TilingWorkspaceSwipeStore = createWorkspaceSwipeStore();
    const send = jest.spyOn(store, "send");
    const element: HTMLElement = document.createElement("div");
    document.body.appendChild(element);

    renderHook((): void => {
      useWorkspaceSwipeDriver({
        store,
        element,
        wheel: true,
        touch: false,
        config: TILING_WORKSPACE_SWIPE_DEFAULTS,
        hasPrev: true,
        hasNext: true,
        dragActive: false,
        dispatch: (): void => {},
      });
    });

    act((): void => {
      element.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: 16,
          deltaY: 0,
          metaKey: true,
          altKey: false,
          shiftKey: false,
          ctrlKey: false,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    const wheelEvents: TilingWorkspaceSwipeEvent[] = send.mock.calls
      .map((call: Parameters<TilingWorkspaceSwipeStore["send"]>): TilingWorkspaceSwipeEvent => call[0])
      .filter(
        (event: TilingWorkspaceSwipeEvent): event is Extract<TilingWorkspaceSwipeEvent, { type: "WHEEL" }> =>
          event.type === "WHEEL",
      );
    expect(wheelEvents.length).toBeGreaterThanOrEqual(1);
    expect(wheelEvents[0]).toMatchObject({
      type: "WHEEL",
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false,
    });

    send.mockRestore();
    element.remove();
  });
});
