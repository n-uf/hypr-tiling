import * as React from "react";
import {
  collectGroups,
  collectSplitNodes,
  findLeafByDirection,
  isCommandEnabled,
  readLeafNodeIds,
  resolveInteractionCapabilities,
  resolveJumpedPaneId,
  type DynamicFocusDirection,
  type DynamicGroupNode,
  type DynamicLayoutNode,
  type DynamicSplitNode,
  type ResolvedTilingInteractionCapabilities,
  type ResolvedTilingKeyChord,
  type ResolvedTilingKeyChordModifiers,
  type ResolvedTilingKeymap,
  type TilingCommand,
  type TilingCommandGates,
  type TilingCommandHandle,
  type TilingInteractionCapabilities,
} from "@n-uf/hypr-tiling";

// Clickable, context-dependent keyboard-shortcut affordances for the homepage.
// Each entry dispatches a REAL tiling command through the renderer's command
// handle (the same router the keyboard layer uses), and shows its key combo.
// "Context-dependent" mirrors the renderer's own per-pane shortcut-chip logic
// (buildPaneShortcutChips): an entry is surfaced only when its command is both
// capability-enabled (isCommandEnabled) AND actionable given the live
// layout/focus state (a neighbor exists, a group is focused, etc.). Dogfoods the
// command API directly on the docs homepage.

interface ShortcutEntry {
  readonly id: string;
  readonly label: string;
  readonly combo: string;
  readonly command: TilingCommand;
  readonly isVisible: boolean;
}

interface ShortcutSection {
  readonly id: string;
  readonly heading: string;
  readonly entries: ReadonlyArray<ShortcutEntry>;
}

function keyCodeLabel(code: string): string {
  const direct: Record<string, string> = {
    Enter: "Enter",
    Escape: "Esc",
    BracketLeft: "[",
    BracketRight: "]",
    Backquote: "`",
    ArrowLeft: "\u2190",
    ArrowRight: "\u2192",
    ArrowUp: "\u2191",
    ArrowDown: "\u2193",
    Equal: "+",
    Minus: "-",
    Comma: ",",
    Period: ".",
  };
  if (direct[code] != null) {
    return direct[code];
  }
  if (code.startsWith("Key")) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith("Digit")) {
    return code.slice(5);
  }
  return code;
}

function modifierPrefix(modifiers: ResolvedTilingKeyChordModifiers): string {
  const tokens: Array<string> = [];
  if (modifiers.ctrl) {
    tokens.push("Ctrl");
  }
  if (modifiers.meta) {
    tokens.push("Meta");
  }
  if (modifiers.alt) {
    tokens.push("Alt");
  }
  if (modifiers.shift) {
    tokens.push("Shift");
  }
  return tokens.join("+");
}

function formatChord(chord: ResolvedTilingKeyChord): string {
  const prefix: string = modifierPrefix(chord);
  const key: string = keyCodeLabel(chord.code);
  return prefix.length === 0 ? key : `${prefix}+${key}`;
}

function gatesFromCapabilities(
  capabilities: ResolvedTilingInteractionCapabilities,
): TilingCommandGates {
  return {
    maximizeEnabled: capabilities.maximize.enable,
    paneSwitchingEnabled: capabilities.paneSwitching.enable,
    focusEnabled: capabilities.focus,
    rearrangeEnabled: capabilities.rearrange,
    sizingEnabled: capabilities.paneTitleBarControls.sizing,
    acquireSpaceEnabled: capabilities.paneTitleBarControls.acquireSpace,
    resizeEnabled: capabilities.resize !== "none",
    layoutEnabled: capabilities.masterLayout,
    groupingEnabled: capabilities.grouping,
  };
}

function buildSections(args: {
  layout: DynamicLayoutNode;
  focusedLeafId: string | null;
  maximizedLeafId: string | null;
  keymap: ResolvedTilingKeymap;
  gates: TilingCommandGates;
}): ReadonlyArray<ShortcutSection> {
  const { layout, focusedLeafId, maximizedLeafId, keymap, gates } = args;
  const leafIds: ReadonlyArray<string> = readLeafNodeIds(layout);
  const hasMultiplePanes: boolean = leafIds.length > 1;
  const groups: ReadonlyArray<DynamicGroupNode> = collectGroups(layout);
  const focusedGroup: DynamicGroupNode | undefined =
    focusedLeafId == null
      ? undefined
      : groups.find((group: DynamicGroupNode): boolean =>
          group.members.some((member): boolean => member.id === focusedLeafId),
        );
  const isFocusedGrouped: boolean =
    focusedGroup != null && focusedGroup.members.length > 1;
  const splits: ReadonlyArray<DynamicSplitNode> = collectSplitNodes(layout);
  const isMasterActive: boolean = splits.some(
    (split: DynamicSplitNode): boolean => split.layoutMode === "master",
  );

  const directionExists = (direction: DynamicFocusDirection): boolean =>
    focusedLeafId != null &&
    findLeafByDirection(layout, focusedLeafId, direction) != null;

  const directionEntry = (
    direction: DynamicFocusDirection,
    chord: ResolvedTilingKeyChord,
  ): ShortcutEntry => {
    const command: TilingCommand = { kind: "focus-direction", direction };
    return {
      id: `focus-${direction}`,
      label: `Focus ${direction}`,
      combo: formatChord(chord),
      command,
      isVisible: isCommandEnabled(command, gates) && directionExists(direction),
    };
  };

  const jumpEntries: ReadonlyArray<ShortcutEntry> = leafIds.map(
    (_, index: number): ShortcutEntry => {
      const paneNumber: number = index + 1;
      const command: TilingCommand = { kind: "focus-jump", paneNumber };
      const target: string | null = resolveJumpedPaneId(leafIds, paneNumber);
      const prefix: string = modifierPrefix(keymap.jumpToPane);
      const combo: string =
        prefix.length === 0 ? `${paneNumber}` : `${prefix}+${paneNumber}`;
      return {
        id: `focus-jump-${paneNumber}`,
        label: `Pane ${paneNumber}`,
        combo,
        command,
        isVisible:
          isCommandEnabled(command, gates) &&
          target != null &&
          target !== focusedLeafId,
      };
    },
  );

  const focusSection: ShortcutSection = {
    id: "focus",
    heading: "focus",
    entries: [
      {
        id: "focus-previous",
        label: "Previous pane",
        combo: formatChord(keymap.previousPane),
        command: { kind: "focus-cycle", direction: "previous" },
        isVisible:
          isCommandEnabled(
            { kind: "focus-cycle", direction: "previous" },
            gates,
          ) && hasMultiplePanes,
      },
      {
        id: "focus-next",
        label: "Next pane",
        combo: formatChord(keymap.nextPane),
        command: { kind: "focus-cycle", direction: "next" },
        isVisible:
          isCommandEnabled(
            { kind: "focus-cycle", direction: "next" },
            gates,
          ) && hasMultiplePanes,
      },
      {
        id: "focus-current-or-last",
        label: "Last pane",
        combo: formatChord(keymap.focusCurrentOrLast),
        command: { kind: "focus-current-or-last" },
        isVisible:
          isCommandEnabled({ kind: "focus-current-or-last" }, gates) &&
          hasMultiplePanes,
      },
      directionEntry("left", keymap.focusLeft),
      directionEntry("down", keymap.focusDown),
      directionEntry("up", keymap.focusUp),
      directionEntry("right", keymap.focusRight),
      ...jumpEntries,
    ],
  };

  const windowSection: ShortcutSection = {
    id: "window",
    heading: "window",
    entries: [
      {
        id: "maximize",
        label: "Maximize pane",
        combo: formatChord(keymap.toggleMaximize),
        command: { kind: "toggle-maximize" },
        isVisible:
          isCommandEnabled({ kind: "toggle-maximize" }, gates) &&
          focusedLeafId != null &&
          maximizedLeafId == null,
      },
      {
        id: "restore",
        label: "Restore pane",
        combo: formatChord(keymap.restore),
        command: { kind: "restore" },
        isVisible:
          isCommandEnabled({ kind: "restore" }, gates) &&
          maximizedLeafId != null,
      },
      {
        id: "move-mode",
        label: "Move pane",
        combo: formatChord(keymap.enterMoveMode),
        command: { kind: "enter-move-mode" },
        isVisible:
          isCommandEnabled({ kind: "enter-move-mode" }, gates) &&
          focusedLeafId != null &&
          hasMultiplePanes,
      },
    ],
  };

  const layoutSection: ShortcutSection = {
    id: "layout",
    heading: "layout",
    entries: [
      {
        id: "cycle-layout-mode",
        label: isMasterActive ? "Dwindle layout" : "Master layout",
        combo: formatChord(keymap.cycleLayoutMode),
        command: { kind: "cycle-layout-mode" },
        isVisible:
          isCommandEnabled({ kind: "cycle-layout-mode" }, gates) &&
          splits.length > 0,
      },
      {
        id: "master-orientation",
        label: "Master side",
        combo: formatChord(keymap.cycleMasterOrientation),
        command: { kind: "cycle-master-orientation" },
        isVisible:
          isCommandEnabled({ kind: "cycle-master-orientation" }, gates) &&
          isMasterActive,
      },
      {
        id: "master-count-inc",
        label: "Master +1",
        combo: formatChord(keymap.incrementMasterCount),
        command: { kind: "adjust-master-count", delta: 1 },
        isVisible:
          isCommandEnabled(
            { kind: "adjust-master-count", delta: 1 },
            gates,
          ) && isMasterActive,
      },
      {
        id: "master-count-dec",
        label: "Master \u22121",
        combo: formatChord(keymap.decrementMasterCount),
        command: { kind: "adjust-master-count", delta: -1 },
        isVisible:
          isCommandEnabled(
            { kind: "adjust-master-count", delta: -1 },
            gates,
          ) && isMasterActive,
      },
      {
        id: "master-ratio-inc",
        label: "Wider master",
        combo: formatChord(keymap.incrementMasterRatio),
        command: { kind: "adjust-master-ratio", delta: 0.05 },
        isVisible:
          isCommandEnabled(
            { kind: "adjust-master-ratio", delta: 0.05 },
            gates,
          ) && isMasterActive,
      },
      {
        id: "master-ratio-dec",
        label: "Narrower master",
        combo: formatChord(keymap.decrementMasterRatio),
        command: { kind: "adjust-master-ratio", delta: -0.05 },
        isVisible:
          isCommandEnabled(
            { kind: "adjust-master-ratio", delta: -0.05 },
            gates,
          ) && isMasterActive,
      },
    ],
  };

  const groupSection: ShortcutSection = {
    id: "group",
    heading: "group",
    entries: [
      {
        id: "toggle-group",
        label: isFocusedGrouped ? "Ungroup pane" : "Group pane",
        combo: formatChord(keymap.toggleGroup),
        command: { kind: "toggle-group" },
        isVisible:
          isCommandEnabled({ kind: "toggle-group" }, gates) &&
          focusedLeafId != null &&
          (hasMultiplePanes || isFocusedGrouped),
      },
      {
        id: "group-tab-next",
        label: "Next tab",
        combo: formatChord(keymap.groupTabNext),
        command: { kind: "group-tab-cycle", direction: "next" },
        isVisible:
          isCommandEnabled(
            { kind: "group-tab-cycle", direction: "next" },
            gates,
          ) && isFocusedGrouped,
      },
      {
        id: "group-tab-previous",
        label: "Previous tab",
        combo: formatChord(keymap.groupTabPrevious),
        command: { kind: "group-tab-cycle", direction: "previous" },
        isVisible:
          isCommandEnabled(
            { kind: "group-tab-cycle", direction: "previous" },
            gates,
          ) && isFocusedGrouped,
      },
    ],
  };

  return [focusSection, windowSection, layoutSection, groupSection].map(
    (section: ShortcutSection): ShortcutSection => ({
      ...section,
      entries: section.entries.filter(
        (entry: ShortcutEntry): boolean => entry.isVisible,
      ),
    }),
  );
}

export function ShortcutsPane({
  commandHandleRef,
  layout,
  focusedLeafId,
  maximizedLeafId,
  interaction,
}: {
  commandHandleRef: React.RefObject<TilingCommandHandle | null>;
  layout: DynamicLayoutNode;
  focusedLeafId: string | null;
  maximizedLeafId: string | null;
  interaction?: TilingInteractionCapabilities;
}): React.ReactElement {
  const capabilities: ResolvedTilingInteractionCapabilities = React.useMemo(
    (): ResolvedTilingInteractionCapabilities =>
      resolveInteractionCapabilities(interaction),
    [interaction],
  );
  const sections: ReadonlyArray<ShortcutSection> = React.useMemo(
    (): ReadonlyArray<ShortcutSection> =>
      buildSections({
        layout,
        focusedLeafId,
        maximizedLeafId,
        keymap: capabilities.keymap,
        gates: gatesFromCapabilities(capabilities),
      }),
    [layout, focusedLeafId, maximizedLeafId, capabilities],
  );

  const dispatch = React.useCallback(
    (command: TilingCommand): void => {
      commandHandleRef.current?.dispatch(command);
    },
    [commandHandleRef],
  );

  const visibleSections: ReadonlyArray<ShortcutSection> = sections.filter(
    (section: ShortcutSection): boolean => section.entries.length > 0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-3.5 w-[2px] shrink-0 rounded-full bg-amber-300/70"
          />
          <h2 className="font-display text-[20px] font-medium leading-tight tracking-[-0.01em] text-stone-50">
            Live controls
          </h2>
        </div>
        <p className="max-w-[62ch] text-[12px] leading-[1.6] text-stone-400">
          Click a control to run the real tiling command on the focused pane —
          the same typed command API the keyboard layer drives. Only controls
          that are actionable right now are shown.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {visibleSections.map(
          (section: ShortcutSection): React.ReactElement => (
            <div key={section.id} className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
                {section.heading}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {section.entries.map(
                  (entry: ShortcutEntry): React.ReactElement => (
                    <button
                      key={entry.id}
                      type="button"
                      title={`${entry.label} (${entry.combo})`}
                      onClick={(): void => dispatch(entry.command)}
                      className="group flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-left transition-[transform,border-color,background-color] duration-150 hover:-translate-y-px hover:border-amber-300/40 hover:bg-amber-300/[0.06] active:translate-y-0"
                    >
                      <span className="text-[12px] text-stone-200 group-hover:text-stone-50">
                        {entry.label}
                      </span>
                      <kbd className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] leading-none text-stone-400 group-hover:border-amber-300/40 group-hover:text-amber-100">
                        {entry.combo}
                      </kbd>
                    </button>
                  ),
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
