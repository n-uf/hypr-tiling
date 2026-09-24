import type {
  TilingLayoutNode,
  TilingWorkspace,
  TilingWorkspaceSet,
} from "@n-uf/hypr-tiling";

// Seed workspace set for the docs homepage. Workspace 1 (Home) is active on
// SSR / first paint. Home is four columns: intro over discoverability in the
// left stack, then features, install, and use cases at full height. Column
// widths are tuned for the four-column home grid at 1440×900; the left stack
// seats discoverability under intro (0.675/0.325). Workspaces seats the workspaces copy (left, wider) beside the
// set-inspector / swipe-meter dogfood pair. Changelog is a four-widget
// dashboard: tall release timeline beside latest / breaking / version. Doc
// tile ids match `DOC_PANES`; widget tile ids live in `changelog-widgets.tsx`.
// Leaf id equals tile id.
//
// Storage key and envelope version move together. A mismatch
// (`parseHomeWorkspaceSetBlob`) returns null so the next visit reseeds
// instead of replaying a previous Home tree.

export const HOME_WORKSPACE_STORAGE_KEY: string =
  "hypr-tiling-home-workspaces-v6";

export const HOME_WORKSPACE_STORAGE_VERSION: number = 6;

export const HOME_WORKSPACE_ID_HOME: string = "ws-home";
export const HOME_WORKSPACE_ID_WORKSPACES: string = "ws-workspaces";
export const HOME_WORKSPACE_ID_CHANGELOG: string = "ws-changelog";

export const HOME_WORKSPACE_NAME_HOME: string = "Home";
export const HOME_WORKSPACE_NAME_WORKSPACES: string = "Workspaces";
export const HOME_WORKSPACE_NAME_CHANGELOG: string = "Changelog";

// Root fractions: left column 0.26 (intro 0.675 / discoverability 0.325 of that
// column), features 0.308 (0.416 of the remaining 0.74), install 0.275
// (0.636 of what remains after features), use cases 0.157. The extra left
// width comes from install so features and use cases keep their share.
const HOME_LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "home-root",
  axis: "horizontal",
  ratio: 0.26,
  first: {
    kind: "split",
    id: "home-intro-stack",
    axis: "vertical",
    ratio: 0.675,
    first: { kind: "leaf", id: "intro", tileId: "intro" },
    second: {
      kind: "leaf",
      id: "discoverability",
      tileId: "discoverability",
    },
  },
  second: {
    kind: "split",
    id: "home-features-rest",
    axis: "horizontal",
    ratio: 0.416,
    first: { kind: "leaf", id: "features", tileId: "features" },
    second: {
      kind: "split",
      id: "home-install-uses",
      axis: "horizontal",
      ratio: 0.636,
      first: { kind: "leaf", id: "install", tileId: "install" },
      second: { kind: "leaf", id: "usecases", tileId: "usecases" },
    },
  },
};

const WORKSPACES_LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "workspaces-root",
  axis: "horizontal",
  ratio: 0.62,
  first: { kind: "leaf", id: "workspaces", tileId: "workspaces" },
  second: {
    kind: "split",
    id: "workspaces-dogfood",
    axis: "vertical",
    ratio: 0.62,
    first: { kind: "leaf", id: "set-inspector", tileId: "set-inspector" },
    second: { kind: "leaf", id: "swipe-meter", tileId: "swipe-meter" },
  },
};

const CHANGELOG_LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "changelog-root",
  axis: "horizontal",
  ratio: 0.38,
  first: { kind: "leaf", id: "release-timeline", tileId: "release-timeline" },
  second: {
    kind: "split",
    id: "changelog-right",
    axis: "vertical",
    ratio: 0.42,
    first: { kind: "leaf", id: "latest-release", tileId: "latest-release" },
    second: {
      kind: "split",
      id: "changelog-bottom",
      axis: "horizontal",
      ratio: 0.56,
      first: {
        kind: "leaf",
        id: "breaking-changes",
        tileId: "breaking-changes",
      },
      second: {
        kind: "leaf",
        id: "version-install",
        tileId: "version-install",
      },
    },
  },
};

export function createHomeWorkspaceSet(): TilingWorkspaceSet {
  return {
    activeId: HOME_WORKSPACE_ID_HOME,
    workspaces: [
      {
        id: HOME_WORKSPACE_ID_HOME,
        name: HOME_WORKSPACE_NAME_HOME,
        layout: HOME_LAYOUT,
      },
      {
        id: HOME_WORKSPACE_ID_WORKSPACES,
        name: HOME_WORKSPACE_NAME_WORKSPACES,
        layout: WORKSPACES_LAYOUT,
      },
      {
        id: HOME_WORKSPACE_ID_CHANGELOG,
        name: HOME_WORKSPACE_NAME_CHANGELOG,
        layout: CHANGELOG_LAYOUT,
      },
    ],
  };
}

/** Seed set the homepage resets to. Stable reference for `defaults` / `workspaceDefaults`. */
export const HOME_WORKSPACE_SEED: TilingWorkspaceSet = createHomeWorkspaceSet();

interface HomeWorkspaceStorageEnvelope {
  readonly version: number;
  readonly set: TilingWorkspaceSet;
}

interface JsonRecord {
  readonly [key: string]: JsonValue;
}

type JsonValue = string | number | boolean | null | JsonRecord | ReadonlyArray<JsonValue>;

function isJsonRecord(value: JsonValue): value is JsonRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonValue(raw: string): JsonValue | null {
  try {
    const value: JsonValue = JSON.parse(raw) as JsonValue;
    return value;
  } catch {
    return null;
  }
}

function isLayoutNode(value: JsonValue): value is TilingLayoutNode & JsonRecord {
  if (!isJsonRecord(value)) {
    return false;
  }
  const kind: JsonValue = value.kind;
  return kind === "leaf" || kind === "split" || kind === "group";
}

function isWorkspaceSet(value: JsonValue): value is TilingWorkspaceSet & JsonRecord {
  if (!isJsonRecord(value)) {
    return false;
  }
  const workspaces: JsonValue = value.workspaces;
  const activeId: JsonValue = value.activeId;
  if (!Array.isArray(workspaces) || typeof activeId !== "string" || activeId === "") {
    return false;
  }
  if (workspaces.length < 1 || workspaces.length > 12) {
    return false;
  }
  const ids: Array<string> = [];
  for (const entry of workspaces) {
    if (!isJsonRecord(entry)) {
      return false;
    }
    const id: JsonValue = entry.id;
    const name: JsonValue = entry.name;
    const layout: JsonValue = entry.layout;
    if (typeof id !== "string" || id === "") {
      return false;
    }
    if (typeof name !== "string" || name.trim() === "") {
      return false;
    }
    if (layout !== null && !isLayoutNode(layout)) {
      return false;
    }
    ids.push(id);
  }
  return ids.includes(activeId);
}

// A pre-workspace homepage blob was a bare `TilingLayoutNode` (kind split/leaf/
// group). Those reset to the seed set — we do not guess how to split one tree
// into the Home / Workspaces / Changelog set.
function isLegacyLayoutBlob(value: JsonValue): boolean {
  if (!isJsonRecord(value)) {
    return false;
  }
  if (value.workspaces != null) {
    return false;
  }
  return isLayoutNode(value);
}

export function parseHomeWorkspaceSetBlob(raw: string): TilingWorkspaceSet | null {
  const parsed: JsonValue | null = parseJsonValue(raw);
  if (parsed == null) {
    return null;
  }
  if (isLegacyLayoutBlob(parsed)) {
    return null;
  }
  if (!isJsonRecord(parsed)) {
    return null;
  }
  const version: JsonValue = parsed.version;
  const set: JsonValue = parsed.set;
  if (version !== HOME_WORKSPACE_STORAGE_VERSION) {
    return null;
  }
  if (!isWorkspaceSet(set)) {
    return null;
  }
  return set;
}

export function readHomeWorkspaceSet(): TilingWorkspaceSet | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw: string | null = window.localStorage.getItem(
      HOME_WORKSPACE_STORAGE_KEY,
    );
    if (raw == null) {
      return null;
    }
    return parseHomeWorkspaceSetBlob(raw);
  } catch {
    return null;
  }
}

export function writeHomeWorkspaceSet(set: TilingWorkspaceSet): void {
  if (typeof window === "undefined") {
    return;
  }
  const envelope: HomeWorkspaceStorageEnvelope = {
    version: HOME_WORKSPACE_STORAGE_VERSION,
    set,
  };
  try {
    window.localStorage.setItem(
      HOME_WORKSPACE_STORAGE_KEY,
      JSON.stringify(envelope),
    );
  } catch {
    // Quota / private-mode: keep the in-memory set; next visit reseeds.
  }
}

export function clearHomeWorkspaceSet(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(HOME_WORKSPACE_STORAGE_KEY);
  } catch {
    // Private-mode / blocked storage: in-memory reset still stands.
  }
}

export function mintHomeWorkspaceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `ws-${crypto.randomUUID()}`;
  }
  return `ws-${Date.now().toString(36)}`;
}

export function nextHomeWorkspaceName(
  existing: ReadonlyArray<TilingWorkspace>,
): string {
  return `Workspace ${existing.length + 1}`;
}
