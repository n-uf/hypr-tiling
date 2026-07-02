import * as React from "react";
import {
  isCommandEnabled,
  queryTilingLayout,
  resolveInteractionCapabilities,
  resolveJumpedPaneId,
  type TilingFocusDirection,
  type TilingGroupNode,
  type TilingLayoutNode,
  type TilingLayoutQuery,
  type TilingSplitNode,
  type ResolvedTilingInteractionCapabilities,
  type ResolvedTilingKeyChord,
  type ResolvedTilingKeyChordModifiers,
  type ResolvedTilingKeymap,
  type TilingCommand,
  type TilingCommandGates,
  type TilingCommandHandle,
  type TilingInteractionCapabilities,
} from "@n-uf/hypr-tiling";

// Clickable, context-dependent keyboard-shortcut affordances for the homepage,
// hosted in the page-level bottom bar (`HomeShortcuts`). Each entry dispatches a
// REAL tiling command through the renderer's command handle (the same router the
// keyboard layer uses), and shows its key combo. "Context-dependent" mirrors the
// renderer's own per-pane shortcut-chip logic (buildPaneShortcutChips): an entry
// is surfaced only when its command is both capability-enabled (isCommandEnabled)
// AND actionable given the live layout/focus state (a neighbor exists, a group is
// focused, etc.). Dogfoods the command API directly on the docs homepage.

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
  layout: TilingLayoutNode;
  focusedLeafId: string | null;
  maximizedLeafId: string | null;
  keymap: ResolvedTilingKeymap;
  gates: TilingCommandGates;
}): ReadonlyArray<ShortcutSection> {
  const { layout, focusedLeafId, maximizedLeafId, keymap, gates } = args;
  const query: TilingLayoutQuery = queryTilingLayout(layout);
  const leafIds: ReadonlyArray<string> = query.leafIds;
  const hasMultiplePanes: boolean = leafIds.length > 1;
  const groups: ReadonlyArray<TilingGroupNode> = query.groups;
  const focusedGroup: TilingGroupNode | undefined =
    focusedLeafId == null
      ? undefined
      : groups.find((group: TilingGroupNode): boolean =>
          group.members.some((member): boolean => member.id === focusedLeafId),
        );
  const isFocusedGrouped: boolean =
    focusedGroup != null && focusedGroup.members.length > 1;
  const splits: ReadonlyArray<TilingSplitNode> = query.splits;
  const isMasterActive: boolean = query.hasMasterSplit;

  const directionExists = (direction: TilingFocusDirection): boolean =>
    focusedLeafId != null &&
    query.neighborLeafId(focusedLeafId, direction) != null;

  const directionEntry = (
    direction: TilingFocusDirection,
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

// Which homepage skin the shortcut strip presents in. Kept generic (a small
// token lookup) so the interactive command affordances re-skin in lockstep with
// the rest of the page — dark/amber for Mosaic, ink on paper for Editorial, and
// grey keycap chips for Canvas.
type ShortcutSkin = "mosaic" | "editorial" | "canvas";

// Compact chip tokens for the page-level bottom bar. The shortcut affordances
// live in the bottom bar (not a standalone pane), so these are sized for a
// dense single-row strip: small section labels, tight keycap chips, per-skin
// color language matching the rest of the chrome. Each chip now shows ONLY its
// key-binding keycap; the descriptive label moves into a lightweight custom
// hover `tooltip` (fast, ~60ms — NOT the slow native `title` attribute), styled
// in the same per-skin vibe as the bar.
interface ShortcutBarTokens {
  readonly sectionLabel: string;
  readonly button: string;
  readonly kbd: string;
  readonly tooltip: string;
  readonly divider: string;
}

const SHORTCUT_BAR_SKIN: Record<ShortcutSkin, ShortcutBarTokens> = {
  mosaic: {
    sectionLabel:
      "shrink-0 font-mono text-[9px] uppercase tracking-[0.22em] text-stone-600",
    button:
      "group relative flex shrink-0 items-center rounded border border-white/[0.08] bg-white/[0.02] px-1 py-0.5 transition-[transform,border-color,background-color] duration-150 hover:-translate-y-px hover:border-amber-300/40 hover:bg-amber-300/[0.06] active:translate-y-0",
    kbd: "shrink-0 rounded border border-white/[0.08] bg-white/[0.03] px-1 py-0.5 font-mono text-[9px] leading-none text-stone-300 group-hover:border-amber-300/40 group-hover:text-amber-100",
    tooltip:
      "pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-amber-300/25 bg-[#1c1e22] px-2 py-1 font-mono text-[10px] normal-case tracking-[0.02em] text-stone-100 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.9)]",
    divider: "h-3.5 w-px shrink-0 bg-white/10",
  },
  editorial: {
    sectionLabel:
      "shrink-0 font-mono text-[9px] uppercase tracking-[0.24em] text-[#a89c83]",
    button:
      "group relative flex shrink-0 items-center rounded-[3px] border border-[#ddd3bd] bg-transparent px-1 py-0.5 transition-[transform,border-color,background-color] duration-150 hover:-translate-y-px hover:border-[#241f17]/50 hover:bg-[#241f17]/[0.04] active:translate-y-0",
    kbd: "shrink-0 rounded-[2px] border border-[#ddd4bf] bg-[#efe8d6] px-1 py-0.5 font-mono text-[9px] leading-none text-[#6b6250] group-hover:border-[#241f17]/40 group-hover:text-[#241f17]",
    tooltip:
      "pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[2px] border border-[#d7ccb2] bg-[#fbf9f2] px-2 py-1 font-mono text-[10px] normal-case tracking-[0.02em] text-[#241f17] shadow-[0_10px_28px_-20px_rgba(36,31,23,0.6)]",
    divider: "h-3.5 w-px shrink-0 bg-[#d7ccb2]",
  },
  canvas: {
    sectionLabel:
      "shrink-0 font-mono text-[9px] uppercase tracking-[0.24em] text-slate-400",
    button:
      "group relative flex shrink-0 items-center rounded border border-slate-200 bg-white px-1 py-0.5 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-[transform,border-color,background-color] duration-150 hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 active:translate-y-0",
    kbd: "shrink-0 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[9px] leading-none text-slate-500 shadow-[0_1px_0_rgba(15,23,42,0.04)] group-hover:border-slate-300 group-hover:text-slate-700",
    tooltip:
      "pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] normal-case tracking-[0.02em] text-slate-700 shadow-[0_10px_28px_-20px_rgba(15,23,42,0.4)]",
    divider: "h-3.5 w-px shrink-0 bg-slate-200",
  },
};

// A single shortcut chip: shows ONLY its key-binding keycap and reveals the
// descriptive label in a FAST custom hover tooltip (~60ms) — deliberately not
// the native `title` attribute, whose show-delay is browser-fixed and slow.
// Hover AND keyboard-focus both reveal the tooltip (a11y), and the label stays
// on the button's `aria-label` so the chip is never label-less to a screenreader.
// The tooltip only exercises post-hydration (hover/focus state), so it carries
// no prerendered markup.
function ShortcutChip({
  entry,
  tokens,
  onActivate,
}: {
  entry: ShortcutEntry;
  tokens: ShortcutBarTokens;
  onActivate: (command: TilingCommand) => void;
}): React.ReactElement {
  const [isHinted, setIsHinted] = React.useState<boolean>(false);
  const timerRef = React.useRef<number | null>(null);

  const clearTimer = React.useCallback((): void => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reveal = React.useCallback((): void => {
    clearTimer();
    timerRef.current = window.setTimeout((): void => {
      setIsHinted(true);
    }, 60);
  }, [clearTimer]);

  const hide = React.useCallback((): void => {
    clearTimer();
    setIsHinted(false);
  }, [clearTimer]);

  React.useEffect((): (() => void) => clearTimer, [clearTimer]);

  return (
    <button
      type="button"
      aria-label={`${entry.label} (${entry.combo})`}
      onClick={(): void => onActivate(entry.command)}
      onMouseEnter={reveal}
      onMouseLeave={hide}
      onFocus={reveal}
      onBlur={hide}
      className={tokens.button}
    >
      <kbd className={tokens.kbd}>{entry.combo}</kbd>
      {isHinted ? (
        <span role="tooltip" className={tokens.tooltip}>
          {entry.label}
        </span>
      ) : null}
    </button>
  );
}

// The keyboard-shortcut strip hosted in the page-level bottom bar. It dogfoods
// the same context-dependent command affordances the old standalone controls
// pane carried — only shortcuts that are actionable right now are shown, each
// dispatching a REAL typed tiling command — but laid out as a dense, horizontally
// scrollable single row of keycap chips grouped by section. Returns `null` when
// nothing is actionable so the bottom bar lays out cleanly without an empty gap.
export function HomeShortcuts({
  commandHandleRef,
  layout,
  focusedLeafId,
  maximizedLeafId,
  interaction,
  skin,
}: {
  commandHandleRef: React.RefObject<TilingCommandHandle | null>;
  layout: TilingLayoutNode;
  focusedLeafId: string | null;
  maximizedLeafId: string | null;
  interaction?: TilingInteractionCapabilities;
  skin: ShortcutSkin;
}): React.ReactElement | null {
  const tokens: ShortcutBarTokens = SHORTCUT_BAR_SKIN[skin];
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

  if (visibleSections.length === 0) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="keyboard shortcuts"
      className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {visibleSections.map(
        (section: ShortcutSection, sectionIndex: number): React.ReactElement => (
          <React.Fragment key={section.id}>
            {sectionIndex > 0 ? (
              <span aria-hidden className={tokens.divider} />
            ) : null}
            <span className={tokens.sectionLabel}>{section.heading}</span>
            {section.entries.map(
              (entry: ShortcutEntry): React.ReactElement => (
                <ShortcutChip
                  key={entry.id}
                  entry={entry}
                  tokens={tokens}
                  onActivate={dispatch}
                />
              ),
            )}
          </React.Fragment>
        ),
      )}
    </div>
  );
}
