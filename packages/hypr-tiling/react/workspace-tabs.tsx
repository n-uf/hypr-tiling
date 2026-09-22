/**
 * Headless workspace tab strip (`_agent/workspace-set-concept.md` §5.4):
 * `useTilingWorkspaceTabs` owns the WAI-ARIA `tablist` / `tab` semantics,
 * roving focus, the keyboard model (arrows / Home / End / Enter / F2 /
 * Delete), rename + close affordance hooks and the drop-target wiring to the
 * renderer (`resolveExternalDragHover` hit-tests the registered tab rects, so
 * the host never writes one). It paints NOTHING: the only classes it emits
 * are the theme's `workspaceTab*` tokens (absent by default). The render-prop
 * `TilingWorkspaceTabs` is the same hook for hosts that prefer JSX.
 */
import * as React from "react";
import type {
  TilingClientPoint,
  TilingExternalDragHover,
  TilingExternalDragHoverResolver,
  TilingWorkspacePlacement,
} from "../engine/types";
import {
  createWorkspace,
  deleteWorkspace,
  renameWorkspace,
  switchWorkspace,
  type CreateWorkspaceInput,
  type TilingDeleteWorkspaceResult,
  type TilingWorkspace,
  type TilingWorkspaceSet,
} from "../engine/workspace-set";
import {
  resolveWorkspaceTabHover,
  resolveWorkspaceTabKey,
  type TilingWorkspaceTabKeyAction,
  type TilingWorkspaceTabTarget,
  type TilingWorkspaceTabsOrientation,
} from "../engine/workspace-tabs";
import { cn } from "./cn";
import { useTilingTheme, type TilingTheme } from "./theme";

/** Options of {@link useTilingWorkspaceTabs}. */
export interface UseTilingWorkspaceTabsOptions {
  /** The controlled workspace set the strip presents (the same object the renderer gets). */
  readonly workspaces: TilingWorkspaceSet;
  /** Receives the next set for every edit the strip performs (switch, rename, close, create). */
  readonly onWorkspacesChange: (workspaces: TilingWorkspaceSet) => void;
  /**
   * Prefix for the generated DOM ids: tabs are `${idPrefix}-tab-${workspaceId}`,
   * panels `${idPrefix}-panel-${workspaceId}`. Default `"hpt-workspace"`.
   */
  readonly idPrefix?: string;
  /** Arrow keys that move focus. Default `"horizontal"` (Left / Right). */
  readonly orientation?: TilingWorkspaceTabsOrientation;
  /**
   * `"manual"` (default, WAI-ARIA recommended for tabs that swap heavy
   * content): arrows move focus, Enter / Space activates. `"automatic"`:
   * moving focus also activates.
   */
  readonly activation?: "manual" | "automatic";
  /**
   * The rename affordance: F2 on a focused tab (or `tab.requestRename()`)
   * asks the host to open its editor; the host commits with
   * `tab.rename(name)`. Absent → F2 is not handled.
   */
  readonly onRenameRequest?: (workspace: TilingWorkspace) => void;
  /**
   * The close affordance: Delete on a focused tab (or `tab.requestClose()`)
   * asks the host to confirm; the host commits with `tab.close()`. Absent →
   * Delete is not handled.
   */
  readonly onCloseRequest?: (workspace: TilingWorkspace) => void;
  /**
   * Where a leaf dropped on a workspace's tab lands in that workspace.
   * Undefined → the engine default (root, second side).
   */
  readonly dropPlacement?: (workspace: TilingWorkspace) => TilingWorkspacePlacement | undefined;
  /**
   * Theme whose `workspaceTab*` tokens class the strip. Default: the
   * `TilingThemeProvider` context, else the library default theme.
   */
  readonly theme?: TilingTheme;
}

/** Props {@link TilingWorkspaceTab.tabProps} hands to the `tab` element. */
export interface TilingWorkspaceTabElementProps {
  /** WAI-ARIA role. */
  readonly role: "tab";
  /** `${idPrefix}-tab-${workspaceId}` — also the drop target's `targetId`. */
  readonly id: string;
  /** Keeps a `<button>` out of form submission. */
  readonly type: "button";
  /** `true` on the set's active workspace. */
  readonly "aria-selected": boolean;
  /** The matching `tabpanel` id. */
  readonly "aria-controls": string;
  /** Roving focus: `0` on the focused tab, `-1` elsewhere. */
  readonly tabIndex: 0 | -1;
  /** Theme `workspaceTab` (+ `workspaceTabActive` / `workspaceTabDropTarget`) tokens; `undefined` when unstyled. */
  readonly className: string | undefined;
  /** The workspace id, for styling hooks and tests. */
  readonly "data-workspace-id": string;
  /** Present (`""`) on the active tab. */
  readonly "data-active": "" | undefined;
  /** Present (`""`) while a dragged leaf hovers this tab. */
  readonly "data-drop-target": "" | undefined;
  /** Registers the element for focus management and drop hit-testing. */
  readonly ref: (element: HTMLElement | null) => void;
  /** Activates the workspace and takes the roving focus. */
  readonly onClick: () => void;
  /** Takes the roving focus. */
  readonly onFocus: () => void;
  /** The keyboard model (arrows / Home / End / Enter / Space / F2 / Delete). */
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

/** Props {@link UseTilingWorkspaceTabsResult.tablistProps} hands to the `tablist` element. */
export interface TilingWorkspaceTablistElementProps {
  /** WAI-ARIA role. */
  readonly role: "tablist";
  /** The strip's axis (drives which arrow keys move focus). */
  readonly "aria-orientation": TilingWorkspaceTabsOrientation;
  /** Theme `workspaceTabs` token; `undefined` when unstyled. */
  readonly className: string | undefined;
}

/** Props {@link UseTilingWorkspaceTabsResult.panelProps} hands to a workspace's `tabpanel`. */
export interface TilingWorkspacePanelElementProps {
  /** WAI-ARIA role. */
  readonly role: "tabpanel";
  /** `${idPrefix}-panel-${workspaceId}`. */
  readonly id: string;
  /** The owning tab's id. */
  readonly "aria-labelledby": string;
  /** `true` for every workspace but the active one. */
  readonly hidden: boolean;
}

/** One workspace as the strip presents it. */
export interface TilingWorkspaceTab {
  /** The workspace this tab presents. */
  readonly workspace: TilingWorkspace;
  /** Position in the strip. */
  readonly index: number;
  /** The `tab` element's DOM id. */
  readonly id: string;
  /** Is this the set's active workspace. */
  readonly isActive: boolean;
  /** Does this tab hold the roving focus (the one `tabIndex: 0` tab). */
  readonly isFocused: boolean;
  /** Is a dragged leaf hovering this tab (the renderer's resolved workspace-tab hover). */
  readonly isDropTarget: boolean;
  /** Spread onto the `tab` element (a `<button>`). */
  readonly tabProps: TilingWorkspaceTabElementProps;
  /** Switch to this workspace. */
  readonly activate: () => void;
  /** Rename; `false` when the engine refused (empty / over-long / unchanged name). */
  readonly rename: (name: string) => boolean;
  /** Delete this workspace (refused for the last one). Returns the engine result. */
  readonly close: () => TilingDeleteWorkspaceResult;
  /** Fire the host's rename affordance (`onRenameRequest`). */
  readonly requestRename: () => void;
  /** Fire the host's close affordance (`onCloseRequest`). */
  readonly requestClose: () => void;
}

/** What {@link useTilingWorkspaceTabs} returns. */
export interface UseTilingWorkspaceTabsResult {
  /** One entry per workspace, in set order. */
  readonly tabs: ReadonlyArray<TilingWorkspaceTab>;
  /** The set's active tab (`null` only for a dangling `activeId`). */
  readonly activeTab: TilingWorkspaceTab | null;
  /** Spread onto the `tablist` element. */
  readonly tablistProps: TilingWorkspaceTablistElementProps;
  /** Props for the `tabpanel` presenting `workspaceId` (the renderer's container, typically). */
  readonly panelProps: (workspaceId: string) => TilingWorkspacePanelElementProps;
  /** The workspace whose tab a dragged leaf is hovering, else `null`. */
  readonly dropTargetWorkspaceId: string | null;
  /**
   * Spread onto `TilingRenderer`: the tab hit-test as
   * `resolveExternalDragHover` plus `onExternalDragHoverChange` feeding
   * `isDropTarget` back. No host hit-test, no host claim.
   */
  readonly rendererProps: {
    readonly resolveExternalDragHover: TilingExternalDragHoverResolver;
    readonly onExternalDragHoverChange: (hover: TilingExternalDragHover | null) => void;
  };
  /** Create a workspace (`createWorkspace`); `false` when the engine refused. */
  readonly create: (input: CreateWorkspaceInput) => boolean;
  /** Move the roving focus to a tab (and focus its element). */
  readonly focusTab: (workspaceId: string) => void;
}

const DEFAULT_ID_PREFIX: string = "hpt-workspace";

/**
 * Headless workspace tab strip over a controlled {@link TilingWorkspaceSet}.
 * Returns per-tab props (`role="tab"`, `aria-selected`, roving `tabIndex`,
 * keyboard handling), `tablist` / `tabpanel` props, rename / close
 * affordances, and the renderer props that make every tab a native drop
 * target. Renders nothing itself.
 */
export function useTilingWorkspaceTabs(
  options: UseTilingWorkspaceTabsOptions,
): UseTilingWorkspaceTabsResult {
  const {
    workspaces,
    onWorkspacesChange,
    idPrefix = DEFAULT_ID_PREFIX,
    orientation = "horizontal",
    activation = "manual",
    onRenameRequest,
    onCloseRequest,
    dropPlacement,
    theme: themeOption,
  } = options;
  const contextTheme: TilingTheme = useTilingTheme();
  const theme: TilingTheme = themeOption ?? contextTheme;

  // Roving focus follows the active workspace until the user moves it.
  const [focusedWorkspaceId, setFocusedWorkspaceId] = React.useState<string | null>(null);
  const [dropTargetWorkspaceId, setDropTargetWorkspaceId] = React.useState<string | null>(null);
  const elementsRef = React.useRef<Map<string, HTMLElement>>(new Map<string, HTMLElement>());
  const workspacesRef = React.useRef<TilingWorkspaceSet>(workspaces);
  workspacesRef.current = workspaces;
  const onWorkspacesChangeRef = React.useRef(onWorkspacesChange);
  onWorkspacesChangeRef.current = onWorkspacesChange;
  const dropPlacementRef = React.useRef(dropPlacement);
  dropPlacementRef.current = dropPlacement;

  const ids: ReadonlyArray<string> = workspaces.workspaces.map(
    (workspace: TilingWorkspace): string => workspace.id,
  );
  const resolvedFocusedId: string =
    focusedWorkspaceId != null && ids.includes(focusedWorkspaceId)
      ? focusedWorkspaceId
      : ids.includes(workspaces.activeId)
        ? workspaces.activeId
        : (ids[0] ?? "");

  const commit = React.useCallback((next: TilingWorkspaceSet): boolean => {
    if (next === workspacesRef.current) {
      return false;
    }
    onWorkspacesChangeRef.current(next);
    return true;
  }, []);

  const focusTab = React.useCallback((workspaceId: string): void => {
    setFocusedWorkspaceId(workspaceId);
    elementsRef.current.get(workspaceId)?.focus();
  }, []);

  const activate = React.useCallback(
    (workspaceId: string): void => {
      commit(switchWorkspace(workspacesRef.current, workspaceId));
    },
    [commit],
  );

  const resolveExternalDragHover: TilingExternalDragHoverResolver = React.useCallback(
    (point: TilingClientPoint): TilingExternalDragHover | null => {
      const targets: TilingWorkspaceTabTarget[] = [];
      for (const workspace of workspacesRef.current.workspaces) {
        const element: HTMLElement | undefined = elementsRef.current.get(workspace.id);
        if (element == null) {
          continue;
        }
        const rect: DOMRect = element.getBoundingClientRect();
        const placement: TilingWorkspacePlacement | undefined =
          dropPlacementRef.current?.(workspace);
        targets.push({
          targetId: element.id,
          workspaceId: workspace.id,
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          ...(placement === undefined ? {} : { placement }),
        });
      }
      return resolveWorkspaceTabHover(targets, point);
    },
    [],
  );
  const onExternalDragHoverChange = React.useCallback(
    (hover: TilingExternalDragHover | null): void => {
      setDropTargetWorkspaceId(hover?.kind === "workspace-tab" ? hover.workspaceId : null);
    },
    [],
  );
  const rendererProps: UseTilingWorkspaceTabsResult["rendererProps"] = React.useMemo(
    () => ({ resolveExternalDragHover, onExternalDragHoverChange }),
    [resolveExternalDragHover, onExternalDragHoverChange],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>, workspace: TilingWorkspace): void => {
      const current: TilingWorkspaceSet = workspacesRef.current;
      const orderedIds: ReadonlyArray<string> = current.workspaces.map(
        (candidate: TilingWorkspace): string => candidate.id,
      );
      const action: TilingWorkspaceTabKeyAction | null = resolveWorkspaceTabKey(
        event.key,
        orderedIds.indexOf(workspace.id),
        orderedIds.length,
        orientation,
      );
      if (action == null) {
        return;
      }
      if (action.kind === "rename" && onRenameRequest == null) {
        return;
      }
      if (action.kind === "close" && onCloseRequest == null) {
        return;
      }
      event.preventDefault();
      switch (action.kind) {
        case "focus": {
          const targetId: string = orderedIds[action.index];
          focusTab(targetId);
          if (activation === "automatic") {
            activate(targetId);
          }
          return;
        }
        case "activate":
          activate(workspace.id);
          return;
        case "rename":
          onRenameRequest?.(workspace);
          return;
        case "close":
          onCloseRequest?.(workspace);
          return;
      }
    },
    [activate, activation, focusTab, onCloseRequest, onRenameRequest, orientation],
  );

  const tabs: ReadonlyArray<TilingWorkspaceTab> = React.useMemo(
    (): ReadonlyArray<TilingWorkspaceTab> =>
      workspaces.workspaces.map((workspace: TilingWorkspace, index: number): TilingWorkspaceTab => {
        const isActive: boolean = workspace.id === workspaces.activeId;
        const isFocused: boolean = workspace.id === resolvedFocusedId;
        const isDropTarget: boolean = workspace.id === dropTargetWorkspaceId;
        const id: string = `${idPrefix}-tab-${workspace.id}`;
        const className: string = cn(
          theme.workspaceTab,
          isActive ? theme.workspaceTabActive : undefined,
          isDropTarget ? theme.workspaceTabDropTarget : undefined,
        );
        return {
          workspace,
          index,
          id,
          isActive,
          isFocused,
          isDropTarget,
          tabProps: {
            role: "tab",
            id,
            type: "button",
            "aria-selected": isActive,
            "aria-controls": `${idPrefix}-panel-${workspace.id}`,
            tabIndex: isFocused ? 0 : -1,
            className: className === "" ? undefined : className,
            "data-workspace-id": workspace.id,
            "data-active": isActive ? "" : undefined,
            "data-drop-target": isDropTarget ? "" : undefined,
            ref: (element: HTMLElement | null): void => {
              if (element == null) {
                elementsRef.current.delete(workspace.id);
              } else {
                elementsRef.current.set(workspace.id, element);
              }
            },
            onClick: (): void => {
              setFocusedWorkspaceId(workspace.id);
              activate(workspace.id);
            },
            onFocus: (): void => {
              setFocusedWorkspaceId(workspace.id);
            },
            onKeyDown: (event: React.KeyboardEvent<HTMLElement>): void => {
              handleKeyDown(event, workspace);
            },
          },
          activate: (): void => {
            activate(workspace.id);
          },
          rename: (name: string): boolean =>
            commit(renameWorkspace(workspacesRef.current, workspace.id, name)),
          close: (): TilingDeleteWorkspaceResult => {
            const result: TilingDeleteWorkspaceResult = deleteWorkspace(
              workspacesRef.current,
              workspace.id,
            );
            commit(result.set);
            return result;
          },
          requestRename: (): void => {
            onRenameRequest?.(workspace);
          },
          requestClose: (): void => {
            onCloseRequest?.(workspace);
          },
        };
      }),
    [
      activate,
      commit,
      dropTargetWorkspaceId,
      handleKeyDown,
      idPrefix,
      onCloseRequest,
      onRenameRequest,
      resolvedFocusedId,
      theme.workspaceTab,
      theme.workspaceTabActive,
      theme.workspaceTabDropTarget,
      workspaces,
    ],
  );

  const activeTab: TilingWorkspaceTab | null =
    tabs.find((tab: TilingWorkspaceTab): boolean => tab.isActive) ?? null;

  const tablistProps: TilingWorkspaceTablistElementProps = React.useMemo(
    () => ({
      role: "tablist",
      "aria-orientation": orientation,
      className: theme.workspaceTabs,
    }),
    [orientation, theme.workspaceTabs],
  );

  const panelProps = React.useCallback(
    (workspaceId: string): TilingWorkspacePanelElementProps => ({
      role: "tabpanel",
      id: `${idPrefix}-panel-${workspaceId}`,
      "aria-labelledby": `${idPrefix}-tab-${workspaceId}`,
      hidden: workspaceId !== workspacesRef.current.activeId,
    }),
    [idPrefix],
  );

  const create = React.useCallback(
    (input: CreateWorkspaceInput): boolean =>
      commit(createWorkspace(workspacesRef.current, input)),
    [commit],
  );

  return {
    tabs,
    activeTab,
    tablistProps,
    panelProps,
    dropTargetWorkspaceId,
    rendererProps,
    create,
    focusTab,
  };
}

/** Props of {@link TilingWorkspaceTabs}: the hook options plus the render prop. */
export interface TilingWorkspaceTabsProps extends UseTilingWorkspaceTabsOptions {
  /** Receives the hook result; return the strip's markup. */
  readonly children: (tabs: UseTilingWorkspaceTabsResult) => React.ReactNode;
}

/**
 * Render-prop form of {@link useTilingWorkspaceTabs}. Paints nothing itself.
 *
 * @example
 * ```tsx
 * <TilingWorkspaceTabs workspaces={set} onWorkspacesChange={setSet}>
 *   {({ tabs, tablistProps }) => (
 *     <div {...tablistProps}>
 *       {tabs.map((tab) => (
 *         <button key={tab.workspace.id} {...tab.tabProps}>{tab.workspace.name}</button>
 *       ))}
 *     </div>
 *   )}
 * </TilingWorkspaceTabs>
 * ```
 */
export function TilingWorkspaceTabs({
  children,
  ...options
}: TilingWorkspaceTabsProps): React.ReactElement {
  const result: UseTilingWorkspaceTabsResult = useTilingWorkspaceTabs(options);
  return <>{children(result)}</>;
}
