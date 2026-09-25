import { describe, expect, it } from "@jest/globals";
import type {
  TilingCommand,
  TilingLayoutNode,
  TilingLeafNode,
  TilingWorkspaceSet,
} from "@n-uf/hypr-tiling";
import { isStructurallyValidLayout } from "@n-uf/hypr-tiling/engine";
import {
  healHomeWorkspaceSet,
  type HomeLayoutHealOptions,
  type HomeWorkspaceHealResult,
} from "./home-layout-heal";
import {
  corruptHomeWorkspaceSet,
  HOME_SCENARIOS,
  homeScenarioById,
  homeWorkspaceEnvelope,
  runHomeScenario,
  scenarioRunDisabled,
  type HomeScenario,
  type HomeScenarioId,
  type ScenarioHost,
} from "./home-scenarios";
import {
  HOME_WORKSPACE_SEED,
  parseHomeWorkspaceSetBlob,
} from "./home-workspaces";

const HEAL_OPTIONS: HomeLayoutHealOptions = {
  knownTileIds: [
    "intro",
    "discoverability",
    "features",
    "install",
    "usecases",
    "proof",
    "scenarios",
    "workspaces",
    "set-inspector",
    "swipe-meter",
    "release-timeline",
    "latest-release",
    "breaking-changes",
    "version-install",
  ],
  config: { gapPx: 14, minPaneSizePx: 180, handleSizePx: 8 },
  containerWidthPx: 1440,
  containerHeightPx: 900,
};

function leafTileIds(node: TilingLayoutNode | null): Array<string> {
  if (node == null) {
    return [];
  }
  if (node.kind === "leaf") {
    return [node.tileId];
  }
  if (node.kind === "group") {
    return node.members.map((member: TilingLeafNode): string => member.tileId);
  }
  return [...leafTileIds(node.first), ...leafTileIds(node.second)];
}

function recordingHost(
  commands: Array<TilingCommand>,
  calls: Array<string>,
): ScenarioHost {
  return {
    atDefaults: false,
    dispatch: (command: TilingCommand): void => {
      commands.push(command);
    },
    resetAll: (): void => {
      calls.push("reset-all");
    },
    holdSnapshot: (): void => {
      calls.push("hold");
    },
    writeBrokenLayout: (): void => {
      calls.push("write");
    },
    loadAndHeal: (): ReadonlyArray<string> => {
      calls.push("heal");
      return ["repairWorkspaceSet: tree-rebuilt"];
    },
  };
}

async function runId(id: HomeScenarioId, host: ScenarioHost): Promise<Array<string>> {
  const lines: Array<string> = [];
  const scenario: HomeScenario = homeScenarioById(id);
  await runHomeScenario(scenario, host, {
    stepMs: 0,
    signal: new AbortController().signal,
    onStep: (line: string): void => {
      lines.push(line);
    },
    onDetail: (line: string): void => {
      lines.push(line);
    },
    onFinal: (line: string): void => {
      lines.push(line);
    },
  });
  return lines;
}

describe("home scenarios", () => {
  it("lists corrupt, split, keyboard, and reset steps", async () => {
    const commands: Array<TilingCommand> = [];
    const calls: Array<string> = [];
    const host: ScenarioHost = recordingHost(commands, calls);
    const corruptLines: Array<string> = await runId("corrupt-heal", host);
    expect(calls).toEqual(["hold", "write", "heal"]);
    expect(corruptLines[0]).toBe("1/3 snapshot persisted layout");
    expect(corruptLines[1]).toBe("2/3 write broken layout");
    expect(corruptLines[2]).toBe("3/3 load and heal");
    expect(corruptLines).toContain("repairWorkspaceSet: tree-rebuilt");
    expect(corruptLines[corruptLines.length - 1]).toBe(
      "Healed layout applied. Restore puts the snapshot back.",
    );

    commands.length = 0;
    const splitLines: Array<string> = await runId(
      "split-group",
      recordingHost(commands, []),
    );
    expect(splitLines.slice(0, 5)).toEqual([
      "1/5 eject proof",
      "2/5 eject scenarios",
      "3/5 group panes",
      "4/5 cycle group tab",
      "5/5 ungroup",
    ]);
    expect(commands.map((command: TilingCommand): TilingCommand["kind"] => command.kind)).toEqual([
      "focus-pane",
      "remove-from-group",
      "remove-from-group",
      "focus-pane",
      "group-leaves",
      "focus-pane",
      "group-tab-cycle",
      "focus-pane",
      "ungroup",
    ]);

    commands.length = 0;
    const tourLines: Array<string> = await runId(
      "keyboard-tour",
      recordingHost(commands, []),
    );
    expect(tourLines.slice(0, 6)).toEqual([
      "1/6 Alt+G",
      "2/6 Alt+]",
      "3/6 Alt+[",
      "4/6 Alt+ArrowRight",
      "5/6 Alt+ArrowLeft",
      "6/6 reset-workspace",
    ]);
    expect(commands.map((command: TilingCommand): TilingCommand["kind"] => command.kind)).toEqual([
      "toggle-group",
      "focus-cycle",
      "focus-cycle",
      "cycle-workspace",
      "cycle-workspace",
      "reset-workspace",
    ]);

    calls.length = 0;
    const resetLines: Array<string> = await runId(
      "reset-all",
      recordingHost([], calls),
    );
    expect(resetLines[0]).toBe("1/1 reset all");
    expect(calls).toEqual(["reset-all"]);
    expect(HOME_SCENARIOS.map((scenario: HomeScenario): HomeScenarioId => scenario.id)).toEqual([
      "corrupt-heal",
      "split-group",
      "keyboard-tour",
      "reset-all",
    ]);
  });

  it("disables reset all only when the set is already the seed", () => {
    expect(scenarioRunDisabled("reset-all", true, false)).toBe(true);
    expect(scenarioRunDisabled("reset-all", false, false)).toBe(false);
    expect(scenarioRunDisabled("split-group", true, false)).toBe(false);
    expect(scenarioRunDisabled("split-group", false, true)).toBe(true);
  });

  it("leaves a sound set untouched and reports repairs for a broken blob", () => {
    const sound: HomeWorkspaceHealResult = healHomeWorkspaceSet(
      HOME_WORKSPACE_SEED,
      HEAL_OPTIONS,
    );
    expect(sound.lines).toEqual([]);
    expect(sound.set).toBe(HOME_WORKSPACE_SEED);

    const broken: TilingWorkspaceSet = corruptHomeWorkspaceSet(HOME_WORKSPACE_SEED);
    const parsed: TilingWorkspaceSet | null = parseHomeWorkspaceSetBlob(
      homeWorkspaceEnvelope(broken),
    );
    expect(parsed).not.toBeNull();
    if (parsed == null) {
      return;
    }
    const healed: HomeWorkspaceHealResult = healHomeWorkspaceSet(
      parsed,
      HEAL_OPTIONS,
    );
    expect(healed.lines.some((line: string): boolean => line.includes("ratio"))).toBe(
      true,
    );
    expect(
      healed.lines.some((line: string): boolean => line.includes("missing its second child")),
    ).toBe(true);
    expect(healed.lines.some((line: string): boolean => line.includes("missing-tile"))).toBe(
      true,
    );
    expect(healed.lines).toContain("repairWorkspaceSet: tree-rebuilt");
    const home: TilingLayoutNode | null = healed.set.workspaces[0]?.layout ?? null;
    expect(home == null ? false : isStructurallyValidLayout(home)).toBe(true);
    expect(leafTileIds(home)).not.toContain("missing-tile");
  });
});
