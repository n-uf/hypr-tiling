import {
  queryTilingLayout,
  type TilingCommand,
  type TilingGroupNode,
  type TilingLayoutNode,
  type TilingLayoutQuery,
  type TilingRenderTileProps,
  type TilingTile,
} from "@n-uf/hypr-tiling";

// Shared homepage group-representation plumbing (no library change, public API
// only). The homepage suppresses the library's default group tab strip — both
// via `paneSwitching.showTabStrip: false` AND a consumer CSS rule that hides the
// `.hpt-group-tab-strip` element (scoped to the homepage shell in index.html) —
// so every SKIN owns its OWN grouped-stack representation instead of the shared
// dark strip. Each skin's tile renderer paints its group affordance from the
// live layout (`TilingGroupNode`) and drives member switching through the SAME
// `TilingCommandHandle.dispatch` the shortcut bar already uses. The three group
// commands used (`group-tab-jump`, `remove-from-group`, `ungroup`) all exist on
// the public `TilingCommand` union.

// Extra per-render context the homepage threads into every skin's tile renderer
// beyond the library `TilingRenderTileProps`: the live layout tree (to resolve
// the group a pane hosts), the command-dispatch fn, and the tile registry (for
// member titles). Kept minimal — these three are all a skin needs to render its
// group switcher.
export interface HomeTileProps extends TilingRenderTileProps {
  readonly layout: TilingLayoutNode;
  readonly dispatch: (command: TilingCommand) => void;
  readonly tilesById: ReadonlyMap<string, TilingTile>;
}

// The group this pane is the ACTIVE MEMBER of, or `null` when the pane is a
// loose leaf. Only a group's active member renders (the stacking contract —
// `readLeafNodeIds` reports a group as its `activeMemberId`), so matching on
// `activeMemberId` uniquely identifies the group whose switcher THIS pane paints.
export function resolveActiveGroup(
  layout: TilingLayoutNode,
  leafId: string,
): TilingGroupNode | null {
  const query: TilingLayoutQuery = queryTilingLayout(layout);
  return (
    query.groups.find(
      (group: TilingGroupNode): boolean => group.activeMemberId === leafId,
    ) ?? null
  );
}

// One member of a group resolved for rendering a switcher: its number (1-based,
// the `group-tab-jump` operand), title, and whether it is the active member.
export interface GroupMemberView {
  readonly memberId: string;
  readonly memberNumber: number;
  readonly title: string;
  readonly isActive: boolean;
}

// Resolve a group's members to titled, numbered views (shared by every skin's
// switcher so the member/title/number derivation lives in one place).
export function groupMemberViews(
  group: TilingGroupNode,
  tilesById: ReadonlyMap<string, TilingTile>,
): ReadonlyArray<GroupMemberView> {
  return group.members.map((member, index: number): GroupMemberView => ({
    memberId: member.id,
    memberNumber: index + 1,
    title: tilesById.get(member.tileId)?.title ?? member.tileId,
    isActive: member.id === group.activeMemberId,
  }));
}

// The three group commands each skin's switcher dispatches, bound to a group id.
// Centralized so every skin issues identical, correctly-typed commands.
export function groupCommands(groupId: string): {
  jump: (memberNumber: number) => TilingCommand;
  remove: (memberId: string) => TilingCommand;
  ungroup: () => TilingCommand;
} {
  return {
    jump: (memberNumber: number): TilingCommand => ({
      kind: "group-tab-jump",
      groupId,
      memberNumber,
    }),
    remove: (memberId: string): TilingCommand => ({
      kind: "remove-from-group",
      groupId,
      memberId,
    }),
    ungroup: (): TilingCommand => ({ kind: "ungroup", groupId }),
  };
}
