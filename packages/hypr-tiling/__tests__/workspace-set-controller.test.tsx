/**
 * @jest-environment jsdom
 *
 * Workspace-set controller (H7): `useTilingWorkspaceSetController` plus the
 * framework-free helpers in `engine/workspace-set-controller.ts`. Tree edits
 * debounce; lifecycle / move / reveal commit at once; read-only switches stay
 * local; pending trees fold into the next mutation and flush on unmount.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  adoptIncomingWorkspaceTrees,
  classifyIncomingWorkspaceSet,
  diffWorkspaceTreeLayouts,
  foldPendingTrees,
  viewedWorkspaceSet,
  workspaceSetLayoutMap,
} from "../engine/workspace-set-controller";
import {
  useTilingWorkspaceSetController,
  type TilingWorkspaceSetCommitReason,
  type TilingWorkspaceSetControllerOptions,
} from "../react/use-tiling-workspace-set-controller";
import type { TilingLayoutNode, TilingLeafNode, TilingSplitNode } from "../engine/types";
import type { TilingWorkspace, TilingWorkspaceSet } from "../engine/workspace-set";

function leaf(id: string): TilingLeafNode {
  return { kind: "leaf", id: `leaf:${id}`, tileId: id };
}

function split(
  id: string,
  first: TilingLayoutNode,
  second: TilingLayoutNode,
): TilingSplitNode {
  return { kind: "split", id, axis: "horizontal", ratio: 0.5, first, second };
}

function twoWorkspaces(activeId: string = "main"): TilingWorkspaceSet {
  return {
    workspaces: [
      { id: "main", name: "Main", layout: leaf("a") },
      { id: "ops", name: "Ops", layout: leaf("b") },
    ],
    activeId,
  };
}

function withWorkspaceLayout(
  set: TilingWorkspaceSet,
  workspaceId: string,
  layout: TilingLayoutNode | null,
): TilingWorkspaceSet {
  return {
    ...set,
    workspaces: set.workspaces.map((workspace: TilingWorkspace): TilingWorkspace =>
      workspace.id === workspaceId ? { ...workspace, layout } : workspace,
    ),
  };
}

interface CommitRecord {
  readonly next: TilingWorkspaceSet;
  readonly reason: TilingWorkspaceSetCommitReason;
}

interface RenderControllerOptions {
  readonly value?: TilingWorkspaceSet;
  readonly readOnly?: boolean;
  readonly maxWorkspaces?: number;
  readonly treeDebounceMs?: number;
  readonly applyCommits?: boolean;
  readonly defaults?: TilingWorkspaceSet;
}

interface RenderedController {
  readonly result: { current: ReturnType<typeof useTilingWorkspaceSetController> };
  readonly rerender: (props: TilingWorkspaceSetControllerOptions) => void;
  readonly unmount: () => void;
  readonly onCommit: jest.Mock<(next: TilingWorkspaceSet, reason: TilingWorkspaceSetCommitReason) => void>;
  readonly commits: CommitRecord[];
  readonly propsOf: () => TilingWorkspaceSetControllerOptions;
}

function renderController(options: RenderControllerOptions = {}): RenderedController {
  const commits: CommitRecord[] = [];
  const applyCommits: boolean = options.applyCommits === true;
  let minted: number = 0;
  const holder: { props: TilingWorkspaceSetControllerOptions } = {
    props: {
      value: options.value ?? twoWorkspaces(),
      onCommit: (next: TilingWorkspaceSet, reason: TilingWorkspaceSetCommitReason): void => {
        commits.push({ next, reason });
      },
      readOnly: options.readOnly,
      maxWorkspaces: options.maxWorkspaces,
      treeDebounceMs: options.treeDebounceMs,
      defaults: options.defaults,
      mintWorkspaceId: (): string => {
        minted += 1;
        return `ws-${minted}`;
      },
      nextWorkspaceName: (existing: ReadonlyArray<TilingWorkspace>): string =>
        `Workspace ${existing.length + 1}`,
    },
  };
  const onCommit: RenderedController["onCommit"] = jest.fn(
    (next: TilingWorkspaceSet, reason: TilingWorkspaceSetCommitReason): void => {
      commits.push({ next, reason });
      if (applyCommits) {
        holder.props = { ...holder.props, value: next };
        hook.rerender(holder.props);
      }
    },
  );
  holder.props = { ...holder.props, onCommit };
  const hook = renderHook(
    (props: TilingWorkspaceSetControllerOptions) => useTilingWorkspaceSetController(props),
    { initialProps: holder.props },
  );
  return {
    result: hook.result,
    rerender: hook.rerender,
    unmount: hook.unmount,
    onCommit,
    commits,
    propsOf: (): TilingWorkspaceSetControllerOptions => holder.props,
  };
}

beforeEach((): void => {
  jest.useFakeTimers();
});

afterEach((): void => {
  cleanup();
  jest.useRealTimers();
});

describe("workspace-set-controller helpers", (): void => {
  it("foldPendingTrees overlays pending layouts and is same-ref when empty", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces();
    expect(foldPendingTrees(set, new Map())).toBe(set);
    const nextLayout: TilingLayoutNode = leaf("a-edited");
    const folded: TilingWorkspaceSet = foldPendingTrees(
      set,
      new Map<string, TilingLayoutNode | null>([["main", nextLayout]]),
    );
    expect(folded).not.toBe(set);
    expect(folded.workspaces[0].layout).toBe(nextLayout);
    expect(folded.workspaces[1].layout).toBe(set.workspaces[1].layout);
  });

  it("viewedWorkspaceSet overlays local trees and a local active id", (): void => {
    const set: TilingWorkspaceSet = twoWorkspaces("main");
    const local: TilingLayoutNode = leaf("a-local");
    const viewed: TilingWorkspaceSet = viewedWorkspaceSet(
      set,
      new Map<string, TilingLayoutNode | null>([["main", local]]),
      "ops",
    );
    expect(viewed.activeId).toBe("ops");
    expect(viewed.workspaces[0].layout).toBe(local);
    expect(viewedWorkspaceSet(set, new Map(), null)).toBe(set);
  });

  it("diffWorkspaceTreeLayouts reports layout-reference changes only", (): void => {
    const current: TilingWorkspaceSet = twoWorkspaces();
    const nextLayout: TilingLayoutNode = leaf("a-next");
    const next: TilingWorkspaceSet = withWorkspaceLayout(current, "main", nextLayout);
    expect(diffWorkspaceTreeLayouts(current, next)).toEqual([
      { workspaceId: "main", layout: nextLayout },
    ]);
    expect(diffWorkspaceTreeLayouts(current, { ...current, activeId: "ops" })).toEqual([]);
  });

  it("classifyIncomingWorkspaceSet distinguishes echo, stale, and authoritative", (): void => {
    const committed: TilingWorkspaceSet = twoWorkspaces("ops");
    expect(classifyIncomingWorkspaceSet(committed, committed, true)).toBe("echo");
    const echo: TilingWorkspaceSet = {
      workspaces: committed.workspaces,
      activeId: "ops",
    };
    expect(classifyIncomingWorkspaceSet(echo, committed, false)).toBe("echo");
    const staleHost: TilingWorkspaceSet = { workspaces: committed.workspaces, activeId: "main" };
    expect(classifyIncomingWorkspaceSet(staleHost, committed, true)).toBe("stale");
    expect(classifyIncomingWorkspaceSet(staleHost, committed, false)).toBe("authoritative");
    const hostTree: TilingWorkspaceSet = withWorkspaceLayout(committed, "main", leaf("other"));
    expect(classifyIncomingWorkspaceSet(hostTree, committed, true)).toBe("authoritative");
  });

  it("adoptIncomingWorkspaceTrees drops local trees the host superseded", (): void => {
    const incoming: TilingWorkspaceSet = twoWorkspaces();
    const staleLocal: TilingLayoutNode = leaf("stale");
    const adopted = adoptIncomingWorkspaceTrees({
      incoming,
      localTrees: new Map<string, TilingLayoutNode | null>([["main", staleLocal]]),
      pending: new Map<string, TilingLayoutNode | null>([["main", staleLocal]]),
      lastCommitted: workspaceSetLayoutMap(withWorkspaceLayout(incoming, "main", leaf("old"))),
    });
    expect(adopted.localTrees.has("main")).toBe(false);
    expect(adopted.pending.has("main")).toBe(false);
    expect(adopted.droppedPending).toBe(true);
    expect(adopted.localTreesChanged).toBe(true);
  });
});

describe("useTilingWorkspaceSetController", (): void => {
  it("debounces a tree edit and commits once with reason tree", (): void => {
    const rendered: RenderedController = renderController();
    const editedLayout: TilingLayoutNode = split("main-root", leaf("a"), leaf("c"));
    act((): void => {
      rendered.result.current.onWorkspacesChange(
        withWorkspaceLayout(rendered.result.current.set, "main", editedLayout),
      );
    });
    expect(rendered.result.current.set.workspaces[0].layout).toBe(editedLayout);
    expect(rendered.result.current.pending).toBe(true);
    expect(rendered.onCommit).not.toHaveBeenCalled();
    act((): void => {
      jest.advanceTimersByTime(399);
    });
    expect(rendered.onCommit).not.toHaveBeenCalled();
    act((): void => {
      jest.advanceTimersByTime(1);
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
    expect(rendered.commits[0].reason).toBe("tree");
    expect(rendered.commits[0].next.workspaces[0].layout).toBe(editedLayout);
    expect(rendered.result.current.pending).toBe(false);
  });

  it("coalesces two tree edits inside the window into one tree commit", (): void => {
    const rendered: RenderedController = renderController();
    const first: TilingLayoutNode = leaf("a-1");
    const second: TilingLayoutNode = leaf("a-2");
    act((): void => {
      rendered.result.current.onWorkspacesChange(
        withWorkspaceLayout(rendered.result.current.set, "main", first),
      );
    });
    act((): void => {
      jest.advanceTimersByTime(200);
    });
    act((): void => {
      rendered.result.current.onWorkspacesChange(
        withWorkspaceLayout(rendered.result.current.set, "main", second),
      );
    });
    act((): void => {
      jest.advanceTimersByTime(200);
    });
    expect(rendered.onCommit).not.toHaveBeenCalled();
    act((): void => {
      jest.advanceTimersByTime(200);
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
    expect(rendered.commits[0].reason).toBe("tree");
    expect(rendered.commits[0].next.workspaces[0].layout).toBe(second);
  });

  it("folds pending trees into a lifecycle commit", (): void => {
    const rendered: RenderedController = renderController();
    const editedLayout: TilingLayoutNode = leaf("a-pending");
    act((): void => {
      rendered.result.current.onWorkspacesChange(
        withWorkspaceLayout(rendered.result.current.set, "main", editedLayout),
      );
    });
    act((): void => {
      rendered.result.current.rename("main", "Renamed");
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
    expect(rendered.commits[0].reason).toBe("lifecycle");
    expect(rendered.commits[0].next.workspaces[0].name).toBe("Renamed");
    expect(rendered.commits[0].next.workspaces[0].layout).toBe(editedLayout);
    expect(rendered.result.current.pending).toBe(false);
    act((): void => {
      jest.advanceTimersByTime(400);
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps a read-only switch local and commits nothing", (): void => {
    const value: TilingWorkspaceSet = twoWorkspaces("main");
    const rendered: RenderedController = renderController({ value, readOnly: true });
    act((): void => {
      rendered.result.current.switch("ops");
    });
    expect(rendered.result.current.set.activeId).toBe("ops");
    expect(rendered.onCommit).not.toHaveBeenCalled();
    expect(value.activeId).toBe("main");
  });

  it("create respects the host cap and read-only", (): void => {
    const capped: RenderedController = renderController({ maxWorkspaces: 2 });
    let created: string | null = "unset";
    act((): void => {
      created = capped.result.current.create();
    });
    expect(created).toBeNull();
    expect(capped.onCommit).not.toHaveBeenCalled();

    const writable: RenderedController = renderController({ applyCommits: true });
    act((): void => {
      created = writable.result.current.create();
    });
    expect(created).toBe("ws-1");
    expect(writable.onCommit).toHaveBeenCalledTimes(1);
    expect(writable.commits[0].reason).toBe("lifecycle");
    expect(writable.result.current.set.activeId).toBe("ws-1");
    expect(writable.result.current.set.workspaces.map((w: TilingWorkspace): string => w.id)).toEqual([
      "main",
      "ops",
      "ws-1",
    ]);

    const frozen: RenderedController = renderController({ readOnly: true });
    act((): void => {
      created = frozen.result.current.create();
    });
    expect(created).toBeNull();
    expect(frozen.onCommit).not.toHaveBeenCalled();
  });

  it("remove returns removedTileIds and [] when unchanged", (): void => {
    const rendered: RenderedController = renderController({ applyCommits: true });
    let removed: ReadonlyArray<string> = ["sentinel"];
    act((): void => {
      removed = rendered.result.current.remove("ops");
    });
    expect(removed).toEqual(["b"]);
    expect(rendered.commits[0].reason).toBe("lifecycle");
    expect(rendered.result.current.set.workspaces.map((w: TilingWorkspace): string => w.id)).toEqual([
      "main",
    ]);
    act((): void => {
      removed = rendered.result.current.remove("main");
    });
    expect(removed).toEqual([]);
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
  });

  it("moveTile commits move and switches to the destination", (): void => {
    const rendered: RenderedController = renderController({ applyCommits: true });
    act((): void => {
      rendered.result.current.moveTile("a", "ops");
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
    expect(rendered.commits[0].reason).toBe("move");
    expect(rendered.result.current.set.activeId).toBe("ops");
    const opsLayout: TilingLayoutNode | null = rendered.result.current.set.workspaces[1].layout;
    expect(opsLayout).not.toBeNull();
    const seated: ReadonlyArray<string> =
      opsLayout?.kind === "split"
        ? [opsLayout.first, opsLayout.second].flatMap((node: TilingLayoutNode): string[] =>
            node.kind === "leaf" ? [node.tileId] : [],
          )
        : opsLayout?.kind === "leaf"
          ? [opsLayout.tileId]
          : [];
    expect(seated).toContain("a");
    expect(seated).toContain("b");
    expect(rendered.result.current.set.workspaces[0].layout).toBeNull();
  });

  it("reveal commits reveal when it changes the set and is a no-op otherwise", (): void => {
    const rendered: RenderedController = renderController({ applyCommits: true });
    act((): void => {
      const result = rendered.result.current.reveal("b");
      expect(result?.changed).toBe("workspace");
      expect(result?.workspaceId).toBe("ops");
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
    expect(rendered.commits[0].reason).toBe("reveal");
    expect(rendered.result.current.set.activeId).toBe("ops");

    act((): void => {
      const again = rendered.result.current.reveal("b");
      expect(again?.changed).toBe("none");
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);

    act((): void => {
      expect(rendered.result.current.reveal("missing")).toBeNull();
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
  });

  it("drops stale local trees when the host value is authoritative", (): void => {
    const initial: TilingWorkspaceSet = twoWorkspaces();
    const rendered: RenderedController = renderController({ value: initial });
    const localLayout: TilingLayoutNode = leaf("a-local");
    act((): void => {
      rendered.result.current.onWorkspacesChange(
        withWorkspaceLayout(rendered.result.current.set, "main", localLayout),
      );
    });
    expect(rendered.result.current.set.workspaces[0].layout).toBe(localLayout);
    const hostLayout: TilingLayoutNode = leaf("a-host");
    const incoming: TilingWorkspaceSet = withWorkspaceLayout(initial, "main", hostLayout);
    act((): void => {
      rendered.rerender({ ...rendered.propsOf(), value: incoming });
    });
    expect(rendered.result.current.set.workspaces[0].layout).toBe(hostLayout);
    expect(rendered.result.current.pending).toBe(false);
    act((): void => {
      jest.advanceTimersByTime(400);
    });
    expect(rendered.onCommit).not.toHaveBeenCalled();
  });

  it("flushes pending trees synchronously on unmount", (): void => {
    const rendered: RenderedController = renderController();
    const editedLayout: TilingLayoutNode = leaf("a-unmount");
    act((): void => {
      rendered.result.current.onWorkspacesChange(
        withWorkspaceLayout(rendered.result.current.set, "main", editedLayout),
      );
    });
    expect(rendered.onCommit).not.toHaveBeenCalled();
    act((): void => {
      rendered.unmount();
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
    expect(rendered.commits[0].reason).toBe("tree");
    expect(rendered.commits[0].next.workspaces[0].layout).toBe(editedLayout);
  });

  it("flush commits pending trees now and same-ref engine ops do not commit", (): void => {
    const rendered: RenderedController = renderController();
    const editedLayout: TilingLayoutNode = leaf("a-flush");
    act((): void => {
      rendered.result.current.onWorkspacesChange(
        withWorkspaceLayout(rendered.result.current.set, "main", editedLayout),
      );
    });
    act((): void => {
      rendered.result.current.flush();
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
    expect(rendered.commits[0].reason).toBe("tree");
    act((): void => {
      rendered.result.current.switch("main");
      rendered.result.current.rename("missing", "Nope");
      rendered.result.current.moveTile("missing", "ops");
    });
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
  });

  it("reset restores one workspace or the whole set immediately and reports atDefaults", (): void => {
    const seed: TilingWorkspaceSet = twoWorkspaces("main");
    const edited: TilingWorkspaceSet = {
      workspaces: [
        { id: "main", name: "Main edited", layout: leaf("z") },
        { id: "ops", name: "Ops edited", layout: leaf("y") },
      ],
      activeId: "ops",
    };
    const rendered: RenderedController = renderController({
      value: edited,
      defaults: seed,
      applyCommits: true,
    });
    expect(rendered.result.current.atDefaults).toBe(false);
    let changed: boolean = false;
    act((): void => {
      changed = rendered.result.current.reset("workspace");
    });
    expect(changed).toBe(true);
    expect(rendered.onCommit).toHaveBeenCalledTimes(1);
    expect(rendered.commits[0].reason).toBe("lifecycle");
    expect(rendered.result.current.set.activeId).toBe("ops");
    expect(rendered.result.current.set.workspaces[1].name).toBe("Ops");
    expect(rendered.result.current.set.workspaces[1].layout).toEqual(seed.workspaces[1].layout);
    expect(rendered.result.current.set.workspaces[0].name).toBe("Main edited");
    expect(rendered.result.current.atDefaults).toBe(false);
    act((): void => {
      changed = rendered.result.current.reset("all");
    });
    expect(changed).toBe(true);
    expect(rendered.onCommit).toHaveBeenCalledTimes(2);
    expect(rendered.result.current.set.activeId).toBe("ops");
    expect(rendered.result.current.set.workspaces[0].layout).toEqual(seed.workspaces[0].layout);
    // Every workspace matches the seed; the active id is irrelevant to atDefaults.
    expect(rendered.result.current.atDefaults).toBe(true);
    act((): void => {
      changed = rendered.result.current.reset("all");
    });
    expect(changed).toBe(false);
    expect(rendered.onCommit).toHaveBeenCalledTimes(2);
    const atSeed: RenderedController = renderController({ value: seed, defaults: seed });
    expect(atSeed.result.current.atDefaults).toBe(true);
    act((): void => {
      changed = atSeed.result.current.reset("all");
    });
    expect(changed).toBe(false);
    expect(atSeed.onCommit).not.toHaveBeenCalled();
  });

  it("reset returns false without defaults or when read-only; atDefaults is false without defaults", (): void => {
    const edited: TilingWorkspaceSet = withWorkspaceLayout(twoWorkspaces("ops"), "ops", leaf("y"));
    const none: RenderedController = renderController({ value: edited });
    expect(none.result.current.atDefaults).toBe(false);
    let changed: boolean = true;
    act((): void => {
      changed = none.result.current.reset("all");
    });
    expect(changed).toBe(false);
    expect(none.onCommit).not.toHaveBeenCalled();
    const frozen: RenderedController = renderController({
      value: edited,
      defaults: twoWorkspaces(),
      readOnly: true,
    });
    expect(frozen.result.current.atDefaults).toBe(false);
    act((): void => {
      changed = frozen.result.current.reset("workspace");
    });
    expect(changed).toBe(false);
    expect(frozen.onCommit).not.toHaveBeenCalled();
  });
});
