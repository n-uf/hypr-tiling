/**
 * Framework-free helpers for the workspace-set controller (H7). The React hook
 * (`react/use-tiling-workspace-set-controller.ts`) owns timers, refs, and
 * `onCommit`; everything that diffs trees, folds pending edits, or decides
 * whether an incoming host `value` is an echo / stale / authoritative
 * replacement lives here so it can be unit-tested without React.
 */
import type { TilingLayoutNode } from "./types";
import {
  setWorkspaceLayout,
  type TilingWorkspace,
  type TilingWorkspaceId,
  type TilingWorkspaceSet,
} from "./workspace-set";

/** Workspace id → tree overlay (local edits or trees awaiting a commit). */
export type TilingWorkspaceTreeMap = ReadonlyMap<TilingWorkspaceId, TilingLayoutNode | null>;

/** One workspace whose `layout` reference differs between two sets. */
export interface TilingWorkspaceTreeDiff {
  /** Workspace whose tree changed. */
  readonly workspaceId: TilingWorkspaceId;
  /** The incoming tree (`null` = empty workspace). */
  readonly layout: TilingLayoutNode | null;
}

/**
 * How an incoming host `value` relates to the last set the controller committed.
 *
 * - `echo` — same workspaces, names, layout refs, and `activeId` as last
 *   committed (the host applied our persist). Keep local overlays that still
 *   differ; release ones the host has caught up with.
 * - `stale` — we are ahead (a commit the host has not applied yet): shared
 *   workspace layouts still match, but membership / names / `activeId` do
 *   not. Keep the optimistic set.
 * - `authoritative` — at least one incoming layout differs from last
 *   committed, or we are not ahead and the set is not an echo. The host
 *   document wins; drop local trees for those workspaces.
 */
export type IncomingWorkspaceSetKind = "echo" | "stale" | "authoritative";

/** Input to {@link adoptIncomingWorkspaceTrees}. */
export interface AdoptIncomingWorkspaceTreesInput {
  /** The host's current set. */
  readonly incoming: TilingWorkspaceSet;
  /** Local tree overlays (edited since last persist / adopt). */
  readonly localTrees: TilingWorkspaceTreeMap;
  /** Trees awaiting a debounced `"tree"` commit. */
  readonly pending: TilingWorkspaceTreeMap;
  /** Per-workspace layouts of the last committed (or adopted) set. */
  readonly lastCommitted: TilingWorkspaceTreeMap;
  /**
   * When `true` (default), drop last-committed / local / pending entries for
   * workspaces the host no longer has. Pass `false` while the controller is
   * ahead of the host (`stale`) so a just-created workspace is not forgotten.
   */
  readonly dropMissingWorkspaces?: boolean;
}

/** Result of {@link adoptIncomingWorkspaceTrees}. */
export interface AdoptIncomingWorkspaceTreesResult {
  /** Local overlays after dropping superseded / released trees. */
  readonly localTrees: Map<TilingWorkspaceId, TilingLayoutNode | null>;
  /** Pending map after dropping superseded trees. */
  readonly pending: Map<TilingWorkspaceId, TilingLayoutNode | null>;
  /** Last-committed layouts after adopting the host's trees. */
  readonly lastCommitted: Map<TilingWorkspaceId, TilingLayoutNode | null>;
  /** `true` when at least one pending tree was dropped (host superseded it). */
  readonly droppedPending: boolean;
  /** `true` when `localTrees` changed (a setState is needed). */
  readonly localTreesChanged: boolean;
}

/**
 * Replace matching workspaces' trees with the pending overlay. Same set
 * reference when `pending` is empty or every overlay is already the seated
 * tree (`setWorkspaceLayout` same-ref discipline).
 */
export function foldPendingTrees(
  set: TilingWorkspaceSet,
  pending: TilingWorkspaceTreeMap,
): TilingWorkspaceSet {
  if (pending.size === 0) {
    return set;
  }
  let next: TilingWorkspaceSet = set;
  for (const [workspaceId, layout] of pending) {
    next = setWorkspaceLayout(next, workspaceId, layout);
  }
  return next;
}

/**
 * The set a renderer / tab strip should see: `value` with local tree overlays
 * and an optional local `activeId` (read-only view switching, or an
 * optimistic switch that has not landed in `value` yet). Same reference when
 * nothing overlays.
 */
export function viewedWorkspaceSet(
  value: TilingWorkspaceSet,
  localTrees: TilingWorkspaceTreeMap,
  localActiveId?: TilingWorkspaceId | null,
): TilingWorkspaceSet {
  let treesChanged: boolean = false;
  const workspaces: ReadonlyArray<TilingWorkspace> = value.workspaces.map(
    (workspace: TilingWorkspace): TilingWorkspace => {
      const local: TilingLayoutNode | null | undefined = localTrees.get(workspace.id);
      if (local === undefined || local === workspace.layout) {
        return workspace;
      }
      treesChanged = true;
      return { ...workspace, layout: local };
    },
  );
  const activeId: TilingWorkspaceId =
    localActiveId != null &&
    value.workspaces.some((workspace: TilingWorkspace): boolean => workspace.id === localActiveId)
      ? localActiveId
      : value.activeId;
  if (!treesChanged && activeId === value.activeId) {
    return value;
  }
  return { workspaces: treesChanged ? workspaces : value.workspaces, activeId };
}

/**
 * Workspaces in `next` whose `layout` reference differs from the same id in
 * `current`. New workspaces (no prior id) are ignored — membership changes
 * are lifecycle, not tree edits.
 */
export function diffWorkspaceTreeLayouts(
  current: TilingWorkspaceSet,
  next: TilingWorkspaceSet,
): ReadonlyArray<TilingWorkspaceTreeDiff> {
  const diffs: TilingWorkspaceTreeDiff[] = [];
  for (const workspace of next.workspaces) {
    const before: TilingWorkspace | undefined = current.workspaces.find(
      (candidate: TilingWorkspace): boolean => candidate.id === workspace.id,
    );
    if (before !== undefined && before.layout !== workspace.layout) {
      diffs.push({ workspaceId: workspace.id, layout: workspace.layout });
    }
  }
  return diffs;
}

/** `true` when both sets have the same tab order, names, layout refs, and `activeId`. */
export function workspaceSetsAlign(left: TilingWorkspaceSet, right: TilingWorkspaceSet): boolean {
  if (left === right) {
    return true;
  }
  if (left.activeId !== right.activeId || left.workspaces.length !== right.workspaces.length) {
    return false;
  }
  for (let index: number = 0; index < left.workspaces.length; index += 1) {
    const a: TilingWorkspace = left.workspaces[index];
    const b: TilingWorkspace = right.workspaces[index];
    if (a.id !== b.id || a.name !== b.name || a.layout !== b.layout) {
      return false;
    }
  }
  return true;
}

/**
 * Classify an incoming host `value` against the last committed set. See
 * {@link IncomingWorkspaceSetKind}.
 */
export function classifyIncomingWorkspaceSet(
  incoming: TilingWorkspaceSet,
  lastCommitted: TilingWorkspaceSet,
  ahead: boolean,
): IncomingWorkspaceSetKind {
  if (incoming === lastCommitted || workspaceSetsAlign(incoming, lastCommitted)) {
    return "echo";
  }
  for (const workspace of incoming.workspaces) {
    const last: TilingWorkspace | undefined = lastCommitted.workspaces.find(
      (candidate: TilingWorkspace): boolean => candidate.id === workspace.id,
    );
    if (last != null && last.layout !== workspace.layout) {
      return "authoritative";
    }
  }
  return ahead ? "stale" : "authoritative";
}

/**
 * Adopt a host `value`. Drop local / pending trees for workspaces whose
 * incoming layout differs from last committed (the host is authoritative).
 * Keep overlays whose incoming layout still matches last committed (host
 * echo of our last persist). Optionally drop entries for workspaces the
 * host no longer has.
 */
export function adoptIncomingWorkspaceTrees(
  input: AdoptIncomingWorkspaceTreesInput,
): AdoptIncomingWorkspaceTreesResult {
  const dropMissing: boolean = input.dropMissingWorkspaces !== false;
  const nextLocal: Map<TilingWorkspaceId, TilingLayoutNode | null> = new Map<
    TilingWorkspaceId,
    TilingLayoutNode | null
  >(input.localTrees);
  const nextPending: Map<TilingWorkspaceId, TilingLayoutNode | null> = new Map<
    TilingWorkspaceId,
    TilingLayoutNode | null
  >(input.pending);
  const nextLast: Map<TilingWorkspaceId, TilingLayoutNode | null> = new Map<
    TilingWorkspaceId,
    TilingLayoutNode | null
  >(input.lastCommitted);
  let droppedPending: boolean = false;
  let localTreesChanged: boolean = false;
  const known: Set<TilingWorkspaceId> = new Set<TilingWorkspaceId>();

  for (const workspace of input.incoming.workspaces) {
    known.add(workspace.id);
    const baseline: TilingLayoutNode | null | undefined = nextLast.get(workspace.id);
    const local: TilingLayoutNode | null | undefined = nextLocal.get(workspace.id);
    if (baseline !== undefined && baseline === workspace.layout) {
      if (local !== undefined && !nextPending.has(workspace.id) && local === workspace.layout) {
        nextLocal.delete(workspace.id);
        localTreesChanged = true;
      }
      continue;
    }
    if (nextPending.delete(workspace.id)) {
      droppedPending = true;
    }
    nextLast.set(workspace.id, workspace.layout);
    if (local !== undefined) {
      nextLocal.delete(workspace.id);
      localTreesChanged = true;
    }
  }

  if (dropMissing) {
    for (const workspaceId of [...nextLast.keys()]) {
      if (known.has(workspaceId)) {
        continue;
      }
      nextLast.delete(workspaceId);
      if (nextPending.delete(workspaceId)) {
        droppedPending = true;
      }
      if (nextLocal.has(workspaceId)) {
        nextLocal.delete(workspaceId);
        localTreesChanged = true;
      }
    }
  }

  return {
    localTrees: nextLocal,
    pending: nextPending,
    lastCommitted: nextLast,
    droppedPending,
    localTreesChanged,
  };
}

/** Per-workspace layout refs of a set — the last-committed map {@link adoptIncomingWorkspaceTrees} reads. */
export function workspaceSetLayoutMap(
  set: TilingWorkspaceSet,
): Map<TilingWorkspaceId, TilingLayoutNode | null> {
  return new Map<TilingWorkspaceId, TilingLayoutNode | null>(
    set.workspaces.map(
      (workspace: TilingWorkspace): [TilingWorkspaceId, TilingLayoutNode | null] => [
        workspace.id,
        workspace.layout,
      ],
    ),
  );
}
