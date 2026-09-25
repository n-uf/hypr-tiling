import * as React from "react";
import type {
  ResolvedTilingGroupTabStripOptions,
  ResolvedTilingGroupTabStripTheme,
  TilingGroupTabMember,
} from "../engine/types";
import { cn } from "./cn";

/**
 * One tab in the built-in strip. `index` is the insert slot a drop on this
 * tab requests and the 0-based position arrow keys move through.
 */
export interface GroupTabStripMember extends TilingGroupTabMember {
  index: number;
}

export interface GroupTabStripProps {
  groupId: string;
  members: ReadonlyArray<GroupTabStripMember>;
  options: ResolvedTilingGroupTabStripOptions;
  isGroupingEnabled: boolean;
  isMergeTarget: boolean;
  prefersReducedMotion: boolean;
  /**
   * When true the strip is the nested tier under a pane strip (maximized
   * group member). Shorter, indented, with a nest tick before the rail.
   */
  nested: boolean;
  setRef: (element: HTMLDivElement | null) => void;
  onActivate: (memberNumber: number) => void;
  onEject: (memberId: string) => void;
  onUngroup: () => void;
}

/** One item the shared strip paints. `selected` drives `aria-selected`. */
export interface TabStripItem {
  id: string;
  title: string;
  selected: boolean;
}

export interface TabStripProps {
  items: ReadonlyArray<TabStripItem>;
  theme: ResolvedTilingGroupTabStripTheme;
  height: number;
  prefersReducedMotion: boolean;
  ariaLabel: string;
  className: string;
  placement: "top" | "bottom";
  placementAttrName: "data-hpt-group-tab-placement" | "data-hpt-pane-tab-placement";
  isMergeTarget: boolean;
  setRef: ((element: HTMLDivElement | null) => void) | null;
  onActivate: (index: number) => void;
  onTabDoubleClick: ((index: number) => void) | null;
  renderItemLabel: (item: TabStripItem, index: number) => React.ReactNode;
  trailing: React.ReactNode;
  tabIndexAttrName: "data-member-index" | null;
  nested: boolean;
}

const TAB_MIN_WIDTH_PX: number = 56;
const TAB_STRIP_NESTED_SHORTEN_PX: number = 4;
const TAB_STRIP_NESTED_INDENT_PX: number = 18;
const TAB_RAIL_PADDING_PX: number = 2;

/** Rendered strip height: nested tier is the height token minus 4px. */
export function tabStripRenderedHeight(height: number, nested: boolean): number {
  return nested ? Math.max(0, height - TAB_STRIP_NESTED_SHORTEN_PX) : height;
}

function stripThemeStyle(
  theme: ResolvedTilingGroupTabStripTheme,
  height: number,
  nested: boolean,
): React.CSSProperties {
  return {
    height,
    boxSizing: "border-box",
    background: theme.background,
    borderColor: theme.borderColor,
    borderStyle: "solid",
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    fontFamily: theme.fontFamily,
    fontSize: theme.fontSize,
    letterSpacing: theme.letterSpacing,
    gap: theme.gap,
    paddingLeft: nested ? TAB_STRIP_NESTED_INDENT_PX : theme.paddingX,
    paddingRight: theme.paddingX,
    position: "relative",
    zIndex: 1,
    ["--hpt-group-tab-strip-background" as string]: theme.background,
    ["--hpt-group-tab-strip-border" as string]: theme.borderColor,
    ["--hpt-group-tab-color" as string]: theme.tabColor,
    ["--hpt-group-tab-hover-color" as string]: theme.tabHoverColor,
    ["--hpt-group-tab-active-color" as string]: theme.tabActiveColor,
    ["--hpt-group-tab-background" as string]: theme.tabBackground,
    ["--hpt-group-tab-active-background" as string]: theme.tabActiveBackground,
    ["--hpt-group-tab-accent" as string]: theme.accent,
    ["--hpt-group-tab-font-family" as string]: theme.fontFamily,
    ["--hpt-group-tab-font-size" as string]: theme.fontSize,
    ["--hpt-group-tab-letter-spacing" as string]: theme.letterSpacing,
    ["--hpt-group-tab-radius" as string]: theme.radius,
    ["--hpt-group-tab-gap" as string]: theme.gap,
    ["--hpt-group-tab-padding-x" as string]: theme.paddingX,
    ["--hpt-group-tab-control" as string]: theme.controlColor,
    ["--hpt-group-tab-control-hover" as string]: theme.controlHoverColor,
    ["--hpt-group-tab-strip-height" as string]: `${height}px`,
    ["--hpt-group-tab-rail-background" as string]: theme.railBackground,
    ["--hpt-group-tab-rail-border" as string]: theme.railBorderColor,
    ["--hpt-group-tab-nested-active-background" as string]: theme.nestedTabActiveBackground,
    ["--hpt-group-tab-nested-active-color" as string]: theme.nestedTabActiveColor,
    ["--hpt-tab-strip-nested" as string]: nested ? "true" : "false",
  };
}

function railThemeStyle(theme: ResolvedTilingGroupTabStripTheme): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    boxSizing: "border-box",
    minWidth: 0,
    maxWidth: "100%",
    flex: "0 1 auto",
    overflow: "hidden",
    padding: TAB_RAIL_PADDING_PX,
    gap: theme.gap,
    background: theme.railBackground,
    borderColor: theme.railBorderColor,
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: `calc(${theme.radius} + 2px)`,
    ["--hpt-group-tab-rail-background" as string]: theme.railBackground,
    ["--hpt-group-tab-rail-border" as string]: theme.railBorderColor,
  };
}

/**
 * Shared `role="tablist"` strip: theme tokens as `--hpt-group-tab-*` custom
 * properties, arrow / Home / End activation. Used by the group strip and the
 * top-level pane strip.
 */
export function TabStrip(props: TabStripProps): React.ReactElement {
  const {
    items,
    theme,
    height,
    prefersReducedMotion,
    ariaLabel,
    className,
    placement,
    placementAttrName,
    isMergeTarget,
    setRef,
    onActivate,
    onTabDoubleClick,
    renderItemLabel,
    trailing,
    tabIndexAttrName,
    nested,
  } = props;
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocusIndex = React.useRef<number | null>(null);
  const selectedId: string =
    items.find((item: TabStripItem): boolean => item.selected)?.id ?? "";
  const [hoveredTabId, setHoveredTabId] = React.useState<string | null>(null);

  React.useEffect((): void => {
    const index: number | null = pendingFocusIndex.current;
    if (index == null) {
      return;
    }
    pendingFocusIndex.current = null;
    tabRefs.current[index]?.focus();
  }, [selectedId]);

  const indicatorTransition: string = prefersReducedMotion
    ? "none"
    : "color 160ms ease, background-color 160ms ease";

  function moveTo(index: number): void {
    if (items.length === 0) {
      return;
    }
    const wrapped: number = (index + items.length) % items.length;
    pendingFocusIndex.current = wrapped;
    onActivate(wrapped);
  }

  function onTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      moveTo(index + 1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      moveTo(index - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      moveTo(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      moveTo(items.length - 1);
    }
  }

  const placementAttrs: Record<string, string> = {
    [placementAttrName]: placement,
  };

  const activeBackground: string = nested
    ? theme.nestedTabActiveBackground
    : theme.tabActiveBackground;
  const activeColor: string = nested ? theme.nestedTabActiveColor : theme.tabActiveColor;

  return (
    <div
      ref={setRef ?? undefined}
      role="tablist"
      aria-label={ariaLabel}
      data-hpt-reduced-motion={prefersReducedMotion ? "true" : "false"}
      data-nested={nested ? "true" : undefined}
      className={cn(
        "hpt-tab-strip flex shrink-0 items-center overflow-hidden",
        className,
        isMergeTarget ? "ring-2 ring-violet-400/50" : "",
      )}
      style={stripThemeStyle(theme, height, nested)}
      {...placementAttrs}
    >
      {nested ? (
        <span
          aria-hidden="true"
          data-hpt-tab-strip-nest-tick=""
          className="hpt-tab-strip-nest-tick shrink-0"
          style={{
            color: theme.controlColor,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          └
        </span>
      ) : null}
      <div className="hpt-tab-strip-rail" style={railThemeStyle(theme)}>
        {items.map((item: TabStripItem, index: number): React.ReactElement => {
          const hovered: boolean = hoveredTabId === item.id;
          const tabColor: string = item.selected
            ? activeColor
            : hovered
              ? theme.tabHoverColor
              : theme.tabColor;
          const indexAttrs: Record<string, number> =
            tabIndexAttrName != null ? { [tabIndexAttrName]: index } : {};
          return (
            <button
              key={item.id}
              ref={(element: HTMLButtonElement | null): void => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              aria-selected={item.selected}
              tabIndex={item.selected ? 0 : -1}
              title={item.title}
              onClick={(): void => {
                onActivate(index);
              }}
              onDoubleClick={
                onTabDoubleClick != null
                  ? (): void => {
                      onTabDoubleClick(index);
                    }
                  : undefined
              }
              onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>): void => {
                onTabKeyDown(event, index);
              }}
              onMouseEnter={(): void => {
                setHoveredTabId(item.id);
              }}
              onMouseLeave={(): void => {
                setHoveredTabId((current: string | null): string | null =>
                  current === item.id ? null : current,
                );
              }}
              className="hpt-group-tab flex min-w-0 items-center overflow-hidden outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--hpt-group-tab-accent)]"
              style={{
                flex: "0 1 auto",
                flexGrow: 0,
                minWidth: TAB_MIN_WIDTH_PX,
                maxWidth: "100%",
                color: tabColor,
                background: item.selected ? activeBackground : theme.tabBackground,
                borderRadius: theme.radius,
                opacity: 1,
                transition: indicatorTransition,
                paddingTop: 3,
                paddingBottom: 3,
                paddingLeft: 10,
                paddingRight: 10,
              }}
              {...indexAttrs}
            >
              <span
                className="min-w-0 overflow-hidden text-left"
                style={{ textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {renderItemLabel(item, index)}
              </span>
            </button>
          );
        })}
      </div>
      {trailing != null ? (
        <div className="ml-auto flex shrink-0 items-center">{trailing}</div>
      ) : null}
    </div>
  );
}

/**
 * Built-in group tab strip. Tabs truncate, arrow keys move activation, and
 * the right end ejects the active member or ungroups. Theme tokens are CSS
 * custom properties on the strip element (same resolve-then-apply path as
 * `dragChrome`).
 */
export function GroupTabStrip(props: GroupTabStripProps): React.ReactElement {
  const {
    groupId,
    members,
    options,
    isGroupingEnabled,
    isMergeTarget,
    prefersReducedMotion,
    nested,
    setRef,
    onActivate,
    onEject,
    onUngroup,
  } = props;
  const theme = options.theme;
  const [hoveredControl, setHoveredControl] = React.useState<"eject" | "ungroup" | null>(null);
  const showEject: boolean = isGroupingEnabled && options.showEject;
  const showUngroup: boolean = isGroupingEnabled && options.showUngroup;
  const activeMember: GroupTabStripMember | undefined = members.find(
    (member: GroupTabStripMember): boolean => member.active,
  );
  const items: ReadonlyArray<TabStripItem> = members.map(
    (member: GroupTabStripMember): TabStripItem => ({
      id: member.id,
      title: member.title,
      selected: member.active,
    }),
  );

  const trailing: React.ReactNode = (
    <>
      {showEject && activeMember != null ? (
        <button
          type="button"
          data-hpt-group-eject=""
          aria-label={`Eject ${activeMember.title}`}
          title={`Eject ${activeMember.title}`}
          onMouseEnter={(): void => {
            setHoveredControl("eject");
          }}
          onMouseLeave={(): void => {
            setHoveredControl((current: "eject" | "ungroup" | null): "eject" | "ungroup" | null =>
              current === "eject" ? null : current,
            );
          }}
          onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
            event.stopPropagation();
            onEject(activeMember.id);
          }}
          className="hpt-group-tab-eject shrink-0 px-1.5 outline-none"
          style={{
            color: hoveredControl === "eject" ? theme.controlHoverColor : theme.controlColor,
          }}
        >
          ×
        </button>
      ) : null}
      {showUngroup ? (
        <button
          type="button"
          data-hpt-group-ungroup=""
          aria-label="Ungroup"
          title="Ungroup"
          onMouseEnter={(): void => {
            setHoveredControl("ungroup");
          }}
          onMouseLeave={(): void => {
            setHoveredControl((current: "eject" | "ungroup" | null): "eject" | "ungroup" | null =>
              current === "ungroup" ? null : current,
            );
          }}
          onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
            event.stopPropagation();
            onUngroup();
          }}
          className="hpt-group-tab-ungroup shrink-0 px-1.5 outline-none"
          style={{
            color: hoveredControl === "ungroup" ? theme.controlHoverColor : theme.controlColor,
          }}
        >
          <UngroupGlyph />
        </button>
      ) : null}
    </>
  );

  return (
    <TabStrip
      items={items}
      theme={theme}
      height={tabStripRenderedHeight(options.height, nested)}
      prefersReducedMotion={prefersReducedMotion}
      ariaLabel={`group ${groupId} members`}
      className="hpt-group-tab-strip"
      placement={options.placement}
      placementAttrName="data-hpt-group-tab-placement"
      isMergeTarget={isMergeTarget}
      setRef={setRef}
      onActivate={(index: number): void => {
        onActivate(index + 1);
      }}
      onTabDoubleClick={null}
      renderItemLabel={(item: TabStripItem, index: number): React.ReactNode => {
        const member: GroupTabStripMember | undefined = members[index];
        if (member == null) {
          return item.title;
        }
        return options.renderTabLabel != null ? options.renderTabLabel(member) : member.title;
      }}
      trailing={trailing}
      tabIndexAttrName="data-member-index"
      nested={nested}
    />
  );
}

function UngroupGlyph(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="4" height="4" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="7" y="7" width="4" height="4" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
