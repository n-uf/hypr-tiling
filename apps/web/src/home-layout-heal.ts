import type {
  TilingLayoutConfig,
  TilingLayoutNode,
  TilingLeafNode,
  TilingWorkspaceSet,
} from "@n-uf/hypr-tiling";
import {
  assertLayoutIntegrity,
  isStructurallyValidLayout,
  removeLeafTile,
  repairLayout,
  repairWorkspaceSet,
  setWorkspaceLayout,
  type LayoutTileIntegrityReport,
  type TilingWorkspaceSetRepairReason,
} from "@n-uf/hypr-tiling/engine";
import { parseHomeWorkspaceSetBlob } from "./home-workspaces";

// Boot and the Corrupt-and-heal scenario both enter here. A sound set is
// returned by reference with an empty report. A broken set is described,
// then passed through `repairWorkspaceSet` and, when the tree is walkable,
// `assertLayoutIntegrity` / `repairLayout`.

export interface HomeLayoutHealOptions {
  readonly knownTileIds: ReadonlyArray<string>;
  readonly config: TilingLayoutConfig;
  readonly containerWidthPx: number;
  readonly containerHeightPx: number;
}

export interface HomeWorkspaceHealResult {
  readonly set: TilingWorkspaceSet;
  readonly lines: ReadonlyArray<string>;
}

function childSlot(
  node: TilingLayoutNode,
  slot: "first" | "second",
): TilingLayoutNode | null {
  if (node.kind !== "split") {
    return null;
  }
  const value: TilingLayoutNode | null =
    slot === "first" ? (node.first ?? null) : (node.second ?? null);
  return value;
}

function describeNode(
  node: TilingLayoutNode | null,
  known: ReadonlySet<string>,
  lines: Array<string>,
): void {
  if (node == null) {
    return;
  }
  if (node.kind === "leaf") {
    if (node.tileId.length === 0 || !known.has(node.tileId)) {
      lines.push(
        `${node.id} references tile "${node.tileId}" which is not in the tile pool`,
      );
    }
    return;
  }
  if (node.kind === "group") {
    const members: ReadonlyArray<TilingLeafNode> = node.members ?? [];
    const memberIds: ReadonlyArray<string> = members.map(
      (member: TilingLeafNode): string => member.id,
    );
    if (!memberIds.includes(node.activeMemberId)) {
      lines.push(
        `${node.id} activeMemberId "${node.activeMemberId}" is not a member`,
      );
    }
    for (const member of members) {
      describeNode(member, known, lines);
    }
    return;
  }
  if (!Number.isFinite(node.ratio) || node.ratio <= 0 || node.ratio >= 1) {
    lines.push(`${node.id} ratio ${String(node.ratio)} is outside (0, 1)`);
  }
  const first: TilingLayoutNode | null = childSlot(node, "first");
  const second: TilingLayoutNode | null = childSlot(node, "second");
  if (first == null) {
    lines.push(`${node.id} is missing its first child`);
  } else {
    describeNode(first, known, lines);
  }
  if (second == null) {
    lines.push(`${node.id} is missing its second child`);
  } else {
    describeNode(second, known, lines);
  }
}

function collectLeaves(node: TilingLayoutNode | null): Array<TilingLeafNode> {
  if (node == null) {
    return [];
  }
  if (node.kind === "leaf") {
    return [node];
  }
  if (node.kind === "group") {
    return [...(node.members ?? [])];
  }
  return [
    ...collectLeaves(childSlot(node, "first")),
    ...collectLeaves(childSlot(node, "second")),
  ];
}

function integrityLine(report: LayoutTileIntegrityReport): string | null {
  const flags: Array<string> = [];
  if (report.hasEmptyTileId) {
    flags.push("empty tile id");
  }
  if (report.duplicateTileIds.length > 0) {
    flags.push(`duplicate tiles ${report.duplicateTileIds.join(", ")}`);
  }
  if (report.unknownTileIds.length > 0) {
    flags.push(`unknown tiles ${report.unknownTileIds.join(", ")}`);
  }
  if (report.missingTileIds.length > 0) {
    flags.push(`missing tiles ${report.missingTileIds.join(", ")}`);
  }
  if (report.hasCollapsedRatio) {
    flags.push("collapsed ratio");
  }
  if (report.hasZeroAreaLeaf) {
    flags.push("zero-area leaf");
  }
  if (report.hasOverlappingLeaves) {
    flags.push("overlapping leaves");
  }
  if (report.hasFillSlack) {
    flags.push("fill slack");
  }
  if (report.requiresRebuild) {
    flags.push("requires rebuild");
  }
  if (flags.length === 0) {
    return null;
  }
  return `assertLayoutIntegrity: ${flags.join("; ")}`;
}

function pruneUnknownTiles(
  set: TilingWorkspaceSet,
  known: ReadonlySet<string>,
  lines: Array<string>,
): TilingWorkspaceSet {
  let next: TilingWorkspaceSet = set;
  for (const workspace of next.workspaces) {
    if (workspace.layout == null) {
      continue;
    }
    const unknown: ReadonlyArray<TilingLeafNode> = collectLeaves(
      workspace.layout,
    ).filter((leaf: TilingLeafNode): boolean => !known.has(leaf.tileId));
    let layout: TilingLayoutNode = workspace.layout;
    for (const leaf of unknown) {
      const removed: TilingLayoutNode = removeLeafTile(layout, leaf.id);
      if (removed !== layout && isStructurallyValidLayout(removed)) {
        layout = removed;
        lines.push(`pruned tile "${leaf.tileId}" (${leaf.id})`);
      }
    }
    if (layout !== workspace.layout) {
      next = setWorkspaceLayout(next, workspace.id, layout);
    }
  }
  return next;
}

function healRatios(
  set: TilingWorkspaceSet,
  options: HomeLayoutHealOptions,
  lines: Array<string>,
): TilingWorkspaceSet {
  let next: TilingWorkspaceSet = set;
  for (const workspace of next.workspaces) {
    const layout: TilingLayoutNode | null = workspace.layout;
    if (layout == null || !isStructurallyValidLayout(layout)) {
      continue;
    }
    const before: LayoutTileIntegrityReport = assertLayoutIntegrity(layout);
    const beforeLine: string | null = integrityLine(before);
    if (before.ok && beforeLine == null) {
      continue;
    }
    if (beforeLine != null) {
      lines.push(`${workspace.id}: ${beforeLine}`);
    }
    const healed: TilingLayoutNode = repairLayout(layout, {
      containerWidthPx: options.containerWidthPx,
      containerHeightPx: options.containerHeightPx,
      config: options.config,
      fallbackLayout: layout,
    });
    if (healed !== layout) {
      lines.push(`${workspace.id}: repairLayout rewrote the tree`);
      next = setWorkspaceLayout(next, workspace.id, healed);
    }
  }
  return next;
}

export function healHomeWorkspaceSet(
  set: TilingWorkspaceSet,
  options: HomeLayoutHealOptions,
): HomeWorkspaceHealResult {
  const known: ReadonlySet<string> = new Set(options.knownTileIds);
  const lines: Array<string> = [];
  for (const workspace of set.workspaces) {
    describeNode(workspace.layout, known, lines);
  }
  const structural: {
    readonly set: TilingWorkspaceSet;
    readonly reasons: ReadonlyArray<TilingWorkspaceSetRepairReason>;
  } = repairWorkspaceSet(set);
  if (lines.length === 0 && structural.reasons.length === 0) {
    return { set, lines: [] };
  }
  for (const reason of structural.reasons) {
    lines.push(`repairWorkspaceSet: ${reason}`);
  }
  const pruned: TilingWorkspaceSet = pruneUnknownTiles(
    structural.set,
    known,
    lines,
  );
  const healed: TilingWorkspaceSet = healRatios(pruned, options, lines);
  return { set: healed, lines };
}

export function loadHomeWorkspaceBlob(
  raw: string,
  options: HomeLayoutHealOptions,
): HomeWorkspaceHealResult | null {
  const parsed: TilingWorkspaceSet | null = parseHomeWorkspaceSetBlob(raw);
  if (parsed == null) {
    return null;
  }
  return healHomeWorkspaceSet(parsed, options);
}
