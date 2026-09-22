/**
 * Workspace set — several layout trees over ONE pool of tiles, one active
 * (`_agent/workspace-set-concept.md`). A workspace is a host-named tree
 * (`TilingLayoutNode | null`; `null` = an empty workspace). Leaves are the
 * shared item space: a leaf `{ id, tileId }` may be seated in several
 * workspaces (shown in each), at most once per workspace, and its `id` ↔
 * `tileId` binding is the same in every seat. Framework-free and pure: every
 * op returns a NEW set, or the SAME reference when it is a no-op, and never
 * throws on a bad id — the total-function contract of the tree reducers.
 *
 * Cross-tree moves reuse the tree reducers' halves (`extractLeafNode` +
 * `insertLeafInto`, `engine/state.ts`) instead of re-deriving them.
 */
import {
  extractLeafNode,
  findLeafById,
  insertLeafInto,
  isStructurallyValidLayout,
  normalizeStaticAxisFill,
  type ExtractedLeafResult,
} from "./state";
import type {
  TilingGroupNode,
  TilingLayoutNode,
  TilingLeafNode,
  TilingPaneCycleDirection,
  TilingWorkspacePlacement,
} from "./types";

/** Host-minted workspace id — any non-empty string, unique within the set. */
export type TilingWorkspaceId = string;

/** One workspace: a stable id, a host-facing name, and its layout tree (`null` = empty). */
export interface TilingWorkspace {
  /** Unique within the set. Any non-empty string (e.g. `"main"`, `"ws:01H…"`). */
  readonly id: TilingWorkspaceId;
  /** Display name; 1..{@link TILING_WORKSPACE_NAME_MAX_CHARS} chars after trim. */
  readonly name: string;
  /** The workspace's tree, or `null` for an empty workspace. */
  readonly layout: TilingLayoutNode | null;
}

/**
 * The ordered collection of workspaces plus the active one — the value a set
 * host owns in state and hands to `TilingRenderer` via the `workspaces` prop.
 * Array order is tab order.
 */
export interface TilingWorkspaceSet {
  /** Tab order. At least one workspace. */
  readonly workspaces: ReadonlyArray<TilingWorkspace>;
  /** The rendered workspace. Always one of `workspaces[].id`. */
  readonly activeId: TilingWorkspaceId;
}

/** Maximum number of workspaces `createWorkspace` admits. */
export const TILING_WORKSPACES_MAX: number = 12;
/** Maximum workspace name length (after trim) `createWorkspace` / `renameWorkspace` admit. */
export const TILING_WORKSPACE_NAME_MAX_CHARS: number = 40;
/** Default placement when a leaf enters a tree without a host placement: a new root split, leaf last. */
export const TILING_DEFAULT_WORKSPACE_PLACEMENT: TilingWorkspacePlacement = {
  kind: "root",
  side: "second",
};
/** Id of the single workspace `workspaceSetOfLayout` mints for a one-tree host. */
export const TILING_MAIN_WORKSPACE_ID: TilingWorkspaceId = "main";
/** Name of the single workspace `workspaceSetOfLayout` mints for a one-tree host. */
export const TILING_MAIN_WORKSPACE_NAME: string = "Main";

// ───────────────────────────────────────────────────────────────────────────
// Names / lookup helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Trim a workspace name and validate it against
 * {@link TILING_WORKSPACE_NAME_MAX_CHARS}. `null` when the trimmed name is
 * empty or too long — the ops refuse (return the set unchanged) on `null`.
 */
export function normalizeWorkspaceName(name: string): string | null {
  const trimmed: string = name.trim();
  if (trimmed.length === 0 || trimmed.length > TILING_WORKSPACE_NAME_MAX_CHARS) {
    return null;
  }
  return trimmed;
}

function workspaceIndex(set: TilingWorkspaceSet, id: TilingWorkspaceId): number {
  return set.workspaces.findIndex((workspace: TilingWorkspace): boolean => workspace.id === id);
}

function workspaceById(set: TilingWorkspaceSet, id: TilingWorkspaceId): TilingWorkspace | null {
  return set.workspaces.find((workspace: TilingWorkspace): boolean => workspace.id === id) ?? null;
}

/** Every leaf of a tree in reading order (group members in tab order); `[]` for `null`. */
function collectLeaves(tree: TilingLayoutNode | null): ReadonlyArray<TilingLeafNode> {
  if (tree == null) {
    return [];
  }
  if (tree.kind === "leaf") {
    return [tree];
  }
  if (tree.kind === "group") {
    return tree.members;
  }
  return [...collectLeaves(tree.first), ...collectLeaves(tree.second)];
}

/** Remove `leafId` from a nullable tree and gap-close; the root leaf → `null`. Same ref when absent. */
function removeLeafFromTree(
  tree: TilingLayoutNode | null,
  leafId: string,
): TilingLayoutNode | null {
  if (tree == null) {
    return null;
  }
  const extraction: ExtractedLeafResult = extractLeafNode(tree, leafId);
  if (extraction.extractedLeaf == null) {
    return tree;
  }
  return extraction.nextNode == null ? null : normalizeStaticAxisFill(extraction.nextNode);
}

function replaceLayoutAt(
  set: TilingWorkspaceSet,
  id: TilingWorkspaceId,
  layout: TilingLayoutNode | null,
): TilingWorkspaceSet {
  const index: number = workspaceIndex(set, id);
  if (index === -1 || set.workspaces[index].layout === layout) {
    return set;
  }
  const workspaces: TilingWorkspace[] = [...set.workspaces];
  workspaces[index] = { ...workspaces[index], layout };
  return { ...set, workspaces };
}

interface LeafSeat {
  readonly workspaceId: TilingWorkspaceId;
  readonly leaf: TilingLeafNode;
}

/** The seat of `leafId` to read node payload from: the active workspace's when it has one, else the first in order. */
function primarySeat(set: TilingWorkspaceSet, leafId: string): LeafSeat | null {
  const active: TilingWorkspace | null = workspaceById(set, set.activeId);
  const activeLeaf: TilingLeafNode | null =
    active?.layout == null ? null : findLeafById(active.layout, leafId);
  if (active != null && activeLeaf != null) {
    return { workspaceId: active.id, leaf: activeLeaf };
  }
  for (const workspace of set.workspaces) {
    const leaf: TilingLeafNode | null =
      workspace.layout == null ? null : findLeafById(workspace.layout, leafId);
    if (leaf != null) {
      return { workspaceId: workspace.id, leaf };
    }
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Construction
// ───────────────────────────────────────────────────────────────────────────

/**
 * Single-tree sugar: the one-workspace set a `layout` / `onLayoutChange` host
 * is projected onto (`{ workspaces: [{ id, name, layout }], activeId: id }`).
 */
export function workspaceSetOfLayout(
  layout: TilingLayoutNode | null,
  id: TilingWorkspaceId = TILING_MAIN_WORKSPACE_ID,
  name: string = TILING_MAIN_WORKSPACE_NAME,
): TilingWorkspaceSet {
  return { workspaces: [{ id, name, layout }], activeId: id };
}

/** The workspace `set.activeId` names, or `null` when it names none (an integrity issue). */
export function activeWorkspace(set: TilingWorkspaceSet): TilingWorkspace | null {
  return workspaceById(set, set.activeId);
}

/** The workspace with `id`, or `null` when absent. */
export function findWorkspaceById(
  set: TilingWorkspaceSet,
  id: TilingWorkspaceId,
): TilingWorkspace | null {
  return workspaceById(set, id);
}

/** Input to {@link createWorkspace}. */
export interface CreateWorkspaceInput {
  /** Unique within the set. Refused (unchanged set) when empty or already present. */
  readonly id: TilingWorkspaceId;
  /** Display name; refused when it normalises to `null` (see {@link normalizeWorkspaceName}). */
  readonly name: string;
  /**
   * Initial tree. Default `null` (empty). A leaf already seated in another
   * workspace is MOVED here (replace wins) so no tree ends up with a stale
   * second seat the host did not ask for; use {@link showInWorkspace} to share.
   */
  readonly layout?: TilingLayoutNode | null;
  /** Insertion index in tab order. Default: append. Clamped to `[0, length]`. */
  readonly at?: number;
  /** Make the new workspace active. Default `false`. */
  readonly activate?: boolean;
}

/**
 * Append (or insert at `at`) a workspace. Unchanged when the id is empty or
 * taken, the name is invalid, or the set already holds
 * {@link TILING_WORKSPACES_MAX} workspaces.
 */
export function createWorkspace(
  set: TilingWorkspaceSet,
  input: CreateWorkspaceInput,
): TilingWorkspaceSet {
  const name: string | null = normalizeWorkspaceName(input.name);
  if (
    input.id.length === 0 ||
    name == null ||
    workspaceById(set, input.id) != null ||
    set.workspaces.length >= TILING_WORKSPACES_MAX
  ) {
    return set;
  }
  const layout: TilingLayoutNode | null = input.layout ?? null;
  // Replace wins: leaves the new tree seats leave their other seats.
  let stripped: TilingWorkspaceSet = set;
  if (layout != null) {
    if (!isStructurallyValidLayout(layout)) {
      return set;
    }
    for (const leaf of collectLeaves(layout)) {
      for (const workspace of stripped.workspaces) {
        stripped = replaceLayoutAt(stripped, workspace.id, removeLeafFromTree(workspace.layout, leaf.id));
      }
    }
  }
  const at: number = Math.min(
    Math.max(input.at ?? stripped.workspaces.length, 0),
    stripped.workspaces.length,
  );
  const workspaces: TilingWorkspace[] = [...stripped.workspaces];
  workspaces.splice(at, 0, { id: input.id, name, layout });
  return {
    workspaces,
    activeId: input.activate === true ? input.id : stripped.activeId,
  };
}

/** Rename a workspace. Unchanged when the id is unknown, the name is invalid, or already equal. */
export function renameWorkspace(
  set: TilingWorkspaceSet,
  id: TilingWorkspaceId,
  name: string,
): TilingWorkspaceSet {
  const normalized: string | null = normalizeWorkspaceName(name);
  const index: number = workspaceIndex(set, id);
  if (normalized == null || index === -1 || set.workspaces[index].name === normalized) {
    return set;
  }
  const workspaces: TilingWorkspace[] = [...set.workspaces];
  workspaces[index] = { ...workspaces[index], name: normalized };
  return { ...set, workspaces };
}

/** The result of {@link deleteWorkspace}. */
export interface TilingDeleteWorkspaceResult {
  /** The set without the workspace (the input by reference when refused). */
  readonly set: TilingWorkspaceSet;
  /**
   * Tile ids that were shown ONLY in the deleted workspace, in that tree's
   * reading order — they are now seated nowhere, so a host with a tile
   * registry reconciles (DashAI: items shown nowhere leave `items`). Empty
   * when refused.
   */
  readonly removedTileIds: ReadonlyArray<string>;
}

/**
 * Delete a workspace. The LAST workspace is never deleted (refused, unchanged
 * set). Leaves shown only there leave the set (reported as `removedTileIds`);
 * leaves also shown elsewhere keep their other seats. When the deleted
 * workspace was active, the previous one in tab order becomes active, else
 * the next.
 */
export function deleteWorkspace(
  set: TilingWorkspaceSet,
  id: TilingWorkspaceId,
): TilingDeleteWorkspaceResult {
  const index: number = workspaceIndex(set, id);
  if (index === -1 || set.workspaces.length <= 1) {
    return { set, removedTileIds: [] };
  }
  const removed: TilingWorkspace = set.workspaces[index];
  const remaining: ReadonlyArray<TilingWorkspace> = set.workspaces.filter(
    (workspace: TilingWorkspace): boolean => workspace.id !== id,
  );
  const shownElsewhere: Set<string> = new Set<string>(
    remaining.flatMap((workspace: TilingWorkspace): ReadonlyArray<string> =>
      collectLeaves(workspace.layout).map((leaf: TilingLeafNode): string => leaf.tileId),
    ),
  );
  const removedTileIds: ReadonlyArray<string> = collectLeaves(removed.layout)
    .map((leaf: TilingLeafNode): string => leaf.tileId)
    .filter((tileId: string): boolean => !shownElsewhere.has(tileId));
  const nextActiveId: TilingWorkspaceId =
    set.activeId === id
      ? (remaining[Math.max(index - 1, 0)]?.id ?? remaining[0].id)
      : set.activeId;
  return {
    set: { workspaces: remaining, activeId: nextActiveId },
    removedTileIds,
  };
}

/** Make `id` the active workspace. Unchanged when unknown or already active. */
export function switchWorkspace(
  set: TilingWorkspaceSet,
  id: TilingWorkspaceId,
): TilingWorkspaceSet {
  if (set.activeId === id || workspaceById(set, id) == null) {
    return set;
  }
  return { ...set, activeId: id };
}

/** Activate the next / previous workspace in tab order (wraps). Unchanged with one workspace. */
export function cycleWorkspace(
  set: TilingWorkspaceSet,
  direction: TilingPaneCycleDirection,
): TilingWorkspaceSet {
  const count: number = set.workspaces.length;
  if (count < 2) {
    return set;
  }
  const index: number = Math.max(workspaceIndex(set, set.activeId), 0);
  const step: number = direction === "next" ? 1 : -1;
  return switchWorkspace(set, set.workspaces[(index + step + count) % count].id);
}

/**
 * Replace ONE workspace's tree — the in-tree commit path the renderer uses in
 * set mode (a drag / resize / collapse edit of the active tree). Only that
 * workspace changes; other seats are untouched (a cross-tree move is
 * {@link moveLeafToWorkspace}). Unchanged when the id is unknown, the tree is
 * the same reference, or a non-null tree fails `isStructurallyValidLayout`.
 */
export function setWorkspaceLayout(
  set: TilingWorkspaceSet,
  id: TilingWorkspaceId,
  layout: TilingLayoutNode | null,
): TilingWorkspaceSet {
  if (layout != null && !isStructurallyValidLayout(layout)) {
    return set;
  }
  return replaceLayoutAt(set, id, layout);
}

// ───────────────────────────────────────────────────────────────────────────
// Leaf seating across workspaces
// ───────────────────────────────────────────────────────────────────────────

/**
 * Move a leaf to workspace `to` at `placement`: it leaves EVERY workspace that
 * shows it and is seated once in `to` (the drag-onto-a-tab commit; DashAI
 * `moveItem`). The node payload (`sizing`, `collapsed`, `minBBoxPx`) travels
 * from the active workspace's seat when it has one, else the first seat in
 * tab order; the collapse pin is re-asserted on the destination axis by
 * `insertLeafInto`. When `to` is the leaf's only workspace this is a
 * same-tree re-seat (extract + insert). Unchanged when the leaf or `to` is
 * unknown. A source tree whose only leaf moved out becomes `null`.
 */
export function moveLeafToWorkspace(
  set: TilingWorkspaceSet,
  leafId: string,
  to: TilingWorkspaceId,
  placement: TilingWorkspacePlacement = TILING_DEFAULT_WORKSPACE_PLACEMENT,
): TilingWorkspaceSet {
  if (workspaceById(set, to) == null) {
    return set;
  }
  const seat: LeafSeat | null = primarySeat(set, leafId);
  if (seat == null) {
    return set;
  }
  let next: TilingWorkspaceSet = set;
  for (const workspace of set.workspaces) {
    next = replaceLayoutAt(next, workspace.id, removeLeafFromTree(workspace.layout, leafId));
  }
  const target: TilingWorkspace | null = workspaceById(next, to);
  return replaceLayoutAt(next, to, insertLeafInto(target?.layout ?? null, seat.leaf, placement));
}

/**
 * Seat a leaf that is already in the set in ANOTHER workspace too (shown in
 * both; DashAI `showItem`). The new seat is a fresh `{ id, tileId }` node —
 * `sizing` / `collapsed` are per workspace. Unchanged when the leaf is
 * unknown, `to` is unknown, or `to` already shows it.
 */
export function showInWorkspace(
  set: TilingWorkspaceSet,
  leafId: string,
  to: TilingWorkspaceId,
  placement: TilingWorkspacePlacement = TILING_DEFAULT_WORKSPACE_PLACEMENT,
): TilingWorkspaceSet {
  const target: TilingWorkspace | null = workspaceById(set, to);
  if (target == null) {
    return set;
  }
  if (target.layout != null && findLeafById(target.layout, leafId) != null) {
    return set;
  }
  const seat: LeafSeat | null = primarySeat(set, leafId);
  if (seat == null) {
    return set;
  }
  const fresh: TilingLeafNode = { kind: "leaf", id: seat.leaf.id, tileId: seat.leaf.tileId };
  return replaceLayoutAt(set, to, insertLeafInto(target.layout, fresh, placement));
}

/**
 * Remove a leaf's seat from workspace `from` (DashAI `hideItem`). When that
 * was its only seat the leaf leaves the set — consult
 * {@link queryWorkspaceSet}.`workspacesOfLeaf` first if the host must keep
 * every item shown somewhere. Unchanged when `from` does not show the leaf.
 */
export function hideFromWorkspace(
  set: TilingWorkspaceSet,
  leafId: string,
  from: TilingWorkspaceId,
): TilingWorkspaceSet {
  const source: TilingWorkspace | null = workspaceById(set, from);
  if (source == null) {
    return set;
  }
  return replaceLayoutAt(set, from, removeLeafFromTree(source.layout, leafId));
}

// ───────────────────────────────────────────────────────────────────────────
// Read facade
// ───────────────────────────────────────────────────────────────────────────

/** Read-only view over a set — the set-level analogue of `queryTilingLayout`. */
export interface TilingWorkspaceSetQuery {
  /** The active workspace (the first one when `activeId` is dangling). */
  readonly active: TilingWorkspace;
  /** Look a workspace up by id. */
  readonly workspace: (id: TilingWorkspaceId) => TilingWorkspace | null;
  /** Ids of the workspaces showing `leafId`, in tab order. */
  readonly workspacesOfLeaf: (leafId: string) => ReadonlyArray<TilingWorkspaceId>;
  /** Ids of the workspaces showing `tileId`, in tab order. */
  readonly workspacesOfTile: (tileId: string) => ReadonlyArray<TilingWorkspaceId>;
  /** Every leaf id of one workspace in reading order (group members in tab order). */
  readonly leafIds: (workspaceId: TilingWorkspaceId) => ReadonlyArray<string>;
  /** Every tile id of one workspace in reading order. */
  readonly tileIds: (workspaceId: TilingWorkspaceId) => ReadonlyArray<string>;
  /** Number of leaves a workspace shows (`0` for an empty one). */
  readonly leafCount: (workspaceId: TilingWorkspaceId) => number;
  /** The workspace after / before `workspaceId` in tab order (wraps); `null` with one workspace. */
  readonly neighbour: (
    workspaceId: TilingWorkspaceId,
    direction: TilingPaneCycleDirection,
  ) => TilingWorkspaceId | null;
}

/** Build a read-only {@link TilingWorkspaceSetQuery} over `set`. */
export function queryWorkspaceSet(set: TilingWorkspaceSet): TilingWorkspaceSetQuery {
  const leavesOf = (workspaceId: TilingWorkspaceId): ReadonlyArray<TilingLeafNode> =>
    collectLeaves(workspaceById(set, workspaceId)?.layout ?? null);
  return {
    active: workspaceById(set, set.activeId) ?? set.workspaces[0],
    workspace: (id: TilingWorkspaceId): TilingWorkspace | null => workspaceById(set, id),
    workspacesOfLeaf: (leafId: string): ReadonlyArray<TilingWorkspaceId> =>
      set.workspaces
        .filter(
          (workspace: TilingWorkspace): boolean =>
            workspace.layout != null && findLeafById(workspace.layout, leafId) != null,
        )
        .map((workspace: TilingWorkspace): TilingWorkspaceId => workspace.id),
    workspacesOfTile: (tileId: string): ReadonlyArray<TilingWorkspaceId> =>
      set.workspaces
        .filter((workspace: TilingWorkspace): boolean =>
          collectLeaves(workspace.layout).some((leaf: TilingLeafNode): boolean => leaf.tileId === tileId),
        )
        .map((workspace: TilingWorkspace): TilingWorkspaceId => workspace.id),
    leafIds: (workspaceId: TilingWorkspaceId): ReadonlyArray<string> =>
      leavesOf(workspaceId).map((leaf: TilingLeafNode): string => leaf.id),
    tileIds: (workspaceId: TilingWorkspaceId): ReadonlyArray<string> =>
      leavesOf(workspaceId).map((leaf: TilingLeafNode): string => leaf.tileId),
    leafCount: (workspaceId: TilingWorkspaceId): number => leavesOf(workspaceId).length,
    neighbour: (
      workspaceId: TilingWorkspaceId,
      direction: TilingPaneCycleDirection,
    ): TilingWorkspaceId | null => {
      const count: number = set.workspaces.length;
      const index: number = workspaceIndex(set, workspaceId);
      if (count < 2 || index === -1) {
        return null;
      }
      const step: number = direction === "next" ? 1 : -1;
      return set.workspaces[(index + step + count) % count].id;
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Integrity
// ───────────────────────────────────────────────────────────────────────────

/**
 * The set-level invariants {@link workspaceSetIssues} checks (per-tree
 * structure is `isStructurallyValidLayout`):
 *
 * - `no-workspaces` — the set is empty.
 * - `empty-workspace-id` / `duplicate-workspace-id` — workspace ids are
 *   non-empty and unique.
 * - `invalid-workspace-name` — a name that fails {@link normalizeWorkspaceName}.
 * - `active-workspace-missing` — `activeId` names no workspace.
 * - `invalid-tree` — a tree fails `isStructurallyValidLayout` (duplicate leaf
 *   or tile inside one tree, empty ids, bad split).
 * - `leaf-tile-binding-mismatch` — a leaf id bound to a different tile id (or
 *   a tile id to a different leaf id) than in an earlier workspace; a leaf id
 *   resolves to ONE logical pane across the set.
 * - `orphan-tile` — an `expectedTileIds` member seated in no workspace.
 * - `unknown-tile` — a seated tile absent from `expectedTileIds`.
 */
export type TilingWorkspaceSetIssueKind =
  | "no-workspaces"
  | "empty-workspace-id"
  | "duplicate-workspace-id"
  | "invalid-workspace-name"
  | "active-workspace-missing"
  | "invalid-tree"
  | "leaf-tile-binding-mismatch"
  | "orphan-tile"
  | "unknown-tile";

/** One integrity finding of {@link workspaceSetIssues}. */
export interface TilingWorkspaceSetIssue {
  readonly kind: TilingWorkspaceSetIssueKind;
  /** The workspace the finding is about, when it is workspace-local. */
  readonly workspaceId?: TilingWorkspaceId;
  /** The leaf the finding is about, when leaf-local. */
  readonly leafId?: string;
  /** The tile the finding is about, when tile-local. */
  readonly tileId?: string;
  /** Human-readable summary. */
  readonly message: string;
}

/** Options for {@link workspaceSetIssues} / {@link repairWorkspaceSet}. */
export interface WorkspaceSetIntegrityOptions {
  /**
   * The host's tile registry, set-wide. When given, every expected tile must
   * be seated in ≥ 1 workspace (`orphan-tile`) and no tree may seat an
   * unknown tile (`unknown-tile`). Omit to check structure only.
   */
  readonly expectedTileIds?: ReadonlyArray<string>;
}

/** Canonical leaf-id ↔ tile-id binding: the first seat in tab / reading order wins. */
interface LeafBinding {
  readonly leafId: string;
  readonly tileId: string;
}

function collectBindings(set: TilingWorkspaceSet): {
  byLeaf: Map<string, LeafBinding>;
  byTile: Map<string, LeafBinding>;
} {
  const byLeaf: Map<string, LeafBinding> = new Map<string, LeafBinding>();
  const byTile: Map<string, LeafBinding> = new Map<string, LeafBinding>();
  for (const workspace of set.workspaces) {
    for (const leaf of collectLeaves(workspace.layout)) {
      if (!byLeaf.has(leaf.id) && !byTile.has(leaf.tileId)) {
        const binding: LeafBinding = { leafId: leaf.id, tileId: leaf.tileId };
        byLeaf.set(leaf.id, binding);
        byTile.set(leaf.tileId, binding);
      }
    }
  }
  return { byLeaf, byTile };
}

/**
 * Walk a set and report every violated invariant (see
 * {@link TilingWorkspaceSetIssueKind}). Empty array = the set is sound. Pure.
 */
export function workspaceSetIssues(
  set: TilingWorkspaceSet,
  options: WorkspaceSetIntegrityOptions = {},
): ReadonlyArray<TilingWorkspaceSetIssue> {
  const issues: TilingWorkspaceSetIssue[] = [];
  if (set.workspaces.length === 0) {
    issues.push({ kind: "no-workspaces", message: "workspace set has no workspaces" });
  }
  const seenIds: Set<string> = new Set<string>();
  for (const workspace of set.workspaces) {
    if (workspace.id.length === 0) {
      issues.push({ kind: "empty-workspace-id", workspaceId: workspace.id, message: "workspace id is empty" });
    } else if (seenIds.has(workspace.id)) {
      issues.push({
        kind: "duplicate-workspace-id",
        workspaceId: workspace.id,
        message: `duplicate workspace id ${workspace.id}`,
      });
    }
    seenIds.add(workspace.id);
    if (normalizeWorkspaceName(workspace.name) !== workspace.name) {
      issues.push({
        kind: "invalid-workspace-name",
        workspaceId: workspace.id,
        message: `workspace ${workspace.id} name must be 1..${TILING_WORKSPACE_NAME_MAX_CHARS} trimmed chars`,
      });
    }
    if (workspace.layout != null && !isStructurallyValidLayout(workspace.layout)) {
      issues.push({
        kind: "invalid-tree",
        workspaceId: workspace.id,
        message: `workspace ${workspace.id} tree is structurally invalid`,
      });
    }
  }
  if (set.workspaces.length > 0 && !seenIds.has(set.activeId)) {
    issues.push({
      kind: "active-workspace-missing",
      message: `activeId ${set.activeId} names no workspace`,
    });
  }
  const { byLeaf, byTile } = collectBindings(set);
  for (const workspace of set.workspaces) {
    for (const leaf of collectLeaves(workspace.layout)) {
      const canonicalByLeaf: LeafBinding | undefined = byLeaf.get(leaf.id);
      const canonicalByTile: LeafBinding | undefined = byTile.get(leaf.tileId);
      if (canonicalByLeaf?.tileId !== leaf.tileId || canonicalByTile?.leafId !== leaf.id) {
        issues.push({
          kind: "leaf-tile-binding-mismatch",
          workspaceId: workspace.id,
          leafId: leaf.id,
          tileId: leaf.tileId,
          message: `leaf ${leaf.id} → tile ${leaf.tileId} in ${workspace.id} disagrees with an earlier seat`,
        });
      }
    }
  }
  if (options.expectedTileIds != null) {
    const expected: Set<string> = new Set<string>(options.expectedTileIds);
    const seated: Set<string> = new Set<string>();
    for (const workspace of set.workspaces) {
      for (const leaf of collectLeaves(workspace.layout)) {
        seated.add(leaf.tileId);
        if (!expected.has(leaf.tileId)) {
          issues.push({
            kind: "unknown-tile",
            workspaceId: workspace.id,
            leafId: leaf.id,
            tileId: leaf.tileId,
            message: `tile ${leaf.tileId} seated in ${workspace.id} is not an expected tile`,
          });
        }
      }
    }
    for (const tileId of options.expectedTileIds) {
      if (!seated.has(tileId)) {
        issues.push({ kind: "orphan-tile", tileId, message: `tile ${tileId} is shown in no workspace` });
      }
    }
  }
  return issues;
}

// ───────────────────────────────────────────────────────────────────────────
// Repair
// ───────────────────────────────────────────────────────────────────────────

/**
 * What {@link repairWorkspaceSet} did, in application order:
 *
 * - `workspace-created` — empty set → one `main` / "Main" workspace.
 * - `workspace-dropped` — a workspace with an empty or duplicate id was
 *   removed; leaves shown only there moved to the kept workspace.
 * - `workspace-renamed` — an invalid name was replaced.
 * - `tree-rebuilt` — a structurally invalid tree was rebuilt from its distinct
 *   leaves in reading order.
 * - `leaf-rebound` — a leaf whose id / tile binding disagreed with an earlier
 *   seat was rewritten to the canonical id.
 * - `leaf-removed` — a mismatched seat that could not be rebound was removed.
 * - `unknown-tile-pruned` — a seat of a tile outside `expectedTileIds` was removed.
 * - `orphan-seated` — an expected tile shown nowhere was seated.
 * - `active-reset` — a dangling `activeId` now names the first workspace.
 */
export type TilingWorkspaceSetRepairReason =
  | "workspace-created"
  | "workspace-dropped"
  | "workspace-renamed"
  | "tree-rebuilt"
  | "leaf-rebound"
  | "leaf-removed"
  | "unknown-tile-pruned"
  | "orphan-seated"
  | "active-reset";

/** Options for {@link repairWorkspaceSet}. */
export interface RepairWorkspaceSetOptions extends WorkspaceSetIntegrityOptions {
  /** Where orphan expected tiles are seated. Default: the active workspace. */
  readonly orphanWorkspaceId?: TilingWorkspaceId;
  /** Placement for seated orphans. Default {@link TILING_DEFAULT_WORKSPACE_PLACEMENT}. */
  readonly orphanPlacement?: TilingWorkspacePlacement;
  /**
   * Leaf id for a tile the repair has to seat from scratch (an orphan with no
   * seat anywhere). Default `` `leaf-${tileId}` `` (the `buildDefaultDwindleLayout`
   * convention); a host with its own scheme (DashAI `leaf:<itemId>`) passes it
   * so repaired seats match the ids it mints.
   */
  readonly mintLeafId?: (tileId: string) => string;
}

/** The result of {@link repairWorkspaceSet}. */
export interface TilingWorkspaceSetRepairResult {
  /** The repaired set (the input by reference when nothing was wrong). */
  readonly set: TilingWorkspaceSet;
  /** Every rule that fired, in application order, one entry per fix. */
  readonly reasons: ReadonlyArray<TilingWorkspaceSetRepairReason>;
}

function defaultMintLeafId(tileId: string): string {
  return `leaf-${tileId}`;
}

/** Rebuild an invalid tree from its distinct leaves in reading order (first occurrence of a leaf id / tile id wins). */
function rebuildTree(tree: TilingLayoutNode): TilingLayoutNode | null {
  const seenLeafIds: Set<string> = new Set<string>();
  const seenTileIds: Set<string> = new Set<string>();
  let rebuilt: TilingLayoutNode | null = null;
  for (const leaf of collectLeaves(tree)) {
    if (
      leaf.id.length === 0 ||
      leaf.tileId.length === 0 ||
      seenLeafIds.has(leaf.id) ||
      seenTileIds.has(leaf.tileId)
    ) {
      continue;
    }
    seenLeafIds.add(leaf.id);
    seenTileIds.add(leaf.tileId);
    rebuilt = insertLeafInto(rebuilt, { kind: "leaf", id: leaf.id, tileId: leaf.tileId });
  }
  return rebuilt;
}

/** Rewrite one leaf's id in place (leaf or group member); the group's active id follows. */
function rebindLeafId(
  tree: TilingLayoutNode,
  fromLeafId: string,
  toLeafId: string,
): TilingLayoutNode {
  if (tree.kind === "leaf") {
    return tree.id === fromLeafId ? { ...tree, id: toLeafId } : tree;
  }
  if (tree.kind === "group") {
    if (!tree.members.some((member: TilingLeafNode): boolean => member.id === fromLeafId)) {
      return tree;
    }
    const group: TilingGroupNode = {
      ...tree,
      members: tree.members.map((member: TilingLeafNode): TilingLeafNode =>
        member.id === fromLeafId ? { ...member, id: toLeafId } : member,
      ),
      activeMemberId: tree.activeMemberId === fromLeafId ? toLeafId : tree.activeMemberId,
    };
    return group;
  }
  const first: TilingLayoutNode = rebindLeafId(tree.first, fromLeafId, toLeafId);
  const second: TilingLayoutNode = rebindLeafId(tree.second, fromLeafId, toLeafId);
  return first === tree.first && second === tree.second ? tree : { ...tree, first, second };
}

/**
 * Deterministically repair a set so {@link workspaceSetIssues} (with the same
 * options) is empty afterwards. Rules run in the order of
 * {@link TilingWorkspaceSetRepairReason}; every fix is reported. A sound set
 * is returned by reference with no reasons. Pure.
 */
export function repairWorkspaceSet(
  set: TilingWorkspaceSet,
  options: RepairWorkspaceSetOptions = {},
): TilingWorkspaceSetRepairResult {
  const reasons: TilingWorkspaceSetRepairReason[] = [];
  let workspaces: TilingWorkspace[] = [...set.workspaces];
  let activeId: TilingWorkspaceId = set.activeId;

  // 1. Empty set → one main workspace.
  if (workspaces.length === 0) {
    workspaces = [{ id: TILING_MAIN_WORKSPACE_ID, name: TILING_MAIN_WORKSPACE_NAME, layout: null }];
    activeId = TILING_MAIN_WORKSPACE_ID;
    reasons.push("workspace-created");
  }

  // 2. Empty / duplicate ids → drop, moving leaves shown only there into the kept workspace.
  const kept: TilingWorkspace[] = [];
  const dropped: TilingWorkspace[] = [];
  const seenIds: Set<string> = new Set<string>();
  for (const workspace of workspaces) {
    if (workspace.id.length === 0 || seenIds.has(workspace.id)) {
      dropped.push(workspace);
      continue;
    }
    seenIds.add(workspace.id);
    kept.push(workspace);
  }
  if (dropped.length > 0) {
    if (kept.length === 0) {
      kept.push({ id: TILING_MAIN_WORKSPACE_ID, name: TILING_MAIN_WORKSPACE_NAME, layout: null });
      reasons.push("workspace-created");
    }
    for (const workspace of dropped) {
      const sink: TilingWorkspace =
        kept.find((candidate: TilingWorkspace): boolean => candidate.id === workspace.id) ?? kept[0];
      const sinkIndex: number = kept.indexOf(sink);
      let sinkTree: TilingLayoutNode | null = sink.layout;
      for (const leaf of collectLeaves(workspace.layout)) {
        const shownElsewhere: boolean = kept.some(
          (candidate: TilingWorkspace): boolean =>
            candidate !== sink &&
            collectLeaves(candidate.layout).some((seat: TilingLeafNode): boolean => seat.tileId === leaf.tileId),
        );
        const inSink: boolean = collectLeaves(sinkTree).some(
          (seat: TilingLeafNode): boolean => seat.tileId === leaf.tileId || seat.id === leaf.id,
        );
        if (!shownElsewhere && !inSink) {
          sinkTree = insertLeafInto(sinkTree, { kind: "leaf", id: leaf.id, tileId: leaf.tileId });
        }
      }
      kept[sinkIndex] = { ...sink, layout: sinkTree };
      reasons.push("workspace-dropped");
    }
    workspaces = kept;
  }

  // 3. Invalid names.
  workspaces = workspaces.map((workspace: TilingWorkspace, index: number): TilingWorkspace => {
    const normalized: string | null = normalizeWorkspaceName(workspace.name);
    if (normalized === workspace.name) {
      return workspace;
    }
    reasons.push("workspace-renamed");
    const name: string =
      normalized ?? (workspace.name.trim().length === 0
        ? `Workspace ${index + 1}`
        : workspace.name.trim().slice(0, TILING_WORKSPACE_NAME_MAX_CHARS));
    return { ...workspace, name };
  });

  // 4. Structurally invalid trees → rebuilt from their distinct leaves.
  workspaces = workspaces.map((workspace: TilingWorkspace): TilingWorkspace => {
    if (workspace.layout == null || isStructurallyValidLayout(workspace.layout)) {
      return workspace;
    }
    reasons.push("tree-rebuilt");
    return { ...workspace, layout: rebuildTree(workspace.layout) };
  });

  // 5. Leaf ↔ tile binding: canonical = first seat; rebind or remove later disagreeing seats.
  let working: TilingWorkspaceSet = { workspaces, activeId };
  const { byLeaf, byTile } = collectBindings(working);
  for (const workspace of working.workspaces) {
    let tree: TilingLayoutNode | null = workspace.layout;
    for (const leaf of collectLeaves(workspace.layout)) {
      if (tree == null) {
        break;
      }
      const canonical: LeafBinding | undefined = byTile.get(leaf.tileId);
      if (canonical != null && canonical.leafId === leaf.id) {
        continue;
      }
      if (canonical != null && findLeafById(tree, canonical.leafId) == null) {
        tree = rebindLeafId(tree, leaf.id, canonical.leafId);
        reasons.push("leaf-rebound");
        continue;
      }
      // The tile's canonical leaf id is already in this tree, or this leaf id
      // is canonically bound to another tile: the seat is a duplicate → remove.
      if (canonical != null || byLeaf.get(leaf.id)?.tileId !== leaf.tileId) {
        tree = removeLeafFromTree(tree, leaf.id);
        reasons.push("leaf-removed");
      }
    }
    working = replaceLayoutAt(working, workspace.id, tree);
  }

  // 6. Unknown tiles pruned; 7. orphans seated.
  if (options.expectedTileIds != null) {
    const expected: Set<string> = new Set<string>(options.expectedTileIds);
    for (const workspace of working.workspaces) {
      let tree: TilingLayoutNode | null = workspace.layout;
      for (const leaf of collectLeaves(workspace.layout)) {
        if (!expected.has(leaf.tileId)) {
          tree = removeLeafFromTree(tree, leaf.id);
          reasons.push("unknown-tile-pruned");
        }
      }
      working = replaceLayoutAt(working, workspace.id, tree);
    }
    const seated: Map<string, string> = new Map<string, string>();
    const usedLeafIds: Set<string> = new Set<string>();
    for (const workspace of working.workspaces) {
      for (const leaf of collectLeaves(workspace.layout)) {
        seated.set(leaf.tileId, leaf.id);
        usedLeafIds.add(leaf.id);
      }
    }
    const orphanWorkspaceId: TilingWorkspaceId =
      options.orphanWorkspaceId != null && workspaceById(working, options.orphanWorkspaceId) != null
        ? options.orphanWorkspaceId
        : workspaceById(working, working.activeId)?.id ?? working.workspaces[0].id;
    const mint: (tileId: string) => string = options.mintLeafId ?? defaultMintLeafId;
    for (const tileId of options.expectedTileIds) {
      if (seated.has(tileId)) {
        continue;
      }
      let leafId: string = mint(tileId);
      let suffix: number = 2;
      while (usedLeafIds.has(leafId) || leafId.length === 0) {
        leafId = `${mint(tileId)}-${suffix}`;
        suffix += 1;
      }
      usedLeafIds.add(leafId);
      seated.set(tileId, leafId);
      const sink: TilingWorkspace | null = workspaceById(working, orphanWorkspaceId);
      working = replaceLayoutAt(
        working,
        orphanWorkspaceId,
        insertLeafInto(
          sink?.layout ?? null,
          { kind: "leaf", id: leafId, tileId },
          options.orphanPlacement ?? TILING_DEFAULT_WORKSPACE_PLACEMENT,
        ),
      );
      reasons.push("orphan-seated");
    }
  }

  // 8. Dangling active id.
  if (workspaceById(working, working.activeId) == null) {
    working = { ...working, activeId: working.workspaces[0].id };
    reasons.push("active-reset");
  }

  if (reasons.length === 0) {
    return { set, reasons };
  }
  return { set: working, reasons };
}
