/**
 * Workspace set — pure ops, integrity walker, deterministic repair
 * (`engine/workspace-set.ts`; `_agent/workspace-set-concept.md` §2–§3, H1).
 * Fixture-driven rows for every op edge plus property-style sweeps: random
 * sound sets → random op sequences → `workspaceSetIssues` stays empty; random
 * broken sets → `repairWorkspaceSet` → issues empty and reasons non-empty.
 */
import { describe, expect, it } from "@jest/globals";
import {
  TILING_DEFAULT_WORKSPACE_PLACEMENT,
  TILING_WORKSPACES_MAX,
  TILING_WORKSPACE_NAME_MAX_CHARS,
  createWorkspace,
  cycleWorkspace,
  deleteWorkspace,
  hideFromWorkspace,
  hideTileFromWorkspace,
  moveLeafToWorkspace,
  moveTileToWorkspace,
  normalizeWorkspaceName,
  queryWorkspaceSet,
  removeTile,
  renameWorkspace,
  repairWorkspaceSet,
  revealTile,
  setWorkspaceLayout,
  showInWorkspace,
  showTileInWorkspace,
  switchWorkspace,
  workspaceSetIssues,
  workspaceSetOfLayout,
  type TilingHideTileResult,
  type TilingRevealTileResult,
  type TilingWorkspace,
  type TilingWorkspaceSet,
  type TilingWorkspaceSetIssue,
} from "../engine/workspace-set";
import {
  extractLeafNode,
  findLeafById,
  insertLeafAdjacent,
  insertLeafInto,
  isStructurallyValidLayout,
  moveLeafToRoot,
  moveLeafToSplitContainer,
  addLeafToGroup,
  setLeafCollapsed,
} from "../engine/state";
import type {
  TilingGroupNode,
  TilingLayoutNode,
  TilingLeafNode,
  TilingSplitNode,
  TilingWorkspacePlacement,
} from "../engine/types";

function leaf(tileId: string): TilingLeafNode {
  return { kind: "leaf", id: `leaf:${tileId}`, tileId };
}

function split(
  id: string,
  axis: "horizontal" | "vertical",
  first: TilingLayoutNode,
  second: TilingLayoutNode,
  ratio: number = 0.5,
): TilingSplitNode {
  return { kind: "split", id, axis, ratio, first, second };
}

function group(id: string, tileIds: ReadonlyArray<string>, active: string = tileIds[0]): TilingGroupNode {
  return { kind: "group", id, members: tileIds.map(leaf), activeMemberId: `leaf:${active}` };
}

/** main: a | (b / c) ; ops: c | d — `c` is shown in both. */
function twoWorkspaces(): TilingWorkspaceSet {
  return {
    workspaces: [
      { id: "main", name: "Main", layout: split("root", "horizontal", leaf("a"), split("s2", "vertical", leaf("b"), leaf("c"))) },
      { id: "ops", name: "Ops", layout: split("root", "horizontal", leaf("c"), leaf("d")) },
    ],
    activeId: "main",
  };
}

function tileIdsOf(set: TilingWorkspaceSet): ReadonlyArray<ReadonlyArray<string>> {
  const query = queryWorkspaceSet(set);
  return set.workspaces.map((workspace: TilingWorkspace): ReadonlyArray<string> => query.tileIds(workspace.id));
}

function kinds(issues: ReadonlyArray<TilingWorkspaceSetIssue>): ReadonlyArray<string> {
  return issues.map((issue: TilingWorkspaceSetIssue): string => issue.kind);
}

describe("workspace set — construction, names, switch", (): void => {
  it("workspaceSetOfLayout mints the single main workspace", (): void => {
    const set: TilingWorkspaceSet = workspaceSetOfLayout(leaf("a"));
    expect(set).toEqual({ workspaces: [{ id: "main", name: "Main", layout: leaf("a") }], activeId: "main" });
    expect(workspaceSetIssues(set)).toEqual([]);
    expect(workspaceSetOfLayout(null, "ws:1", "One").workspaces[0]).toEqual({ id: "ws:1", name: "One", layout: null });
  });

  it("normalizeWorkspaceName trims and bounds", (): void => {
    expect(normalizeWorkspaceName("  Ops ")).toBe("Ops");
    expect(normalizeWorkspaceName("   ")).toBeNull();
    expect(normalizeWorkspaceName("x".repeat(TILING_WORKSPACE_NAME_MAX_CHARS))).toHaveLength(TILING_WORKSPACE_NAME_MAX_CHARS);
    expect(normalizeWorkspaceName("x".repeat(TILING_WORKSPACE_NAME_MAX_CHARS + 1))).toBeNull();
  });

  it("createWorkspace appends an empty workspace; refuses duplicates, bad names, empty ids, and the cap", (): void => {
    const base: TilingWorkspaceSet = workspaceSetOfLayout(leaf("a"));
    const created: TilingWorkspaceSet = createWorkspace(base, { id: "ws:ops", name: " Ops " });
    expect(created.workspaces.map((workspace: TilingWorkspace) => [workspace.id, workspace.name, workspace.layout])).toEqual([
      ["main", "Main", leaf("a")],
      ["ws:ops", "Ops", null],
    ]);
    expect(created.activeId).toBe("main");
    expect(createWorkspace(created, { id: "ws:ops", name: "Again" })).toBe(created);
    expect(createWorkspace(created, { id: "", name: "Empty" })).toBe(created);
    expect(createWorkspace(created, { id: "ws:blank", name: "   " })).toBe(created);
    expect(createWorkspace(created, { id: "ws:long", name: "y".repeat(TILING_WORKSPACE_NAME_MAX_CHARS + 1) })).toBe(created);
    let full: TilingWorkspaceSet = base;
    for (let index = 1; index < TILING_WORKSPACES_MAX; index += 1) {
      full = createWorkspace(full, { id: `ws:${index}`, name: `W${index}` });
    }
    expect(full.workspaces).toHaveLength(TILING_WORKSPACES_MAX);
    expect(createWorkspace(full, { id: "ws:over", name: "Over" })).toBe(full);
    expect(workspaceSetIssues(full)).toEqual([]);
  });

  it("createWorkspace honours `at` / `activate` and moves leaves the initial tree seats (replace wins)", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const created: TilingWorkspaceSet = createWorkspace(set, {
      id: "ws:new",
      name: "New",
      layout: split("r", "horizontal", leaf("a"), leaf("e")),
      at: 1,
      activate: true,
    });
    expect(created.workspaces.map((workspace: TilingWorkspace): string => workspace.id)).toEqual(["main", "ws:new", "ops"]);
    expect(created.activeId).toBe("ws:new");
    expect(tileIdsOf(created)).toEqual([["b", "c"], ["a", "e"], ["c", "d"]]);
    expect(workspaceSetIssues(created)).toEqual([]);
    expect(createWorkspace(set, { id: "ws:bad", name: "Bad", layout: split("r", "horizontal", leaf("x"), leaf("x")) })).toBe(set);
  });

  it("renameWorkspace trims; unchanged on unknown id, invalid name, or same name", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    expect(renameWorkspace(set, "ops", " Finance ").workspaces[1].name).toBe("Finance");
    expect(renameWorkspace(set, "ops", "Ops")).toBe(set);
    expect(renameWorkspace(set, "nope", "X")).toBe(set);
    expect(renameWorkspace(set, "ops", "")).toBe(set);
  });

  it("switchWorkspace / cycleWorkspace", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    expect(switchWorkspace(set, "ops").activeId).toBe("ops");
    expect(switchWorkspace(set, "main")).toBe(set);
    expect(switchWorkspace(set, "nope")).toBe(set);
    expect(cycleWorkspace(set, "next").activeId).toBe("ops");
    expect(cycleWorkspace(set, "previous").activeId).toBe("ops");
    expect(cycleWorkspace(cycleWorkspace(set, "next"), "next").activeId).toBe("main");
    expect(cycleWorkspace(workspaceSetOfLayout(leaf("a")), "next")).toEqual(workspaceSetOfLayout(leaf("a")));
  });

  it("setWorkspaceLayout replaces one tree only; refuses an invalid tree", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const next: TilingWorkspaceSet = setWorkspaceLayout(set, "ops", leaf("d"));
    expect(tileIdsOf(next)).toEqual([["a", "b", "c"], ["d"]]);
    expect(next.workspaces[0]).toBe(set.workspaces[0]);
    expect(setWorkspaceLayout(set, "ops", set.workspaces[1].layout)).toBe(set);
    expect(setWorkspaceLayout(set, "nope", null)).toBe(set);
    expect(setWorkspaceLayout(set, "ops", split("r", "horizontal", leaf("x"), leaf("x")))).toBe(set);
    expect(setWorkspaceLayout(set, "ops", null).workspaces[1].layout).toBeNull();
  });
});

describe("workspace set — deleteWorkspace", (): void => {
  it("refuses the last workspace and unknown ids", (): void => {
    const single: TilingWorkspaceSet = workspaceSetOfLayout(leaf("a"));
    expect(deleteWorkspace(single, "main")).toEqual({ set: single, removedTileIds: [] });
    const set: TilingWorkspaceSet = twoWorkspaces();
    expect(deleteWorkspace(set, "nope")).toEqual({ set, removedTileIds: [] });
    expect(deleteWorkspace(set, "nope").set).toBe(set);
  });

  it("returns tile ids shown only there; shared tiles keep their other seat", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const deleted = deleteWorkspace(set, "ops");
    expect(deleted.removedTileIds).toEqual(["d"]);
    expect(tileIdsOf(deleted.set)).toEqual([["a", "b", "c"]]);
    expect(deleted.set.activeId).toBe("main");
    const deletedMain = deleteWorkspace(switchWorkspace(set, "main"), "main");
    expect(deletedMain.removedTileIds).toEqual(["a", "b"]);
    expect(deletedMain.set.activeId).toBe("ops");
    expect(workspaceSetIssues(deletedMain.set)).toEqual([]);
  });

  it("deleting the active workspace activates the previous in order, else the next", (): void => {
    let set: TilingWorkspaceSet = workspaceSetOfLayout(leaf("a"));
    set = createWorkspace(set, { id: "b", name: "B" });
    set = createWorkspace(set, { id: "c", name: "C" });
    expect(deleteWorkspace(switchWorkspace(set, "b"), "b").set.activeId).toBe("main");
    expect(deleteWorkspace(switchWorkspace(set, "main"), "main").set.activeId).toBe("b");
    expect(deleteWorkspace(switchWorkspace(set, "c"), "b").set.activeId).toBe("c");
  });
});

describe("workspace set — moveLeafToWorkspace", (): void => {
  it("moves a leaf out of every seat into the target with the default root-second placement", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const moved: TilingWorkspaceSet = moveLeafToWorkspace(set, "leaf:c", "ops");
    // `c` was in both; now only in ops, seated last.
    expect(tileIdsOf(moved)).toEqual([["a", "b"], ["d", "c"]]);
    expect(workspaceSetIssues(moved)).toEqual([]);
    const movedA: TilingWorkspaceSet = moveLeafToWorkspace(set, "leaf:a", "ops", { kind: "root", side: "first" });
    expect(tileIdsOf(movedA)).toEqual([["b", "c"], ["a", "c", "d"]]);
  });

  it("empties a source whose only leaf moved and seats into a null destination as the bare leaf", (): void => {
    const set: TilingWorkspaceSet = createWorkspace(workspaceSetOfLayout(leaf("a")), { id: "ops", name: "Ops" });
    const moved: TilingWorkspaceSet = moveLeafToWorkspace(set, "leaf:a", "ops");
    expect(moved.workspaces[0].layout).toBeNull();
    expect(moved.workspaces[1].layout).toEqual(leaf("a"));
    expect(workspaceSetIssues(moved)).toEqual([]);
  });

  it("supports adjacent / split-container / group placements and falls back when the target is absent", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const adjacent: TilingWorkspaceSet = moveLeafToWorkspace(set, "leaf:a", "ops", {
      kind: "adjacent",
      targetLeafId: "leaf:d",
      placement: "left",
    });
    expect(tileIdsOf(adjacent)[1]).toEqual(["c", "a", "d"]);
    const container: TilingWorkspaceSet = moveLeafToWorkspace(set, "leaf:a", "ops", {
      kind: "split-container",
      splitId: "root",
      side: "first",
    });
    expect(tileIdsOf(container)[1]).toEqual(["a", "c", "d"]);
    const grouped: TilingWorkspaceSet = {
      ...set,
      workspaces: [set.workspaces[0], { ...set.workspaces[1], layout: split("root", "horizontal", group("g", ["c", "d"]), leaf("e")) }],
    };
    const intoGroup: TilingWorkspaceSet = moveLeafToWorkspace(grouped, "leaf:a", "ops", { kind: "group", groupId: "g" });
    const g: TilingGroupNode = (intoGroup.workspaces[1].layout as TilingSplitNode).first as TilingGroupNode;
    expect(g.members.map((member: TilingLeafNode): string => member.tileId)).toEqual(["c", "d", "a"]);
    expect(g.activeMemberId).toBe("leaf:a");
    const fallback: TilingWorkspaceSet = moveLeafToWorkspace(set, "leaf:a", "ops", {
      kind: "adjacent",
      targetLeafId: "leaf:missing",
      placement: "top",
    });
    expect(tileIdsOf(fallback)[1]).toEqual(["c", "d", "a"]);
  });

  it("re-seats within the same workspace when `to` is the leaf's own workspace", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const reseated: TilingWorkspaceSet = moveLeafToWorkspace(set, "leaf:a", "main");
    expect(tileIdsOf(reseated)[0]).toEqual(["b", "c", "a"]);
    expect(reseated.workspaces[1]).toBe(set.workspaces[1]);
  });

  it("is unchanged for an unknown leaf or workspace", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    expect(moveLeafToWorkspace(set, "leaf:zzz", "ops")).toBe(set);
    expect(moveLeafToWorkspace(set, "leaf:a", "nope")).toBe(set);
  });

  it("a group member leaves its group (group of one collapses) and a collapsed leaf keeps its pin on the new axis", (): void => {
    const set: TilingWorkspaceSet = {
      workspaces: [
        { id: "main", name: "Main", layout: split("root", "horizontal", group("g", ["a", "b"]), leaf("c")) },
        { id: "ops", name: "Ops", layout: split("root", "vertical", leaf("d"), leaf("e")) },
      ],
      activeId: "main",
    };
    const moved: TilingWorkspaceSet = moveLeafToWorkspace(set, "leaf:a", "ops");
    const mainRoot: TilingSplitNode = moved.workspaces[0].layout as TilingSplitNode;
    expect(mainRoot.first).toEqual(leaf("b"));
    expect(tileIdsOf(moved)).toEqual([["b", "c"], ["d", "e", "a"]]);
    // Collapsed under a horizontal parent (width pin) → root-second on a vertical root → height pin.
    const collapsedMain: TilingLayoutNode = setLeafCollapsed(
      split("root", "horizontal", leaf("a"), leaf("c")),
      "leaf:a",
      true,
      40,
    );
    const collapsedSet: TilingWorkspaceSet = { ...set, workspaces: [{ ...set.workspaces[0], layout: collapsedMain }, set.workspaces[1]] };
    const movedCollapsed: TilingWorkspaceSet = moveLeafToWorkspace(collapsedSet, "leaf:a", "ops");
    const seat: TilingLeafNode | null = findLeafById(movedCollapsed.workspaces[1].layout as TilingLayoutNode, "leaf:a");
    expect(seat?.collapsed).toBe(true);
    expect(seat?.collapsedDimension).toBe("height");
    expect(seat?.sizing?.heightPx).toBe(40);
  });
});

describe("workspace set — showInWorkspace / hideFromWorkspace", (): void => {
  it("showInWorkspace seats a fresh copy; no-op when already shown or unknown", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const shown: TilingWorkspaceSet = showInWorkspace(set, "leaf:a", "ops");
    expect(tileIdsOf(shown)).toEqual([["a", "b", "c"], ["c", "d", "a"]]);
    expect(queryWorkspaceSet(shown).workspacesOfLeaf("leaf:a")).toEqual(["main", "ops"]);
    expect(workspaceSetIssues(shown)).toEqual([]);
    expect(showInWorkspace(shown, "leaf:a", "ops")).toBe(shown);
    expect(showInWorkspace(set, "leaf:zzz", "ops")).toBe(set);
    expect(showInWorkspace(set, "leaf:a", "nope")).toBe(set);
    // Per-workspace payload: the new seat carries no sizing/collapse from the source.
    const collapsed: TilingWorkspaceSet = setWorkspaceLayout(set, "main", setLeafCollapsed(set.workspaces[0].layout as TilingLayoutNode, "leaf:a", true, 40));
    const shownCollapsed: TilingWorkspaceSet = showInWorkspace(collapsed, "leaf:a", "ops");
    expect(findLeafById(shownCollapsed.workspaces[1].layout as TilingLayoutNode, "leaf:a")).toEqual(leaf("a"));
  });

  it("hideFromWorkspace removes one seat; the last seat leaves the set", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const hidden: TilingWorkspaceSet = hideFromWorkspace(set, "leaf:c", "main");
    expect(tileIdsOf(hidden)).toEqual([["a", "b"], ["c", "d"]]);
    expect(hideFromWorkspace(set, "leaf:a", "ops")).toBe(set);
    expect(hideFromWorkspace(set, "leaf:a", "nope")).toBe(set);
    const gone: TilingWorkspaceSet = hideFromWorkspace(hidden, "leaf:c", "ops");
    expect(queryWorkspaceSet(gone).workspacesOfLeaf("leaf:c")).toEqual([]);
    expect(kinds(workspaceSetIssues(gone, { expectedTileIds: ["a", "b", "c", "d"] }))).toEqual(["orphan-tile"]);
    const emptied: TilingWorkspaceSet = hideFromWorkspace(hideFromWorkspace(set, "leaf:c", "ops"), "leaf:d", "ops");
    expect(emptied.workspaces[1].layout).toBeNull();
  });
});

describe("workspace set — tile-keyed movers", (): void => {
  it("moveTileToWorkspace unseats every seat and seats once in `to`", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const moved: TilingWorkspaceSet = moveTileToWorkspace(set, "c", "ops");
    expect(moved).toEqual(moveLeafToWorkspace(set, "leaf:c", "ops"));
    expect(tileIdsOf(moved)).toEqual([["a", "b"], ["d", "c"]]);
    expect(workspaceSetIssues(moved)).toEqual([]);
    const region: TilingWorkspaceSet = moveTileToWorkspace(set, "a", "ops", { kind: "region", region: "start" });
    expect(tileIdsOf(region)[1][0]).toBe("a");
  });

  it("moveTileToWorkspace is unchanged for an unknown tile (no mint) or unknown workspace", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    expect(moveTileToWorkspace(set, "zzz", "ops")).toBe(set);
    expect(moveTileToWorkspace(set, "a", "nope")).toBe(set);
    expect(moveTileToWorkspace(set, "zzz", "ops", undefined, { leaf: { id: "" } })).toBe(set);
  });

  it("moveTileToWorkspace mints a fresh leaf only when the tile is seated nowhere and leaf.id is given", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const minted: TilingWorkspaceSet = moveTileToWorkspace(set, "z", "ops", { kind: "region", region: "end" }, {
      leaf: { id: "leaf:z" },
    });
    expect(tileIdsOf(minted)).toEqual([["a", "b", "c"], ["c", "d", "z"]]);
    expect(queryWorkspaceSet(minted).workspacesOfTile("z")).toEqual(["ops"]);
    expect(workspaceSetIssues(minted)).toEqual([]);
    const empty: TilingWorkspaceSet = createWorkspace(workspaceSetOfLayout(leaf("a")), { id: "ops", name: "Ops" });
    const intoNull: TilingWorkspaceSet = moveTileToWorkspace(empty, "z", "ops", undefined, { leaf: { id: "leaf:z" } });
    expect(intoNull.workspaces[1].layout).toEqual(leaf("z"));
    expect(moveTileToWorkspace(set, "z", "ops", undefined, { leaf: { id: "leaf:a" } })).toBe(set);
  });

  it("showTileInWorkspace adds a seat; unchanged if already shown, tile unknown, or workspace unknown", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const shown: TilingWorkspaceSet = showTileInWorkspace(set, "a", "ops");
    expect(shown).toEqual(showInWorkspace(set, "leaf:a", "ops"));
    expect(tileIdsOf(shown)).toEqual([["a", "b", "c"], ["c", "d", "a"]]);
    expect(showTileInWorkspace(shown, "a", "ops")).toBe(shown);
    expect(showTileInWorkspace(set, "zzz", "ops")).toBe(set);
    expect(showTileInWorkspace(set, "a", "nope")).toBe(set);
    expect(workspaceSetIssues(shown)).toEqual([]);
  });

  it("hideTileFromWorkspace reports orphaned true/false; same-reference when the seat is absent", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const hidden: TilingHideTileResult = hideTileFromWorkspace(set, "c", "main");
    expect(tileIdsOf(hidden.set)).toEqual([["a", "b"], ["c", "d"]]);
    expect(hidden.orphaned).toBe(false);
    const last: TilingHideTileResult = hideTileFromWorkspace(hidden.set, "c", "ops");
    expect(last.orphaned).toBe(true);
    expect(queryWorkspaceSet(last.set).workspacesOfTile("c")).toEqual([]);
    expect(hideTileFromWorkspace(set, "a", "ops")).toEqual({ set, orphaned: false });
    expect(hideTileFromWorkspace(set, "a", "ops").set).toBe(set);
    expect(hideTileFromWorkspace(set, "zzz", "main")).toEqual({ set, orphaned: true });
    expect(hideTileFromWorkspace(set, "zzz", "main").set).toBe(set);
    expect(hideTileFromWorkspace(set, "a", "nope").set).toBe(set);
  });

  it("removeTile drops every seat; unchanged when the tile is unknown", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const gone: TilingWorkspaceSet = removeTile(set, "c");
    expect(tileIdsOf(gone)).toEqual([["a", "b"], ["d"]]);
    expect(queryWorkspaceSet(gone).workspacesOfTile("c")).toEqual([]);
    expect(workspaceSetIssues(gone)).toEqual([]);
    expect(removeTile(set, "zzz")).toBe(set);
    expect(removeTile(removeTile(set, "a"), "a")).toEqual(removeTile(set, "a"));
  });
});

describe("workspace set — revealTile", (): void => {
  it("returns null when the tile is seated nowhere", (): void => {
    expect(revealTile(twoWorkspaces(), "zzz")).toBeNull();
    expect(revealTile(workspaceSetOfLayout(null), "a")).toBeNull();
  });

  it("returns the same set when the tile is already revealed (changed none)", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const revealed: TilingRevealTileResult | null = revealTile(set, "a");
    expect(revealed).toEqual({ set, workspaceId: "main", leafId: "leaf:a", changed: "none" });
    expect(revealed?.set).toBe(set);
  });

  it("switches activeId when the tile lives only in another workspace", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const revealed: TilingRevealTileResult | null = revealTile(set, "d");
    expect(revealed?.workspaceId).toBe("ops");
    expect(revealed?.leafId).toBe("leaf:d");
    expect(revealed?.changed).toBe("workspace");
    expect(revealed?.set.activeId).toBe("ops");
    expect(revealed?.set.workspaces).toBe(set.workspaces);
    expect(workspaceSetIssues(revealed?.set as TilingWorkspaceSet)).toEqual([]);
  });

  it("honours prefer when that workspace shows the tile and ignores it otherwise", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const honoured: TilingRevealTileResult | null = revealTile(set, "c", "ops");
    expect(honoured?.workspaceId).toBe("ops");
    expect(honoured?.changed).toBe("workspace");
    const ignored: TilingRevealTileResult | null = revealTile(set, "d", "main");
    expect(ignored?.workspaceId).toBe("ops");
    expect(ignored?.changed).toBe("workspace");
    const unknownPrefer: TilingRevealTileResult | null = revealTile(set, "a", "nope");
    expect(unknownPrefer?.workspaceId).toBe("main");
    expect(unknownPrefer?.changed).toBe("none");
    expect(unknownPrefer?.set).toBe(set);
  });

  it("activates a group member that is not the group's activeMemberId (tab / both)", (): void => {
    const grouped: TilingWorkspaceSet = {
      workspaces: [
        { id: "main", name: "Main", layout: split("root", "horizontal", group("g", ["a", "b"], "a"), leaf("c")) },
        { id: "ops", name: "Ops", layout: split("root", "horizontal", group("g2", ["d", "e"], "d"), leaf("f")) },
      ],
      activeId: "main",
    };
    const tab: TilingRevealTileResult | null = revealTile(grouped, "b");
    expect(tab?.changed).toBe("tab");
    expect(tab?.workspaceId).toBe("main");
    expect(tab?.leafId).toBe("leaf:b");
    const mainGroup: TilingGroupNode = (tab?.set.workspaces[0].layout as TilingSplitNode).first as TilingGroupNode;
    expect(mainGroup.activeMemberId).toBe("leaf:b");
    expect(tab?.set.workspaces[1]).toBe(grouped.workspaces[1]);
    const both: TilingRevealTileResult | null = revealTile(grouped, "e");
    expect(both?.changed).toBe("both");
    expect(both?.workspaceId).toBe("ops");
    expect(both?.set.activeId).toBe("ops");
    const opsGroup: TilingGroupNode = (both?.set.workspaces[1].layout as TilingSplitNode).first as TilingGroupNode;
    expect(opsGroup.activeMemberId).toBe("leaf:e");
    expect(revealTile(tab?.set as TilingWorkspaceSet, "b")?.changed).toBe("none");
    expect(revealTile(tab?.set as TilingWorkspaceSet, "b")?.set).toBe(tab?.set);
    expect(workspaceSetIssues(tab?.set as TilingWorkspaceSet)).toEqual([]);
    expect(workspaceSetIssues(both?.set as TilingWorkspaceSet)).toEqual([]);
  });
});

describe("workspace set — query", (): void => {
  it("exposes active, seats, counts and neighbours", (): void => {
    const query = queryWorkspaceSet(twoWorkspaces());
    expect(query.active.id).toBe("main");
    expect(query.workspace("ops")?.name).toBe("Ops");
    expect(query.workspace("nope")).toBeNull();
    expect(query.workspacesOfLeaf("leaf:c")).toEqual(["main", "ops"]);
    expect(query.workspacesOfTile("d")).toEqual(["ops"]);
    expect(query.leafIds("main")).toEqual(["leaf:a", "leaf:b", "leaf:c"]);
    expect(query.tileIds("nope")).toEqual([]);
    expect(query.leafCount("ops")).toBe(2);
    expect(query.neighbour("main", "next")).toBe("ops");
    expect(query.neighbour("main", "previous")).toBe("ops");
    expect(query.neighbour("nope", "next")).toBeNull();
    expect(queryWorkspaceSet(workspaceSetOfLayout(null)).neighbour("main", "next")).toBeNull();
  });
});

describe("workspace set — integrity walker", (): void => {
  it("reports every invariant class", (): void => {
    expect(kinds(workspaceSetIssues({ workspaces: [], activeId: "x" }))).toEqual(["no-workspaces"]);
    const broken: TilingWorkspaceSet = {
      workspaces: [
        { id: "", name: "Blank id", layout: null },
        { id: "main", name: "Main", layout: split("r", "horizontal", leaf("a"), leaf("a")) },
        { id: "main", name: "  ", layout: leaf("b") },
        { id: "ops", name: "Ops", layout: split("r", "horizontal", { kind: "leaf", id: "other", tileId: "a" }, { kind: "leaf", id: "leaf:b", tileId: "z" }) },
      ],
      activeId: "nope",
    };
    const issues: ReadonlyArray<string> = kinds(workspaceSetIssues(broken, { expectedTileIds: ["a", "b", "q"] }));
    expect(issues).toContain("empty-workspace-id");
    expect(issues).toContain("duplicate-workspace-id");
    expect(issues).toContain("invalid-workspace-name");
    expect(issues).toContain("invalid-tree");
    expect(issues).toContain("active-workspace-missing");
    expect(issues).toContain("leaf-tile-binding-mismatch");
    expect(issues).toContain("unknown-tile");
    expect(issues).toContain("orphan-tile");
  });

  it("accepts a tile shown in several workspaces with a consistent leaf id", (): void => {
    expect(workspaceSetIssues(twoWorkspaces(), { expectedTileIds: ["a", "b", "c", "d"] })).toEqual([]);
  });
});

describe("workspace set — repair", (): void => {
  it("returns a sound set by reference with no reasons", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    expect(repairWorkspaceSet(set, { expectedTileIds: ["a", "b", "c", "d"] })).toEqual({ set, reasons: [] });
    expect(repairWorkspaceSet(set).set).toBe(set);
  });

  it("creates main for an empty set and resets a dangling active id", (): void => {
    const repaired = repairWorkspaceSet({ workspaces: [], activeId: "x" });
    expect(repaired.set).toEqual({ workspaces: [{ id: "main", name: "Main", layout: null }], activeId: "main" });
    expect(repaired.reasons).toEqual(["workspace-created"]);
    const dangling = repairWorkspaceSet({ ...twoWorkspaces(), activeId: "gone" });
    expect(dangling.set.activeId).toBe("main");
    expect(dangling.reasons).toEqual(["active-reset"]);
  });

  it("seats orphans in the active (or named) workspace with the host's leaf-id minter, prunes unknown tiles", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    const repaired = repairWorkspaceSet(set, {
      expectedTileIds: ["a", "b", "c", "x"],
      mintLeafId: (tileId: string): string => `leaf:${tileId}`,
    });
    expect(repaired.reasons).toEqual(["unknown-tile-pruned", "orphan-seated"]);
    expect(tileIdsOf(repaired.set)).toEqual([["a", "b", "c", "x"], ["c"]]);
    expect(findLeafById(repaired.set.workspaces[0].layout as TilingLayoutNode, "leaf:x")).toEqual(leaf("x"));
    const named = repairWorkspaceSet(set, { expectedTileIds: ["a", "b", "c", "d", "x"], orphanWorkspaceId: "ops" });
    expect(tileIdsOf(named.set)[1]).toEqual(["c", "d", "x"]);
    expect(findLeafById(named.set.workspaces[1].layout as TilingLayoutNode, "leaf-x")).not.toBeNull();
    expect(workspaceSetIssues(named.set, { expectedTileIds: ["a", "b", "c", "d", "x"] })).toEqual([]);
  });

  it("rebinds or removes disagreeing seats and rebuilds invalid trees", (): void => {
    const set: TilingWorkspaceSet = {
      workspaces: [
        { id: "main", name: "Main", layout: split("r", "horizontal", leaf("a"), leaf("a")) },
        { id: "ops", name: "Ops", layout: split("r", "horizontal", { kind: "leaf", id: "other", tileId: "a" }, { kind: "leaf", id: "leaf:a", tileId: "z" }) },
      ],
      activeId: "main",
    };
    const repaired = repairWorkspaceSet(set);
    expect(repaired.reasons).toEqual(["tree-rebuilt", "leaf-removed", "leaf-removed"]);
    expect(repaired.set.workspaces[0].layout).toEqual(leaf("a"));
    // ops: `other→a` disagrees with `leaf:a→a` and `leaf:a` is already in this tree → removed; `leaf:a→z` disagrees → removed.
    expect(repaired.set.workspaces[1].layout).toBeNull();
    expect(workspaceSetIssues(repaired.set)).toEqual([]);
    const rebound = repairWorkspaceSet({
      workspaces: [
        { id: "main", name: "Main", layout: leaf("a") },
        { id: "ops", name: "Ops", layout: { kind: "leaf", id: "other", tileId: "a" } },
      ],
      activeId: "main",
    });
    expect(rebound.reasons).toEqual(["leaf-rebound"]);
    expect(rebound.set.workspaces[1].layout).toEqual(leaf("a"));
  });

  it("drops blank / duplicate workspace ids, keeping their unique leaves, and fixes names", (): void => {
    const repaired = repairWorkspaceSet({
      workspaces: [
        { id: "main", name: "  ", layout: leaf("a") },
        { id: "main", name: "Dup", layout: split("r", "horizontal", leaf("a"), leaf("b")) },
        { id: "", name: "x".repeat(50), layout: leaf("c") },
      ],
      activeId: "main",
    });
    expect(repaired.reasons).toEqual(["workspace-dropped", "workspace-dropped", "workspace-renamed"]);
    expect(repaired.set.workspaces.map((workspace: TilingWorkspace): string => workspace.id)).toEqual(["main"]);
    expect(repaired.set.workspaces[0].name).toBe("Workspace 1");
    expect(tileIdsOf(repaired.set)).toEqual([["a", "b", "c"]]);
    expect(workspaceSetIssues(repaired.set)).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Property-style sweeps (seeded PRNG so a failure is reproducible)
// ───────────────────────────────────────────────────────────────────────────

function prng(seed: number): () => number {
  let state: number = seed >>> 0;
  return (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(random: () => number, items: ReadonlyArray<T>): T {
  return items[Math.floor(random() * items.length)];
}

const TILE_POOL: ReadonlyArray<string> = ["a", "b", "c", "d", "e", "f", "g", "h"];

/** A random sound set: 1..4 workspaces, each seating a random subset of the pool (shared tiles allowed). */
function randomSoundSet(random: () => number): TilingWorkspaceSet {
  const count: number = 1 + Math.floor(random() * 4);
  const workspaces: TilingWorkspace[] = [];
  for (let index = 0; index < count; index += 1) {
    let tree: TilingLayoutNode | null = null;
    for (const tileId of TILE_POOL) {
      if (random() < 0.5) {
        const placement: TilingWorkspacePlacement =
          tree == null || random() < 0.5
            ? { kind: "root", side: random() < 0.5 ? "first" : "second" }
            : { kind: "adjacent", targetLeafId: pick(random, queryLeafIds(tree)), placement: pick(random, ["left", "right", "top", "bottom"] as const) };
        tree = insertLeafInto(tree, leaf(tileId), placement);
      }
    }
    workspaces.push({ id: `ws:${index}`, name: `W${index}`, layout: tree });
  }
  return { workspaces, activeId: workspaces[Math.floor(random() * count)].id };
}

function queryLeafIds(tree: TilingLayoutNode): ReadonlyArray<string> {
  const set: TilingWorkspaceSet = workspaceSetOfLayout(tree);
  return queryWorkspaceSet(set).leafIds("main");
}

function allLeafIds(set: TilingWorkspaceSet): ReadonlyArray<string> {
  const query = queryWorkspaceSet(set);
  return [...new Set<string>(set.workspaces.flatMap((workspace: TilingWorkspace): ReadonlyArray<string> => query.leafIds(workspace.id)))];
}

function randomPlacement(random: () => number, set: TilingWorkspaceSet, workspaceId: string): TilingWorkspacePlacement {
  const query = queryWorkspaceSet(set);
  const leafIds: ReadonlyArray<string> = query.leafIds(workspaceId);
  const roll: number = random();
  if (roll < 0.3 || leafIds.length === 0) {
    return { kind: "root", side: random() < 0.5 ? "first" : "second" };
  }
  if (roll < 0.55) {
    return { kind: "adjacent", targetLeafId: pick(random, leafIds), placement: pick(random, ["left", "right", "top", "bottom"] as const) };
  }
  if (roll < 0.8) {
    return { kind: "region", region: random() < 0.5 ? "start" : "end" };
  }
  return { kind: "split-container", splitId: random() < 0.5 ? "root-move-leaf:a" : "nope", side: "first" };
}

function randomOp(random: () => number, set: TilingWorkspaceSet): TilingWorkspaceSet {
  const workspaceIds: ReadonlyArray<string> = set.workspaces.map((workspace: TilingWorkspace): string => workspace.id);
  const leafIds: ReadonlyArray<string> = allLeafIds(set);
  const roll: number = random();
  if (roll < 0.1) {
    return createWorkspace(set, { id: `ws:${Math.floor(random() * 1000)}`, name: "New", activate: random() < 0.5 });
  }
  if (roll < 0.2) {
    return deleteWorkspace(set, pick(random, workspaceIds)).set;
  }
  if (roll < 0.3) {
    return switchWorkspace(set, pick(random, [...workspaceIds, "nope"]));
  }
  if (roll < 0.4) {
    return renameWorkspace(set, pick(random, workspaceIds), pick(random, ["Alpha", " Beta ", "", "x".repeat(41)]));
  }
  if (leafIds.length === 0) {
    return set;
  }
  const leafId: string = pick(random, [...leafIds, "leaf:zzz"]);
  const to: string = pick(random, [...workspaceIds, "nope"]);
  if (roll < 0.55) {
    return moveLeafToWorkspace(set, leafId, to, randomPlacement(random, set, to));
  }
  if (roll < 0.7) {
    return showInWorkspace(set, leafId, to, randomPlacement(random, set, to));
  }
  if (roll < 0.8) {
    const tileId: string = leafId.startsWith("leaf:") ? leafId.slice("leaf:".length) : pick(random, TILE_POOL);
    return moveTileToWorkspace(set, tileId, to, randomPlacement(random, set, to), {
      leaf: { id: `leaf:${tileId}` },
    });
  }
  if (roll < 0.9) {
    const tileId: string = leafId.startsWith("leaf:") ? leafId.slice("leaf:".length) : pick(random, TILE_POOL);
    return showTileInWorkspace(set, tileId, to, randomPlacement(random, set, to));
  }
  return hideFromWorkspace(set, leafId, to);
}

describe("workspace set — properties", (): void => {
  it("random sound sets stay sound under random op sequences; every tree stays structurally valid", (): void => {
    for (let seed = 1; seed <= 120; seed += 1) {
      const random: () => number = prng(seed);
      let set: TilingWorkspaceSet = randomSoundSet(random);
      expect(workspaceSetIssues(set)).toEqual([]);
      for (let step = 0; step < 25; step += 1) {
        set = randomOp(random, set);
        const issues: ReadonlyArray<TilingWorkspaceSetIssue> = workspaceSetIssues(set);
        if (issues.length > 0) {
          throw new Error(`seed ${seed} step ${step}: ${JSON.stringify(issues)}`);
        }
        for (const workspace of set.workspaces) {
          if (workspace.layout != null) {
            expect(isStructurallyValidLayout(workspace.layout)).toBe(true);
          }
        }
        expect(set.workspaces.length).toBeGreaterThanOrEqual(1);
        expect(set.workspaces.length).toBeLessThanOrEqual(TILING_WORKSPACES_MAX);
      }
    }
  });

  it("tile-keyed ops and revealTile keep random sets sound; same-reference when they report no change", (): void => {
    for (let seed = 400; seed < 480; seed += 1) {
      const random: () => number = prng(seed);
      const set: TilingWorkspaceSet = randomSoundSet(random);
      const query = queryWorkspaceSet(set);
      const workspaceIds: ReadonlyArray<string> = set.workspaces.map(
        (workspace: TilingWorkspace): string => workspace.id,
      );
      const seatedTiles: ReadonlyArray<string> = [
        ...new Set<string>(
          set.workspaces.flatMap((workspace: TilingWorkspace): ReadonlyArray<string> => query.tileIds(workspace.id)),
        ),
      ];
      const tileId: string = pick(random, [...seatedTiles, "zzz"]);
      const to: string = pick(random, [...workspaceIds, "nope"]);
      const placement: TilingWorkspacePlacement = randomPlacement(random, set, to);
      const knownWorkspace: boolean = query.workspace(to) != null;
      const seats: ReadonlyArray<string> = query.workspacesOfTile(tileId);
      const seated: boolean = seats.length > 0;

      const moved: TilingWorkspaceSet = moveTileToWorkspace(set, tileId, to, placement, {
        leaf: { id: `leaf:${tileId}` },
      });
      if (workspaceSetIssues(moved).length > 0) {
        throw new Error(`seed ${seed} moveTileToWorkspace: ${JSON.stringify(workspaceSetIssues(moved))}`);
      }
      if (!knownWorkspace || (!seated && allLeafIds(set).includes(`leaf:${tileId}`))) {
        expect(moved).toBe(set);
      }

      const shown: TilingWorkspaceSet = showTileInWorkspace(set, tileId, to, placement);
      expect(workspaceSetIssues(shown)).toEqual([]);
      if (!seated || !knownWorkspace || seats.includes(to)) {
        expect(shown).toBe(set);
      }

      const hidden: TilingHideTileResult = hideTileFromWorkspace(set, tileId, to);
      expect(workspaceSetIssues(hidden.set)).toEqual([]);
      if (!seats.includes(to)) {
        expect(hidden.set).toBe(set);
      }
      expect(hidden.orphaned).toBe(queryWorkspaceSet(hidden.set).workspacesOfTile(tileId).length === 0);

      const removed: TilingWorkspaceSet = removeTile(set, tileId);
      expect(workspaceSetIssues(removed)).toEqual([]);
      if (!seated) {
        expect(removed).toBe(set);
      }

      const revealed: TilingRevealTileResult | null = revealTile(
        set,
        tileId,
        pick(random, [...workspaceIds, "nope"]),
      );
      if (!seated) {
        expect(revealed).toBeNull();
      } else {
        expect(revealed).not.toBeNull();
        expect(workspaceSetIssues(revealed?.set as TilingWorkspaceSet)).toEqual([]);
        if (revealed?.changed === "none") {
          expect(revealed.set).toBe(set);
        }
      }
    }
  });

  it("moveLeafToWorkspace leaves the leaf in exactly one workspace; showInWorkspace adds exactly one seat", (): void => {
    for (let seed = 200; seed < 260; seed += 1) {
      const random: () => number = prng(seed);
      const set: TilingWorkspaceSet = randomSoundSet(random);
      const leafIds: ReadonlyArray<string> = allLeafIds(set);
      if (leafIds.length === 0) {
        continue;
      }
      const leafId: string = pick(random, leafIds);
      const to: string = pick(random, set.workspaces.map((workspace: TilingWorkspace): string => workspace.id));
      const moved: TilingWorkspaceSet = moveLeafToWorkspace(set, leafId, to, randomPlacement(random, set, to));
      expect(queryWorkspaceSet(moved).workspacesOfLeaf(leafId)).toEqual([to]);
      const before: ReadonlyArray<string> = queryWorkspaceSet(set).workspacesOfLeaf(leafId);
      const shown: TilingWorkspaceSet = showInWorkspace(set, leafId, to);
      const after: ReadonlyArray<string> = queryWorkspaceSet(shown).workspacesOfLeaf(leafId);
      expect(after.length).toBe(before.includes(to) ? before.length : before.length + 1);
      expect(after).toContain(to);
    }
  });

  it("random broken sets repair to a sound set with reasons, and repair is idempotent", (): void => {
    const names: ReadonlyArray<string> = ["Ok", "", "   ", "y".repeat(45)];
    for (let seed = 300; seed < 380; seed += 1) {
      const random: () => number = prng(seed);
      const sound: TilingWorkspaceSet = randomSoundSet(random);
      // Corrupt: duplicate ids, blank ids, bad names, dangling active, leaf/tile rebinds, in-tree dupes.
      const workspaces: TilingWorkspace[] = sound.workspaces.map((workspace: TilingWorkspace): TilingWorkspace => {
        let layout: TilingLayoutNode | null = workspace.layout;
        if (layout != null && random() < 0.3) {
          const ids: ReadonlyArray<string> = queryLeafIds(layout);
          const victim: string = pick(random, ids);
          const victimLeaf: TilingLeafNode | null = findLeafById(layout, victim);
          if (victimLeaf != null) {
            layout = insertLeafInto(layout, { kind: "leaf", id: `${victim}-dup`, tileId: victimLeaf.tileId });
          }
        }
        if (layout != null && random() < 0.3) {
          const ids: ReadonlyArray<string> = queryLeafIds(layout);
          const victimLeaf: TilingLeafNode | null = findLeafById(layout, pick(random, ids));
          if (victimLeaf != null) {
            layout = insertLeafInto(layout, { kind: "leaf", id: victimLeaf.id, tileId: pick(random, TILE_POOL) });
          }
        }
        return {
          id: random() < 0.2 ? pick(random, ["", sound.workspaces[0].id]) : workspace.id,
          name: pick(random, names),
          layout,
        };
      });
      const broken: TilingWorkspaceSet = { workspaces, activeId: random() < 0.3 ? "gone" : sound.activeId };
      const expectedTileIds: ReadonlyArray<string> | undefined = random() < 0.5 ? TILE_POOL.slice(0, 5) : undefined;
      const repaired = repairWorkspaceSet(broken, { expectedTileIds });
      const issues: ReadonlyArray<TilingWorkspaceSetIssue> = workspaceSetIssues(repaired.set, { expectedTileIds });
      if (issues.length > 0) {
        throw new Error(`seed ${seed}: ${JSON.stringify(issues)}\n${JSON.stringify(repaired)}`);
      }
      if (workspaceSetIssues(broken, { expectedTileIds }).length > 0) {
        expect(repaired.reasons.length).toBeGreaterThan(0);
      }
      const again = repairWorkspaceSet(repaired.set, { expectedTileIds });
      expect(again.set).toBe(repaired.set);
      expect(again.reasons).toEqual([]);
    }
  });
});

describe("state — insertLeafInto mirrors the movers' insert halves", (): void => {
  const base: TilingLayoutNode = split("root", "horizontal", leaf("a"), split("s2", "vertical", leaf("b"), leaf("c")));

  it("extract + insertLeafInto(root) equals moveLeafToRoot byte-for-byte", (): void => {
    for (const side of ["first", "second"] as const) {
      const extraction = extractLeafNode(base, "leaf:b");
      const composed: TilingLayoutNode = insertLeafInto(extraction.nextNode, extraction.extractedLeaf as TilingLeafNode, { kind: "root", side });
      expect(composed).toEqual(moveLeafToRoot(base, "leaf:b", side));
    }
  });

  it("extract + insertLeafInto(adjacent) equals insertLeafAdjacent", (): void => {
    for (const placement of ["left", "right", "top", "bottom"] as const) {
      const extraction = extractLeafNode(base, "leaf:a");
      const composed: TilingLayoutNode = insertLeafInto(extraction.nextNode, extraction.extractedLeaf as TilingLeafNode, {
        kind: "adjacent",
        targetLeafId: "leaf:c",
        placement,
      });
      expect(composed).toEqual(insertLeafAdjacent(base, "leaf:a", "leaf:c", placement));
    }
  });

  it("extract + insertLeafInto(split-container) equals moveLeafToSplitContainer", (): void => {
    const extraction = extractLeafNode(base, "leaf:a");
    const composed: TilingLayoutNode = insertLeafInto(extraction.nextNode, extraction.extractedLeaf as TilingLeafNode, {
      kind: "split-container",
      splitId: "s2",
      side: "first",
    });
    expect(composed).toEqual(moveLeafToSplitContainer(base, "leaf:a", "s2", "first"));
  });

  it("extract + insertLeafInto(group) equals addLeafToGroup", (): void => {
    const withGroup: TilingLayoutNode = split("root", "horizontal", leaf("a"), group("g", ["b", "c"]));
    const extraction = extractLeafNode(withGroup, "leaf:a");
    const composed: TilingLayoutNode = insertLeafInto(extraction.nextNode, extraction.extractedLeaf as TilingLeafNode, { kind: "group", groupId: "g" });
    expect(composed).toEqual(addLeafToGroup(withGroup, "g", "leaf:a"));
  });

  it("null tree → bare leaf; absent targets fall back to root-second", (): void => {
    expect(insertLeafInto(null, leaf("z"))).toEqual(leaf("z"));
    expect(insertLeafInto(null, leaf("z"), { kind: "group", groupId: "nope" })).toEqual(leaf("z"));
    const fallback: TilingLayoutNode = insertLeafInto(base, leaf("z"), { kind: "split-container", splitId: "nope", side: "first" });
    expect(fallback).toEqual(insertLeafInto(base, leaf("z"), TILING_DEFAULT_WORKSPACE_PLACEMENT));
    expect((fallback as TilingSplitNode).second).toEqual(leaf("z"));
  });

  it("region start / end equals adjacent left-of-first / right-of-last; null is the bare leaf", (): void => {
    const start: TilingLayoutNode = insertLeafInto(base, leaf("z"), { kind: "region", region: "start" });
    expect(start).toEqual(
      insertLeafInto(base, leaf("z"), { kind: "adjacent", targetLeafId: "leaf:a", placement: "left" }),
    );
    expect(queryLeafIds(start)).toEqual(["leaf:z", "leaf:a", "leaf:b", "leaf:c"]);
    const end: TilingLayoutNode = insertLeafInto(base, leaf("z"), { kind: "region", region: "end" });
    expect(end).toEqual(
      insertLeafInto(base, leaf("z"), { kind: "adjacent", targetLeafId: "leaf:c", placement: "right" }),
    );
    expect(queryLeafIds(end)).toEqual(["leaf:a", "leaf:b", "leaf:c", "leaf:z"]);
    expect(insertLeafInto(null, leaf("z"), { kind: "region", region: "start" })).toEqual(leaf("z"));
    expect(insertLeafInto(null, leaf("z"), { kind: "region", region: "end" })).toEqual(leaf("z"));
  });

  it("region seats beside a group node, not inside it, even when the neighbour is a non-active member", (): void => {
    const grouped: TilingLayoutNode = split("root", "horizontal", group("g", ["a", "b"], "b"), leaf("c"));
    const start: TilingLayoutNode = insertLeafInto(grouped, leaf("z"), { kind: "region", region: "start" });
    expect(start).toEqual(
      insertLeafInto(grouped, leaf("z"), { kind: "adjacent", targetLeafId: "leaf:b", placement: "left" }),
    );
    const startWrap: TilingSplitNode = (start as TilingSplitNode).first as TilingSplitNode;
    expect(startWrap.first).toEqual(leaf("z"));
    expect(startWrap.second).toEqual(group("g", ["a", "b"], "b"));
    const endGrouped: TilingLayoutNode = split("root", "horizontal", leaf("c"), group("g", ["a", "b"], "a"));
    const end: TilingLayoutNode = insertLeafInto(endGrouped, leaf("z"), { kind: "region", region: "end" });
    expect(end).toEqual(
      insertLeafInto(endGrouped, leaf("z"), { kind: "adjacent", targetLeafId: "leaf:a", placement: "right" }),
    );
    const endWrap: TilingSplitNode = (end as TilingSplitNode).second as TilingSplitNode;
    expect(endWrap.first).toEqual(group("g", ["a", "b"], "a"));
    expect(endWrap.second).toEqual(leaf("z"));
  });
});
