import * as React from "react";
import {
  DISCOVERABILITY_PARAGRAPHS,
  FEATURE_CORE,
  FEATURE_LATEST,
  FEATURE_LATEST_SINCE,
  FEATURE_RECENT,
  FEATURE_RECENT_SINCE,
  INSTALL_CONTROLLED_PARAGRAPH,
  INSTALL_INTRO_PARAGRAPH,
  INSTALL_SNIPPET,
  INTEGRATION_EXAMPLE,
  INTRO_H1,
  INTRO_HEADLINE_ACCENT,
  INTRO_HEADLINE_LEAD,
  INTRO_LICENSE_TAIL,
  INTRO_ONE_LINER,
  INTRO_REACH_PARAGRAPH,
  INTRO_KUDOS_PARAGRAPH,
  LICENSE_NAME,
  LICENSE_URL,
  ROADMAP_REST,
  GUIDE_LINKS_HEADING,
  guideLinks,
  introLinks,
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
  type IntroLink,
} from "./docs";
import { useIsMobileHomeViewport } from "./mobile-home/use-viewport";

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

export function EditorialHeading({
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

export function EditorialLead({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <p className="max-w-[64ch] text-[15px] leading-[1.7] text-[#4b4335]">
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
export function EditorialInline({
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
  readonly link?: { readonly label: string; readonly href: string };
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
            {item.link != null ? (
              <>
                {" "}
                <EditorialLink href={item.link.href}>{item.link.label}</EditorialLink>
              </>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

// The guide links: one small-caps kicker over a plain list of links. `compact`
// is the intro tile's footer on the mobile layout (small type); the Use cases
// tile carries the full size under its index.
function EditorialGuideLinks({
  compact = false,
}: {
  compact?: boolean;
}): React.ReactElement | null {
  const links: ReadonlyArray<IntroLink> = guideLinks();
  if (links.length === 0) {
    return null;
  }
  return (
    <nav
      aria-label={GUIDE_LINKS_HEADING}
      className={
        compact
          ? "mb-2 mt-2 flex flex-col gap-1.5"
          : "flex flex-col gap-1.5"
      }
    >
      <EditorialKicker>{GUIDE_LINKS_HEADING}</EditorialKicker>
      <ul
        className={`flex flex-col gap-0.5 ${
          compact ? "text-[12px] leading-[1.4]" : "text-[13px] leading-[1.6] text-[#5c5342]"
        }`}
      >
        {links.map(
          (link: IntroLink): React.ReactElement => (
            <li key={link.href}>
              <EditorialLink href={link.href}>{link.label}</EditorialLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}

// Mobile layout only (see MosaicIntroGuides in docs.tsx for why).
function EditorialIntroGuides(): React.ReactElement | null {
  return useIsMobileHomeViewport() ? <EditorialGuideLinks compact /> : null;
}

// --- Per-pane editorial content --------------------------------------------

function IntroContent(): React.ReactElement {
  return (
    <div className="flex min-h-full flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <EditorialKicker>dynamic tiling · for react</EditorialKicker>
        <h1 className="font-display min-h-[2.08em] text-balance text-[clamp(1.4rem,2.05vw,2.15rem)] max-[760px]:text-[1.75rem] font-normal leading-[1.04] tracking-[-0.02em] text-[#241f17]">
          {INTRO_H1}
        </h1>
        <p className="font-display text-[clamp(0.75rem,1.05vw,1.1rem)] font-normal max-[760px]:text-[1.1rem] leading-[1.15] tracking-[-0.01em] text-[#4b4335]">
          {INTRO_HEADLINE_LEAD}{" "}
          <em className="font-display italic text-[#7a6a4c]">
            {INTRO_HEADLINE_ACCENT}
          </em>
        </p>
        <span aria-hidden className="h-px w-full bg-[#ddd3bd]" />
      </div>
      <p className="max-w-[64ch] text-[15px] leading-[1.5] text-[#4b4335]">
        {INTRO_ONE_LINER}
      </p>
      <p className="max-w-[64ch] text-[15px] leading-[1.5] text-[#4b4335]">
        {INTRO_REACH_PARAGRAPH}
      </p>
      <footer className="mt-auto border-t border-[#ddd3bd] pt-2 text-[11px] leading-[1.4] text-[#8c8069]">
        <nav
          aria-label="Explore hypr-tiling"
          className="mb-1 flex flex-wrap items-center gap-x-2 text-[12px] leading-[1.4] text-[#8c8069]"
        >
          {introLinks().map(
            (link: IntroLink, index: number): React.ReactElement => (
              <React.Fragment key={link.href}>
                {index > 0 ? <span aria-hidden>·</span> : null}
                <EditorialLink href={link.href}>{link.label}</EditorialLink>
              </React.Fragment>
            ),
          )}
        </nav>
        <EditorialIntroGuides />
        <EditorialLink href={LICENSE_URL}>{LICENSE_NAME}</EditorialLink>
        {INTRO_LICENSE_TAIL}
        {" · "}
        <EditorialInline paragraph={INTRO_KUDOS_PARAGRAPH} />
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
      <EditorialGuideLinks />
    </div>
  );
}

function InstallContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <EditorialHeading>Install</EditorialHeading>
      <EditorialPre>{INSTALL_SNIPPET}</EditorialPre>
      <EditorialPre>{INTEGRATION_EXAMPLE}</EditorialPre>
      <EditorialLead>
        <EditorialInline paragraph={INSTALL_INTRO_PARAGRAPH} />
      </EditorialLead>
      <EditorialLead>
        <EditorialInline paragraph={INSTALL_CONTROLLED_PARAGRAPH} />
      </EditorialLead>
    </div>
  );
}

function FeaturesContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <EditorialHeading>Ships today</EditorialHeading>
      <EditorialKicker>core tiling</EditorialKicker>
      <EditorialIndex items={FEATURE_CORE} />
      <EditorialKicker>since {FEATURE_RECENT_SINCE}</EditorialKicker>
      <EditorialIndex items={FEATURE_RECENT} />
      <EditorialKicker>since {FEATURE_LATEST_SINCE}</EditorialKicker>
      <EditorialIndex items={FEATURE_LATEST} />
    </div>
  );
}

function WorkspacesContent(): React.ReactElement {
  return (
    <div className="flex flex-col gap-5">
      <EditorialHeading>{WORKSPACES_HEADING}</EditorialHeading>
      <EditorialLead>
        <EditorialInline paragraph={WORKSPACES_LEAD} />
      </EditorialLead>
      <EditorialLead>
        <EditorialInline paragraph={WORKSPACES_SHIPPED} />
      </EditorialLead>
      <p>
        <EditorialLink href={WORKSPACES_HOWTO_HREF}>
          {WORKSPACES_HOWTO_LABEL}
        </EditorialLink>
      </p>
      <div className="flex flex-col gap-4 border-t border-[#ddd3bd] pt-5">
        <EditorialKicker>{WORKSPACES_ALSO_PLANNED}</EditorialKicker>
        <EditorialIndex items={ROADMAP_REST} />
      </div>
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
  workspaces: WorkspacesContent,
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
