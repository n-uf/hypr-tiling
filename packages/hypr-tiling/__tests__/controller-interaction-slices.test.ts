import { describe, expect, it } from "@jest/globals";
import type { DragResolvedTarget } from "../core/drag-machine";
import {
  type TilingController,
  type TilingControllerHost,
  type TilingControllerState,
  createTilingController,
} from "../core/controller";
import type { DragInputDriverSlotCommitment } from "../core/input-driver";
import {
  EMPTY_FOCUS_HISTORY,
  type FocusHistory,
  pruneFocusHistory,
  pushFocusHistory,
  resolveFocusCurrentOrLast,
} from "../core/focus-history";
import {
  advancePaneSwitcher,
  commitPaneSwitcher,
  openPaneSwitcher,
  resolveMaximizeToggle,
} from "../core/pane-switching";
import {
  canGroupMultiSelection,
  pruneMultiSelection,
  toggleLeafMultiSelection,
} from "../core/multi-selection";
import type {
  ResolvedTilingKeyChordModifiers,
  TilingLayoutNode,
  TilingLeafNode,
  TilingMoveModeState,
  TilingPaneSwitcherState,
  TilingSplitNode,
} from "../core/types";

// IMPORT-GRAPH GATE (mirrors controller-headless.test.ts): this file imports
// ONLY `core/` modules. There is NO `react` / `react-dom` and NO DOM
// (`document` / `window`) in its transitive import graph — the Stage-7
// state-collapse folded the renderer's focus / maximize / switcher / move-mode /
// multi-select `useState`/`useRef` slices into `createTilingController`, and
// these characterization tests exercise those slices against the framework-free
// store exactly as the renderer's callbacks do (via the SAME pure `core/`
// helpers), with no React render harness. If a future edit pulls a React/DOM
// dependency into `core/controller.ts`, this module fails to load under the
// headless (node) path and the gate trips.

const HOLD_ALT: ResolvedTilingKeyChordModifiers = {
  alt: true,
  ctrl: false,
  meta: false,
  shift: false,
};

/** A scripted no-target stub host — the interaction slices under test never touch it. */
function createStubHost(): TilingControllerHost {
  return {
    resolveTarget: (): DragResolvedTarget | null => null,
    capturePointer: (): void => undefined,
    getSlotCommitment: (): DragInputDriverSlotCommitment => ({
      mode: "delta-responsive",
      reresolveDeltaPx: 24,
    }),
  };
}

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id, tileId: `tile-${id}` };
}

// A 3-leaf right-leaning tree: split(a, split(b, c)).
function threeLeafTree(): TilingSplitNode {
  return {
    kind: "split",
    id: "root",
    axis: "horizontal",
    ratio: 0.5,
    first: leaf("a"),
    second: {
      kind: "split",
      id: "inner",
      axis: "horizontal",
      ratio: 0.5,
      first: leaf("b"),
      second: leaf("c"),
    },
  };
}

function makeController(): {
  controller: TilingController;
  notifies: () => number;
  unsubscribe: () => void;
} {
  const controller: TilingController = createTilingController({
    host: createStubHost(),
  });
  let count: number = 0;
  const unsubscribe: () => void = controller.subscribe((): void => {
    count += 1;
  });
  return { controller, notifies: (): number => count, unsubscribe };
}

describe("controller store — folded interaction slices (no React/DOM)", (): void => {
  it("starts at the interaction defaults alongside the idle drag FSM", (): void => {
    const controller: TilingController = createTilingController({
      host: createStubHost(),
    });
    const state: TilingControllerState = controller.getState();
    expect(state.drag.phase).toBe("idle");
    expect(state.focus).toBeNull();
    expect(state.maximize).toBeNull();
    expect(state.switcher).toBeNull();
    expect(state.moveMode).toBeNull();
    expect([...state.multiSelect]).toEqual([]);
    expect(controller.getFocusHistory()).toBe(EMPTY_FOCUS_HISTORY);
    controller.dispose();
  });

  describe("focus slice + MRU history integration", (): void => {
    it("mirrors setFocusedLeaf: pushes MRU history then sets focus, toggling current-or-last", (): void => {
      const { controller, notifies, unsubscribe } = makeController();

      // The renderer's `setFocusedLeaf` sequence: history push (off-snapshot),
      // then the internal focus set (snapshot + notify).
      const focusPane = (id: string): void => {
        controller.updateFocusHistory((history: FocusHistory): FocusHistory =>
          pushFocusHistory(history, id),
        );
        controller.setFocus(id);
      };

      focusPane("a");
      focusPane("b");
      expect(controller.getState().focus).toBe("b");
      expect(controller.getFocusHistory().entries).toEqual(["a", "b"]);
      // Two real focus transitions → two notifies (history pushes are silent).
      expect(notifies()).toBe(2);

      // "current-or-last" resolves to the previously-focused distinct pane.
      expect(
        resolveFocusCurrentOrLast(
          controller.getFocusHistory(),
          controller.getState().focus,
        ),
      ).toBe("a");

      unsubscribe();
      controller.dispose();
    });

    it("suppresses a same-value focus set (Object.is bail-out, no notify)", (): void => {
      const { controller, notifies, unsubscribe } = makeController();
      controller.setFocus("a");
      const afterFirst: TilingControllerState = controller.getState();
      expect(notifies()).toBe(1);
      controller.setFocus("a");
      expect(controller.getState()).toBe(afterFirst);
      expect(notifies()).toBe(1);
      unsubscribe();
      controller.dispose();
    });

    it("keeps the MRU history OUT of the notified snapshot (a push never re-renders)", (): void => {
      const { controller, notifies, unsubscribe } = makeController();
      const before: TilingControllerState = controller.getState();
      controller.updateFocusHistory((history: FocusHistory): FocusHistory =>
        pushFocusHistory(history, "a"),
      );
      expect(controller.getState()).toBe(before);
      expect(notifies()).toBe(0);
      expect(controller.getFocusHistory().entries).toEqual(["a"]);
      unsubscribe();
      controller.dispose();
    });

    it("prunes the MRU history against the live leaf-id set", (): void => {
      const controller: TilingController = createTilingController({
        host: createStubHost(),
      });
      controller.updateFocusHistory((history: FocusHistory): FocusHistory =>
        pushFocusHistory(pushFocusHistory(history, "a"), "z"),
      );
      controller.updateFocusHistory((history: FocusHistory): FocusHistory =>
        pruneFocusHistory(history, ["a", "b", "c"]),
      );
      expect(controller.getFocusHistory().entries).toEqual(["a"]);
      controller.dispose();
    });
  });

  describe("maximize toggle", (): void => {
    it("toggles the internal maximized-leaf slice on and off via resolveMaximizeToggle", (): void => {
      const { controller, notifies, unsubscribe } = makeController();

      // First toggle on the focused pane maximizes it.
      controller.setMaximize(resolveMaximizeToggle(controller.getState().maximize, "b"));
      expect(controller.getState().maximize).toBe("b");

      // Re-toggling the same pane restores (null).
      controller.setMaximize(resolveMaximizeToggle(controller.getState().maximize, "b"));
      expect(controller.getState().maximize).toBeNull();

      // Toggling a DIFFERENT pane while one is maximized switches the maximized pane.
      controller.setMaximize("b");
      controller.setMaximize(resolveMaximizeToggle(controller.getState().maximize, "c"));
      expect(controller.getState().maximize).toBe("c");

      // set-on, set-off, set-b, switch-to-c → 4 notifies.
      expect(notifies()).toBe(4);
      unsubscribe();
      controller.dispose();
    });
  });

  describe("switcher advance / commit", (): void => {
    it("opens, advances the highlight, and commits the selected pane", (): void => {
      const { controller, unsubscribe } = makeController();
      const leafIds: ReadonlyArray<string> = ["a", "b", "c"];

      const opened: TilingPaneSwitcherState | null = openPaneSwitcher(
        leafIds,
        "a",
        "next",
        HOLD_ALT,
      );
      expect(opened).not.toBeNull();
      controller.setSwitcher(opened);
      expect(controller.getState().switcher?.selectedLeafId).toBe("b");

      // Advance the highlight one more step.
      const current: TilingPaneSwitcherState | null =
        controller.getState().switcher;
      if (current == null) {
        throw new Error("switcher expected open");
      }
      controller.setSwitcher(advancePaneSwitcher(leafIds, current, "next"));
      const advanced: TilingPaneSwitcherState | null =
        controller.getState().switcher;
      expect(advanced?.selectedLeafId).toBe("c");

      // Commit reads the selection then closes the overlay.
      if (advanced == null) {
        throw new Error("switcher expected open");
      }
      const committed: string = commitPaneSwitcher(advanced);
      controller.setSwitcher(null);
      expect(committed).toBe("c");
      expect(controller.getState().switcher).toBeNull();

      unsubscribe();
      controller.dispose();
    });
  });

  describe("move-mode enter / aim / commit / cancel", (): void => {
    it("enters on a source, aims a target, and clears on commit", (): void => {
      const { controller, unsubscribe } = makeController();

      controller.setMoveMode({
        sourceLeafId: "a",
        targetLeafId: null,
        placement: null,
      });
      expect(controller.getState().moveMode).toEqual({
        sourceLeafId: "a",
        targetLeafId: null,
        placement: null,
      });

      // Aim (functional update, exactly as the renderer's aimMoveMode).
      controller.setMoveMode(
        (current: TilingMoveModeState | null): TilingMoveModeState | null =>
          current == null
            ? current
            : { ...current, targetLeafId: "b", placement: "right" },
      );
      expect(controller.getState().moveMode).toEqual({
        sourceLeafId: "a",
        targetLeafId: "b",
        placement: "right",
      });

      // Commit reads the latest then clears the slice (the layout mutation is
      // the renderer's; the store transition is null).
      const inFlight: TilingMoveModeState | null =
        controller.getState().moveMode;
      controller.setMoveMode(null);
      expect(inFlight?.targetLeafId).toBe("b");
      expect(controller.getState().moveMode).toBeNull();

      unsubscribe();
      controller.dispose();
    });

    it("cancels a move back to null", (): void => {
      const { controller, unsubscribe } = makeController();
      controller.setMoveMode({
        sourceLeafId: "a",
        targetLeafId: null,
        placement: null,
      });
      controller.setMoveMode(null);
      expect(controller.getState().moveMode).toBeNull();
      unsubscribe();
      controller.dispose();
    });
  });

  describe("multi-select toggle / prune / group", (): void => {
    it("toggles membership, is groupable at ≥2, and prunes vanished panes", (): void => {
      const { controller, notifies, unsubscribe } = makeController();
      const layout: TilingLayoutNode = threeLeafTree();

      const toggle = (id: string): void => {
        controller.setMultiSelect(
          (current: ReadonlySet<string>): ReadonlySet<string> =>
            toggleLeafMultiSelection(current, id),
        );
      };

      toggle("a");
      expect(
        canGroupMultiSelection(layout, controller.getState().multiSelect),
      ).toBe(false);
      toggle("b");
      expect([...controller.getState().multiSelect]).toEqual(["a", "b"]);
      expect(
        canGroupMultiSelection(layout, controller.getState().multiSelect),
      ).toBe(true);

      // Toggling `a` off removes it, preserving order.
      toggle("a");
      expect([...controller.getState().multiSelect]).toEqual(["b"]);
      expect(notifies()).toBe(3);

      // Prune drops a selected id no longer present.
      controller.setMultiSelect(
        (current: ReadonlySet<string>): ReadonlySet<string> =>
          pruneMultiSelection(current, ["a", "c"]),
      );
      expect([...controller.getState().multiSelect]).toEqual([]);
      expect(notifies()).toBe(4);

      unsubscribe();
      controller.dispose();
    });

    it("suppresses a no-op prune (same-reference result, no notify)", (): void => {
      const { controller, notifies, unsubscribe } = makeController();
      controller.setMultiSelect(new Set<string>(["a", "b"]));
      const afterSet: TilingControllerState = controller.getState();
      expect(notifies()).toBe(1);
      // Nothing to prune → pruneMultiSelection returns the SAME reference →
      // Object.is bail-out → no snapshot rebuild, no notify.
      controller.setMultiSelect(
        (current: ReadonlySet<string>): ReadonlySet<string> =>
          pruneMultiSelection(current, ["a", "b", "c"]),
      );
      expect(controller.getState()).toBe(afterSet);
      expect(notifies()).toBe(1);
      unsubscribe();
      controller.dispose();
    });

    it("clears to empty only when non-empty (no pointless re-render when already empty)", (): void => {
      const { controller, notifies, unsubscribe } = makeController();
      const clear = (): void => {
        controller.setMultiSelect(
          (current: ReadonlySet<string>): ReadonlySet<string> =>
            current.size === 0 ? current : new Set<string>(),
        );
      };
      // Already empty → no-op → no notify.
      clear();
      expect(notifies()).toBe(0);
      controller.setMultiSelect(new Set<string>(["a"]));
      clear();
      expect([...controller.getState().multiSelect]).toEqual([]);
      // set-a + clear = 2 notifies.
      expect(notifies()).toBe(2);
      unsubscribe();
      controller.dispose();
    });
  });

  it("interaction sets leave the drag FSM slice untouched", (): void => {
    const controller: TilingController = createTilingController({
      host: createStubHost(),
    });
    const dragBefore = controller.getState().drag;
    controller.setFocus("a");
    controller.setMaximize("b");
    controller.setMultiSelect(new Set<string>(["a", "b"]));
    expect(controller.getState().drag).toBe(dragBefore);
    expect(controller.getState().drag.phase).toBe("idle");
    controller.dispose();
  });
});
