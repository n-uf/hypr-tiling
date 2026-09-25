import type { TilingCommand, TilingWorkspaceSet } from "@n-uf/hypr-tiling";
import {
  HOME_HERO_GROUP_ID,
  HOME_WORKSPACE_STORAGE_VERSION,
} from "./home-workspaces";

// Scripted Home demos. The runner only calls the injected host, so a test
// can record commands without a DOM. The React tile owns timing, abort, and
// the live controller.

export const SCENARIO_STEP_MS: number = 450;

export const HOME_LAYOUT_SNAPSHOT_KEY: string =
  "hypr-tiling-home-layout-snapshot";

export type HomeScenarioId =
  | "corrupt-heal"
  | "split-group"
  | "keyboard-tour"
  | "reset-all";

export interface ScenarioHost {
  dispatch: (command: TilingCommand) => void;
  resetAll: () => void;
  holdSnapshot: () => void;
  writeBrokenLayout: () => void;
  loadAndHeal: () => ReadonlyArray<string>;
  atDefaults: boolean;
}

export interface HomeScenarioStep {
  readonly label: string;
  readonly run: (host: ScenarioHost) => ReadonlyArray<string>;
}

export interface HomeScenario {
  readonly id: HomeScenarioId;
  readonly title: string;
  readonly description: string;
  readonly steps: ReadonlyArray<HomeScenarioStep>;
  readonly finalLine: string;
}

export interface HomeScenarioRunOptions {
  readonly stepMs: number;
  readonly signal: AbortSignal;
  readonly onStep: (line: string) => void;
  readonly onDetail: (line: string) => void;
  readonly onFinal: (line: string) => void;
}

type MutableJson =
  | string
  | number
  | boolean
  | null
  | MutableRecord
  | MutableJson[];

interface MutableRecord {
  kind?: string;
  id?: string;
  tileId?: string;
  ratio?: number;
  first?: MutableJson;
  second?: MutableJson;
  members?: MutableJson[];
  workspaces?: MutableJson[];
  activeId?: string;
  layout?: MutableJson;
  name?: string;
  [key: string]: MutableJson | undefined;
}

function isRecord(value: MutableJson | undefined): value is MutableRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function walkLayout(
  node: MutableJson | undefined,
  visit: (record: MutableRecord) => void,
): void {
  if (!isRecord(node)) {
    return;
  }
  visit(node);
  walkLayout(node.first, visit);
  walkLayout(node.second, visit);
  const members: MutableJson | undefined = node.members;
  if (!Array.isArray(members)) {
    return;
  }
  for (const member of members) {
    walkLayout(member, visit);
  }
}

function cloneSet(set: TilingWorkspaceSet): MutableRecord {
  const cloned: MutableJson = JSON.parse(JSON.stringify(set)) as MutableJson;
  if (!isRecord(cloned)) {
    throw new Error("home scenario: workspace set clone was not an object");
  }
  return cloned;
}

// Three defects: a ratio outside (0, 1), a split child removed, and a group
// member whose tile id is not in the tile pool. The parser still accepts the
// blob; `healHomeWorkspaceSet` is what reports and repairs it.
export function corruptHomeWorkspaceSet(
  set: TilingWorkspaceSet,
): TilingWorkspaceSet {
  const cloned: MutableRecord = cloneSet(set);
  const workspaces: MutableJson | undefined = cloned.workspaces;
  if (!Array.isArray(workspaces)) {
    return set;
  }
  for (const workspace of workspaces) {
    if (!isRecord(workspace)) {
      continue;
    }
    walkLayout(workspace.layout, (node: MutableRecord): void => {
      if (node.id === "home-root") {
        node.ratio = 1.5;
      }
      if (node.id === "home-intro-stack") {
        delete node.second;
      }
      if (node.id === HOME_HERO_GROUP_ID && Array.isArray(node.members)) {
        node.members.push({
          kind: "leaf",
          id: "missing-seat",
          tileId: "missing-tile",
        });
      }
    });
  }
  return cloned as TilingWorkspaceSet;
}

export function homeWorkspaceEnvelope(set: TilingWorkspaceSet): string {
  return JSON.stringify({
    version: HOME_WORKSPACE_STORAGE_VERSION,
    set,
  });
}

export function readHomeLayoutSnapshot(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage.getItem(HOME_LAYOUT_SNAPSHOT_KEY);
  } catch {
    return null;
  }
}

export function writeHomeLayoutSnapshot(raw: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(HOME_LAYOUT_SNAPSHOT_KEY, raw);
  } catch {
    // Private-mode storage: the in-memory Restore flag still shows the button.
  }
}

export function clearHomeLayoutSnapshot(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(HOME_LAYOUT_SNAPSHOT_KEY);
  } catch {
    // The button hides from React state even if the key remains.
  }
}

function commandStep(
  label: string,
  commands: ReadonlyArray<TilingCommand>,
): HomeScenarioStep {
  return {
    label,
    run: (host: ScenarioHost): ReadonlyArray<string> => {
      for (const command of commands) {
        host.dispatch(command);
      }
      return [];
    },
  };
}

const CORRUPT_HEAL: HomeScenario = {
  id: "corrupt-heal",
  title: "Corrupt and heal",
  description:
    "Snapshot the persisted layout, write a broken blob, then load it through the same heal path as boot.",
  finalLine: "Healed layout applied. Restore puts the snapshot back.",
  steps: [
    {
      label: "snapshot persisted layout",
      run: (host: ScenarioHost): ReadonlyArray<string> => {
        host.holdSnapshot();
        return [];
      },
    },
    {
      label: "write broken layout",
      run: (host: ScenarioHost): ReadonlyArray<string> => {
        host.writeBrokenLayout();
        return [];
      },
    },
    {
      label: "load and heal",
      run: (host: ScenarioHost): ReadonlyArray<string> => host.loadAndHeal(),
    },
  ],
};

const SPLIT_GROUP: HomeScenario = {
  id: "split-group",
  title: "Split and group",
  description:
    "Eject Proof and Scenarios from the hero group into their own panes, group the two, cycle the group tab, then ungroup.",
  finalLine: "Group created, cycled, and ungrouped.",
  steps: [
    commandStep("eject proof", [
      { kind: "focus-pane", leafId: "intro" },
      {
        kind: "remove-from-group",
        groupId: HOME_HERO_GROUP_ID,
        memberId: "proof",
      },
    ]),
    commandStep("eject scenarios", [
      {
        kind: "remove-from-group",
        groupId: HOME_HERO_GROUP_ID,
        memberId: "scenarios",
      },
    ]),
    commandStep("group panes", [
      { kind: "focus-pane", leafId: "proof" },
      {
        kind: "group-leaves",
        leafIds: ["proof", "scenarios"],
        hostLeafId: "proof",
      },
    ]),
    commandStep("cycle group tab", [
      { kind: "focus-pane", leafId: "proof" },
      {
        kind: "group-tab-cycle",
        groupId: "group-proof",
        direction: "next",
      },
    ]),
    commandStep("ungroup", [
      { kind: "focus-pane", leafId: "proof" },
      { kind: "ungroup", groupId: "group-proof" },
    ]),
  ],
};

const KEYBOARD_TOUR: HomeScenario = {
  id: "keyboard-tour",
  title: "Keyboard tour",
  description:
    "Dispatch the default chords Alt+G, Alt+], Alt+[, workspace next, workspace previous, then reset-workspace.",
  finalLine: "Chords dispatched. Active workspace layout is the seed.",
  steps: [
    commandStep("Alt+G", [{ kind: "toggle-group" }]),
    commandStep("Alt+]", [{ kind: "focus-cycle", direction: "next" }]),
    commandStep("Alt+[", [{ kind: "focus-cycle", direction: "previous" }]),
    commandStep("Alt+ArrowRight", [
      { kind: "cycle-workspace", direction: "next" },
    ]),
    commandStep("Alt+ArrowLeft", [
      { kind: "cycle-workspace", direction: "previous" },
    ]),
    commandStep("reset-workspace", [{ kind: "reset-workspace" }]),
  ],
};

const RESET_ALL: HomeScenario = {
  id: "reset-all",
  title: "Reset all",
  description: "Replace every workspace from the seed.",
  finalLine: "All workspaces replaced from the seed.",
  steps: [
    {
      label: "reset all",
      run: (host: ScenarioHost): ReadonlyArray<string> => {
        host.resetAll();
        return [];
      },
    },
  ],
};

export const HOME_SCENARIOS: ReadonlyArray<HomeScenario> = [
  CORRUPT_HEAL,
  SPLIT_GROUP,
  KEYBOARD_TOUR,
  RESET_ALL,
];

export function homeScenarioById(id: HomeScenarioId): HomeScenario {
  const found: HomeScenario | undefined = HOME_SCENARIOS.find(
    (scenario: HomeScenario): boolean => scenario.id === id,
  );
  if (found == null) {
    throw new Error(`home scenario: missing id ${id}`);
  }
  return found;
}

export function scenarioRunDisabled(
  id: HomeScenarioId,
  atDefaults: boolean,
  running: boolean,
): boolean {
  if (running) {
    return true;
  }
  return id === "reset-all" && atDefaults;
}

function abortError(): Error {
  return new Error("scenario aborted");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject): void => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer: ReturnType<typeof setTimeout> = setTimeout((): void => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort);
  });
}

export function scenarioStepDelayMs(): number {
  if (typeof window === "undefined") {
    return SCENARIO_STEP_MS;
  }
  const reduce: boolean = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  return reduce ? 0 : SCENARIO_STEP_MS;
}

export async function runHomeScenario(
  scenario: HomeScenario,
  host: ScenarioHost,
  options: HomeScenarioRunOptions,
): Promise<void> {
  const count: number = scenario.steps.length;
  for (let index: number = 0; index < count; index += 1) {
    if (options.signal.aborted) {
      return;
    }
    const step: HomeScenarioStep = scenario.steps[index];
    options.onStep(`${index + 1}/${count} ${step.label}`);
    const details: ReadonlyArray<string> = step.run(host);
    for (const detail of details) {
      options.onDetail(detail);
    }
    if (index < count - 1) {
      await sleep(options.stepMs, options.signal);
    }
  }
  if (options.signal.aborted) {
    return;
  }
  options.onFinal(scenario.finalLine);
}
