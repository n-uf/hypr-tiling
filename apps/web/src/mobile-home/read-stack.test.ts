import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "@jest/globals";
import type { TilingTile } from "@n-uf/hypr-tiling";
import { MOBILE_HOME_TILE_IDS } from "./layout-tree";
import { ReadStackMobile, readSectionId } from "./read-stack";

// Read mode stacks every pane as a section, in reading order, whatever order
// the page hands the tiles in, and each anchor chip points at its section.

const READING_ORDER: ReadonlyArray<string> = [
  "intro",
  "features",
  "workspaces",
  "install",
  "usecases",
  "discoverability",
];

const tile = (id: string): TilingTile => ({
  id,
  title: `title ${id}`,
  accent: "amber",
  content: React.createElement("p", null, `body ${id}`),
});

describe("ReadStackMobile", (): void => {
  const shuffled: ReadonlyArray<TilingTile> = [
    "usecases",
    "intro",
    "discoverability",
    "workspaces",
    "install",
    "features",
    "controls",
  ].map(tile);
  const markup: string = renderToStaticMarkup(
    React.createElement(ReadStackMobile, { tiles: shuffled, skin: "mosaic" }),
  );

  it("seats the six documentation panes", (): void => {
    expect([...MOBILE_HOME_TILE_IDS]).toEqual(READING_ORDER);
  });

  it("renders all six section ids in reading order, and no other pane", (): void => {
    const ids = [...markup.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(READING_ORDER.map(readSectionId));
  });

  it("renders each pane's content inside its own section", (): void => {
    for (const id of READING_ORDER) {
      expect(markup).toMatch(
        new RegExp(`<section id="${readSectionId(id)}"[^>]*><p>body ${id}</p></section>`),
      );
    }
    expect(markup).not.toContain("body controls");
  });

  it("links one chip to each section, in the same order", (): void => {
    const hrefs = [...markup.matchAll(/<a href="#([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(READING_ORDER.map(readSectionId));
  });
});
