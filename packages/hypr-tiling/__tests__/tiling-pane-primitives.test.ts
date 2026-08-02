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
 */
import { describe, expect, it } from "@jest/globals";
import * as React from "react";
import { render } from "@testing-library/react";
import { TilingPaneBody } from "../react/tiling-pane-primitives";
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
