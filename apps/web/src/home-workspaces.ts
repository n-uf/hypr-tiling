import type {
  TilingLayoutNode,
  TilingWorkspace,
  TilingWorkspaceSet,
} from "@n-uf/hypr-tiling";

// Seed workspace set for the docs homepage. The landing tree (intro / features /
// install) is workspace 1 so SSR and first paint stay on the editorial home.
// Feature copy (workspaces + model) and use-case / SEO copy sit in the other
// two. Tile ids match `DOC_PANES`; leaf id equals tile id, same as the previous
// single-layout home.

export const HOME_WORKSPACE_STORAGE_KEY: string =
  "hypr-tiling-home-workspaces-v1";

export const HOME_WORKSPACE_STORAGE_VERSION: number = 1;

export const HOME_WORKSPACE_ID_HOME: string = "ws-home";
export const HOME_WORKSPACE_ID_WORKSPACES: string = "ws-workspaces";
export const HOME_WORKSPACE_ID_USE: string = "ws-use";

export const HOME_WORKSPACE_NAME_HOME: string = "Home";
export const HOME_WORKSPACE_NAME_WORKSPACES: string = "Workspaces";
export const HOME_WORKSPACE_NAME_USE: string = "Use";

const HOME_LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "home-root",
  axis: "horizontal",
  ratio: 0.42,
  first: { kind: "leaf", id: "intro", tileId: "intro" },
  second: {
    kind: "split",
    id: "home-right",
    axis: "vertical",
    ratio: 0.55,
    first: { kind: "leaf", id: "features", tileId: "features" },
    second: { kind: "leaf", id: "install", tileId: "install" },
  },
};

const WORKSPACES_LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "workspaces-root",
  axis: "horizontal",
  ratio: 0.55,
  first: { kind: "leaf", id: "workspaces", tileId: "workspaces" },
  second: { kind: "leaf", id: "model", tileId: "model" },
};

const USE_LAYOUT: TilingLayoutNode = {
  kind: "split",
  id: "use-root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "usecases", tileId: "usecases" },
  second: { kind: "leaf", id: "discoverability", tileId: "discoverability" },
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
        id: HOME_WORKSPACE_ID_USE,
        name: HOME_WORKSPACE_NAME_USE,
        layout: USE_LAYOUT,
      },
    ],
  };
}

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
// into three workspaces.
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
