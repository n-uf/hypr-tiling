"use client";

import * as React from "react";

// Pane CONTENT for the hypr-tiling showcase. Design concept (single source of
// truth for the visual direction) lives at
// `_agent/showcase-content-design-concept.md`: a dense financial-ops
// observability console — Bloomberg-terminal density, modern dark-SaaS polish.
// The chrome (title bar, FLEX/H/W/BOTH controls, drag header) is owned by the
// renderer; content here is deliberately distinct (sans default, mono only for
// data, slate titles never accent, status hues semantic-only, ≤ 2 framed tiers).

type StatusTone = "ok" | "info" | "warn" | "crit" | "neutral";
type DeltaTone = "up" | "down" | "flat";

interface MetricDatum {
  label: string;
  value: string;
  delta: string;
  deltaTone: DeltaTone;
}

interface EventFeedItem {
  time: string;
  message: string;
  severity: Exclude<StatusTone, "crit" | "neutral">;
}

interface SpendBarPoint {
  hour: string;
  amountK: number;
}

interface AlertTableRow {
  id: string;
  tenant: string;
  rule: string;
  severity: Exclude<StatusTone, "neutral">;
  age: string;
}

const OVERVIEW_METRICS: ReadonlyArray<MetricDatum> = [
  { label: "queue depth", value: "21", delta: "+3", deltaTone: "up" },
  { label: "issued today", value: "73", delta: "+12%", deltaTone: "up" },
  { label: "quota headroom", value: "42%", delta: "-4%", deltaTone: "down" },
  { label: "auth p95", value: "184ms", delta: "stable", deltaTone: "flat" },
];

const EVENT_FEED: ReadonlyArray<EventFeedItem> = [
  { time: "19:56:10", message: "card created for team alpha", severity: "ok" },
  { time: "19:56:11", message: "webhook retry succeeded", severity: "ok" },
  { time: "19:56:13", message: "settlement batch acknowledged", severity: "info" },
  { time: "19:56:16", message: "push dispatch queued for finance-admins", severity: "info" },
  { time: "19:56:20", message: "policy eval: merchant_country_allowlist allow", severity: "ok" },
  { time: "19:56:22", message: "spend ledger write amplification warning", severity: "warn" },
  { time: "19:56:27", message: "async snapshot persisted to tenant-ops bucket", severity: "info" },
  { time: "19:56:31", message: "delayed webhook replay drained 44 events", severity: "ok" },
  { time: "19:56:33", message: "notification fanout completed retries=0", severity: "ok" },
  { time: "19:56:36", message: "throttle probe: no active circuit breakers", severity: "info" },
];

const SPEND_BARS: ReadonlyArray<SpendBarPoint> = [
  { hour: "00", amountK: 14.2 },
  { hour: "03", amountK: 11.8 },
  { hour: "06", amountK: 20.1 },
  { hour: "09", amountK: 28.4 },
  { hour: "12", amountK: 34.8 },
  { hour: "15", amountK: 31.2 },
  { hour: "18", amountK: 47.5 },
  { hour: "21", amountK: 41.0 },
  { hour: "24", amountK: 52.3 },
];

const SPEND_TOTAL_LABEL: string = "52.3k";

const ALERT_ROWS: ReadonlyArray<AlertTableRow> = [
  { id: "AL-441", tenant: "northern_ops", rule: "burst_rate_threshold", severity: "warn", age: "2m" },
  { id: "AL-442", tenant: "platform", rule: "webhook_replay_drained", severity: "info", age: "4m" },
  { id: "AL-443", tenant: "storage", rule: "compaction_backlog", severity: "warn", age: "11m" },
  { id: "AL-444", tenant: "workers", rule: "pod_health_check", severity: "info", age: "14m" },
  { id: "AL-445", tenant: "forecast", rule: "confidence_floor", severity: "warn", age: "18m" },
  { id: "AL-446", tenant: "issuer_api", rule: "upstream_429", severity: "crit", age: "22m" },
  { id: "AL-447", tenant: "ingest", rule: "queue_soft_watermark", severity: "warn", age: "31m" },
  { id: "AL-448", tenant: "reconcile", rule: "long_running_delta", severity: "warn", age: "47m" },
];

const DEBUG_TRACE_LINES: ReadonlyArray<string> = [
  '{"op":"split.resize","id":"root","ratio":0.57}',
  '{"op":"tile.swap","from":"north-east","to":"south"}',
  '{"op":"bounds.check","status":"ok"}',
  '{"op":"resolver.edge-eval","zone":"left","valid":true,"distancePx":42.7}',
  '{"op":"layout.snapshot","leafCount":5,"splitCount":4}',
  '{"op":"pointer.move","mode":"drag","target":"south-east"}',
  '{"op":"drop.preview","projectedRatio":0.500}',
  '{"op":"focus.navigate","direction":"left","to":"south-west"}',
];

const ALERT_TABLE_HEADERS: ReadonlyArray<string> = ["id", "tenant", "rule", "sev", "age"];

// ---------------------------------------------------------------------------
// Design tokens — single source of truth. See `_agent/showcase-content-design-concept.md`.
// ---------------------------------------------------------------------------

const TOKENS = {
  surface: {
    section: "rounded-lg bg-slate-900/40 ring-1 ring-inset ring-white/5",
    well: "rounded-md bg-slate-950/60 ring-1 ring-inset ring-white/5",
    card: "rounded-md bg-white/[0.03] ring-1 ring-inset ring-white/5 hover:bg-white/[0.05]",
  },
  rule: "border-b border-white/10",
  hairline: "divide-y divide-white/5",
  rowHover: "hover:bg-white/[0.03]",
  type: {
    sectionTitle: "text-[11px] font-semibold tracking-tight text-slate-100",
    sectionMeta: "text-[10px] text-slate-500",
    label: "text-[10px] font-medium text-slate-400",
    value: "text-[11px] text-slate-200",
    metricValue: "text-lg font-semibold tabular-nums text-slate-50",
    mono: "font-mono text-[10px] tabular-nums text-slate-500",
    console: "font-mono text-[10px] leading-relaxed text-slate-300",
    badge: "text-[9px] font-semibold uppercase tracking-wide",
  },
  badgeTone: {
    ok: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    info: "bg-sky-400/10 text-sky-300 ring-sky-400/20",
    warn: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
    crit: "bg-rose-400/10 text-rose-300 ring-rose-400/25",
    neutral: "bg-white/[0.04] text-slate-300 ring-white/10",
  },
  dotTone: {
    ok: "bg-emerald-400",
    info: "bg-sky-400",
    warn: "bg-amber-400",
    crit: "bg-rose-400",
    neutral: "bg-slate-400",
  },
} as const;

function deltaToneClassName(tone: DeltaTone): string {
  if (tone === "up") {
    return "text-emerald-300";
  }
  if (tone === "down") {
    return "text-rose-300";
  }
  return "text-slate-400";
}

function cn(...classes: ReadonlyArray<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Self-contained pane stylesheet.
//
// This package is NOT in the host app's Tailwind `content` globs
// (`apps/web/tailwind.config.ts`), so utilities used ONLY here are not
// generated — they render only when they happen to also appear in a scanned
// package. Two consequences this stylesheet neutralizes:
//   1. Pane-relative responsiveness. The pane is resized/tiled/dragged at
//      runtime, so layout must respond to the PANE width, not the viewport.
//      Tailwind viewport breakpoints (`sm:`) are wrong here; CSS container
//      queries off the content root (`container-type: inline-size`) are right.
//   2. Form-field surfaces. The intended field bg/border/focus utilities
//      (`bg-slate-950/70`, `ring-white/10`, `focus:ring-sky-400/40`) are not
//      compiled, which is the literal cause of the white `<select>` (native UA
//      control + light color-scheme + no `appearance` reset, painting platform
//      white over an un-applied background) and the stray default-blue ring on
//      the note input. We style fields here in raw CSS so they are correct
//      regardless of Tailwind scanning. Selectors are `.hpt-*`-scoped so the
//      blast radius is the demo content only.
//
// Container-query breakpoints follow the design concept's narrow-pane scaling:
// metric grid collapses 2-col → 1-col, the quota form stacks → two-up.
// ---------------------------------------------------------------------------

const PANE_CONTENT_STYLE_HREF: string = "hypr-tiling-showcase-pane-content";

const PANE_CONTENT_CSS: string = `
.hpt-pane-content { container-type: inline-size; }

.hpt-metric-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
}
@container (min-width: 300px) {
  .hpt-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.hpt-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
}
.hpt-form-span { grid-column: 1 / -1; }
@container (min-width: 340px) {
  .hpt-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.hpt-field {
  width: 100%;
  min-width: 0;
  border-radius: 0.375rem;
  border: 0;
  background-color: rgb(2 6 23 / 0.7);
  color: rgb(226 232 240);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
  padding: 0.25rem 0.5rem;
  font-size: 11px;
  line-height: 1.25rem;
  outline: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  color-scheme: dark;
  transition: box-shadow 150ms;
}
.hpt-field::placeholder { color: rgb(71 85 105); }
.hpt-field:hover { box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18); }
.hpt-field:focus { box-shadow: inset 0 0 0 1px rgb(56 189 248 / 0.55); }

.hpt-select-wrap { position: relative; min-width: 0; }
.hpt-select { padding-right: 1.75rem; cursor: pointer; }
.hpt-select-chevron {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: rgb(148 163 184);
}

.hpt-apply {
  border-radius: 0.375rem;
  border: 0;
  background-color: rgb(56 189 248 / 0.14);
  color: rgb(186 230 253);
  box-shadow: inset 0 0 0 1px rgb(56 189 248 / 0.3);
  padding: 0.375rem 0.5rem;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms;
}
.hpt-apply:hover { background-color: rgb(56 189 248 / 0.22); }
`;

/**
 * Co-located stylesheet for the demo content. Rendered inside every
 * `PaneContent`; React 19 hoists and dedupes `<style>` by `href`+`precedence`,
 * so it lands once in the document head regardless of pane count.
 */
function PaneContentStyles(): React.ReactElement {
  return (
    <style href={PANE_CONTENT_STYLE_HREF} precedence="default">
      {PANE_CONTENT_CSS}
    </style>
  );
}

/** Custom chevron for the appearance-reset selects (the native arrow is gone). */
function SelectChevron(): React.ReactElement {
  return (
    <svg
      className="hpt-select-chevron"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Content primitives
// ---------------------------------------------------------------------------

interface PaneContentProps {
  children: React.ReactNode;
}

/**
 * Content root: frameless, resets inherited mono → sans, owns inter-section
 * rhythm, and establishes the container-query measurement basis (`hpt-pane-content`
 * sets `container-type: inline-size`) so children respond to the PANE width.
 */
function PaneContent({ children }: PaneContentProps): React.ReactElement {
  return (
    <div className="hpt-pane-content flex min-h-0 flex-1 flex-col gap-2 font-sans">
      <PaneContentStyles />
      {children}
    </div>
  );
}

interface ContentSectionProps {
  title: string;
  meta?: string;
  fill?: boolean;
  children: React.ReactNode;
}

/** The one framed surface (Tier-1). Header rule + body; `fill` makes it own the scroll. */
function ContentSection({ title, meta, fill, children }: ContentSectionProps): React.ReactElement {
  return (
    <section
      className={cn(
        TOKENS.surface.section,
        "flex flex-col gap-1.5 p-2.5",
        fill === true ? "min-h-0 flex-1" : "",
      )}
    >
      <div className={cn(TOKENS.rule, "flex items-center justify-between gap-2 pb-1.5")}>
        <h3 className={TOKENS.type.sectionTitle}>{title}</h3>
        {meta == null ? null : <span className={cn("truncate", TOKENS.type.sectionMeta)}>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

interface StatusDotProps {
  tone: StatusTone;
}

function StatusDot({ tone }: StatusDotProps): React.ReactElement {
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TOKENS.dotTone[tone])} />;
}

interface StatusBadgeProps {
  tone: StatusTone;
  withDot?: boolean;
  children: React.ReactNode;
}

function StatusBadge({ tone, withDot, children }: StatusBadgeProps): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 ring-1 ring-inset",
        TOKENS.type.badge,
        TOKENS.badgeTone[tone],
      )}
    >
      {withDot === true ? <StatusDot tone={tone} /> : null}
      {children}
    </span>
  );
}

interface DataRowProps {
  leading?: React.ReactNode;
  body: React.ReactNode;
  trailing?: React.ReactNode;
}

/** Hairline row (not a boxed strip); siblings separated by parent `divide-y`. */
function DataRow({ leading, body, trailing }: DataRowProps): React.ReactElement {
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded px-0.5 py-1.5", TOKENS.rowHover)}>
      {leading == null ? null : <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">{body}</div>
      {trailing == null ? null : <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

interface MetricCardProps {
  metric: MetricDatum;
}

function MetricCard({ metric }: MetricCardProps): React.ReactElement {
  return (
    <div className={cn(TOKENS.surface.card, "px-2.5 py-1.5 transition-colors")}>
      <div className={cn("truncate", TOKENS.type.label)}>{metric.label}</div>
      <div className="mt-0.5 flex items-baseline justify-between gap-1.5">
        <span className={cn("truncate", TOKENS.type.metricValue)}>{metric.value}</span>
        <span
          className={cn(
            "shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums",
            deltaToneClassName(metric.deltaTone),
          )}
        >
          {metric.delta}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panes
// ---------------------------------------------------------------------------

function OverviewPaneContent(): React.ReactElement {
  return (
    <PaneContent>
      <ContentSection title="capacity snapshot" meta="rolling 15m">
        <div className="hpt-metric-grid">
          {OVERVIEW_METRICS.map((metric: MetricDatum): React.ReactElement => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      </ContentSection>

      <ContentSection title="quota adjustment" meta="draft mode">
        <form
          className="hpt-form-grid"
          onSubmit={(event: React.FormEvent<HTMLFormElement>): void => {
            event.preventDefault();
          }}
        >
          <label className="flex min-w-0 flex-col gap-1">
            <span className={TOKENS.type.label}>team</span>
            <div className="hpt-select-wrap">
              <select className="hpt-field hpt-select truncate" defaultValue="alpha">
                <option value="alpha">team alpha</option>
                <option value="beta">team beta</option>
                <option value="ops">ops nightly</option>
              </select>
              <SelectChevron />
            </div>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={TOKENS.type.label}>limit tier</span>
            <div className="hpt-select-wrap">
              <select className="hpt-field hpt-select truncate" defaultValue="elevated">
                <option value="default">default 2,500</option>
                <option value="elevated">elevated 12,000</option>
                <option value="emergency">emergency 25,000</option>
              </select>
              <SelectChevron />
            </div>
          </label>
          <label className="hpt-form-span flex min-w-0 flex-col gap-1">
            <span className={TOKENS.type.label}>note</span>
            <input
              type="text"
              placeholder="reason for limit change"
              className="hpt-field truncate"
            />
          </label>
          <button type="submit" className="hpt-apply hpt-form-span">
            apply draft
          </button>
        </form>
      </ContentSection>
    </PaneContent>
  );
}

function EventsPaneContent(): React.ReactElement {
  return (
    <PaneContent>
      <ContentSection title="event stream" meta={`${EVENT_FEED.length} entries`} fill>
        <ul className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto pr-0.5", TOKENS.hairline)}>
          {EVENT_FEED.map((item: EventFeedItem, index: number): React.ReactElement => (
            <li key={`${item.time}-${index}`} className="min-w-0">
              <DataRow
                leading={<span className={TOKENS.type.mono}>{item.time}</span>}
                body={<p className={cn("truncate", TOKENS.type.value)}>{item.message}</p>}
                trailing={<StatusBadge tone={item.severity} withDot>{item.severity}</StatusBadge>}
              />
            </li>
          ))}
        </ul>
      </ContentSection>
    </PaneContent>
  );
}

function GraphPaneContent(): React.ReactElement {
  const maxAmount: number = Math.max(...SPEND_BARS.map((point: SpendBarPoint): number => point.amountK));

  return (
    <PaneContent>
      <ContentSection title="hourly spend" meta="usd k">
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <span className={cn("min-w-0 truncate", TOKENS.type.label)}>24h total</span>
          <span className="shrink-0 text-base font-semibold tabular-nums text-sky-300">{SPEND_TOTAL_LABEL}</span>
        </div>

        <div className={cn(TOKENS.surface.well, "flex min-h-[88px] flex-1 items-end gap-1 overflow-x-auto p-2")}>
          {SPEND_BARS.map((point: SpendBarPoint): React.ReactElement => {
            const heightPercent: number = (point.amountK / maxAmount) * 100;
            return (
              <div key={point.hour} className="flex min-w-[20px] flex-1 flex-col items-center gap-1">
                <div className="relative flex h-20 w-full items-end justify-center">
                  <div
                    className="w-full max-w-[20px] rounded-t-sm bg-sky-400/70"
                    style={{ height: `${heightPercent}%` }}
                    title={`${point.hour}h: ${point.amountK}k`}
                  />
                </div>
                <span className={cn("font-mono text-[9px] tabular-nums text-slate-500")}>{point.hour}h</span>
              </div>
            );
          })}
        </div>

        <svg
          viewBox="0 0 240 48"
          className={cn(TOKENS.surface.well, "h-12 w-full shrink-0 p-1 text-sky-400/70")}
          aria-hidden
        >
          <defs>
            <linearGradient id="showcaseSparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(56 189 248 / 0.30)" />
              <stop offset="100%" stopColor="rgb(56 189 248 / 0)" />
            </linearGradient>
          </defs>
          <polyline
            fill="url(#showcaseSparkFill)"
            stroke="none"
            points="0,40 30,36 60,32 90,24 120,18 150,22 180,10 210,14 240,6 240,48 0,48"
          />
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points="0,40 30,36 60,32 90,24 120,18 150,22 180,10 210,14 240,6"
          />
        </svg>
      </ContentSection>
    </PaneContent>
  );
}

function AlertsPaneContent(): React.ReactElement {
  return (
    <PaneContent>
      <ContentSection title="active alerts" meta={`${ALERT_ROWS.length} rows`} fill>
        <div className={cn(TOKENS.surface.well, "min-h-0 min-w-0 flex-1 overflow-auto")}>
          <table className="w-full min-w-[280px] border-collapse text-left">
            <thead>
              <tr className={cn(TOKENS.rule, "bg-white/[0.03]")}>
                {ALERT_TABLE_HEADERS.map((header: string): React.ReactElement => (
                  <th key={header} className={cn("px-2 py-1.5", TOKENS.type.label)}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={TOKENS.hairline}>
              {ALERT_ROWS.map((row: AlertTableRow): React.ReactElement => (
                <tr key={row.id} className={TOKENS.rowHover}>
                  <td className={cn("whitespace-nowrap px-2 py-1", TOKENS.type.mono)}>{row.id}</td>
                  <td className={cn("max-w-[80px] truncate px-2 py-1", TOKENS.type.value)}>{row.tenant}</td>
                  <td className={cn("max-w-[104px] truncate px-2 py-1", TOKENS.type.value)}>{row.rule}</td>
                  <td className="px-2 py-1">
                    <StatusBadge tone={row.severity}>{row.severity}</StatusBadge>
                  </td>
                  <td className={cn("whitespace-nowrap px-2 py-1 text-right", TOKENS.type.mono)}>{row.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentSection>
    </PaneContent>
  );
}

function DebugPaneContent(): React.ReactElement {
  return (
    <PaneContent>
      <ContentSection title="trace console" meta="structured feed" fill>
        <DataRow
          leading={
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-400/70" />
              <span className="h-2 w-2 rounded-full bg-amber-400/70" />
              <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
            </div>
          }
          body={<span className={TOKENS.type.label}>runtime log stream</span>}
          trailing={<StatusBadge tone="info" withDot>live</StatusBadge>}
        />
        <pre className={cn(TOKENS.surface.well, "min-h-0 flex-1 overflow-auto p-2", TOKENS.type.console)}>
          {DEBUG_TRACE_LINES.map((line: string, index: number): React.ReactElement => (
            <div key={`trace-${index}`} className="whitespace-pre-wrap break-all">
              <span className="select-none text-slate-600">{String(index + 1).padStart(2, " ")} </span>
              {line}
            </div>
          ))}
        </pre>
      </ContentSection>
    </PaneContent>
  );
}

export type ShowcasePaneId = "overview" | "events" | "graph" | "alerts" | "debug";

export function resolveShowcasePaneContent(tileId: ShowcasePaneId): React.ReactElement {
  switch (tileId) {
    case "overview":
      return <OverviewPaneContent />;
    case "events":
      return <EventsPaneContent />;
    case "graph":
      return <GraphPaneContent />;
    case "alerts":
      return <AlertsPaneContent />;
    case "debug":
      return <DebugPaneContent />;
  }
}
