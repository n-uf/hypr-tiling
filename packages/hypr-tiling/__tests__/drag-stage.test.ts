/**
 * The held pane is drawn inside the stage (the tiling viewport): the rect the
 * pointer holds it at is moved, never resized, to lie inside, as
 * `@n-uf/placement`'s `clampInto` does; a pane larger than the stage keeps its
 * top-left corner on the stage's along that axis. Only the drawing is clamped.
 */
import { describe, expect, it } from "@jest/globals";
import { clampHeldRectToStage } from "../engine/drag-landing";

const STAGE = { width: 1000, height: 600 } as const;
const PANE = { width: 300, height: 200 } as const;

describe("held pane — clamped to the stage", (): void => {
  it("a rect already inside is drawn where the pointer holds it", (): void => {
    const held = { x: 120, y: 80, ...PANE };
    expect(clampHeldRectToStage(held, STAGE)).toEqual(held);
    // Touching every edge exactly is inside.
    expect(clampHeldRectToStage({ x: 0, y: 0, ...PANE }, STAGE)).toEqual({ x: 0, y: 0, ...PANE });
    expect(clampHeldRectToStage({ x: 700, y: 400, ...PANE }, STAGE)).toEqual({ x: 700, y: 400, ...PANE });
  });

  it("stops at each of the four edges, moving along the other axis as held", (): void => {
    expect(clampHeldRectToStage({ x: -40, y: 100, ...PANE }, STAGE)).toEqual({ x: 0, y: 100, ...PANE });
    expect(clampHeldRectToStage({ x: 120, y: -1, ...PANE }, STAGE)).toEqual({ x: 120, y: 0, ...PANE });
    expect(clampHeldRectToStage({ x: 701, y: 100, ...PANE }, STAGE)).toEqual({ x: 700, y: 100, ...PANE });
    expect(clampHeldRectToStage({ x: 120, y: 950, ...PANE }, STAGE)).toEqual({ x: 120, y: 400, ...PANE });
  });

  it("stops in a corner when past two edges", (): void => {
    expect(clampHeldRectToStage({ x: -500, y: -500, ...PANE }, STAGE)).toEqual({ x: 0, y: 0, ...PANE });
    expect(clampHeldRectToStage({ x: 5000, y: 5000, ...PANE }, STAGE)).toEqual({ x: 700, y: 400, ...PANE });
  });

  it("a pane larger than the stage keeps its top-left on the stage's (per axis)", (): void => {
    expect(clampHeldRectToStage({ x: 300, y: 300, width: 1200, height: 700 }, STAGE)).toEqual({ x: 0, y: 0, width: 1200, height: 700 });
    expect(clampHeldRectToStage({ x: -300, y: -300, width: 1200, height: 700 }, STAGE)).toEqual({ x: 0, y: 0, width: 1200, height: 700 });
    // Wider only: x pinned at 0, y still clamped inside.
    expect(clampHeldRectToStage({ x: 50, y: 900, width: 1200, height: 200 }, STAGE)).toEqual({ x: 0, y: 400, width: 1200, height: 200 });
  });

  it("is never resized", (): void => {
    const out = clampHeldRectToStage({ x: 4000, y: -4000, width: 333.5, height: 211.25 }, STAGE);
    expect([out.width, out.height]).toEqual([333.5, 211.25]);
  });

  it("a stage not measured yet leaves the rect as held", (): void => {
    const held = { x: 900, y: 900, ...PANE };
    expect(clampHeldRectToStage(held, { width: 0, height: 0 })).toEqual(held);
    expect(clampHeldRectToStage(held, { width: 1000, height: 0 })).toEqual(held);
  });
});
