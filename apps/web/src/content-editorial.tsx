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

// The EDITORIAL skin's content presentation — the "paper & ink" counterpart to
// the Mosaic (`docs.tsx`) pane content. It reads the SAME shared content model
// (paragraphs, snippets, and the use-case / feature / roadmap lists) and renders
// it in a wholly different typographic system, so switching skins reads as
// flipping between two designs of one site — never a second copy of the words.
//
// Design system — "editorial paper & ink":
//   • warm paper canvas (set on <main> by the page), near-white pane cards
//   • a serif display face (Fraunces) for headlines set large and quiet
//   • ink body type at a generous 1.85 measure — a reading column, not a UI list
//   • mono small-caps kickers + a hairline ink rule under every heading
//   • lists become a NUMBERED editorial index (01 — term, then detail) instead
//     of the Mosaic divide-y micro-rows
//   • monochrome ink accent (no gold): links are ink with a thin rule, emphasis
//     is italic serif — the deliberate opposite of Mosaic's dark/amber chrome.

// --- Editorial ink palette (single source for the skin's colors) -----------
export const EDITORIAL_INK: string = "#241f17";
export const EDITORIAL_INK_BODY: string = "#4b4335";
export const EDITORIAL_INK_MUTED: string = "#8c8069";
export const EDITORIAL_RULE: string = "#ddd3bd";
export const EDITORIAL_CARD: string = "#fbf9f2";
export const EDITORIAL_CODE_SURFACE: string = "#efe8d6";

// --- Editorial primitives --------------------------------------------------

function EditorialKicker({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#8c8069]">
      {children}
    </span>
  );
}

function EditorialHeading({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="font-display text-[26px] font-normal leading-[1.08] tracking-[-0.01em] text-[#241f17]">
        {children}
      </h2>
      <span aria-hidden className="h-px w-full bg-[#ddd3bd]" />
    </div>
  );
}

function EditorialLead({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <p className="max-w-[64ch] text-[14px] leading-[1.85] text-[#4b4335]">
      {children}
    </p>
  );
}

function EditorialLink({
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
      className="text-[#241f17] underline decoration-[#bcae90] underline-offset-[3px] transition-colors hover:decoration-[#241f17]"
    >
      {children}
    </a>
  );
}

function EditorialCode({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <code className="rounded-[3px] border border-[#ddd4bf] bg-[#efe8d6] px-1.5 py-0.5 font-mono text-[12px] text-[#3a3327]">
      {children}
    </code>
  );
}

function EditorialPre({ children }: { children: string }): React.ReactElement {
  return (
    <pre className="overflow-x-auto border-l-2 border-[#c9bd9f] bg-[#f3eede] py-3 pl-4 pr-3 font-mono text-[12px] leading-relaxed text-[#3a3327]">
      <code>{children}</code>
    </pre>
  );
}

// Editorial inline renderer: the same segment model, editorial decorations.
function EditorialInline({
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
          return <EditorialCode key={index}>{segment.code}</EditorialCode>;
        }
        if ("em" in segment) {
          return (
            <em key={index} className="font-display italic text-[#241f17]">
              {segment.em}
            </em>
          );
        }
        return (
          <EditorialLink key={index} href={segment.href}>
            {segment.link}
          </EditorialLink>
        );
      })}
    </>
  );
}

// A numbered editorial index — the Editorial treatment for every term/detail
// list (use cases, features, roadmap). Generic over the shared `{ term, detail }`
// shape, so it stays data-driven from the existing content model.
interface TermDetail {
  readonly term: string;
  readonly detail: string;
}

function EditorialIndex({
  items,
}: {
  items: ReadonlyArray<TermDetail>;
}): React.ReactElement {
  return (
    <ol className="flex flex-col">
      {items.map((item: TermDetail, index: number): React.ReactElement => (
        <li
          key={item.term}
          className="grid grid-cols-[2rem_1fr] gap-x-3 gap-y-1 border-t border-[#e6ddc9] py-3 first:border-t-0 first:pt-0"
        >
          <span
            aria-hidden
            className="pt-0.5 font-mono text-[11px] tabular-nums tracking-[0.1em] text-[#b0a487]"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="font-display text-[15px] leading-snug text-[#241f17]">
            {item.term}
          </span>
          <span className="col-start-2 max-w-[60ch] text-[13px] leading-[1.75] text-[#5c5342]">
            {item.detail}
          </span>
        </li>
      ))}
    </ol>
  );
}

// --- Per-pane editorial content --------------------------------------------

function IntroContent(): React.ReactElement {
  return (
    <div className="flex min-h-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        <EditorialKicker>dynamic tiling · for react</EditorialKicker>
        <h1 className="font-display text-[clamp(2.1rem,3.6vw,3rem)] font-normal leading-[1.04] tracking-[-0.02em] text-[#241f17]">
          {INTRO_HEADLINE_LEAD}{" "}
          <em className="font-display italic text-[#7a6a4c]">
            {INTRO_HEADLINE_ACCENT}
          </em>
        </h1>
        <span aria-hidden className="h-px w-full bg-[#ddd3bd]" />
      </div>
      <EditorialLead>{CANONICAL_DESCRIPTION}</EditorialLead>
      <EditorialLead>{INTRO_REACH_PARAGRAPH}</EditorialLead>
      <p className="max-w-[64ch] border-l-2 border-[#c9bd9f] pl-4 font-display text-[15px] italic leading-[1.7] text-[#4b4335]">
        <EditorialInline paragraph={INTRO_DOGFOOD_PARAGRAPH} />
      </p>
      <div className="mt-auto flex flex-col gap-2 border-t border-[#ddd3bd] pt-4">
        <EditorialKicker>{CONTRIBUTING_EYEBROW}</EditorialKicker>
        <p className="max-w-[64ch] text-[13px] leading-[1.75] text-[#5c5342]">
          <EditorialInline paragraph={INTRO_CONTRIBUTING_PARAGRAPH} />
        </p>
      </div>
      <footer className="border-t border-[#ddd3bd] pt-4 text-[11px] leading-[1.6] text-[#8c8069]">
        <EditorialLink href={LICENSE_URL}>{LICENSE_NAME}</EditorialLink>
        {INTRO_LICENSE_TAIL}
      </footer>
    </div>
  );
}

function UseCasesContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <EditorialHeading>Use cases</EditorialHeading>
      <EditorialLead>{USECASES_LEAD}</EditorialLead>
      <EditorialIndex items={USE_CASES} />
    </div>
  );
}

function InstallContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <EditorialHeading>Install &amp; integrate</EditorialHeading>
      <EditorialLead>
        <EditorialInline paragraph={INSTALL_INTRO_PARAGRAPH} />
      </EditorialLead>
      <EditorialPre>{INSTALL_SNIPPET}</EditorialPre>
      <EditorialLead>
        <EditorialInline paragraph={INSTALL_CONTROLLED_PARAGRAPH} />
      </EditorialLead>
      <EditorialPre>{INTEGRATION_EXAMPLE}</EditorialPre>
    </div>
  );
}

function FeaturesContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <EditorialHeading>Features</EditorialHeading>
      <EditorialIndex items={FEATURE_FACTS} />
    </div>
  );
}

function RoadmapContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <EditorialHeading>Roadmap</EditorialHeading>
      <EditorialLead>
        <EditorialInline paragraph={ROADMAP_LEAD} />
      </EditorialLead>
      <EditorialIndex items={ROADMAP_ITEMS} />
    </div>
  );
}

function ModelContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <EditorialHeading>The model</EditorialHeading>
      <EditorialLead>
        <EditorialInline paragraph={MODEL_BODY_PARAGRAPH} />
      </EditorialLead>
      <h3 className="font-display text-[17px] font-normal italic text-[#241f17]">
        {MODEL_KUDOS_HEADING}
      </h3>
      <EditorialLead>
        <EditorialInline paragraph={MODEL_KUDOS_PARAGRAPH} />
      </EditorialLead>
    </div>
  );
}

function DiscoverabilityContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <EditorialHeading>SEO &amp; LLM friendly</EditorialHeading>
      {DISCOVERABILITY_PARAGRAPHS.map(
        (paragraph: DocParagraph, index: number): React.ReactElement => (
          <EditorialLead key={index}>
            <EditorialInline paragraph={paragraph} />
          </EditorialLead>
        ),
      )}
    </div>
  );
}

const EDITORIAL_PANE_CONTENT: Record<string, () => React.ReactElement> = {
  intro: IntroContent,
  usecases: UseCasesContent,
  install: InstallContent,
  features: FeaturesContent,
  roadmap: RoadmapContent,
  model: ModelContent,
  discoverability: DiscoverabilityContent,
};

// Editorial content for a documentation pane, keyed by the same pane id the
// Mosaic `DOC_PANES` uses. Returns `null` for ids without an editorial mapping
// (e.g. the interactive `controls` pane, which owns its own skin-aware markup).
export function EditorialPaneContent({
  paneId,
}: {
  paneId: string;
}): React.ReactElement | null {
  const Body: (() => React.ReactElement) | undefined =
    EDITORIAL_PANE_CONTENT[paneId];
  return Body != null ? <Body /> : null;
}
