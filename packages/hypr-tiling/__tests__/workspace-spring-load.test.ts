import { describe, expect, it } from "@jest/globals";
import {
  TILING_SPRING_LOAD_DEFAULTS,
  TILING_SPRING_LOAD_INITIAL_STATE,
  isWorkspaceTabDragHover,
  resolveSpringLoadCapability,
  resolveSpringLoadConfig,
  springLoadFireAt,
  springLoadReducer,
  type TilingSpringLoadConfig,
  type TilingSpringLoadEvent,
  type TilingSpringLoadState,
} from "../engine/workspace-spring-load";
import type {
  TilingExternalDragHover,
  TilingWorkspacePlacement,
  TilingWorkspaceTabDragHover,
} from "../engine/types";

const ACTIVE: string = "ws-main";
const OTHER: string = "ws-other";
const THIRD: string = "ws-third";
const LEAF: string = "leaf-a";

const REGION_END: TilingWorkspacePlacement = { kind: "region", region: "end" };

function tabHover(
  workspaceId: string,
  placement?: TilingWorkspacePlacement,
): TilingWorkspaceTabDragHover {
  return {
    kind: "workspace-tab",
    targetId: `tab:${workspaceId}`,
    point: { x: 40, y: 12 },
    workspaceId,
    placement,
  };
}

function externalHover(): TilingExternalDragHover {
  return { targetId: "chat-panel", point: { x: 900, y: 300 } };
}

function hover(
  hoverValue: TilingExternalDragHover | null,
  ts: number,
  overrides: Partial<{ leafId: string | null; activeWorkspaceId: string | null }> = {},
): TilingSpringLoadEvent {
  return {
    type: "HOVER",
    hover: hoverValue,
    leafId: overrides.leafId === undefined ? LEAF : overrides.leafId,
    activeWorkspaceId:
      overrides.activeWorkspaceId === undefined ? ACTIVE : overrides.activeWorkspaceId,
    ts,
  };
}

function tick(ts: number): TilingSpringLoadEvent {
  return { type: "TICK", ts };
}

/** Run a sequence of events from the initial state. */
function run(
  events: ReadonlyArray<TilingSpringLoadEvent>,
  config: TilingSpringLoadConfig = TILING_SPRING_LOAD_DEFAULTS,
): TilingSpringLoadState {
  return events.reduce(
    (state: TilingSpringLoadState, event: TilingSpringLoadEvent): TilingSpringLoadState =>
      springLoadReducer(state, event, config),
    TILING_SPRING_LOAD_INITIAL_STATE,
  );
}

const DWELLING_AT_1000: TilingSpringLoadState = run([hover(tabHover(OTHER, REGION_END), 1000)]);
const FIRED: TilingSpringLoadState = run([
  hover(tabHover(OTHER, REGION_END), 1000),
  tick(1000 + TILING_SPRING_LOAD_DEFAULTS.dwellMs),
]);

describe("spring-load config + capability resolution", () => {
  it("defaults dwell to 500 ms", () => {
    expect(TILING_SPRING_LOAD_DEFAULTS).toEqual({ dwellMs: 500 });
    expect(resolveSpringLoadConfig()).toEqual({ dwellMs: 500 });
    expect(resolveSpringLoadConfig(null)).toEqual({ dwellMs: 500 });
    expect(resolveSpringLoadConfig({})).toEqual({ dwellMs: 500 });
  });

  it("merges an override and clamps a negative dwell to 0", () => {
    expect(resolveSpringLoadConfig({ dwellMs: 120 })).toEqual({ dwellMs: 120 });
    expect(resolveSpringLoadConfig({ dwellMs: -5 })).toEqual({ dwellMs: 0 });
  });

  it("resolves the capability: false / nullish → null (disabled), object → merged config", () => {
    expect(resolveSpringLoadCapability(false)).toBeNull();
    expect(resolveSpringLoadCapability(undefined)).toBeNull();
    expect(resolveSpringLoadCapability(null)).toBeNull();
    expect(resolveSpringLoadCapability({})).toEqual({ dwellMs: 500 });
    expect(resolveSpringLoadCapability({ dwellMs: 250 })).toEqual({ dwellMs: 250 });
  });

  it("isWorkspaceTabDragHover narrows the hover union", () => {
    expect(isWorkspaceTabDragHover(tabHover(OTHER))).toBe(true);
    expect(isWorkspaceTabDragHover(externalHover())).toBe(false);
    expect(isWorkspaceTabDragHover({ kind: "external", targetId: "x", point: { x: 0, y: 0 } })).toBe(false);
    expect(isWorkspaceTabDragHover(null)).toBe(false);
    expect(isWorkspaceTabDragHover(undefined)).toBe(false);
  });
});

describe("spring-load dwell FSM — HOVER", () => {
  it("starts idle with null workspaceId / since / intent", () => {
    expect(TILING_SPRING_LOAD_INITIAL_STATE).toEqual({
      phase: "idle",
      workspaceId: null,
      since: null,
      leafId: null,
      intent: null,
    });
  });

  it("a workspace-tab hover over a non-active tab starts dwelling at the sample's ts, carrying leaf + placement", () => {
    expect(DWELLING_AT_1000).toEqual({
      phase: "dwelling",
      workspaceId: OTHER,
      since: 1000,
      leafId: LEAF,
      placement: REGION_END,
      intent: null,
    });
  });

  it("the same tab continues the dwell — `since` is kept and the state reference is unchanged", () => {
    const next: TilingSpringLoadState = springLoadReducer(
      DWELLING_AT_1000,
      hover(tabHover(OTHER, REGION_END), 1300),
    );
    expect(next).toBe(DWELLING_AT_1000);
    expect(next.since).toBe(1000);
  });

  it("the same tab reported through a different targetId / placement still continues (keyed on workspaceId)", () => {
    const next: TilingSpringLoadState = springLoadReducer(
      DWELLING_AT_1000,
      hover({ ...tabHover(OTHER), targetId: "tab-other-alt", placement: undefined }, 1300),
    );
    expect(next).toBe(DWELLING_AT_1000);
  });

  it("a different tab RESTARTS the dwell (`since` = the new sample's ts, new workspaceId)", () => {
    const next: TilingSpringLoadState = springLoadReducer(
      DWELLING_AT_1000,
      hover(tabHover(THIRD), 1300),
    );
    expect(next.phase).toBe("dwelling");
    expect(next.workspaceId).toBe(THIRD);
    expect(next.since).toBe(1300);
    // The restarted dwell must not fire on the ORIGINAL deadline.
    const atOldDeadline: TilingSpringLoadState = springLoadReducer(next, tick(1500));
    expect(atOldDeadline.phase).toBe("dwelling");
    const atNewDeadline: TilingSpringLoadState = springLoadReducer(next, tick(1800));
    expect(atNewDeadline.phase).toBe("fired");
    expect(atNewDeadline.intent?.workspaceId).toBe(THIRD);
  });

  it("a different dragged leaf over the same tab restarts the dwell", () => {
    const next: TilingSpringLoadState = springLoadReducer(
      DWELLING_AT_1000,
      hover(tabHover(OTHER), 1200, { leafId: "leaf-b" }),
    );
    expect(next.phase).toBe("dwelling");
    expect(next.leafId).toBe("leaf-b");
    expect(next.since).toBe(1200);
  });

  it("a null hover resets to idle", () => {
    const next: TilingSpringLoadState = springLoadReducer(DWELLING_AT_1000, hover(null, 1200));
    expect(next).toBe(TILING_SPRING_LOAD_INITIAL_STATE);
  });

  it("a non-tab external hover resets to idle (and never starts a dwell from idle)", () => {
    expect(springLoadReducer(DWELLING_AT_1000, hover(externalHover(), 1200))).toBe(
      TILING_SPRING_LOAD_INITIAL_STATE,
    );
    expect(springLoadReducer(TILING_SPRING_LOAD_INITIAL_STATE, hover(externalHover(), 0))).toBe(
      TILING_SPRING_LOAD_INITIAL_STATE,
    );
  });

  it("the ACTIVE workspace's own tab never dwells: from idle stays idle, while dwelling resets", () => {
    expect(springLoadReducer(TILING_SPRING_LOAD_INITIAL_STATE, hover(tabHover(ACTIVE), 0))).toBe(
      TILING_SPRING_LOAD_INITIAL_STATE,
    );
    expect(springLoadReducer(DWELLING_AT_1000, hover(tabHover(ACTIVE), 1200))).toBe(
      TILING_SPRING_LOAD_INITIAL_STATE,
    );
    // …and it never fires, however long the pointer sits there.
    const held: TilingSpringLoadState = run([
      hover(tabHover(ACTIVE), 0),
      tick(10_000),
      hover(tabHover(ACTIVE), 10_000),
      tick(20_000),
    ]);
    expect(held.phase).toBe("idle");
  });

  it("a hover with no live leaf (leafId null) resets / never starts", () => {
    expect(
      springLoadReducer(TILING_SPRING_LOAD_INITIAL_STATE, hover(tabHover(OTHER), 0, { leafId: null })),
    ).toBe(TILING_SPRING_LOAD_INITIAL_STATE);
    expect(springLoadReducer(DWELLING_AT_1000, hover(tabHover(OTHER), 1200, { leafId: null }))).toBe(
      TILING_SPRING_LOAD_INITIAL_STATE,
    );
  });

  it("an unknown active workspace (null) does not block dwelling on any tab", () => {
    const next: TilingSpringLoadState = springLoadReducer(
      TILING_SPRING_LOAD_INITIAL_STATE,
      hover(tabHover(OTHER), 0, { activeWorkspaceId: null }),
    );
    expect(next.phase).toBe("dwelling");
  });
});

describe("spring-load dwell FSM — TICK", () => {
  it("does not fire before dwellMs has elapsed", () => {
    const early: TilingSpringLoadState = springLoadReducer(DWELLING_AT_1000, tick(1499));
    expect(early).toBe(DWELLING_AT_1000);
  });

  it("fires exactly at ts − since == dwellMs with a commit-and-rearm intent", () => {
    expect(FIRED).toEqual({
      phase: "fired",
      workspaceId: OTHER,
      since: 1000,
      leafId: LEAF,
      placement: REGION_END,
      intent: {
        kind: "commit-and-rearm",
        leafId: LEAF,
        workspaceId: OTHER,
        placement: REGION_END,
      },
    });
  });

  it("fires past the deadline too (a late timer still fires)", () => {
    const late: TilingSpringLoadState = springLoadReducer(DWELLING_AT_1000, tick(9000));
    expect(late.phase).toBe("fired");
  });

  it("the intent carries `placement: undefined` when the hover had none (engine default seat)", () => {
    const fired: TilingSpringLoadState = run([hover(tabHover(OTHER), 0), tick(500)]);
    expect(fired.intent).toEqual({
      kind: "commit-and-rearm",
      leafId: LEAF,
      workspaceId: OTHER,
      placement: undefined,
    });
  });

  it("honours a custom dwellMs", () => {
    const config: TilingSpringLoadConfig = { dwellMs: 150 };
    const dwelling: TilingSpringLoadState = run([hover(tabHover(OTHER), 100)], config);
    expect(springLoadReducer(dwelling, tick(249), config).phase).toBe("dwelling");
    expect(springLoadReducer(dwelling, tick(250), config).phase).toBe("fired");
  });

  it("dwellMs 0 fires on the first TICK", () => {
    const config: TilingSpringLoadConfig = { dwellMs: 0 };
    const fired: TilingSpringLoadState = run([hover(tabHover(OTHER), 100), tick(100)], config);
    expect(fired.phase).toBe("fired");
  });

  it("TICK in idle is a no-op (same reference)", () => {
    expect(springLoadReducer(TILING_SPRING_LOAD_INITIAL_STATE, tick(5000))).toBe(
      TILING_SPRING_LOAD_INITIAL_STATE,
    );
  });

  it("fires exactly once: further TICKs and HOVERs while fired are absorbed (same reference)", () => {
    expect(springLoadReducer(FIRED, tick(2000))).toBe(FIRED);
    expect(springLoadReducer(FIRED, hover(tabHover(OTHER, REGION_END), 2000))).toBe(FIRED);
    expect(springLoadReducer(FIRED, hover(tabHover(THIRD), 2000))).toBe(FIRED);
    expect(springLoadReducer(FIRED, hover(null, 2000))).toBe(FIRED);
    expect(springLoadReducer(FIRED, hover(externalHover(), 2000))).toBe(FIRED);
  });
});

describe("spring-load dwell FSM — RESET / DRAG_END", () => {
  it("RESET returns to idle from dwelling and from fired", () => {
    expect(springLoadReducer(DWELLING_AT_1000, { type: "RESET" })).toBe(TILING_SPRING_LOAD_INITIAL_STATE);
    expect(springLoadReducer(FIRED, { type: "RESET" })).toBe(TILING_SPRING_LOAD_INITIAL_STATE);
  });

  it("DRAG_END returns to idle from dwelling and from fired", () => {
    expect(springLoadReducer(DWELLING_AT_1000, { type: "DRAG_END" })).toBe(TILING_SPRING_LOAD_INITIAL_STATE);
    expect(springLoadReducer(FIRED, { type: "DRAG_END" })).toBe(TILING_SPRING_LOAD_INITIAL_STATE);
  });

  it("RESET / DRAG_END in idle are no-ops (same reference)", () => {
    expect(springLoadReducer(TILING_SPRING_LOAD_INITIAL_STATE, { type: "RESET" })).toBe(
      TILING_SPRING_LOAD_INITIAL_STATE,
    );
    expect(springLoadReducer(TILING_SPRING_LOAD_INITIAL_STATE, { type: "DRAG_END" })).toBe(
      TILING_SPRING_LOAD_INITIAL_STATE,
    );
  });

  it("after RESET a fresh hover on the same tab starts a NEW dwell (fires again after a full dwellMs)", () => {
    const again: TilingSpringLoadState = run([
      hover(tabHover(OTHER), 0),
      tick(500),
      { type: "RESET" },
      hover(tabHover(OTHER), 600),
      tick(1099),
    ]);
    expect(again.phase).toBe("dwelling");
    expect(springLoadReducer(again, tick(1100)).phase).toBe("fired");
  });

  it("a hover that stops before the deadline never fires, even with later ticks", () => {
    const state: TilingSpringLoadState = run([
      hover(tabHover(OTHER), 0),
      tick(400),
      hover(null, 450),
      tick(500),
      tick(5000),
    ]);
    expect(state).toBe(TILING_SPRING_LOAD_INITIAL_STATE);
  });

  it("is total: every event in every phase yields a well-formed state", () => {
    const phases: ReadonlyArray<TilingSpringLoadState> = [
      TILING_SPRING_LOAD_INITIAL_STATE,
      DWELLING_AT_1000,
      FIRED,
    ];
    const events: ReadonlyArray<TilingSpringLoadEvent> = [
      hover(null, 2000),
      hover(externalHover(), 2000),
      hover(tabHover(ACTIVE), 2000),
      hover(tabHover(OTHER), 2000),
      hover(tabHover(THIRD), 2000),
      tick(0),
      tick(2000),
      { type: "RESET" },
      { type: "DRAG_END" },
    ];
    for (const state of phases) {
      for (const event of events) {
        const next: TilingSpringLoadState = springLoadReducer(state, event);
        expect(["idle", "dwelling", "fired"]).toContain(next.phase);
        if (next.phase === "idle") {
          expect(next.workspaceId).toBeNull();
          expect(next.since).toBeNull();
          expect(next.intent).toBeNull();
        } else {
          expect(typeof next.workspaceId).toBe("string");
          expect(typeof next.since).toBe("number");
          expect(next.intent == null).toBe(next.phase === "dwelling");
        }
      }
    }
  });
});

describe("springLoadFireAt", () => {
  it("is since + dwellMs while dwelling, null otherwise", () => {
    expect(springLoadFireAt(DWELLING_AT_1000)).toBe(1500);
    expect(springLoadFireAt(DWELLING_AT_1000, { dwellMs: 200 })).toBe(1200);
    expect(springLoadFireAt(TILING_SPRING_LOAD_INITIAL_STATE)).toBeNull();
    expect(springLoadFireAt(FIRED)).toBeNull();
  });

  it("a TICK at exactly fireAt fires; one ms earlier does not", () => {
    const fireAt: number | null = springLoadFireAt(DWELLING_AT_1000);
    expect(fireAt).not.toBeNull();
    const at: number = fireAt as number;
    expect(springLoadReducer(DWELLING_AT_1000, tick(at - 1)).phase).toBe("dwelling");
    expect(springLoadReducer(DWELLING_AT_1000, tick(at)).phase).toBe("fired");
  });
});
