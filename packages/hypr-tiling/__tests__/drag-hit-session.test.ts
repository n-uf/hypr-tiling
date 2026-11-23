/**
 * The drag's hit session (`nextDragHitSession`): built once per drag, its parts measured once at the lift; kept through
 * a new `config` object with the same values and a preview switched mid-drag; rebuilt from the lift's part measures,
 * on the same basis and with no DOM read, when the layout or the viewport itself changes under the drag.
 */
import { nextDragHitSession, type DragHitInputs, type DragHitSession } from "../react/tiling-renderer";
import { TILING_INTERACTION_CAPABILITY_DEFAULTS } from "../engine/interaction-capabilities";
import type { TilingDragPartGeometry } from "../engine/tiling-drag-tree";
import type { TilingLayoutConfig, TilingLayoutNode } from "../engine/types";

const L = (id: string, tileId: string): TilingLayoutNode => ({ kind: "leaf", id, tileId }) as TilingLayoutNode;
const layout: TilingLayoutNode = { kind: "split", id: "root", axis: "horizontal", ratio: 0.5, first: L("la", "a"), second: { kind: "split", id: "right", axis: "vertical", ratio: 0.5, first: L("lb", "b"), second: L("lc", "c") } } as TilingLayoutNode;
const config: TilingLayoutConfig = { gapPx: 6, minPaneSizePx: 96, handleSizePx: 4 };

const inputsOf = (more: Partial<DragHitInputs> = {}): DragHitInputs => ({
  layout,
  config,
  width: 1000,
  height: 700,
  basis: "lift",
  geometry: TILING_INTERACTION_CAPABILITY_DEFAULTS.dropHitZoneGeometry,
  gated: new Set<string>(),
  grouping: true,
  footprints: new Map(),
  ...more,
});

/** A counting measure: how often the parts were read from the DOM. */
function counted(): { measure: () => TilingDragPartGeometry; calls: () => number } {
  let n = 0;
  const parts: TilingDragPartGeometry = { bands: new Map([["b", [{ left: 0, top: 0, right: 0, height: 30 }]]]) };
  return { measure: (): TilingDragPartGeometry => (n++, parts), calls: (): number => n };
}

describe("the drag's hit session", (): void => {
  it("is built once per drag: re-renders, a new config object with the same values and a preview switch keep it", (): void => {
    const m = counted();
    const first: DragHitSession | null = nextDragHitSession(null, inputsOf(), "la", undefined, m.measure);
    expect(first).not.toBeNull();
    let s: DragHitSession | null = first;
    for (const inputs of [inputsOf(), inputsOf({ config: { ...config } }), inputsOf({ basis: "base" }), inputsOf()]) {
      s = nextDragHitSession(s, inputs, "la", undefined, m.measure);
      expect(s).toBe(first);
    }
    expect(s!.basis).toBe("lift");
    expect(m.calls()).toBe(1);
  });

  it("the machine leaves the subject out where the render names it \"pane\": one session for both", (): void => {
    const m = counted();
    const first = nextDragHitSession(null, inputsOf(), "la", undefined, m.measure);
    expect(nextDragHitSession(first, inputsOf(), "la", "pane", m.measure)).toBe(first);
    expect(m.calls()).toBe(1);
  });

  it("a new layout or viewport rebuilds the hit from the lift's part measures, on the same basis, reading no DOM", (): void => {
    const m = counted();
    const first = nextDragHitSession(null, inputsOf({ basis: "base" }), "la", undefined, m.measure)!;
    const moved = nextDragHitSession(first, inputsOf({ layout: { ...(layout as object) } as TilingLayoutNode, basis: "lift" }), "la", undefined, m.measure)!;
    expect(moved).not.toBe(first);
    expect(moved.parts).toBe(first.parts);
    expect(moved.basis).toBe("base");
    const resized = nextDragHitSession(moved, inputsOf({ layout: moved.layout, width: 1200 }), "la", undefined, m.measure)!;
    expect(resized).not.toBe(moved);
    expect(resized.parts).toBe(first.parts);
    expect(resized.hit.laid.layout.get("b")!.width).toBeGreaterThan(first.hit.laid.layout.get("b")!.width);
    const other = nextDragHitSession(resized, inputsOf({ layout: resized.layout, width: 1200, config: { ...config, gapPx: 12 } }), "la", undefined, m.measure)!;
    expect(other).not.toBe(resized);
    expect(m.calls()).toBe(1);
  });

  it("a new drag (another pane) measures its parts anew", (): void => {
    const m = counted();
    const first = nextDragHitSession(null, inputsOf(), "la", undefined, m.measure);
    const next = nextDragHitSession(first, inputsOf(), "lb", undefined, m.measure);
    expect(next).not.toBe(first);
    expect(m.calls()).toBe(2);
  });
});
