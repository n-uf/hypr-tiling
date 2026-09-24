import { useState, type ReactElement, type ReactNode } from "react";
import {
  DEFAULT_TILING_LAYOUT_CONFIG,
  TilingRenderer,
  TilingWorkspaceSwipeScope,
  WORKSPACE_KEY_BINDINGS,
  useTilingWorkspaceSetController,
  useTilingWorkspaceTabs,
  useWorkspaceSwipe,
  workspaceSetOfLayout,
  type TilingLayoutNode,
  type TilingRenderTileProps,
  type TilingTile,
  type TilingWorkspace,
  type TilingWorkspaceSet,
  type TilingWorkspaceSetCommitReason,
  type TilingWorkspaceSwitchEvent,
  type UseTilingWorkspaceTabsResult,
} from "@n-uf/hypr-tiling";

// Several layout trees over one tile pool: the set controller owns the
// persisted document + in-flight tree overlays; the tab strip is the native
// drop target; swipe / keymap / spring-load ride the same TilingCommand path.

const tiles: TilingTile[] = [
  { id: "a", title: "Board" },
  { id: "b", title: "Detail" },
];

const seedLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.55,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

function WorkspaceTabStrip({
  tabs,
  onCreate,
}: {
  readonly tabs: UseTilingWorkspaceTabsResult;
  readonly onCreate: () => void;
}): ReactElement {
  const swipe = useWorkspaceSwipe();
  return (
    <div {...tabs.tablistProps} data-swipe-progress={String(swipe.progress)}>
      {tabs.tabs.map((tab) => (
        <button key={tab.workspace.id} {...tab.tabProps}>
          {tab.workspace.name}
        </button>
      ))}
      <button type="button" onClick={onCreate}>
        +
      </button>
    </div>
  );
}

export function WorkspacesExample(): ReactElement {
  const [persisted, setPersisted] = useState<TilingWorkspaceSet>(() =>
    workspaceSetOfLayout(seedLayout),
  );
  const ctl = useTilingWorkspaceSetController({
    value: persisted,
    onCommit: (
      next: TilingWorkspaceSet,
      _reason: TilingWorkspaceSetCommitReason,
    ): void => {
      setPersisted(next);
    },
    mintWorkspaceId: (): string => crypto.randomUUID(),
    nextWorkspaceName: (existing: ReadonlyArray<TilingWorkspace>): string =>
      `Workspace ${existing.length + 1}`,
  });
  const tabs = useTilingWorkspaceTabs({
    workspaces: ctl.set,
    onWorkspacesChange: ctl.onWorkspacesChange,
  });
  return (
    <TilingWorkspaceSwipeScope>
      <WorkspaceTabStrip
        tabs={tabs}
        onCreate={(): void => {
          ctl.create();
        }}
      />
      <TilingRenderer
        workspaces={ctl.set}
        onWorkspacesChange={ctl.onWorkspacesChange}
        tiles={tiles}
        config={DEFAULT_TILING_LAYOUT_CONFIG}
        paneIdentity="stable"
        interaction={{
          keyBindings: { bindings: [...WORKSPACE_KEY_BINDINGS] },
          workspaces: {
            followMovedLeaf: true,
            switch: {
              transition: "slide",
              wheelSwipe: { modifier: "meta" },
              touchSwipe: true,
            },
            springLoad: { dwellMs: 500 },
          },
        }}
        onWorkspaceSwitch={(_event: TilingWorkspaceSwitchEvent): void => {
          /* via: key | command | swipe | spring-load | reveal | tab-drop */
        }}
        onMoveLeaf={(): void => {
          /* do not switch from here — followMovedLeaf already switched */
        }}
        {...tabs.rendererProps}
        renderTile={({ tile }: TilingRenderTileProps): ReactNode => (
          <div style={{ padding: 12, fontSize: 13 }}>{tile.title}</div>
        )}
      />
    </TilingWorkspaceSwipeScope>
  );
}
