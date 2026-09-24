/**
 * Host-agnostic workspace-set controller (H7): keeps locally-edited trees,
 * coalesces tree commits, and applies lifecycle / move / reveal immediately.
 * Replaces the `localTrees` / `pendingRef` / `lastPersistedRef` block a set
 * host (DashAI `dashboard-renderer.tsx`) otherwise keeps by hand.
 */
import * as React from "react";
import type { TilingLayoutNode, TilingWorkspacePlacement } from "../engine/types";
import {
  adoptIncomingWorkspaceTrees,
  classifyIncomingWorkspaceSet,
  diffWorkspaceTreeLayouts,
  foldPendingTrees,
  viewedWorkspaceSet,
  workspaceSetLayoutMap,
  type IncomingWorkspaceSetKind,
  type TilingWorkspaceTreeDiff,
} from "../engine/workspace-set-controller";
import {
  createWorkspace,
  deleteWorkspace,
  moveTileToWorkspace,
  renameWorkspace,
  resetWorkspaceLayout,
  resetWorkspaceSet,
  revealTile,
  switchWorkspace,
  workspaceSetEquals,
  TILING_WORKSPACES_MAX,
  type TilingDeleteWorkspaceResult,
  type TilingRevealTileResult,
  type TilingWorkspace,
  type TilingWorkspaceId,
  type TilingWorkspaceSet,
} from "../engine/workspace-set";

/** Why {@link useTilingWorkspaceSetController} handed a set to the host. */
export type TilingWorkspaceSetCommitReason = "tree" | "lifecycle" | "move" | "reveal";

/** Options of {@link useTilingWorkspaceSetController}. */
export interface TilingWorkspaceSetControllerOptions {
  /** Authoritative set from the host (e.g. its persisted document). */
  readonly value: TilingWorkspaceSet;
  /** Receives the set the host should persist. `reason` tells why. */
  readonly onCommit: (next: TilingWorkspaceSet, reason: TilingWorkspaceSetCommitReason) => void;
  /** Tree edits (divider, rearrange, tab activation, in-tree drop) coalesce for this long. Default 400. */
  readonly treeDebounceMs?: number;
  /** When true: switches stay local, nothing commits (view-only board). Default false. */
  readonly readOnly?: boolean;
  /** Host policy for `create()`. Engine never names. */
  readonly mintWorkspaceId: () => string;
  /** Host policy for `create()`. Receives the current workspaces (pending trees already folded). */
  readonly nextWorkspaceName: (existing: ReadonlyArray<TilingWorkspace>) => string;
  /** Optional cap for `create()` (host concern). Default `TILING_WORKSPACES_MAX`. */
  readonly maxWorkspaces?: number;
  /**
   * Seed set for {@link TilingWorkspaceSetController.reset} and
   * {@link TilingWorkspaceSetController.atDefaults}. Absent → `reset` returns
   * `false` and `atDefaults` is `false`.
   */
  readonly defaults?: TilingWorkspaceSet;
}

/**
 * The controller {@link useTilingWorkspaceSetController} returns. Pass `set`
 * and `onWorkspacesChange` to `<TilingRenderer>` and `useTilingWorkspaceTabs`.
 */
export interface TilingWorkspaceSetController {
  /**
   * The VIEWED set: `value` with locally kept trees and (read-only / optimistic)
   * local active id merged over it. Pass to `<TilingRenderer workspaces>`.
   */
  readonly set: TilingWorkspaceSet;
  /**
   * Pass to `<TilingRenderer onWorkspacesChange>` and `useTilingWorkspaceTabs`.
   * Diffs trees (debounced `"tree"` commit) vs `activeId` (lifecycle commit).
   */
  readonly onWorkspacesChange: (next: TilingWorkspaceSet) => void;
  /** mint + `createWorkspace` + switch; `null` when capped / read-only / refused. */
  readonly create: () => TilingWorkspaceId | null;
  /** Rename a workspace. No-op when read-only or the engine refuses. */
  readonly rename: (id: TilingWorkspaceId, name: string) => void;
  /** Delete a workspace. Returns `removedTileIds` (`[]` when unchanged / read-only). */
  readonly remove: (id: TilingWorkspaceId) => ReadonlyArray<string>;
  /** Switch the viewed workspace. Local when `readOnly`, else commits `"lifecycle"`. */
  readonly switch: (id: TilingWorkspaceId) => void;
  /** Move a tile to `to` (then switch to `to`). Commits `"move"`. No-op when read-only. */
  readonly moveTile: (
    tileId: string,
    to: TilingWorkspaceId,
    placement?: TilingWorkspacePlacement,
  ) => void;
  /**
   * Reveal a tile (`revealTile`). Commits `"reveal"` when `changed !== "none"`
   * and not read-only; read-only applies locally. `null` when the tile is
   * seated nowhere.
   */
  readonly reveal: (tileId: string) => TilingRevealTileResult | null;
  /**
   * Restore the seed: `"workspace"` replaces one workspace (`workspaceId`
   * omitted → the viewed `activeId`); `"all"` replaces the whole set while
   * keeping the current `activeId` when that id exists in `defaults`.
   * Immediate commit (reason `"lifecycle"`), not tree-debounced. `false`
   * when there are no defaults, the host is read-only, or nothing changed.
   */
  readonly reset: (scope: "workspace" | "all", workspaceId?: string) => boolean;
  /**
   * `true` when the viewed set is structurally equal to `defaults`.
   * `false` when `defaults` is omitted.
   */
  readonly atDefaults: boolean;
  /** Commit pending trees now (reason `"tree"`). */
  readonly flush: () => void;
  /** `true` while trees are awaiting a `"tree"` commit. */
  readonly pending: boolean;
}

const DEFAULT_TREE_DEBOUNCE_MS: number = 400;

/**
 * Controlled workspace-set session: the host owns the persisted document
 * (`value` / `onCommit`); the controller owns the in-flight tree overlays,
 * the debounce timer, and the read-only local active id.
 *
 * Every mutation first folds pending trees into the base so a lifecycle
 * commit never drops a tree edit made a moment earlier. Same-reference
 * engine results are ignored (no commit). Unmount with pending trees
 * flushes synchronously via `onCommit`.
 *
 * @example
 * ```tsx
 * const ctl = useTilingWorkspaceSetController({
 *   value: persisted,
 *   onCommit: (next, reason) => persist(next, reason),
 *   readOnly,
 *   mintWorkspaceId: () => crypto.randomUUID(),
 *   nextWorkspaceName: (existing) => `Workspace ${existing.length + 1}`,
 * });
 * const tabs = useTilingWorkspaceTabs({
 *   workspaces: ctl.set,
 *   onWorkspacesChange: ctl.onWorkspacesChange,
 * });
 * return (
 *   <TilingRenderer
 *     workspaces={ctl.set}
 *     onWorkspacesChange={ctl.onWorkspacesChange}
 *     tiles={tiles}
 *     {...tabs.rendererProps}
 *   />
 * );
 * ```
 */
export function useTilingWorkspaceSetController(
  options: TilingWorkspaceSetControllerOptions,
): TilingWorkspaceSetController {
  const {
    value,
    onCommit,
    treeDebounceMs = DEFAULT_TREE_DEBOUNCE_MS,
    readOnly = false,
    mintWorkspaceId,
    nextWorkspaceName,
    maxWorkspaces = TILING_WORKSPACES_MAX,
    defaults,
  } = options;

  const [localTrees, setLocalTrees] = React.useState<
    Map<TilingWorkspaceId, TilingLayoutNode | null>
  >(() => new Map<TilingWorkspaceId, TilingLayoutNode | null>());
  const [localActiveId, setLocalActiveId] = React.useState<TilingWorkspaceId | null>(null);
  const [baseSet, setBaseSet] = React.useState<TilingWorkspaceSet>(value);
  const [pending, setPending] = React.useState<boolean>(false);

  const pendingRef = React.useRef<Map<TilingWorkspaceId, TilingLayoutNode | null>>(
    new Map<TilingWorkspaceId, TilingLayoutNode | null>(),
  );
  const localTreesRef = React.useRef<Map<TilingWorkspaceId, TilingLayoutNode | null>>(localTrees);
  localTreesRef.current = localTrees;
  const baseSetRef = React.useRef<TilingWorkspaceSet>(baseSet);
  baseSetRef.current = baseSet;
  const lastCommittedSetRef = React.useRef<TilingWorkspaceSet>(value);
  const aheadRef = React.useRef<boolean>(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = React.useRef(onCommit);
  onCommitRef.current = onCommit;
  const readOnlyRef = React.useRef<boolean>(readOnly);
  readOnlyRef.current = readOnly;
  const treeDebounceMsRef = React.useRef<number>(treeDebounceMs);
  treeDebounceMsRef.current = treeDebounceMs;
  const mintWorkspaceIdRef = React.useRef(mintWorkspaceId);
  mintWorkspaceIdRef.current = mintWorkspaceId;
  const nextWorkspaceNameRef = React.useRef(nextWorkspaceName);
  nextWorkspaceNameRef.current = nextWorkspaceName;
  const maxWorkspacesRef = React.useRef<number>(maxWorkspaces);
  maxWorkspacesRef.current = maxWorkspaces;
  const defaultsRef = React.useRef<TilingWorkspaceSet | undefined>(defaults);
  defaultsRef.current = defaults;

  const viewed: TilingWorkspaceSet = React.useMemo(
    (): TilingWorkspaceSet => viewedWorkspaceSet(baseSet, localTrees, localActiveId),
    [baseSet, localTrees, localActiveId],
  );
  const viewedRef = React.useRef<TilingWorkspaceSet>(viewed);
  viewedRef.current = viewed;

  const clearTimer = React.useCallback((): void => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const replaceLocalTrees = React.useCallback(
    (next: Map<TilingWorkspaceId, TilingLayoutNode | null>): void => {
      localTreesRef.current = next;
      setLocalTrees(next);
    },
    [],
  );

  const reconcileLocalTrees = React.useCallback(
    (committed: TilingWorkspaceSet): void => {
      const current: Map<TilingWorkspaceId, TilingLayoutNode | null> = localTreesRef.current;
      const next: Map<TilingWorkspaceId, TilingLayoutNode | null> = new Map<
        TilingWorkspaceId,
        TilingLayoutNode | null
      >();
      let changed: boolean = false;
      for (const [workspaceId, tree] of current) {
        const seated: TilingWorkspace | undefined = committed.workspaces.find(
          (workspace: TilingWorkspace): boolean => workspace.id === workspaceId,
        );
        if (seated == null || seated.layout === tree) {
          changed = true;
          continue;
        }
        next.set(workspaceId, tree);
      }
      if (changed) {
        replaceLocalTrees(next);
      }
    },
    [replaceLocalTrees],
  );

  const emit = React.useCallback(
    (next: TilingWorkspaceSet, reason: TilingWorkspaceSetCommitReason): void => {
      if (next === baseSetRef.current) {
        return;
      }
      clearTimer();
      pendingRef.current = new Map<TilingWorkspaceId, TilingLayoutNode | null>();
      setPending(false);
      baseSetRef.current = next;
      setBaseSet(next);
      lastCommittedSetRef.current = next;
      aheadRef.current = true;
      reconcileLocalTrees(next);
      onCommitRef.current(next, reason);
    },
    [clearTimer, reconcileLocalTrees],
  );

  /** Fold pending trees into the base and clear the debounce; does not commit. */
  const withPendingFlushed = React.useCallback((): TilingWorkspaceSet => {
    clearTimer();
    const pendingTrees: Map<TilingWorkspaceId, TilingLayoutNode | null> = pendingRef.current;
    pendingRef.current = new Map<TilingWorkspaceId, TilingLayoutNode | null>();
    if (pendingTrees.size > 0) {
      setPending(false);
    }
    return foldPendingTrees(baseSetRef.current, pendingTrees);
  }, [clearTimer]);

  const emitFlushedIfChanged = React.useCallback(
    (original: TilingWorkspaceSet, flushed: TilingWorkspaceSet): void => {
      if (flushed !== original) {
        emit(flushed, "tree");
      }
    },
    [emit],
  );

  const switchTo = React.useCallback(
    (id: TilingWorkspaceId): void => {
      const current: TilingWorkspaceSet = viewedRef.current;
      if (current.activeId === id) {
        return;
      }
      if (
        !current.workspaces.some((workspace: TilingWorkspace): boolean => workspace.id === id)
      ) {
        return;
      }
      if (readOnlyRef.current) {
        setLocalActiveId(id);
        return;
      }
      const original: TilingWorkspaceSet = baseSetRef.current;
      const base: TilingWorkspaceSet = withPendingFlushed();
      const next: TilingWorkspaceSet = switchWorkspace(base, id);
      if (next === original) {
        return;
      }
      emit(next, next === base ? "tree" : "lifecycle");
      setLocalActiveId(id);
    },
    [emit, withPendingFlushed],
  );

  const onWorkspacesChange = React.useCallback(
    (next: TilingWorkspaceSet): void => {
      const current: TilingWorkspaceSet = viewedRef.current;
      const diffs: ReadonlyArray<TilingWorkspaceTreeDiff> = diffWorkspaceTreeLayouts(
        current,
        next,
      );
      if (diffs.length > 0) {
        const merged: Map<TilingWorkspaceId, TilingLayoutNode | null> = new Map<
          TilingWorkspaceId,
          TilingLayoutNode | null
        >(localTreesRef.current);
        for (const diff of diffs) {
          merged.set(diff.workspaceId, diff.layout);
        }
        replaceLocalTrees(merged);
        if (!readOnlyRef.current) {
          for (const diff of diffs) {
            pendingRef.current.set(diff.workspaceId, diff.layout);
          }
          setPending(true);
          clearTimer();
          const waitMs: number =
            treeDebounceMsRef.current < 0 ? 0 : treeDebounceMsRef.current;
          timerRef.current = setTimeout((): void => {
            timerRef.current = null;
            if (pendingRef.current.size === 0) {
              return;
            }
            const original: TilingWorkspaceSet = baseSetRef.current;
            const flushed: TilingWorkspaceSet = withPendingFlushed();
            if (flushed !== original) {
              emit(flushed, "tree");
            }
          }, waitMs);
        }
      }
      if (next.activeId !== current.activeId) {
        switchTo(next.activeId);
      }
    },
    [clearTimer, emit, replaceLocalTrees, switchTo, withPendingFlushed],
  );

  const create = React.useCallback((): TilingWorkspaceId | null => {
    if (readOnlyRef.current) {
      return null;
    }
    const original: TilingWorkspaceSet = baseSetRef.current;
    const base: TilingWorkspaceSet = withPendingFlushed();
    if (base.workspaces.length >= maxWorkspacesRef.current) {
      emitFlushedIfChanged(original, base);
      return null;
    }
    const id: TilingWorkspaceId = mintWorkspaceIdRef.current();
    const name: string = nextWorkspaceNameRef.current(base.workspaces);
    const created: TilingWorkspaceSet = createWorkspace(base, { id, name, activate: true });
    if (created === base) {
      emitFlushedIfChanged(original, base);
      return null;
    }
    const switched: TilingWorkspaceSet = switchWorkspace(created, id);
    emit(switched, "lifecycle");
    setLocalActiveId(id);
    return id;
  }, [emit, emitFlushedIfChanged, withPendingFlushed]);

  const rename = React.useCallback(
    (id: TilingWorkspaceId, name: string): void => {
      if (readOnlyRef.current) {
        return;
      }
      const original: TilingWorkspaceSet = baseSetRef.current;
      const base: TilingWorkspaceSet = withPendingFlushed();
      const next: TilingWorkspaceSet = renameWorkspace(base, id, name);
      if (next === base) {
        emitFlushedIfChanged(original, base);
        return;
      }
      emit(next, "lifecycle");
    },
    [emit, emitFlushedIfChanged, withPendingFlushed],
  );

  const remove = React.useCallback(
    (id: TilingWorkspaceId): ReadonlyArray<string> => {
      if (readOnlyRef.current) {
        return [];
      }
      const original: TilingWorkspaceSet = baseSetRef.current;
      const base: TilingWorkspaceSet = withPendingFlushed();
      const result: TilingDeleteWorkspaceResult = deleteWorkspace(base, id);
      if (result.set === base) {
        emitFlushedIfChanged(original, base);
        return result.removedTileIds;
      }
      emit(result.set, "lifecycle");
      setLocalActiveId(result.set.activeId);
      return result.removedTileIds;
    },
    [emit, emitFlushedIfChanged, withPendingFlushed],
  );

  const moveTile = React.useCallback(
    (tileId: string, to: TilingWorkspaceId, placement?: TilingWorkspacePlacement): void => {
      if (readOnlyRef.current) {
        return;
      }
      const original: TilingWorkspaceSet = baseSetRef.current;
      const base: TilingWorkspaceSet = withPendingFlushed();
      const moved: TilingWorkspaceSet = moveTileToWorkspace(base, tileId, to, placement);
      if (moved === base) {
        emitFlushedIfChanged(original, base);
        return;
      }
      const switched: TilingWorkspaceSet = switchWorkspace(moved, to);
      emit(switched, "move");
      setLocalActiveId(to);
    },
    [emit, emitFlushedIfChanged, withPendingFlushed],
  );

  const reveal = React.useCallback(
    (tileId: string): TilingRevealTileResult | null => {
      const original: TilingWorkspaceSet = baseSetRef.current;
      const base: TilingWorkspaceSet = withPendingFlushed();
      const result: TilingRevealTileResult | null = revealTile(base, tileId);
      if (result == null || result.changed === "none") {
        emitFlushedIfChanged(original, base);
        return result;
      }
      if (readOnlyRef.current) {
        const diffs: ReadonlyArray<TilingWorkspaceTreeDiff> = diffWorkspaceTreeLayouts(
          viewedRef.current,
          result.set,
        );
        if (diffs.length > 0) {
          const merged: Map<TilingWorkspaceId, TilingLayoutNode | null> = new Map<
            TilingWorkspaceId,
            TilingLayoutNode | null
          >(localTreesRef.current);
          for (const diff of diffs) {
            merged.set(diff.workspaceId, diff.layout);
          }
          replaceLocalTrees(merged);
        }
        setLocalActiveId(result.set.activeId);
        return result;
      }
      emit(result.set, "reveal");
      setLocalActiveId(result.set.activeId);
      return result;
    },
    [emit, emitFlushedIfChanged, replaceLocalTrees, withPendingFlushed],
  );

  const reset = React.useCallback(
    (scope: "workspace" | "all", workspaceId?: string): boolean => {
      if (readOnlyRef.current) {
        return false;
      }
      const seed: TilingWorkspaceSet | undefined = defaultsRef.current;
      if (seed == null) {
        return false;
      }
      const original: TilingWorkspaceSet = baseSetRef.current;
      const base: TilingWorkspaceSet = withPendingFlushed();
      const next: TilingWorkspaceSet =
        scope === "all"
          ? resetWorkspaceSet(base, seed)
          : resetWorkspaceLayout(base, seed, workspaceId ?? base.activeId);
      if (next === base) {
        emitFlushedIfChanged(original, base);
        return false;
      }
      emit(next, "lifecycle");
      return true;
    },
    [emit, emitFlushedIfChanged, withPendingFlushed],
  );

  const atDefaults: boolean =
    defaults != null && workspaceSetEquals(viewed, defaults);

  const flush = React.useCallback((): void => {
    const original: TilingWorkspaceSet = baseSetRef.current;
    const next: TilingWorkspaceSet = withPendingFlushed();
    emitFlushedIfChanged(original, next);
  }, [emitFlushedIfChanged, withPendingFlushed]);

  React.useEffect((): void => {
    const lastCommitted: TilingWorkspaceSet = lastCommittedSetRef.current;
    const kind: IncomingWorkspaceSetKind = classifyIncomingWorkspaceSet(
      value,
      lastCommitted,
      aheadRef.current,
    );
    const adopted = adoptIncomingWorkspaceTrees({
      incoming: value,
      localTrees: localTreesRef.current,
      pending: pendingRef.current,
      lastCommitted: workspaceSetLayoutMap(lastCommitted),
      dropMissingWorkspaces: kind !== "stale",
    });
    pendingRef.current = adopted.pending;
    if (adopted.pending.size === 0) {
      clearTimer();
      setPending(false);
    } else {
      setPending(true);
    }
    if (adopted.localTreesChanged) {
      replaceLocalTrees(adopted.localTrees);
    }
    if (kind === "stale") {
      return;
    }
    aheadRef.current = false;
    lastCommittedSetRef.current = value;
    if (kind === "authoritative") {
      baseSetRef.current = value;
      setBaseSet(value);
      setLocalActiveId(null);
      return;
    }
    // echo — take the host object only when the viewed base is not already aligned
    if (baseSetRef.current !== value) {
      baseSetRef.current = value;
      setBaseSet(value);
    }
  }, [value, clearTimer, replaceLocalTrees]);

  React.useEffect((): (() => void) => {
    return (): void => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (pendingRef.current.size === 0) {
        return;
      }
      const next: TilingWorkspaceSet = foldPendingTrees(
        baseSetRef.current,
        pendingRef.current,
      );
      pendingRef.current = new Map<TilingWorkspaceId, TilingLayoutNode | null>();
      if (next !== baseSetRef.current) {
        onCommitRef.current(next, "tree");
      }
    };
  }, []);

  return {
    set: viewed,
    onWorkspacesChange,
    create,
    rename,
    remove,
    switch: switchTo,
    moveTile,
    reveal,
    reset,
    atDefaults,
    flush,
    pending,
  };
}
