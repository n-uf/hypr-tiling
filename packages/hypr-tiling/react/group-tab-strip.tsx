import * as React from "react";
import type {
  ResolvedTilingGroupTabStripOptions,
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
  setRef: (element: HTMLDivElement | null) => void;
  onActivate: (memberNumber: number) => void;
  onEject: (memberId: string) => void;
  onUngroup: () => void;
}

const TAB_MIN_WIDTH_PX: number = 36;

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
    setRef,
    onActivate,
    onEject,
    onUngroup,
  } = props;
  const theme = options.theme;
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocusIndex = React.useRef<number | null>(null);
  const activeMemberId: string =
    members.find((member: GroupTabStripMember): boolean => member.active)?.id ?? "";
  const [hoveredControl, setHoveredControl] = React.useState<"eject" | "ungroup" | null>(null);
  const [hoveredTabId, setHoveredTabId] = React.useState<string | null>(null);

  React.useEffect((): void => {
    const index: number | null = pendingFocusIndex.current;
    if (index == null) {
      return;
    }
    pendingFocusIndex.current = null;
    tabRefs.current[index]?.focus();
  }, [activeMemberId]);

  const stripStyle: React.CSSProperties = {
    height: options.height,
    boxSizing: "border-box",
    background: theme.background,
    borderColor: theme.borderColor,
    borderStyle: "solid",
    borderWidth: 1,
    fontFamily: theme.fontFamily,
    fontSize: theme.fontSize,
    letterSpacing: theme.letterSpacing,
    gap: theme.gap,
    paddingLeft: theme.paddingX,
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
    ["--hpt-group-tab-strip-height" as string]: `${options.height}px`,
  };

  const indicatorTransition: string = prefersReducedMotion
    ? "none"
    : "box-shadow 160ms ease, color 160ms ease, background-color 160ms ease";

  function moveTo(index: number): void {
    if (members.length === 0) {
      return;
    }
    const wrapped: number = (index + members.length) % members.length;
    pendingFocusIndex.current = wrapped;
    onActivate(wrapped + 1);
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
      moveTo(members.length - 1);
    }
  }

  const showEject: boolean = isGroupingEnabled && options.showEject;
  const showUngroup: boolean = isGroupingEnabled && options.showUngroup;
  const activeMember: GroupTabStripMember | undefined = members.find(
    (member: GroupTabStripMember): boolean => member.active,
  );

  return (
    <div
      ref={setRef}
      role="tablist"
      aria-label={`group ${groupId} members`}
      data-hpt-group-tab-placement={options.placement}
      data-hpt-reduced-motion={prefersReducedMotion ? "true" : "false"}
      className={cn(
        "hpt-group-tab-strip flex shrink-0 items-stretch overflow-hidden",
        isMergeTarget ? "ring-2 ring-violet-400/50" : "",
      )}
      style={stripStyle}
    >
      {members.map((member: GroupTabStripMember): React.ReactElement => {
        const label: React.ReactNode =
          options.renderTabLabel != null ? options.renderTabLabel(member) : member.title;
        const hovered: boolean = hoveredTabId === member.id;
        const tabColor: string = member.active
          ? theme.tabActiveColor
          : hovered
            ? theme.tabHoverColor
            : theme.tabColor;
        return (
          <button
            key={member.id}
            ref={(element: HTMLButtonElement | null): void => {
              tabRefs.current[member.index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={member.active}
            tabIndex={member.active ? 0 : -1}
            data-member-index={member.index}
            title={member.title}
            onClick={(): void => {
              onActivate(member.index + 1);
            }}
            onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>): void => {
              onTabKeyDown(event, member.index);
            }}
            onMouseEnter={(): void => {
              setHoveredTabId(member.id);
            }}
            onMouseLeave={(): void => {
              setHoveredTabId((current: string | null): string | null =>
                current === member.id ? null : current,
              );
            }}
            className="hpt-group-tab flex min-w-0 items-center overflow-hidden outline-none"
            style={{
              flex: "1 1 0%",
              minWidth: TAB_MIN_WIDTH_PX,
              maxWidth: "100%",
              color: tabColor,
              background: member.active ? theme.tabActiveBackground : theme.tabBackground,
              borderRadius: theme.radius,
              boxShadow: member.active ? "inset 0 2px 0 var(--hpt-group-tab-accent)" : "none",
              opacity: 1,
              transition: indicatorTransition,
              paddingLeft: 8,
              paddingRight: 8,
            }}
          >
            <span
              className="min-w-0 flex-1 overflow-hidden text-left"
              style={{ textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {label}
            </span>
          </button>
        );
      })}
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
    </div>
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
