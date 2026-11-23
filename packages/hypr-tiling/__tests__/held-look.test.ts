import { describe, expect, it } from "@jest/globals";
import { SETTLE_TEMPO, createFakeClock, createFrameLoop, type FakeClock, type FrameLoop } from "@n-uf/motion";
import {
  HELD_FADE_OPACITY,
  HELD_THUMBNAIL_SCALE,
  createHeldLookMotion,
  heldLookFrame,
  measureHeldTitleBar,
  resolveHeldLook,
  type HeldLookGeometry,
} from "../engine/held-look";
import type { TilingHeldLook } from "../engine/types";

const LOOKS: ReadonlyArray<TilingHeldLook> = ["auto", "title-bar", "thumbnail", "fade", "none"];

describe("resolveHeldLook — auto", (): void => {
  it("auto is the title bar for a pane that draws one, else a thumbnail", (): void => {
    expect(resolveHeldLook({ renderer: "auto", tile: undefined, hasTitleBar: true })).toBe("title-bar");
    expect(resolveHeldLook({ renderer: "auto", tile: undefined, hasTitleBar: false })).toBe("thumbnail");
  });

  it("nothing set is auto", (): void => {
    expect(resolveHeldLook({ renderer: undefined, tile: undefined, hasTitleBar: true })).toBe("title-bar");
    expect(resolveHeldLook({ renderer: undefined, tile: undefined, hasTitleBar: false })).toBe("thumbnail");
  });

  it("title-bar on a pane with no title bar is a thumbnail; the other looks ignore the title bar", (): void => {
    expect(resolveHeldLook({ renderer: "title-bar", tile: undefined, hasTitleBar: false })).toBe("thumbnail");
    for (const look of ["thumbnail", "fade", "none"] as const) {
      expect(resolveHeldLook({ renderer: look, tile: undefined, hasTitleBar: true })).toBe(look);
      expect(resolveHeldLook({ renderer: look, tile: undefined, hasTitleBar: false })).toBe(look);
    }
  });
});

describe("resolveHeldLook — the tile spec beats the renderer prop", (): void => {
  it("a tile's choice wins over every renderer choice, auto included", (): void => {
    for (const renderer of [undefined, ...LOOKS]) {
      for (const tile of LOOKS) {
        for (const hasTitleBar of [true, false]) {
          const own = resolveHeldLook({ renderer: tile, tile: undefined, hasTitleBar });
          expect(resolveHeldLook({ renderer, tile, hasTitleBar })).toBe(own);
        }
      }
    }
  });

  it("a tile's auto overrides a renderer's fixed look", (): void => {
    expect(resolveHeldLook({ renderer: "fade", tile: "auto", hasTitleBar: true })).toBe("title-bar");
    expect(resolveHeldLook({ renderer: "none", tile: "auto", hasTitleBar: false })).toBe("thumbnail");
  });

  it("a tile with no choice follows the renderer", (): void => {
    expect(resolveHeldLook({ renderer: "fade", tile: undefined, hasTitleBar: true })).toBe("fade");
    expect(resolveHeldLook({ renderer: "none", tile: undefined, hasTitleBar: true })).toBe("none");
  });
});

describe("measureHeldTitleBar — the drag handle is the one source", (): void => {
  const frame = { x: 100, y: 50, width: 400, height: 300 };

  it("a strip along the top is the title bar: it ends at the strip's bottom", (): void => {
    expect(measureHeldTitleBar(frame, { x: 100, y: 50, width: 400, height: 40 })).toBe(40);
  });

  it("a pane's header under a group's tab strip counts: it starts at the pane's top", (): void => {
    expect(measureHeldTitleBar(frame, { x: 100, y: 80, width: 400, height: 40 }, 30)).toBe(70);
  });

  it("a group's tab strip pressed at the frame's top is the title bar", (): void => {
    expect(measureHeldTitleBar(frame, { x: 100, y: 50, width: 400, height: 30 }, 30)).toBe(30);
  });

  it("a small grip is no title bar, even at the top", (): void => {
    expect(measureHeldTitleBar(frame, { x: 104, y: 52, width: 24, height: 24 })).toBeNull();
    // Narrower than 60 % of the frame.
    expect(measureHeldTitleBar(frame, { x: 100, y: 50, width: 230, height: 40 })).toBeNull();
    expect(measureHeldTitleBar(frame, { x: 100, y: 50, width: 240, height: 40 })).toBe(40);
  });

  it("a handle offset from the top (past the slack) is no title bar", (): void => {
    expect(measureHeldTitleBar(frame, { x: 100, y: 60, width: 400, height: 40 })).toBeNull();
    expect(measureHeldTitleBar(frame, { x: 100, y: 54, width: 400, height: 40 })).toBe(44);
    // Offset from the pane's top under a strip, too.
    expect(measureHeldTitleBar(frame, { x: 100, y: 95, width: 400, height: 40 }, 30)).toBeNull();
  });

  it("a handle that is the whole pane, or more than half of it, is no title bar", (): void => {
    expect(measureHeldTitleBar(frame, frame)).toBeNull();
    expect(measureHeldTitleBar(frame, { x: 100, y: 50, width: 400, height: 150 })).toBeNull();
  });

  it("a handle low in the pane, or outside it (a tab torn off a group), is no title bar", (): void => {
    expect(measureHeldTitleBar(frame, { x: 100, y: 300, width: 400, height: 40 })).toBeNull();
    expect(measureHeldTitleBar(frame, { x: 100, y: 10, width: 80, height: 30 })).toBeNull();
  });

  it("an empty handle or frame is no title bar", (): void => {
    expect(measureHeldTitleBar(frame, { x: 100, y: 50, width: 0, height: 40 })).toBeNull();
    expect(measureHeldTitleBar({ ...frame, height: 0 }, { x: 100, y: 50, width: 400, height: 40 })).toBeNull();
  });
});

describe("heldLookFrame — every look keeps the grab point on the pointer", (): void => {
  const pane: HeldLookGeometry = {
    frame: { width: 400, height: 300 },
    leafTop: 0,
    leafHeight: 300,
    grab: { x: 60, y: 14 },
    titleBottom: 40,
  };

  it("amount 0 is the full pane in every look", (): void => {
    for (const look of ["title-bar", "thumbnail", "fade", "none"] as const) {
      expect(heldLookFrame(look, 0, pane)).toEqual({ height: 300, anchorY: 14, leafHeight: 300, scale: 1, opacity: 1 });
    }
  });

  it("title-bar folds to the title bar under a fixed top edge; the grab keeps its height", (): void => {
    expect(heldLookFrame("title-bar", 1, pane)).toEqual({ height: 40, anchorY: 14, leafHeight: 40, scale: 1, opacity: 1 });
    expect(heldLookFrame("title-bar", 0.5, pane)).toEqual({ height: 170, anchorY: 14, leafHeight: 170, scale: 1, opacity: 1 });
  });

  it("title-bar with no title bar measured draws the full pane", (): void => {
    expect(heldLookFrame("title-bar", 1, { ...pane, titleBottom: null }).height).toBe(300);
  });

  it("a group dragged by its strip folds to the strip alone", (): void => {
    const group: HeldLookGeometry = { ...pane, frame: { width: 400, height: 330 }, leafTop: 30, leafHeight: 300, titleBottom: 30 };
    expect(heldLookFrame("title-bar", 1, group)).toEqual({ height: 30, anchorY: 14, leafHeight: 0, scale: 1, opacity: 1 });
  });

  it("a group folds to its strip and the pane's title bar", (): void => {
    const group: HeldLookGeometry = { ...pane, frame: { width: 400, height: 330 }, leafTop: 30, leafHeight: 300, titleBottom: 70 };
    expect(heldLookFrame("title-bar", 1, group)).toEqual({ height: 70, anchorY: 14, leafHeight: 40, scale: 1, opacity: 1 });
  });

  it("a grab below the title bar ends on its bottom edge", (): void => {
    expect(heldLookFrame("title-bar", 1, { ...pane, grab: { x: 60, y: 200 } }).anchorY).toBe(40);
  });

  it("thumbnail scales about the grab point; fade only changes opacity", (): void => {
    expect(heldLookFrame("thumbnail", 1, pane)).toEqual({ height: 300, anchorY: 14, leafHeight: 300, scale: HELD_THUMBNAIL_SCALE, opacity: 1 });
    expect(heldLookFrame("fade", 1, pane)).toEqual({ height: 300, anchorY: 14, leafHeight: 300, scale: 1, opacity: HELD_FADE_OPACITY });
    expect(heldLookFrame("none", 1, pane)).toEqual({ height: 300, anchorY: 14, leafHeight: 300, scale: 1, opacity: 1 });
  });

  it("the amount is clamped into 0..1", (): void => {
    expect(heldLookFrame("thumbnail", 2, pane).scale).toBe(HELD_THUMBNAIL_SCALE);
    expect(heldLookFrame("thumbnail", -1, pane).scale).toBe(1);
  });
});

describe("createHeldLookMotion — the settle both ways, snapping under reduced motion", (): void => {
  function harness(reduced: boolean): { clock: FakeClock; amounts: number[]; motion: ReturnType<typeof createHeldLookMotion> } {
    const clock: FakeClock = createFakeClock();
    const loop: FrameLoop = createFrameLoop({ clock });
    const amounts: number[] = [];
    const motion = createHeldLookMotion({
      loop,
      omega: SETTLE_TEMPO.default,
      reducedMotion: (): boolean => reduced,
      onChange: (amount: number): void => void amounts.push(amount),
    });
    return { clock, amounts, motion };
  }

  it("glides to the look and back, monotonic, never past either end, and rests", (): void => {
    const h = harness(false);
    h.motion.to(true);
    expect(h.motion.moving).toBe(true);
    h.clock.runUntilIdle();
    expect(h.motion.amount).toBe(1);
    expect(h.motion.moving).toBe(false);
    const there: number[] = [...h.amounts];
    expect(there.length).toBeGreaterThan(3);
    for (let i = 1; i < there.length; i++) {
      expect(there[i]).toBeGreaterThanOrEqual(there[i - 1]);
      expect(there[i]).toBeLessThanOrEqual(1);
    }
    h.amounts.length = 0;
    h.motion.to(false);
    h.clock.runUntilIdle();
    expect(h.motion.amount).toBe(0);
    for (let i = 1; i < h.amounts.length; i++) {
      expect(h.amounts[i]).toBeLessThanOrEqual(h.amounts[i - 1]);
      expect(h.amounts[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it("turns mid-flight from where it is", (): void => {
    const h = harness(false);
    h.motion.to(true);
    h.clock.frames(2);
    const mid: number = h.motion.amount;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    h.motion.to(false);
    h.clock.frame();
    expect(h.motion.amount).toBeLessThan(mid);
    h.clock.runUntilIdle();
    expect(h.motion.amount).toBe(0);
  });

  it("snaps under reduced motion, both ways, with no frames", (): void => {
    const h = harness(true);
    h.motion.to(true);
    expect(h.motion.amount).toBe(1);
    expect(h.motion.moving).toBe(false);
    expect(h.clock.pendingFrames).toBe(0);
    h.motion.to(false);
    expect(h.motion.amount).toBe(0);
    // A snap is drawn by the caller, which places the pane right after.
    expect(h.amounts).toEqual([]);
  });

  it("jumpTo rests at once and dispose stops stepping", (): void => {
    const h = harness(false);
    h.motion.to(true);
    h.clock.frame();
    h.motion.jumpTo(false);
    expect(h.motion.amount).toBe(0);
    expect(h.motion.moving).toBe(false);
    h.motion.to(true);
    h.motion.dispose();
    const before: number = h.motion.amount;
    h.clock.frames(5);
    expect(h.motion.amount).toBe(before);
  });
});
