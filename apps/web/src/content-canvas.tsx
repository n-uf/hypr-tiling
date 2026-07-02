import * as React from "react";
import {
  CANONICAL_DESCRIPTION,
  CONTRIBUTING_EYEBROW,
  DISCOVERABILITY_PARAGRAPHS,
  FEATURE_FACTS,
  INSTALL_CONTROLLED_PARAGRAPH,
  INSTALL_INTRO_PARAGRAPH,
  INSTALL_SNIPPET,
  INTEGRATION_EXAMPLE,
  INTRO_CONTRIBUTING_PARAGRAPH,
  INTRO_DOGFOOD_PARAGRAPH,
  INTRO_HEADLINE_ACCENT,
  INTRO_HEADLINE_LEAD,
  INTRO_LICENSE_TAIL,
  INTRO_REACH_PARAGRAPH,
  LICENSE_NAME,
  LICENSE_URL,
  MODEL_BODY_PARAGRAPH,
  MODEL_KUDOS_HEADING,
  MODEL_KUDOS_PARAGRAPH,
  ROADMAP_ITEMS,
  ROADMAP_LEAD,
  USE_CASES,
  USECASES_LEAD,
  type DocInline,
  type DocParagraph,
} from "./docs";
import { CANVAS_TICKS } from "./canvas-theme";

// The CANVAS skin's content presentation — the light "document desk" counterpart
// to the Mosaic (`docs.tsx`) and Editorial (`content-editorial.tsx`) pane content.
// It reads the SAME shared content model and renders it in a wholly different
// system, so a section in Canvas looks unlike the same section in either other
// skin — never a second copy of the words.
//
// Design system — "greyish workspace":
//   • white pane cards on a soft grey desk (set by the page + `canvas-tile`)
//   • quiet NEUTRAL type: a sans reading column at a roomy measure, mono only for
//     small-caps eyebrows and code — no serif, no uppercase-mono density
//   • generous whitespace and hairline slate rules instead of heavy dividers
//   • the ONLY saturated color is the accent-tick language: term/detail lists
//     become file-row-like entries each led by a small colored tick that cycles
//     the signature pink · orange · yellow · green · cyan row; the intro carries
//     the full tick row as its accent mark
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

// The signature multi-color tick row — the Canvas accent mark, used sparingly.
function CanvasTickRow(): React.ReactElement {
  return (
    <span aria-hidden className="flex items-center gap-1.5">
      {CANVAS_TICKS.map((tick: string): React.ReactElement => (
        <span key={tick} className={`h-[3px] w-5 rounded-full ${tick}`} />
      ))}
    </span>
  );
}

function CanvasHeading({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <span aria-hidden className="h-[3px] w-6 rounded-full bg-cyan-400" />
      <h2 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.01em] text-slate-900">
        {children}
      </h2>
      <span aria-hidden className="h-px w-full bg-slate-100" />
    </div>
  );
}

function CanvasLead({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <p className="max-w-[64ch] text-[13.5px] leading-[1.75] text-slate-600">
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
    <code className="rounded-[4px] border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[12px] text-slate-700">
      {children}
    </code>
  );
}

function CanvasPre({ children }: { children: string }): React.ReactElement {
  return (
    <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-[12px] leading-relaxed text-slate-700">
      <code>{children}</code>
    </pre>
  );
}

// Canvas inline renderer: the same segment model, workspace decorations.
function CanvasInline({
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

// A workspace index — the Canvas treatment for every term/detail list (use
// cases, features, roadmap). Each row reads like a document-desk file entry: a
// small colored tick (cycling the signature accent row), the term, then its
// detail. Generic over the shared `{ term, detail }` shape.
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
          className="grid grid-cols-[0.75rem_1fr] items-baseline gap-x-3 gap-y-1 border-t border-slate-100 py-3 first:border-t-0 first:pt-0"
        >
          <span
            aria-hidden
            className={`mt-1.5 h-[3px] w-3 rounded-full ${
              CANVAS_TICKS[index % CANVAS_TICKS.length]
            }`}
          />
          <span className="text-[14px] font-medium leading-snug text-slate-800">
            {item.term}
          </span>
          <span className="col-start-2 max-w-[60ch] text-[12.5px] leading-[1.7] text-slate-500">
            {item.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

// --- Per-pane workspace content --------------------------------------------

function IntroContent(): React.ReactElement {
  return (
    <div className="flex min-h-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <CanvasKicker>dynamic tiling · for react</CanvasKicker>
          <CanvasTickRow />
        </div>
        <h1 className="text-[clamp(1.9rem,3.2vw,2.6rem)] font-semibold leading-[1.06] tracking-[-0.02em] text-slate-900">
          {INTRO_HEADLINE_LEAD}{" "}
          <span className="text-cyan-600">{INTRO_HEADLINE_ACCENT}</span>
        </h1>
        <span aria-hidden className="h-px w-full bg-slate-100" />
      </div>
      <CanvasLead>{CANONICAL_DESCRIPTION}</CanvasLead>
      <CanvasLead>{INTRO_REACH_PARAGRAPH}</CanvasLead>
      <p className="max-w-[64ch] rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-[1.7] text-slate-600">
        <CanvasInline paragraph={INTRO_DOGFOOD_PARAGRAPH} />
      </p>
      <div className="mt-auto flex flex-col gap-2 border-t border-slate-100 pt-4">
        <CanvasKicker>{CONTRIBUTING_EYEBROW}</CanvasKicker>
        <p className="max-w-[64ch] text-[12.5px] leading-[1.7] text-slate-500">
          <CanvasInline paragraph={INTRO_CONTRIBUTING_PARAGRAPH} />
        </p>
      </div>
      <footer className="border-t border-slate-100 pt-4 text-[11px] leading-[1.6] text-slate-400">
        <CanvasLink href={LICENSE_URL}>{LICENSE_NAME}</CanvasLink>
        {INTRO_LICENSE_TAIL}
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
      <CanvasHeading>Install &amp; integrate</CanvasHeading>
      <CanvasLead>
        <CanvasInline paragraph={INSTALL_INTRO_PARAGRAPH} />
      </CanvasLead>
      <CanvasPre>{INSTALL_SNIPPET}</CanvasPre>
      <CanvasLead>
        <CanvasInline paragraph={INSTALL_CONTROLLED_PARAGRAPH} />
      </CanvasLead>
      <CanvasPre>{INTEGRATION_EXAMPLE}</CanvasPre>
    </div>
  );
}

function FeaturesContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <CanvasHeading>Features</CanvasHeading>
      <CanvasIndex items={FEATURE_FACTS} />
    </div>
  );
}

function RoadmapContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <CanvasHeading>Roadmap</CanvasHeading>
      <CanvasLead>
        <CanvasInline paragraph={ROADMAP_LEAD} />
      </CanvasLead>
      <CanvasIndex items={ROADMAP_ITEMS} />
    </div>
  );
}

function ModelContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <CanvasHeading>The model</CanvasHeading>
      <CanvasLead>
        <CanvasInline paragraph={MODEL_BODY_PARAGRAPH} />
      </CanvasLead>
      <h3 className="text-[15px] font-semibold text-slate-900">
        {MODEL_KUDOS_HEADING}
      </h3>
      <CanvasLead>
        <CanvasInline paragraph={MODEL_KUDOS_PARAGRAPH} />
      </CanvasLead>
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
  roadmap: RoadmapContent,
  model: ModelContent,
  discoverability: DiscoverabilityContent,
};

// Workspace content for a documentation pane, keyed by the same pane id the
// Mosaic `DOC_PANES` uses. Returns `null` for ids without a mapping (e.g. the
// interactive `controls` pane, which owns its own skin-aware markup).
export function CanvasPaneContent({
  paneId,
}: {
  paneId: string;
}): React.ReactElement | null {
  const Body: (() => React.ReactElement) | undefined =
    CANVAS_PANE_CONTENT[paneId];
  return Body != null ? <Body /> : null;
}
