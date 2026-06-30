import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import type { ReactElement } from "react";
import { buildDragPaneSnapshot } from "../react/dynamic-tiling-renderer";
import type { TilingDragPaneSnapshot, TilingTile } from "../core/types";

/**
 * Ghost-content sourcing invariant: the drag-pane snapshot captured on pickup
 * (`buildDragPaneSnapshot`) must carry the SAME rich `content` slot the live
 * pane renders, so the floating ghost paints the real body (table / chart /
 * form) rather than the now-unused text-row body. Regression guard for the
 * "header-only ghost / empty body" defect (snapshot used to capture `rows`
 * only, so content-backed panes rode the ghost with no body).
 */
describe("drag-pane ghost content sourcing — snapshot carries the rich content slot", (): void => {
  it("captures the tile's content node so the ghost paints what the live pane paints", (): void => {
    const content: ReactElement = createElement("table", { "data-testid": "events-table" });
    const tile: TilingTile = {
      id: "tile-events",
      title: "Events",
      description: "live event stream",
      accent: "violet",
      content,
    };

    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(tile);

    expect(snapshot.content).toBe(content);
    expect(snapshot.tileId).toBe("tile-events");
    expect(snapshot.accent).toBe("violet");
  });

  it("falls back to null content for a legacy rows-only tile (rows still captured)", (): void => {
    const tile: TilingTile = {
      id: "tile-debug",
      title: "Debug",
      rows: ["line one", "line two", "line three"],
    };

    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(tile);

    expect(snapshot.content).toBeNull();
    expect(snapshot.rows).toEqual(["line one", "line two", "line three"]);
    expect(snapshot.accent).toBe("cyan");
  });

  it("captures both content and rows when a tile supplies both (content wins at render)", (): void => {
    const content: ReactElement = createElement("div", { "data-testid": "graph" });
    const tile: TilingTile = {
      id: "tile-graph",
      title: "Graph",
      content,
      rows: ["fallback row"],
    };

    const snapshot: TilingDragPaneSnapshot = buildDragPaneSnapshot(tile);

    expect(snapshot.content).toBe(content);
    expect(snapshot.rows).toEqual(["fallback row"]);
  });
});
