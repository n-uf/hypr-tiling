import { useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  resolveInteractionCapabilities,
  isCommandEnabled,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingCommand,
  type TilingCommandGates,
  type TilingCommandHandle,
  type TilingInteractionCapabilities,
  type TilingLayoutNode,
  type TilingTile,
  type TilingRenderTileProps,
} from "@n-uf/hypr-tiling";

// ADVANCED: build your own command bar / keyboard shortcuts. isCommandEnabled is
// the gate the renderer uses for its own shortcut chips — pass it a TilingCommand
// plus the gates derived from your resolved capabilities and it tells you whether
// the command would do anything. Use it to hide dead buttons and to keep a
// keyboard binding browser-graceful (only preventDefault when the command runs).

// Map resolved capabilities → the gate flags isCommandEnabled reads.
function gatesFor(interaction?: TilingInteractionCapabilities): TilingCommandGates {
  const caps = resolveInteractionCapabilities(interaction);
  return {
    maximizeEnabled: caps.maximize.enable,
    paneSwitchingEnabled: caps.paneSwitching.enable,
    focusEnabled: caps.focus,
    rearrangeEnabled: caps.rearrange,
    sizingEnabled: caps.paneTitleBarControls.sizing,
    acquireSpaceEnabled: caps.paneTitleBarControls.acquireSpace,
    resizeEnabled: caps.resize !== "none",
    layoutEnabled: caps.masterLayout,
    groupingEnabled: caps.grouping,
  };
}

interface BarEntry {
  readonly label: string;
  readonly key: string;
  readonly command: TilingCommand;
}

const ENTRIES: ReadonlyArray<BarEntry> = [
  { label: "Next pane", key: "]", command: { kind: "focus-cycle", direction: "next" } },
  { label: "Maximize", key: "m", command: { kind: "toggle-maximize" } },
  { label: "Master layout", key: "l", command: { kind: "cycle-layout-mode" } },
];

const tiles: TilingTile[] = [
  { id: "a", title: "One" },
  { id: "b", title: "Two" },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

export function CommandBarExample(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  const handle = useRef<TilingCommandHandle>(null);
  const gates: TilingCommandGates = gatesFor();

  // Only surface commands that are actually enabled right now.
  const available: ReadonlyArray<BarEntry> = ENTRIES.filter((entry): boolean =>
    isCommandEnabled(entry.command, gates),
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const match = available.find((entry): boolean => entry.key === event.key);
    if (match != null) {
      event.preventDefault();
      handle.current?.dispatch(match.command);
    }
  };

  return (
    <div
      onKeyDown={onKeyDown}
      tabIndex={0}
      style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", outline: "none" }}
    >
      <div style={{ display: "flex", gap: 6 }}>
        {available.map((entry): ReactElement => (
          <button
            key={entry.label}
            type="button"
            title={`shortcut: ${entry.key}`}
            onClick={(): void => handle.current?.dispatch(entry.command)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TilingRenderer
          ref={handle}
          layout={layout}
          tiles={tiles}
          config={DEFAULT_TILING_LAYOUT_CONFIG}
          onLayoutChange={setLayout}
          renderTile={({ tile }: TilingRenderTileProps): ReactNode => (
            <div style={{ padding: 12, fontSize: 13 }}>{tile.title}</div>
          )}
        />
      </div>
    </div>
  );
}
