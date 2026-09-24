import { useState, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  useTilingWorkspaceTabs,
  workspaceSetOfLayout,
  WORKSPACE_KEY_BINDINGS,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
  type TilingWorkspaceSet,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// Several layout trees over one tile pool: pass `workspaces` + `onWorkspacesChange`
// instead of `layout` + `onLayoutChange`. The whole pool goes in `tiles`; opt into
// swipe, slide transition, and spring-loaded tab drop through `interaction.workspaces`.

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

export function WorkspacesExample(): ReactElement {
  const [set, setSet] = useState<TilingWorkspaceSet>(() =>
    workspaceSetOfLayout(seedLayout),
  );
  const tabs = useTilingWorkspaceTabs({
    workspaces: set,
    onWorkspacesChange: setSet,
  });
  return (
    <>
      <div {...tabs.tablistProps}>
        {tabs.tabs.map((tab) => (
          <button key={tab.workspace.id} {...tab.tabProps}>
            {tab.workspace.name}
          </button>
        ))}
      </div>
      <TilingRenderer
        workspaces={set}
        onWorkspacesChange={setSet}
        tiles={tiles}
        config={DEFAULT_TILING_LAYOUT_CONFIG}
        interaction={{
          keyBindings: { bindings: [...WORKSPACE_KEY_BINDINGS] },
          workspaces: {
            switch: { transition: "slide", wheelSwipe: true },
            springLoad: { dwellMs: 500 },
          },
        }}
        onWorkspaceSwitch={() => {
          /* from / to / via: command | swipe | spring-load | reveal | key */
        }}
        {...tabs.rendererProps}
        renderTile={({ tile }: TilingRenderTileProps): ReactNode => (
          <div style={{ padding: 12, fontSize: 13 }}>{tile.title}</div>
        )}
      />
    </>
  );
}
