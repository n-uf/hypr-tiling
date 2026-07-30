import {
  assertLayoutIntegrity,
  repairLayout,
  type LayoutTileIntegrityReport,
} from "./layout-normalize";
import type { TilingLayoutConfig, TilingLayoutNode } from "./types";

/**
 * Thin persistence adapter around the engine's first-class integrity APIs.
 *
 * This helper OWNS one thing only: reading/writing the serialized
 * {@link TilingLayoutNode} tree (splits, ratios, tileId leaves) to a
 * key/value store. It does NOT own repair — layout self-healing is an engine
 * trait, and this adapter delegates every heal to the existing
 * `assertLayoutIntegrity` / `repairLayout` exports (the same ones a
 * host calls at a renderer commit gate). Persistence is optional glue; the
 * integrity APIs remain first-class and usable with or without it (a cold load
 * outside the renderer lifecycle is exactly why a host passes `expectedTileIds`
 * here).
 *
 * Only the layout tree is persisted — never tile React content, theme, or
 * interaction config; those stay owned by the host.
 */

/**
 * Minimal synchronous key/value store, structurally compatible with the Web
 * `Storage` API (`window.localStorage` / `sessionStorage`). Supply a custom
 * implementation for tests, SSR, or a non-`localStorage` backend.
 */
export interface TilingLayoutStorage {
  /** Read the serialized layout tree stored under `key`, or `null` if absent. */
  getItem(key: string): string | null;
  /** Write the serialized layout tree `value` under `key`. */
  setItem(key: string, value: string): void;
  /** Remove any serialized layout tree stored under `key`. */
  removeItem(key: string): void;
}

/** Container geometry for the integrity/repair pass performed on load/commit. */
export interface TilingLayoutContainerSize {
  /** Root container width in CSS pixels. */
  containerWidthPx: number;
  /** Root container height in CSS pixels. */
  containerHeightPx: number;
}

/** Options for {@link createPersistedTilingLayout}. */
export interface CreatePersistedTilingLayoutOptions {
  /** Storage key the serialized layout tree is read from / written to. */
  storageKey: string;
  /**
   * Host tile ids that must appear exactly once across the persisted tree.
   * Forwarded verbatim to `assertLayoutIntegrity` / `repairLayout`;
   * a persisted tree that is missing/duplicating/adding tiles is rebuilt from
   * {@link CreatePersistedTilingLayoutOptions.fallbackLayout}.
   */
  expectedTileIds: ReadonlyArray<string>;
  /**
   * Host-authored replacement tree used when the persisted value is absent,
   * unparseable, or fails hard integrity (`requiresRebuild`). Stays app-owned;
   * the adapter never invents a layout.
   */
  fallbackLayout: TilingLayoutNode;
  /** Gap / min-pane / handle geometry, forwarded to the repair pass. */
  config: TilingLayoutConfig;
  /**
   * Key/value store to persist into. Defaults to `window.localStorage` when a
   * DOM is present, otherwise an in-memory store (SSR-safe no-op persistence).
   */
  storage?: TilingLayoutStorage;
  /**
   * Resolves the current container geometry for the repair pass. Called on
   * every `load` / `commit` so a resized viewport heals correctly. Defaults to
   * reading `window.innerWidth` / `innerHeight` (falling back to 1280×800 when
   * no DOM / degenerate size is available).
   */
  resolveContainerSize?: () => TilingLayoutContainerSize;
}

/**
 * Persisted-layout adapter returned by {@link createPersistedTilingLayout}.
 * Every method returns the tree the host should render.
 */
export interface PersistedTilingLayout {
  /**
   * Read + validate + heal the persisted tree. Returns the healed tree on a
   * clean hit, `fallbackLayout` when nothing is stored (or on a read/parse
   * error), and a freshly-reset tree when the stored value fails hard
   * integrity.
   */
  load(): TilingLayoutNode;
  /**
   * Validate + heal `layout`, persist the healed tree, and return it. Falls
   * back to {@link PersistedTilingLayout.reset} when `layout` (or its healed
   * form) fails hard integrity. Call this from `onLayoutChange`.
   */
  commit(layout: TilingLayoutNode): TilingLayoutNode;
  /** Persist and return the `fallbackLayout` (clears a corrupt saved tree). */
  reset(): TilingLayoutNode;
}

const DEFAULT_CONTAINER_WIDTH_PX: number = 1280;
const DEFAULT_CONTAINER_HEIGHT_PX: number = 800;

/** In-memory fallback store when no DOM `localStorage` is available. */
function createMemoryStorage(): TilingLayoutStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
  };
}

function resolveDefaultStorage(): TilingLayoutStorage {
  if (typeof window !== "undefined" && window.localStorage != null) {
    return window.localStorage;
  }
  return createMemoryStorage();
}

function resolveDefaultContainerSize(): TilingLayoutContainerSize {
  if (typeof window !== "undefined") {
    const width: number = window.innerWidth;
    const height: number = window.innerHeight;
    return {
      containerWidthPx: width > 1 ? width : DEFAULT_CONTAINER_WIDTH_PX,
      containerHeightPx: height > 1 ? height : DEFAULT_CONTAINER_HEIGHT_PX,
    };
  }
  return {
    containerWidthPx: DEFAULT_CONTAINER_WIDTH_PX,
    containerHeightPx: DEFAULT_CONTAINER_HEIGHT_PX,
  };
}

/**
 * Defensive structural guard for arbitrary parsed JSON, so the engine walkers
 * (which assume a well-formed {@link TilingLayoutNode}) are never handed a
 * malformed tree. This is shape validation only — tile coverage and geometry
 * are the job of `assertLayoutIntegrity`.
 */
function isPlausibleLayoutNode(value: unknown): value is TilingLayoutNode {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const kind: unknown = (value as { kind?: unknown }).kind;
  if (kind === "leaf") {
    const leaf = value as { id?: unknown; tileId?: unknown };
    return typeof leaf.id === "string" && typeof leaf.tileId === "string";
  }
  if (kind === "split") {
    const split = value as {
      id?: unknown;
      axis?: unknown;
      ratio?: unknown;
      first?: unknown;
      second?: unknown;
    };
    return (
      typeof split.id === "string" &&
      (split.axis === "horizontal" || split.axis === "vertical") &&
      typeof split.ratio === "number" &&
      Number.isFinite(split.ratio) &&
      isPlausibleLayoutNode(split.first) &&
      isPlausibleLayoutNode(split.second)
    );
  }
  if (kind === "group") {
    const group = value as {
      id?: unknown;
      members?: unknown;
      activeMemberId?: unknown;
    };
    return (
      typeof group.id === "string" &&
      typeof group.activeMemberId === "string" &&
      Array.isArray(group.members) &&
      group.members.length > 0 &&
      group.members.every(isPlausibleLayoutNode)
    );
  }
  return false;
}

/**
 * Build a {@link PersistedTilingLayout} — a thin persist adapter over the
 * engine's `assertLayoutIntegrity` / `repairLayout`. The storage key, expected
 * tile ids, and fallback tree stay host-owned; repair stays engine-owned.
 *
 * @example
 * ```ts
 * const persisted = createPersistedTilingLayout({
 *   storageKey: "annotate.tilingLayout",
 *   expectedTileIds: ["cases", "document", "review"],
 *   fallbackLayout: DEFAULT_LAYOUT,
 *   config: TILING_CONFIG,
 * });
 * const [layout, setLayout] = useState(() => persisted.load());
 * // onLayoutChange: setLayout(persisted.commit(next));
 * ```
 *
 * @param options - {@link CreatePersistedTilingLayoutOptions}
 */
export function createPersistedTilingLayout(
  options: CreatePersistedTilingLayoutOptions,
): PersistedTilingLayout {
  const {
    storageKey,
    expectedTileIds,
    fallbackLayout,
    config,
    storage: storageOption,
    resolveContainerSize,
  } = options;
  const storage: TilingLayoutStorage = storageOption ?? resolveDefaultStorage();
  const readContainerSize: () => TilingLayoutContainerSize =
    resolveContainerSize ?? resolveDefaultContainerSize;

  function heal(node: TilingLayoutNode): TilingLayoutNode {
    const { containerWidthPx, containerHeightPx } = readContainerSize();
    return repairLayout(node, {
      containerWidthPx,
      containerHeightPx,
      config,
      expectedTileIds,
      fallbackLayout,
    });
  }

  function reset(): TilingLayoutNode {
    storage.setItem(storageKey, JSON.stringify(fallbackLayout));
    return fallbackLayout;
  }

  function commit(layout: TilingLayoutNode): TilingLayoutNode {
    const integrity: LayoutTileIntegrityReport = assertLayoutIntegrity(layout, {
      expectedTileIds,
    });
    if (integrity.requiresRebuild || !isPlausibleLayoutNode(layout)) {
      return reset();
    }
    const healed: TilingLayoutNode = heal(layout);
    const healedIntegrity: LayoutTileIntegrityReport = assertLayoutIntegrity(
      healed,
      { expectedTileIds },
    );
    if (healedIntegrity.requiresRebuild || !isPlausibleLayoutNode(healed)) {
      return reset();
    }
    storage.setItem(storageKey, JSON.stringify(healed));
    return healed;
  }

  function load(): TilingLayoutNode {
    try {
      const raw: string | null = storage.getItem(storageKey);
      if (raw === null) {
        return fallbackLayout;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!isPlausibleLayoutNode(parsed)) {
        return reset();
      }
      const integrity: LayoutTileIntegrityReport = assertLayoutIntegrity(
        parsed,
        { expectedTileIds },
      );
      if (integrity.requiresRebuild) {
        return reset();
      }
      return heal(parsed);
    } catch {
      return fallbackLayout;
    }
  }

  return { load, commit, reset };
}
