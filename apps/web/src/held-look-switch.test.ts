import { describe, expect, it } from "@jest/globals";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TilingDragPreview, TilingHeldLook } from "@n-uf/hypr-tiling";
import { DEFAULT_HOME_HELD_LOOK, HELD_LOOK_OPTIONS, HeldLookSwitch, heldLookFits } from "./held-look-switch";

const PREVIEWS: ReadonlyArray<TilingDragPreview> = ["indicator", "snap"];

function markup(look: TilingHeldLook, preview: TilingDragPreview): string {
  return renderToStaticMarkup(
    React.createElement(HeldLookSwitch, {
      look,
      preview,
      onChange: (): void => undefined,
      className: "group",
      labelClassName: "label",
      selectClassName: "select",
    }),
  );
}

describe("home held look — the looks and which suit a drop preview", (): void => {
  it("offers the five looks in order, the original look named Full size", (): void => {
    expect(HELD_LOOK_OPTIONS.map((option) => option.id)).toEqual(["auto", "title-bar", "thumbnail", "fade", "none"]);
    expect(HELD_LOOK_OPTIONS.map((option) => option.label)).toEqual(["Auto", "Title bar", "Thumbnail", "Fade", "Full size"]);
    expect(HELD_LOOK_OPTIONS.find((option) => option.id === "none")?.label).toBe("Full size");
  });

  it("every look suits the indicator; in snap to slot the fade does not (it falls back to the default, auto)", (): void => {
    for (const option of HELD_LOOK_OPTIONS) {
      expect(heldLookFits(option.id, "indicator")).toBe(true);
      expect(heldLookFits(option.id, "snap")).toBe(option.id !== "fade");
    }
    expect(DEFAULT_HOME_HELD_LOOK).toBe("auto");
    expect(heldLookFits(DEFAULT_HOME_HELD_LOOK, "snap")).toBe(true);
  });

  it("the switch's menu lists only the looks that suit the preview", (): void => {
    const indicator: string = markup("auto", "indicator");
    const snap: string = markup("auto", "snap");
    expect(indicator).toContain(">Fade</option>");
    expect(snap).not.toContain("Fade");
    for (const preview of PREVIEWS) {
      const menu: string = markup("auto", preview);
      expect(menu).toContain(">Full size</option>");
      expect(menu).not.toContain(">Off</option>");
      for (const label of ["Auto", "Title bar", "Thumbnail"]) {
        expect(menu).toContain(`>${label}</option>`);
      }
    }
  });
});
