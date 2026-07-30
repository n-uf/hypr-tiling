import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  createPersistedTilingLayout,
  type TilingLayoutContainerSize,
  type TilingLayoutStorage,
} from "../engine/persisted-layout";
import type { TilingLayoutConfig, TilingLayoutNode } from "../engine/types";

const STORAGE_KEY: string = "test.tilingLayout";
const EXPECTED_TILE_IDS: ReadonlyArray<string> = ["cases", "document", "review"];

const CONFIG: TilingLayoutConfig = {
  gapPx: 8,
  minPaneSizePx: 200,
  handleSizePx: 4,
};

const CONTAINER_SIZE: TilingLayoutContainerSize = {
  containerWidthPx: 1280,
  containerHeightPx: 800,
};

const FALLBACK_LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.18,
  first: {
    kind: "leaf",
    id: "leaf-cases",
    tileId: "cases",
    sizing: { width: "static", widthPx: 256 },
  },
  second: {
    kind: "split",
    id: "main",
    axis: "horizontal",
    ratio: 0.66,
    first: { kind: "leaf", id: "leaf-document", tileId: "document" },
    second: {
      kind: "leaf",
      id: "leaf-review",
      tileId: "review",
      sizing: { width: "static", widthPx: 384 },
    },
  },
};

function createFakeStorage(seed?: Record<string, string>): {
  storage: TilingLayoutStorage;
  raw: () => Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    storage: {
      getItem: (key: string): string | null => map.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        map.set(key, value);
      },
      removeItem: (key: string): void => {
        map.delete(key);
      },
    },
    raw: (): Record<string, string> => Object.fromEntries(map),
  };
}

function collectTileIds(node: TilingLayoutNode, into: string[]): void {
  if (node.kind === "leaf") {
    into.push(node.tileId);
    return;
  }
  if (node.kind === "group") {
    for (const member of node.members) {
      into.push(member.tileId);
    }
    return;
  }
  collectTileIds(node.first, into);
  collectTileIds(node.second, into);
}

function tileIdsOf(node: TilingLayoutNode): string[] {
  const ids: string[] = [];
  collectTileIds(node, ids);
  return ids.sort();
}

describe("createPersistedTilingLayout", () => {
  let fake: ReturnType<typeof createFakeStorage>;

  function makePersisted(seed?: Record<string, string>) {
    fake = createFakeStorage(seed);
    return createPersistedTilingLayout({
      storageKey: STORAGE_KEY,
      expectedTileIds: EXPECTED_TILE_IDS,
      fallbackLayout: FALLBACK_LAYOUT,
      config: CONFIG,
      storage: fake.storage,
      resolveContainerSize: (): TilingLayoutContainerSize => CONTAINER_SIZE,
    });
  }

  beforeEach(() => {
    fake = createFakeStorage();
  });

  it("load returns the fallback when nothing is stored (without writing)", () => {
    const persisted = makePersisted();
    expect(persisted.load()).toBe(FALLBACK_LAYOUT);
    expect(fake.raw()[STORAGE_KEY]).toBeUndefined();
  });

  it("load returns a repaired copy of a healthy stored tree", () => {
    const persisted = makePersisted({
      [STORAGE_KEY]: JSON.stringify(FALLBACK_LAYOUT),
    });
    const loaded = persisted.load();
    expect(tileIdsOf(loaded)).toEqual(["cases", "document", "review"]);
  });

  it("load resets when the stored value is not parseable JSON", () => {
    const persisted = makePersisted({ [STORAGE_KEY]: "}{ not json" });
    const loaded = persisted.load();
    expect(loaded).toBe(FALLBACK_LAYOUT);
    // Parse errors are swallowed and return the fallback WITHOUT writing.
    expect(fake.raw()[STORAGE_KEY]).toBe("}{ not json");
  });

  it("load resets when the stored value is structurally malformed", () => {
    const persisted = makePersisted({
      [STORAGE_KEY]: JSON.stringify({ kind: "split", id: "x" }),
    });
    const loaded = persisted.load();
    expect(loaded).toBe(FALLBACK_LAYOUT);
    expect(JSON.parse(fake.raw()[STORAGE_KEY]!)).toEqual(FALLBACK_LAYOUT);
  });

  it("load resets when a stored tree is missing an expected tile", () => {
    const missingReview: TilingLayoutNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: { kind: "leaf", id: "leaf-cases", tileId: "cases" },
      second: { kind: "leaf", id: "leaf-document", tileId: "document" },
    };
    const persisted = makePersisted({
      [STORAGE_KEY]: JSON.stringify(missingReview),
    });
    const loaded = persisted.load();
    expect(loaded).toBe(FALLBACK_LAYOUT);
    expect(JSON.parse(fake.raw()[STORAGE_KEY]!)).toEqual(FALLBACK_LAYOUT);
  });

  it("load resets when a stored tree carries an unknown tile", () => {
    const unknownTile: TilingLayoutNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: { kind: "leaf", id: "leaf-cases", tileId: "cases" },
      second: {
        kind: "split",
        id: "main",
        axis: "horizontal",
        ratio: 0.5,
        first: { kind: "leaf", id: "leaf-document", tileId: "document" },
        second: {
          kind: "split",
          id: "aux",
          axis: "horizontal",
          ratio: 0.5,
          first: { kind: "leaf", id: "leaf-review", tileId: "review" },
          second: { kind: "leaf", id: "leaf-ghost", tileId: "ghost" },
        },
      },
    };
    const persisted = makePersisted({
      [STORAGE_KEY]: JSON.stringify(unknownTile),
    });
    expect(persisted.load()).toBe(FALLBACK_LAYOUT);
  });

  it("commit persists a healed copy of a healthy tree and returns it", () => {
    const persisted = makePersisted();
    const committed = persisted.commit(FALLBACK_LAYOUT);
    expect(tileIdsOf(committed)).toEqual(["cases", "document", "review"]);
    const stored = JSON.parse(fake.raw()[STORAGE_KEY]!) as TilingLayoutNode;
    expect(tileIdsOf(stored)).toEqual(["cases", "document", "review"]);
  });

  it("commit resets when the incoming tree fails hard integrity", () => {
    const duplicateTiles: TilingLayoutNode = {
      kind: "split",
      id: "root",
      axis: "horizontal",
      ratio: 0.5,
      first: { kind: "leaf", id: "leaf-a", tileId: "cases" },
      second: { kind: "leaf", id: "leaf-b", tileId: "cases" },
    };
    const persisted = makePersisted();
    const committed = persisted.commit(duplicateTiles);
    expect(committed).toBe(FALLBACK_LAYOUT);
    expect(JSON.parse(fake.raw()[STORAGE_KEY]!)).toEqual(FALLBACK_LAYOUT);
  });

  it("reset writes and returns the fallback tree", () => {
    const persisted = makePersisted({ [STORAGE_KEY]: "stale" });
    const reset = persisted.reset();
    expect(reset).toBe(FALLBACK_LAYOUT);
    expect(JSON.parse(fake.raw()[STORAGE_KEY]!)).toEqual(FALLBACK_LAYOUT);
  });

  it("round-trips commit → load", () => {
    const persisted = makePersisted();
    const committed = persisted.commit(FALLBACK_LAYOUT);
    const reloaded = persisted.load();
    expect(tileIdsOf(reloaded)).toEqual(tileIdsOf(committed));
  });
});
