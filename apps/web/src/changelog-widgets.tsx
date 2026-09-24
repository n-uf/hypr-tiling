import * as React from "react";
import {
  queryWorkspaceSet,
  TILING_ACCENT_HUES,
  TILING_TILE_ACCENTS,
  useWorkspaceSwipe,
  type TilingAccentHue,
  type TilingTile,
  type TilingTileAccent,
  type TilingWorkspace,
  type TilingWorkspaceSet,
  type TilingWorkspaceSetQuery,
  type TilingWorkspaceSwitchEvent,
  type TilingWorkspaceSwipeSnapshot,
} from "@n-uf/hypr-tiling";
import {
  breakingChangeGroups,
  CHANGELOG_RELEASES,
  changelogInlinesText,
  latestPublishedRelease,
  LIBRARY_NPM_URL,
  LIBRARY_PACKAGE_NAME,
  LIBRARY_REPOSITORY_URL,
  LIBRARY_VERSION,
  releaseBullets,
  releaseLead,
  type BreakingReleaseGroup,
  type ChangelogBullet,
  type ChangelogInline,
  type ChangelogRelease,
} from "./changelog";
import { INSTALL_SNIPPET } from "./docs";

// Homepage Changelog workspace widgets. Bodies are plain styled DOM (lists,
// bars, mono text) that paint identically on SSR and the first client render.
// Live values (swipe phase, last switch) start at their idle/empty snapshots
// and refine after mount. Chrome titles come from the `TilingTile` pool.

export type ChangelogWidgetSkin = "mosaic" | "editorial" | "canvas";

export const CHANGELOG_WIDGET_TILE_IDS: ReadonlyArray<string> = [
  "release-timeline",
  "latest-release",
  "breaking-changes",
  "version-install",
  "set-inspector",
  "swipe-meter",
];

interface WidgetSkinTokens {
  readonly body: string;
  readonly row: string;
  readonly rowCurrent: string;
  readonly version: string;
  readonly date: string;
  readonly lead: string;
  readonly bullet: string;
  readonly breaking: string;
  readonly mono: string;
  readonly link: string;
  readonly barTrack: string;
  readonly barFill: string;
  readonly hint: string;
  readonly activeRow: string;
  readonly flashRow: string;
  readonly pre: string;
}

const WIDGET_SKIN: Record<ChangelogWidgetSkin, WidgetSkinTokens> = {
  mosaic: {
    body: "flex min-h-0 flex-col gap-2 font-mono text-[11px] leading-[1.45] text-stone-300",
    row: "flex flex-col gap-0.5 border-l border-white/[0.08] py-1.5 pl-2.5",
    rowCurrent: "flex flex-col gap-0.5 border-l border-amber-300/55 bg-amber-300/[0.06] py-1.5 pl-2.5",
    version: "font-semibold uppercase tracking-[0.12em] text-stone-100",
    date: "text-[10px] tracking-[0.08em] text-stone-500",
    lead: "text-[11px] leading-[1.45] text-stone-400",
    bullet: "text-[11px] leading-[1.5] text-stone-300",
    breaking:
      "mr-1.5 inline-block font-mono text-[9px] uppercase tracking-[0.18em] text-rose-300/90",
    mono: "font-mono text-[11px] text-stone-200",
    link: "text-amber-200/90 underline decoration-amber-300/40 underline-offset-[3px] hover:text-amber-100",
    barTrack: "h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]",
    barFill: "h-full rounded-full bg-amber-300/80 motion-reduce:transition-none",
    hint: "text-[10px] leading-[1.45] text-stone-500",
    activeRow: "border-l border-amber-300/55 bg-amber-300/[0.08]",
    flashRow:
      "border-l border-amber-200 bg-amber-300/20 motion-reduce:bg-amber-300/15",
    pre: "overflow-x-auto rounded border border-white/[0.08] bg-[#0a0b0d] px-2 py-1.5 font-mono text-[10px] text-stone-200",
  },
  editorial: {
    body: "flex min-h-0 flex-col gap-2 font-mono text-[11px] leading-[1.5] text-[#5c5344]",
    row: "flex flex-col gap-0.5 border-l border-[#e2dac6] py-1.5 pl-2.5",
    rowCurrent:
      "flex flex-col gap-0.5 border-l border-[#241f17] bg-[#efe8d6] py-1.5 pl-2.5",
    version: "font-semibold uppercase tracking-[0.12em] text-[#241f17]",
    date: "text-[10px] tracking-[0.08em] text-[#9c8f77]",
    lead: "text-[11px] leading-[1.5] text-[#6b6250]",
    bullet: "text-[11px] leading-[1.5] text-[#4b4335]",
    breaking:
      "mr-1.5 inline-block font-mono text-[9px] uppercase tracking-[0.18em] text-[#9a3d2f]",
    mono: "font-mono text-[11px] text-[#241f17]",
    link: "text-[#241f17] underline decoration-[#c9bd9f] underline-offset-[3px] hover:decoration-[#241f17]",
    barTrack: "h-1.5 w-full overflow-hidden rounded-[2px] bg-[#efe8d6]",
    barFill: "h-full rounded-[2px] bg-[#241f17] motion-reduce:transition-none",
    hint: "text-[10px] leading-[1.45] text-[#9c8f77]",
    activeRow: "border-l border-[#241f17] bg-[#efe8d6]",
    flashRow: "border-l border-[#241f17] bg-[#e6dcc4] motion-reduce:bg-[#efe8d6]",
    pre: "overflow-x-auto rounded-[2px] border border-[#e2dac6] bg-[#f4eedb] px-2 py-1.5 font-mono text-[10px] text-[#241f17]",
  },
  canvas: {
    body: "flex min-h-0 flex-col gap-2 font-mono text-[11px] leading-[1.45] text-slate-600",
    row: "flex flex-col gap-0.5 border-l border-slate-200 py-1.5 pl-2.5",
    rowCurrent:
      "flex flex-col gap-0.5 border-l border-cyan-400 bg-cyan-50 py-1.5 pl-2.5",
    version: "font-semibold uppercase tracking-[0.12em] text-slate-800",
    date: "text-[10px] tracking-[0.08em] text-slate-400",
    lead: "text-[11px] leading-[1.45] text-slate-500",
    bullet: "text-[11px] leading-[1.5] text-slate-700",
    breaking:
      "mr-1.5 inline-block font-mono text-[9px] uppercase tracking-[0.18em] text-rose-600",
    mono: "font-mono text-[11px] text-slate-800",
    link: "text-cyan-700 underline decoration-cyan-300 underline-offset-[3px] hover:decoration-cyan-500",
    barTrack: "h-1.5 w-full overflow-hidden rounded-[1px] bg-slate-100",
    barFill: "h-full rounded-[1px] bg-cyan-400 motion-reduce:transition-none",
    hint: "text-[10px] leading-[1.45] text-slate-400",
    activeRow: "border-l border-cyan-400 bg-cyan-50",
    flashRow: "border-l border-cyan-400 bg-cyan-100 motion-reduce:bg-cyan-50",
    pre: "overflow-x-auto rounded-[1px] border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[10px] text-slate-700",
  },
};

function docsReleaseHref(releaseId: string): string {
  return `/docs#${releaseId}`;
}

function openDocsRelease(
  event: React.MouseEvent<HTMLAnchorElement>,
  releaseId: string,
  navigate: ((to: string) => void) | undefined,
): void {
  if (navigate == null) {
    return;
  }
  if (event.defaultPrevented) {
    return;
  }
  if (event.button !== 0) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  navigate(docsReleaseHref(releaseId));
}

function WidgetInlines({
  inlines,
}: {
  inlines: ReadonlyArray<ChangelogInline>;
}): React.ReactElement {
  return (
    <>
      {inlines.map((inline: ChangelogInline, index: number): React.ReactElement => {
        if (inline.kind === "code") {
          return <code key={index}>{inline.text}</code>;
        }
        if (inline.kind === "strong") {
          return <strong key={index}>{inline.text}</strong>;
        }
        if (inline.kind === "link") {
          return (
            <span key={index}>{inline.text}</span>
          );
        }
        return <React.Fragment key={index}>{inline.text}</React.Fragment>;
      })}
    </>
  );
}

function BreakingFlag({
  tokens,
  isBreaking,
}: {
  tokens: WidgetSkinTokens;
  isBreaking: boolean;
}): React.ReactElement | null {
  if (!isBreaking) {
    return null;
  }
  return <span className={tokens.breaking}>breaking</span>;
}

function ReleaseTimelineWidget({
  skin,
  navigate,
}: {
  skin: ChangelogWidgetSkin;
  navigate?: (to: string) => void;
}): React.ReactElement {
  const tokens: WidgetSkinTokens = WIDGET_SKIN[skin];
  return (
    <ol className={tokens.body}>
      {CHANGELOG_RELEASES.map(
        (release: ChangelogRelease, index: number): React.ReactElement => {
          const accent: TilingTileAccent =
            TILING_TILE_ACCENTS[index % TILING_TILE_ACCENTS.length] ?? "amber";
          const hue: TilingAccentHue = TILING_ACCENT_HUES[accent];
          const isCurrent: boolean = release.versionLabel === LIBRARY_VERSION;
          const lead: string = releaseLead(release);
          return (
            <li key={release.id}>
              <a
                href={docsReleaseHref(release.id)}
                onClick={(event: React.MouseEvent<HTMLAnchorElement>): void => {
                  openDocsRelease(event, release.id, navigate);
                }}
                className={`block ${isCurrent ? tokens.rowCurrent : tokens.row}`}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${hue.swatch}`}
                  />
                  <span className={tokens.version}>{release.versionLabel}</span>
                  {release.date != null ? (
                    <span className={tokens.date}>{release.date}</span>
                  ) : null}
                  {isCurrent ? (
                    <span className={tokens.date}>current</span>
                  ) : null}
                </span>
                {lead !== "" ? <span className={tokens.lead}>{lead}</span> : null}
              </a>
            </li>
          );
        },
      )}
    </ol>
  );
}

function LatestReleaseWidget({
  skin,
}: {
  skin: ChangelogWidgetSkin;
}): React.ReactElement {
  const tokens: WidgetSkinTokens = WIDGET_SKIN[skin];
  const latest: ChangelogRelease | null =
    latestPublishedRelease(CHANGELOG_RELEASES);
  if (latest == null) {
    return <div className={tokens.body}>No releases.</div>;
  }
  const bullets: ReadonlyArray<ChangelogBullet> = releaseBullets(latest);
  return (
    <div className={tokens.body}>
      <div className="flex items-baseline gap-2">
        <span className={tokens.version}>{latest.versionLabel}</span>
        {latest.date != null ? (
          <span className={tokens.date}>{latest.date}</span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1.5">
        {bullets.map(
          (bullet: ChangelogBullet, index: number): React.ReactElement => (
            <li key={index} className={tokens.bullet}>
              <BreakingFlag tokens={tokens} isBreaking={bullet.isBreaking} />
              <WidgetInlines inlines={bullet.inlines} />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function BreakingChangesWidget({
  skin,
}: {
  skin: ChangelogWidgetSkin;
}): React.ReactElement {
  const tokens: WidgetSkinTokens = WIDGET_SKIN[skin];
  const groups: ReadonlyArray<BreakingReleaseGroup> =
    breakingChangeGroups(CHANGELOG_RELEASES);
  if (groups.length === 0) {
    return <div className={tokens.body}>No breaking bullets.</div>;
  }
  return (
    <div className={tokens.body}>
      {groups.map(
        (group: BreakingReleaseGroup): React.ReactElement => (
          <div key={group.releaseId} className="flex flex-col gap-1">
            <span className={tokens.version}>{group.versionLabel}</span>
            <ul className="flex flex-col gap-1.5">
              {group.bullets.map(
                (bullet: ChangelogBullet, index: number): React.ReactElement => (
                  <li key={index} className={tokens.bullet}>
                    <BreakingFlag tokens={tokens} isBreaking={true} />
                    <WidgetInlines inlines={bullet.inlines} />
                  </li>
                ),
              )}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}

function VersionInstallWidget({
  skin,
}: {
  skin: ChangelogWidgetSkin;
}): React.ReactElement {
  const tokens: WidgetSkinTokens = WIDGET_SKIN[skin];
  return (
    <div className={tokens.body}>
      <div className="flex items-baseline gap-2">
        <span className={tokens.version}>{LIBRARY_PACKAGE_NAME}</span>
        <span className={tokens.date}>{LIBRARY_VERSION}</span>
      </div>
      <pre className={tokens.pre}>
        <code>{INSTALL_SNIPPET}</code>
      </pre>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <a href={LIBRARY_NPM_URL} className={tokens.link} target="_blank" rel="noopener noreferrer">
          npm
        </a>
        <a
          href={LIBRARY_REPOSITORY_URL}
          className={tokens.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}

function workspaceName(
  set: TilingWorkspaceSet,
  id: string,
): string {
  const seated: TilingWorkspace | undefined = set.workspaces.find(
    (workspace: TilingWorkspace): boolean => workspace.id === id,
  );
  return seated?.name ?? id;
}

function seatCountsOf(
  set: TilingWorkspaceSet,
  query: TilingWorkspaceSetQuery,
): ReadonlyArray<{ readonly tileId: string; readonly count: number }> {
  const counts: Map<string, number> = new Map<string, number>();
  for (const workspace of set.workspaces) {
    for (const tileId of query.tileIds(workspace.id)) {
      counts.set(tileId, (counts.get(tileId) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).map(
    ([tileId, count]: [string, number]): {
      readonly tileId: string;
      readonly count: number;
    } => ({ tileId, count }),
  );
}

const INSPECTOR_FLASH_MS: number = 640;

export type HomeInspectorEvent =
  | { readonly kind: "switch"; readonly event: TilingWorkspaceSwitchEvent }
  | { readonly kind: "reset" };

function inspectorEventLine(
  workspaceSet: TilingWorkspaceSet,
  event: HomeInspectorEvent | null,
): string {
  if (event == null) {
    return "none";
  }
  if (event.kind === "reset") {
    return "reset \u2192 seed";
  }
  return `${workspaceName(workspaceSet, event.event.from).toLowerCase()} \u2192 ${workspaceName(workspaceSet, event.event.to).toLowerCase()} via ${event.event.via}`;
}

function SetInspectorWidget({
  skin,
  workspaceSet,
  lastEvent,
  flashNonce,
}: {
  skin: ChangelogWidgetSkin;
  workspaceSet: TilingWorkspaceSet;
  lastEvent: HomeInspectorEvent | null;
  flashNonce: number;
}): React.ReactElement {
  const tokens: WidgetSkinTokens = WIDGET_SKIN[skin];
  const query: TilingWorkspaceSetQuery = queryWorkspaceSet(workspaceSet);
  const seats: ReadonlyArray<{ readonly tileId: string; readonly count: number }> =
    seatCountsOf(workspaceSet, query);
  const [flashing, setFlashing] = React.useState<boolean>(false);

  React.useEffect((): (() => void) | undefined => {
    if (flashNonce === 0 || lastEvent == null) {
      return undefined;
    }
    setFlashing(true);
    const timer: number = window.setTimeout((): void => {
      setFlashing(false);
    }, INSPECTOR_FLASH_MS);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [flashNonce, lastEvent]);

  const eventLine: string = inspectorEventLine(workspaceSet, lastEvent);

  return (
    <div className={tokens.body}>
      {workspaceSet.workspaces.map(
        (workspace: TilingWorkspace): React.ReactElement => {
          const isActive: boolean = workspace.id === workspaceSet.activeId;
          const tiles: ReadonlyArray<string> = query.tileIds(workspace.id);
          return (
            <div
              key={workspace.id}
              className={`flex flex-col gap-0.5 py-1 pl-2.5 ${
                isActive ? tokens.activeRow : tokens.row
              }`}
            >
              <span className={tokens.version}>
                {workspace.name}
                {isActive ? " · active" : ""}
              </span>
              <span className={tokens.mono}>{workspace.id}</span>
              <span className={tokens.lead}>
                tiles {tiles.length === 0 ? "—" : tiles.join(" · ")}
              </span>
            </div>
          );
        },
      )}
      <div className={tokens.lead}>
        seatCount{" "}
        {seats
          .map(
            (entry: { readonly tileId: string; readonly count: number }): string =>
              `${entry.tileId}:${entry.count}`,
          )
          .join(" ")}
      </div>
      <div className={`px-2 py-1 ${flashing ? tokens.flashRow : tokens.row}`}>
        <span className={tokens.date}>last switch</span>
        <div className={tokens.mono}>{eventLine}</div>
      </div>
    </div>
  );
}

function swipeTargetName(
  set: TilingWorkspaceSet,
  swipe: TilingWorkspaceSwipeSnapshot,
): string {
  if (swipe.target == null) {
    return "—";
  }
  const query: TilingWorkspaceSetQuery = queryWorkspaceSet(set);
  const neighbourId: string | null = query.neighbour(
    set.activeId,
    swipe.target === "prev" ? "previous" : "next",
  );
  if (neighbourId == null) {
    return swipe.target;
  }
  return workspaceName(set, neighbourId);
}

function SwipeMeterWidget({
  skin,
  workspaceSet,
}: {
  skin: ChangelogWidgetSkin;
  workspaceSet: TilingWorkspaceSet;
}): React.ReactElement {
  const tokens: WidgetSkinTokens = WIDGET_SKIN[skin];
  const swipe: TilingWorkspaceSwipeSnapshot = useWorkspaceSwipe();
  const widthPercent: number = Math.min(100, Math.abs(swipe.progress) * 100);
  const origin: "left" | "right" = swipe.progress < 0 ? "right" : "left";
  return (
    <div className={tokens.body}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={tokens.version}>{swipe.phase}</span>
        <span className={tokens.date}>
          {swipe.progress.toFixed(2)} · {swipeTargetName(workspaceSet, swipe)}
        </span>
      </div>
      <div className={tokens.barTrack}>
        <div
          className={`${tokens.barFill} transition-[width] duration-75`}
          style={{
            width: `${widthPercent}%`,
            marginLeft: origin === "right" ? `${100 - widthPercent}%` : "0",
          }}
        />
      </div>
      <p className={tokens.hint}>
        ⌘ + two-finger horizontal on trackpad · touch swipe · Alt+←/→
      </p>
    </div>
  );
}

export function buildChangelogWidgetTiles(args: {
  skin: ChangelogWidgetSkin;
  workspaceSet: TilingWorkspaceSet;
  lastEvent: HomeInspectorEvent | null;
  flashNonce: number;
  navigate?: (to: string) => void;
}): ReadonlyArray<TilingTile> {
  const { skin, workspaceSet, lastEvent, flashNonce, navigate } = args;
  return [
    {
      id: "release-timeline",
      title: "Releases",
      accent: "amber",
      content: <ReleaseTimelineWidget skin={skin} navigate={navigate} />,
    },
    {
      id: "latest-release",
      title: "Latest",
      accent: "cyan",
      content: <LatestReleaseWidget skin={skin} />,
    },
    {
      id: "breaking-changes",
      title: "Breaking",
      accent: "rose",
      content: <BreakingChangesWidget skin={skin} />,
    },
    {
      id: "version-install",
      title: "Install",
      accent: "emerald",
      content: <VersionInstallWidget skin={skin} />,
    },
    {
      id: "set-inspector",
      title: "Set",
      accent: "violet",
      content: (
        <SetInspectorWidget
          skin={skin}
          workspaceSet={workspaceSet}
          lastEvent={lastEvent}
          flashNonce={flashNonce}
        />
      ),
    },
    {
      id: "swipe-meter",
      title: "Swipe",
      accent: "sky",
      content: <SwipeMeterWidget skin={skin} workspaceSet={workspaceSet} />,
    },
  ];
}
