import { describe, expect, it } from "@jest/globals";
import type {
  TilingLayoutNode,
  TilingLeafNode,
  TilingWorkspaceSet,
} from "@n-uf/hypr-tiling";
import { isStructurallyValidLayout } from "@n-uf/hypr-tiling/engine";
import {
  HOME_DOCS_GROUP_ID,
  HOME_DOGFOOD_GROUP_ID,
  HOME_USES_GROUP_ID,
  HOME_WORKSPACE_SEED,
  HOME_WORKSPACE_STORAGE_KEY,
  HOME_WORKSPACE_STORAGE_VERSION,
  parseHomeWorkspaceSetBlob,
} from "./home-workspaces";

function findNode(
  node: TilingLayoutNode | null,
  id: string,
): TilingLayoutNode | null {
  if (node == null) {
    return null;
  }
  if (node.id === id) {
    return node;
  }
  if (node.kind === "leaf") {
    return null;
  }
  if (node.kind === "group") {
    for (const member of node.members) {
      const found: TilingLayoutNode | null = findNode(member, id);
      if (found != null) {
        return found;
      }
    }
    return null;
  }
  return findNode(node.first, id) ?? findNode(node.second, id);
}

function homeLayout(set: TilingWorkspaceSet): TilingLayoutNode {
  const layout: TilingLayoutNode | null = set.workspaces[0]?.layout ?? null;
  if (layout == null) {
    throw new Error("home workspace has no layout");
  }
  return layout;
}

describe("home workspace seed", () => {
  it("stores version 8 under the v8 key", () => {
    expect(HOME_WORKSPACE_STORAGE_VERSION).toBe(8);
    expect(HOME_WORKSPACE_STORAGE_KEY).toBe("hypr-tiling-home-workspaces-v8");
  });

  it("rejects a version 7 envelope", () => {
    const raw: string = JSON.stringify({
      version: 7,
      set: HOME_WORKSPACE_SEED,
    });
    expect(parseHomeWorkspaceSetBlob(raw)).toBeNull();
  });

  it("seats the hero group, Features | Install, and Inspector | Swipe", () => {
    const layout: TilingLayoutNode = homeLayout(HOME_WORKSPACE_SEED);
    const root: TilingLayoutNode | null = findNode(layout, "home-root");
    const secondary: TilingLayoutNode | null = findNode(layout, "home-secondary");
    const uses: TilingLayoutNode | null = findNode(layout, HOME_USES_GROUP_ID);
    const docs: TilingLayoutNode | null = findNode(layout, HOME_DOCS_GROUP_ID);
    const workspacesLayout: TilingLayoutNode | null =
      HOME_WORKSPACE_SEED.workspaces[1]?.layout ?? null;
    const dogfood: TilingLayoutNode | null = findNode(
      workspacesLayout,
      HOME_DOGFOOD_GROUP_ID,
    );
    expect(root?.kind).toBe("split");
    expect(secondary?.kind).toBe("split");
    if (root?.kind === "split") {
      expect(root.ratio).toBe(0.38);
    }
    if (secondary?.kind === "split") {
      expect(secondary.ratio).toBe(0.56);
    }
    expect(uses?.kind).toBe("group");
    if (uses?.kind === "group") {
      expect(uses.activeMemberId).toBe("intro");
      expect(
        uses.members.map((member: TilingLeafNode): string => member.id),
      ).toEqual(["intro", "usecases", "proof", "scenarios"]);
    }
    expect(docs?.kind).toBe("group");
    if (docs?.kind === "group") {
      expect(docs.activeMemberId).toBe("features");
      expect(
        docs.members.map((member: TilingLeafNode): string => member.id),
      ).toEqual(["features", "install"]);
    }
    expect(dogfood?.kind).toBe("group");
    if (dogfood?.kind === "group") {
      expect(dogfood.activeMemberId).toBe("set-inspector");
      expect(
        dogfood.members.map((member: TilingLeafNode): string => member.id),
      ).toEqual(["set-inspector", "swipe-meter"]);
    }
    expect(isStructurallyValidLayout(layout)).toBe(true);
    expect(
      workspacesLayout == null ? false : isStructurallyValidLayout(workspacesLayout),
    ).toBe(true);
  });
});
