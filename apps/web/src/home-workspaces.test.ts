import { describe, expect, it } from "@jest/globals";
import type { TilingLayoutNode, TilingWorkspaceSet } from "@n-uf/hypr-tiling";
import { isStructurallyValidLayout } from "@n-uf/hypr-tiling/engine";
import {
  HOME_HERO_GROUP_ID,
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
  it("stores version 9 under the v9 key", () => {
    expect(HOME_WORKSPACE_STORAGE_VERSION).toBe(9);
    expect(HOME_WORKSPACE_STORAGE_KEY).toBe("hypr-tiling-home-workspaces-v9");
  });

  it("rejects a version 6 envelope", () => {
    const raw: string = JSON.stringify({
      version: 6,
      set: HOME_WORKSPACE_SEED,
    });
    expect(parseHomeWorkspaceSetBlob(raw)).toBeNull();
  });

  it("keeps the column ratios and seats hypr-tiling | Proof | Scenarios on the hero slot", () => {
    const layout: TilingLayoutNode = homeLayout(HOME_WORKSPACE_SEED);
    const root: TilingLayoutNode | null = findNode(layout, "home-root");
    const intro: TilingLayoutNode | null = findNode(layout, "home-intro-stack");
    const features: TilingLayoutNode | null = findNode(layout, "home-features-rest");
    const install: TilingLayoutNode | null = findNode(layout, "home-install-uses");
    const group: TilingLayoutNode | null = findNode(layout, HOME_HERO_GROUP_ID);
    expect(root?.kind).toBe("split");
    expect(intro?.kind).toBe("split");
    expect(features?.kind).toBe("split");
    expect(install?.kind).toBe("split");
    if (root?.kind === "split") {
      expect(root.ratio).toBe(0.26);
    }
    if (intro?.kind === "split") {
      expect(intro.ratio).toBe(0.675);
    }
    if (features?.kind === "split") {
      expect(features.ratio).toBe(0.365);
    }
    if (install?.kind === "split") {
      expect(install.ratio).toBe(0.585);
    }
    expect(group?.kind).toBe("group");
    if (group?.kind === "group") {
      expect(group.activeMemberId).toBe("intro");
      expect(group.members.map((member) => member.id)).toEqual([
        "intro",
        "proof",
        "scenarios",
      ]);
    }
    if (intro?.kind === "split") {
      expect(intro.first.id).toBe(HOME_HERO_GROUP_ID);
      expect(intro.second.id).toBe("discoverability");
    }
    if (install?.kind === "split") {
      expect(install.first.id).toBe("install");
      expect(install.second.id).toBe("usecases");
    }
    expect(isStructurallyValidLayout(layout)).toBe(true);
  });
});
