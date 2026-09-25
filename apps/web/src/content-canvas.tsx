import * as React from "react";
import {
  DISCOVERABILITY_PARAGRAPHS,
  FEATURE_CORE,
  FEATURE_RECENT,
  INSTALL_CONTROLLED_PARAGRAPH,
  INSTALL_INTRO_PARAGRAPH,
  INSTALL_SNIPPET,
  INTEGRATION_EXAMPLE,
  INTRO_HEADLINE_ACCENT,
  INTRO_HEADLINE_LEAD,
  INTRO_LICENSE_TAIL,
  INTRO_ONE_LINER,
  INTRO_REACH_PARAGRAPH,
  INTRO_KUDOS_PARAGRAPH,
  LICENSE_NAME,
  LICENSE_URL,
  ROADMAP_REST,
  USE_CASES,
  USECASES_LEAD,
  WORKSPACES_ALSO_PLANNED,
  WORKSPACES_HEADING,
  WORKSPACES_HOWTO_HREF,
  WORKSPACES_HOWTO_LABEL,
  WORKSPACES_LEAD,
  WORKSPACES_SHIPPED,
  type DocInline,
  type DocParagraph,
} from "./docs";
import { CANVAS_TICKS } from "./canvas-theme";

// The CANVAS skin's content presentation — the ENGINEERING-INSTRUMENT readout
// counterpart to the Mosaic (`docs.tsx`) and Editorial (`content-editorial.tsx`)
// pane content. It reads the SAME shared content model and renders it in a
// wholly different system, so a section in Canvas looks unlike the same section
// in either other skin — never a second copy of the words.
//
// Design system — "engineering instrument, LED-lit":
//   • flat neutral panel field (white on the light-grey desk set by the page +
//     `canvas-tile`), no card rounding — squared corners at a 1px hairline
//     radius throughout (code, callouts, panels)
//   • technical type: monospace uppercase for section labels / eyebrows /
//     indices, a quiet neutral sans reading column for prose; tabular figures
//   • hairline slate rules instead of heavy dividers; tight, measured spacing
//   • the ONLY saturated color is the LED language: every term/detail list is a
//     tabular instrument index — a monospace ordinal + a squared status LED that
//     cycles the signature row (magenta · orange · yellow · green · cyan) + the
//     term + its detail; the intro carries the full LED row as its status mark
//   • links are a single calm cyan; emphasis is a neutral slate-900 weight bump.

// --- Canvas primitives -----------------------------------------------------

function CanvasKicker({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-400">
      {children}
    </span>
  );
}

// The signature multi-color LED row — the Canvas status mark, squared ticks.
function CanvasLedRow(): React.ReactElement {
  return (
    <span aria-hidden className="flex items-center gap-1.5">
      {CANVAS_TICKS.map((tick: string): React.ReactElement => (
        <span key={tick} className={`h-[3px] w-5 rounded-[1px] ${tick}`} />
      ))}
    </span>
  );
}

// A concise instrument section label — a lit LED, a monospace uppercase title,
// and a hairline rule. Reads like a control-panel section header, not a display
// headline (that departs from the Mosaic eyebrow + the Editorial serif).
export function CanvasHeading({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-[1px] bg-cyan-400 shadow-[0_0_5px_0_rgba(34,211,238,0.85)]"
        />
        <h2 className="font-mono text-[13px] font-semibold uppercase leading-none tracking-[0.16em] text-slate-800">
          {children}
        </h2>
      </div>
      <span aria-hidden className="h-px w-full bg-slate-200" />
    </div>
  );
}

export function CanvasLead({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <p className="max-w-[64ch] text-[15px] leading-[1.6] text-slate-600">
      {children}
    </p>
  );
}

function CanvasLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  const external: boolean = /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="text-cyan-700 underline decoration-cyan-300 underline-offset-[3px] transition-colors hover:decoration-cyan-500"
    >
      {children}
    </a>
  );
}

function CanvasCode({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <code className="rounded-[1px] border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[12px] text-slate-700">
      {children}
    </code>
  );
}

function CanvasPre({ children }: { children: string }): React.ReactElement {
  return (
    <pre className="overflow-x-auto rounded-[1px] border border-slate-200 bg-slate-50 p-4 font-mono text-[12px] leading-relaxed text-slate-700">
      <code>{children}</code>
    </pre>
  );
}

// Canvas inline renderer: the same segment model, instrument decorations.
export function CanvasInline({
  paragraph,
}: {
  paragraph: DocParagraph;
}): React.ReactElement {
  return (
    <>
      {paragraph.map((segment: DocInline, index: number): React.ReactNode => {
        if (typeof segment === "string") {
          return <React.Fragment key={index}>{segment}</React.Fragment>;
        }
        if ("code" in segment) {
          return <CanvasCode key={index}>{segment.code}</CanvasCode>;
        }
        if ("em" in segment) {
          return (
            <em key={index} className="font-medium not-italic text-slate-900">
              {segment.em}
            </em>
          );
        }
        return (
          <CanvasLink key={index} href={segment.href}>
            {segment.link}
          </CanvasLink>
        );
      })}
    </>
  );
}

// An instrument index — the Canvas treatment for every term/detail list (use
// cases, features, roadmap). Each row is a readout line: a monospace tabular
// ordinal, a squared status LED cycling the signature row, then the term and
// its detail, separated by hairline rules. Generic over the shared
// `{ term, detail }` shape.
interface TermDetail {
  readonly term: string;
  readonly detail: string;
}

function CanvasIndex({
  items,
}: {
  items: ReadonlyArray<TermDetail>;
}): React.ReactElement {
  return (
    <ul className="flex flex-col">
      {items.map((item: TermDetail, index: number): React.ReactElement => (
        <li
          key={item.term}
          className="grid grid-cols-[1.75rem_0.65rem_1fr] items-baseline gap-x-2.5 gap-y-1 border-t border-slate-200 py-2.5 first:border-t-0 first:pt-0"
        >
          <span className="font-mono text-[10px] tabular-nums leading-snug text-slate-400">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            aria-hidden
            className={`mt-[7px] h-[3px] w-2.5 rounded-[1px] ${
              CANVAS_TICKS[index % CANVAS_TICKS.length]
            }`}
          />
          <span className="text-[14px] font-medium leading-snug text-slate-800">
            {item.term}
          </span>
          <span className="col-start-3 max-w-[60ch] text-[12.5px] leading-[1.7] text-slate-500">
            {item.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

// --- Per-pane instrument content -------------------------------------------

function IntroContent(): React.ReactElement {
  return (
    <div className="flex min-h-full flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <CanvasKicker>dynamic tiling · for react</CanvasKicker>
          <CanvasLedRow />
        </div>
        <h1 className="text-[clamp(1.65rem,2.3vw,2rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-slate-900">
          {INTRO_HEADLINE_LEAD}{" "}
          <span className="text-cyan-600">{INTRO_HEADLINE_ACCENT}</span>
        </h1>
        <span aria-hidden className="h-px w-full bg-slate-200" />
      </div>
      <p className="max-w-[64ch] text-[14px] leading-[1.45] text-slate-600">
        {INTRO_ONE_LINER}
      </p>
      <p className="max-w-[64ch] text-[14px] leading-[1.45] text-slate-600">
        {INTRO_REACH_PARAGRAPH}
      </p>
      <footer className="mt-auto border-t border-slate-200 pt-2 text-[11px] leading-[1.4] text-slate-400">
        <CanvasLink href={LICENSE_URL}>{LICENSE_NAME}</CanvasLink>
        {INTRO_LICENSE_TAIL}
        {" · "}
        <CanvasInline paragraph={INTRO_KUDOS_PARAGRAPH} />
      </footer>
    </div>
  );
}

function UseCasesContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <CanvasHeading>Use cases</CanvasHeading>
      <CanvasLead>{USECASES_LEAD}</CanvasLead>
      <CanvasIndex items={USE_CASES} />
    </div>
  );
}

function InstallContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <CanvasHeading>Install</CanvasHeading>
      <CanvasPre>{INSTALL_SNIPPET}</CanvasPre>
      <CanvasPre>{INTEGRATION_EXAMPLE}</CanvasPre>
      <CanvasLead>
        <CanvasInline paragraph={INSTALL_INTRO_PARAGRAPH} />
      </CanvasLead>
      <CanvasLead>
        <CanvasInline paragraph={INSTALL_CONTROLLED_PARAGRAPH} />
      </CanvasLead>
    </div>
  );
}

function FeaturesContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <CanvasHeading>Ships today</CanvasHeading>
      <CanvasKicker>core tiling</CanvasKicker>
      <CanvasIndex items={FEATURE_CORE} />
      <CanvasKicker>since 26.9.x</CanvasKicker>
      <CanvasIndex items={FEATURE_RECENT} />
    </div>
  );
}

function WorkspacesContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <CanvasHeading>{WORKSPACES_HEADING}</CanvasHeading>
      <CanvasLead>
        <CanvasInline paragraph={WORKSPACES_LEAD} />
      </CanvasLead>
      <CanvasLead>
        <CanvasInline paragraph={WORKSPACES_SHIPPED} />
      </CanvasLead>
      <p>
        <CanvasLink href={WORKSPACES_HOWTO_HREF}>{WORKSPACES_HOWTO_LABEL}</CanvasLink>
      </p>
      <div className="flex flex-col gap-4 border-t border-slate-200 pt-5">
        <CanvasKicker>{WORKSPACES_ALSO_PLANNED}</CanvasKicker>
        <CanvasIndex items={ROADMAP_REST} />
      </div>
    </div>
  );
}

function DiscoverabilityContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <CanvasHeading>SEO &amp; LLM friendly</CanvasHeading>
      {DISCOVERABILITY_PARAGRAPHS.map(
        (paragraph: DocParagraph, index: number): React.ReactElement => (
          <CanvasLead key={index}>
            <CanvasInline paragraph={paragraph} />
          </CanvasLead>
        ),
      )}
    </div>
  );
}

const CANVAS_PANE_CONTENT: Record<string, () => React.ReactElement> = {
  intro: IntroContent,
  usecases: UseCasesContent,
  install: InstallContent,
  features: FeaturesContent,
  workspaces: WorkspacesContent,
  discoverability: DiscoverabilityContent,
};

// Instrument content for a documentation pane, keyed by the same pane id the
// Mosaic `DOC_PANES` uses. Returns `null` for ids without a mapping so the
// renderer can fall back gracefully.
export function CanvasPaneContent({
  paneId,
}: {
  paneId: string;
}): React.ReactElement | null {
  const Body: (() => React.ReactElement) | undefined =
    CANVAS_PANE_CONTENT[paneId];
  return Body != null ? <Body /> : null;
}
