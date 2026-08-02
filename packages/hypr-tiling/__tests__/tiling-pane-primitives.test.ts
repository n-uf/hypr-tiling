/**
 * @jest-environment jsdom
 *
 * `TilingPaneBody` HT-PANE-COLLAPSE coverage: a collapsed leaf's body wrapper
 * must be hidden entirely (`display: none`), not merely emptied of children.
 * A bare empty `<div>` still keeps its `flex-1` box in the layout — the
 * leftover slack between that box and the pinned collapse extent rendered as
 * a dead strip below custom-pane titlebars (the "collapsed rendering
 * subtleties" defect). Hiding the wrapper removes that strip so a collapsed
 * custom pane is exactly titlebar-tall.
 *
 * `TilingPaneTitleBarContent` HT-TITLEBAR-DRAG-THRU coverage: the middle
 * titlebar slot must stop pointer-down propagation ONLY for genuine
 * interactive controls inside it. A blanket stop previously turned ANY
 * non-empty `titleBarContent` — including purely decorative content like a
 * selected-case-id label — into a dead zone that swallowed drag pickup
 * entirely, even where nothing inside it was interactive.
 */
import { describe, expect, it, jest } from "@jest/globals";
import * as React from "react";
import { fireEvent, render } from "@testing-library/react";
import {
  TilingPaneBody,
  TilingPaneTitleBarContent,
} from "../react/tiling-pane-primitives";
import type { TilingRenderTileProps } from "../engine/types";

function paneArgs(
  overrides: Partial<Pick<TilingRenderTileProps, "paneBodyRenderMode" | "isCollapsed">>,
): Pick<TilingRenderTileProps, "paneBodyRenderMode" | "isCollapsed"> {
  return {
    paneBodyRenderMode: "render-content",
    isCollapsed: false,
    ...overrides,
  };
}

describe("TilingPaneBody — collapsed body hiding (HT-PANE-COLLAPSE)", (): void => {
  it("renders children and stays visible when expanded with content visible", (): void => {
    const { getByTestId, getByText } = render(
      React.createElement(
        TilingPaneBody,
        { pane: paneArgs({}), "data-testid": "body" } as never,
        "content",
      ),
    );
    const body = getByTestId("body");
    expect(body.style.display).not.toBe("none");
    expect(getByText("content")).toBeTruthy();
  });

  it("empties children but keeps the box laid out when content is toggled off (not collapsed)", (): void => {
    const { getByTestId, queryByText } = render(
      React.createElement(
        TilingPaneBody,
        {
          pane: paneArgs({ paneBodyRenderMode: "render-empty" }),
          "data-testid": "body",
        } as never,
        "content",
      ),
    );
    const body = getByTestId("body");
    expect(body.style.display).not.toBe("none");
    expect(queryByText("content")).toBeNull();
  });

  it("hides the wrapper via display:none when the leaf is collapsed", (): void => {
    const { getByTestId, queryByText } = render(
      React.createElement(
        TilingPaneBody,
        {
          pane: paneArgs({ paneBodyRenderMode: "render-empty", isCollapsed: true }),
          "data-testid": "body",
        } as never,
        "content",
      ),
    );
    const body = getByTestId("body");
    expect(body.style.display).toBe("none");
    expect(queryByText("content")).toBeNull();
  });

  it("merges display:none into a consumer-provided style object rather than clobbering it", (): void => {
    const { getByTestId } = render(
      React.createElement(
        TilingPaneBody,
        {
          pane: paneArgs({ isCollapsed: true }),
          style: { color: "red" },
          "data-testid": "body",
        } as never,
      ),
    );
    const body = getByTestId("body");
    expect(body.style.display).toBe("none");
    expect(body.style.color).toBe("red");
  });
});

describe("TilingPaneTitleBarContent — drag-through for decorative content (HT-TITLEBAR-DRAG-THRU)", (): void => {
  it("does NOT stop pointer-down propagation for decorative (non-interactive) content", (): void => {
    const parentPointerDown = jest.fn();
    const { getByTestId } = render(
      React.createElement(
        "div",
        { onPointerDown: parentPointerDown },
        React.createElement(
          TilingPaneTitleBarContent,
          { "data-testid": "slot" } as never,
          React.createElement("span", null, "selected case: p001"),
        ),
      ),
    );
    fireEvent.pointerDown(getByTestId("slot").querySelector("span")!);
    expect(parentPointerDown).toHaveBeenCalledTimes(1);
  });

  it("stops pointer-down propagation when the press lands on a real button", (): void => {
    const parentPointerDown = jest.fn();
    const { getByText } = render(
      React.createElement(
        "div",
        { onPointerDown: parentPointerDown },
        React.createElement(
          TilingPaneTitleBarContent,
          { "data-testid": "slot" } as never,
          React.createElement("button", { type: "button" }, "fit width"),
        ),
      ),
    );
    fireEvent.pointerDown(getByText("fit width"));
    expect(parentPointerDown).not.toHaveBeenCalled();
  });

  it("stops pointer-down propagation when the press lands on an input nested inside the slot", (): void => {
    const parentPointerDown = jest.fn();
    const { getByTestId } = render(
      React.createElement(
        "div",
        { onPointerDown: parentPointerDown },
        React.createElement(
          TilingPaneTitleBarContent,
          { "data-testid": "slot" } as never,
          React.createElement("input", { "aria-label": "find" }),
        ),
      ),
    );
    fireEvent.pointerDown(getByTestId("slot").querySelector("input")!);
    expect(parentPointerDown).not.toHaveBeenCalled();
  });

  it("still invokes a consumer-provided onPointerDown regardless of target", (): void => {
    const consumerPointerDown = jest.fn();
    const { getByTestId } = render(
      React.createElement(
        TilingPaneTitleBarContent,
        { "data-testid": "slot", onPointerDown: consumerPointerDown } as never,
        React.createElement("span", null, "label"),
      ),
    );
    fireEvent.pointerDown(getByTestId("slot").querySelector("span")!);
    expect(consumerPointerDown).toHaveBeenCalledTimes(1);
  });
});
