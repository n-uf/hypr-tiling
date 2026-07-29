import * as React from "react";
import {
  queryTilingLayout,
  type TilingLayoutNode,
  type TilingTile,
} from "@n-uf/hypr-tiling";
import type { HomeSkin } from "../page";
import { MOBILE_HOME_SKIN_TOKENS, type MobileHomeSkinTokens } from "./skin-tokens";

// The Pocket Grid mini-map: a schematic (rects + ordinals) of the split tree,
// drawn straight from the `TilingLayoutNode` tree rather than shrunk live DOM
// — each split becomes a nested flex row/column sized by its `ratio`, each
// leaf becomes a tappable rect. Tapping a rect opens that leaf below (see
// `PocketGridMobile`).

interface SchematicNodeProps {
  readonly node: TilingLayoutNode;
  readonly ordinalByLeafId: ReadonlyMap<string, number>;
  readonly titleByLeafId: ReadonlyMap<string, string>;
  readonly activeLeafId: string | null;
  readonly onTapLeaf: (leafId: string) => void;
  readonly tokens: MobileHomeSkinTokens;
}

function SchematicNode({
  node,
  ordinalByLeafId,
  titleByLeafId,
  activeLeafId,
  onTapLeaf,
  tokens,
}: SchematicNodeProps): React.ReactElement {
  if (node.kind === "split") {
    const isRow: boolean = node.axis === "horizontal";
    return (
      <div
        className={`flex min-h-0 min-w-0 flex-1 gap-1 ${
          isRow ? "flex-row" : "flex-col"
        }`}
      >
        <div
          style={{ flexGrow: node.ratio, flexBasis: 0 }}
          className="flex min-h-0 min-w-0"
        >
          <SchematicNode
            node={node.first}
            ordinalByLeafId={ordinalByLeafId}
            titleByLeafId={titleByLeafId}
            activeLeafId={activeLeafId}
            onTapLeaf={onTapLeaf}
            tokens={tokens}
          />
        </div>
        <div
          style={{ flexGrow: 1 - node.ratio, flexBasis: 0 }}
          className="flex min-h-0 min-w-0"
        >
          <SchematicNode
            node={node.second}
            ordinalByLeafId={ordinalByLeafId}
            titleByLeafId={titleByLeafId}
            activeLeafId={activeLeafId}
            onTapLeaf={onTapLeaf}
            tokens={tokens}
          />
        </div>
      </div>
    );
  }
  const leafId: string = node.kind === "group" ? node.activeMemberId : node.id;
  const ordinal: number = ordinalByLeafId.get(leafId) ?? 0;
  const title: string = titleByLeafId.get(leafId) ?? leafId;
  const isActive: boolean = leafId === activeLeafId;
  return (
    <button
      type="button"
      onClick={(): void => onTapLeaf(leafId)}
      aria-label={`open pane ${ordinal}: ${title}`}
      title={title}
      className={`flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-[2px] font-mono text-[10px] leading-none tabular-nums transition-colors ${
        isActive ? tokens.schematicRectActive : tokens.schematicRect
      }`}
    >
      {ordinal}
    </button>
  );
}

export function SchematicMap({
  layout,
  tilesById,
  activeLeafId,
  onTapLeaf,
  skin,
}: {
  layout: TilingLayoutNode;
  tilesById: ReadonlyMap<string, TilingTile>;
  activeLeafId: string | null;
  onTapLeaf: (leafId: string) => void;
  skin: HomeSkin;
}): React.ReactElement {
  const tokens: MobileHomeSkinTokens = MOBILE_HOME_SKIN_TOKENS[skin];
  const query = queryTilingLayout(layout);

  const ordinalByLeafId: ReadonlyMap<string, number> = React.useMemo(
    (): ReadonlyMap<string, number> => {
      const map = new Map<string, number>();
      query.leafIds.forEach((leafId: string, index: number): void => {
        map.set(leafId, index + 1);
      });
      return map;
    },
    [query.leafIds],
  );

  const titleByLeafId: ReadonlyMap<string, string> = React.useMemo(
    (): ReadonlyMap<string, string> => {
      const map = new Map<string, string>();
      query.leafIds.forEach((leafId: string, index: number): void => {
        const tileId: string | undefined = query.tileOrder[index];
        const title: string | undefined =
          tileId != null ? tilesById.get(tileId)?.title : undefined;
        map.set(leafId, title ?? leafId);
      });
      return map;
    },
    [query.leafIds, query.tileOrder, tilesById],
  );

  return (
    // `h-full`, not a fixed height: the schematic FILLS its host — the resizable
    // map leaf of the Pocket Grid split — so dragging the split divider grows or
    // shrinks the map live. Dense hairline gaps (4px) keep the schematic tight
    // with no empty caverns even when the leaf is short.
    <div
      role="group"
      aria-label="split-tree overview"
      className={`flex h-full min-h-0 w-full gap-1 overflow-hidden rounded-[4px] border p-1 ${tokens.schematicShell}`}
    >
      <SchematicNode
        node={layout}
        ordinalByLeafId={ordinalByLeafId}
        titleByLeafId={titleByLeafId}
        activeLeafId={activeLeafId}
        onTapLeaf={onTapLeaf}
        tokens={tokens}
      />
    </div>
  );
}
