import * as React from "react";
import type { TilingTileAccent } from "@n-uf/hypr-tiling";

// Single source of truth for the homepage's documentation surface. The same
// section content is rendered (a) inside the tiling panes for the interactive
// page and (b) into the prerendered HTML for crawlers / LLM fetchers. Plain-text
// mirrors used by `<meta>`, JSON-LD, and `llms.txt` live alongside the JSX so
// the quotable copy stays consistent across every surface.
//
// Typography system (the "mosaic" identity): Fraunces (display serif) for the
// wordmark + section headings, Inter for body at a comfortable 1.7 measure,
// JetBrains Mono for eyebrows / code / keys. A single gold (amber) accent is the
// only chrome color, applied sparingly — eyebrows, the heading tick, links, and
// inline code.

export const PACKAGE_NAME: string = "@n-uf/hypr-tiling";
// Canonical homepage base. The docs homepage lives at the site root.
export const SITE_URL: string = "https://hypr-tiling.n-uf.com/";
export const REPO_URL: string = "https://github.com/n-uf/hypr-tiling";
// The prerendered documentation route (guides + generated API reference). Its
// own static HTML lives at `dist/docs/index.html` (see prerender.mjs).
export const DOCS_URL: string = `${SITE_URL.replace(/\/$/, "")}/docs`;
export const API_REFERENCE_URL: string =
  "https://github.com/n-uf/hypr-tiling/blob/main/packages/hypr-tiling/etc/hypr-tiling.api.md";
export const CHANGELOG_URL: string =
  "https://github.com/n-uf/hypr-tiling/blob/main/packages/hypr-tiling/CHANGELOG.md";
export const SOCIAL_IMAGE_PATH: string = "/social/hypr-tiling-social-preview.png";
export const SOCIAL_IMAGE_URL: string = `${SITE_URL.replace(/\/$/, "")}${SOCIAL_IMAGE_PATH}`;
export const TWITTER_SITE_HANDLE: string = "@n_uf";
export const TWITTER_CREATOR_HANDLE: string = "@n_uf";

// License, sourced from packages/hypr-tiling/package.json
// (`LicenseRef-PolyForm-Perimeter-1.0.1`) and the repo-root LICENSE text.
// polyformproject.org serves the latest Perimeter version (1.0.1) as the
// authoritative canonical text; this URL matches the JSON-LD `license` field
// in entry-server.tsx.
export const LICENSE_NAME: string = "PolyForm Perimeter 1.0.1";
export const LICENSE_URL: string =
  "https://polyformproject.org/licenses/perimeter/1.0.1";

export const PAGE_TITLE: string = "hypr-tiling — dynamic tiling for React";

// One canonical sentence an LLM can quote verbatim.
export const CANONICAL_DESCRIPTION: string =
  "hypr-tiling is a dynamic tiling layout engine for React: a recursive split-tree renderer that lets users drag, drop, resize, group, maximize, and keyboard-control resizable panes at runtime, with a theming engine and self-healing drag recovery — inspired by the Hyprland Wayland compositor.";

export const INSTALL_SNIPPET: string =
  "pnpm add @n-uf/hypr-tiling react react-dom";

export type FeatureGroup = "core" | "recent";

export interface FeatureFact {
  readonly term: string;
  readonly detail: string;
  readonly group: FeatureGroup;
}

// Verified against the published export surface (packages/hypr-tiling/index.ts).
// `detail` stays ≤ 12 words so the home features pane skims in one pass.
export const FEATURE_FACTS: ReadonlyArray<FeatureFact> = [
  {
    term: "Split tree",
    detail: "You own a leaf, split, and group layout.",
    group: "core",
  },
  {
    term: "Drag & drop",
    detail: "Live ghost; swap, insert, or group-merge.",
    group: "core",
  },
  {
    term: "Resize",
    detail: "Drag dividers, or pin a pane in pixels.",
    group: "core",
  },
  {
    term: "Tab groups",
    detail: "Stack leaves; only the active tab paints.",
    group: "core",
  },
  {
    term: "Keyboard",
    detail: "Focus, cycle, maximize; remappable commands.",
    group: "core",
  },
  {
    term: "Pane collapse",
    detail: "Titlebar-only pin; chrome resize floor.",
    group: "recent",
  },
  {
    term: "Compact ghost",
    detail: "Chip ghost plus host external-drop claim.",
    group: "recent",
  },
  {
    term: "Drag chrome",
    detail: "Themeable ghost; overlay portal for tokens.",
    group: "recent",
  },
  {
    term: "Pane identity",
    detail: "Same React instance through drag and drop.",
    group: "recent",
  },
  {
    term: "Persist layout",
    detail: "Save and heal the tree on load.",
    group: "recent",
  },
  {
    term: "Workspaces",
    detail: "Several layout trees over one tile pool.",
    group: "recent",
  },
];

export const FEATURE_CORE: ReadonlyArray<FeatureFact> = FEATURE_FACTS.filter(
  (fact: FeatureFact): boolean => fact.group === "core",
);
export const FEATURE_RECENT: ReadonlyArray<FeatureFact> = FEATURE_FACTS.filter(
  (fact: FeatureFact): boolean => fact.group === "recent",
);

interface SeoFaqItem {
  readonly question: string;
  readonly answer: string;
}

export const SEO_FAQ_ITEMS: ReadonlyArray<SeoFaqItem> = [
  {
    question: "Does hypr-tiling render semantic HTML for docs pages?",
    answer:
      "Yes. The docs content is emitted as semantic DOM inside panes and prerendered to static HTML so crawlers can read it without executing JavaScript.",
  },
  {
    question: "How do I install hypr-tiling in a React app?",
    answer: "Run: pnpm add @n-uf/hypr-tiling react react-dom",
  },
  {
    question: "Can I control layout state myself?",
    answer:
      "Yes. TilingRenderer is controlled: your app owns the layout tree and applies updates via onLayoutChange.",
  },
  {
    question: "Does hypr-tiling support multiple workspaces over one tile pool?",
    answer:
      "Yes. Pass workspaces + onWorkspacesChange (TilingWorkspaceSet) instead of layout + onLayoutChange. useTilingWorkspaceTabs, useTilingWorkspaceSetController, WORKSPACE_KEY_BINDINGS, swipe, slide/fade transition, and spring-load tab drop ship on the public API (26.9.3–26.9.8).",
  },
];

interface UseCase {
  readonly term: string;
  readonly detail: string;
}

// The scenarios the tiling engine is built for. Promoted from the buried clause
// in the intro positioning copy into an explicit, scannable list. Kept in sync
// with the `## Use cases` section in the repo README.
export const USE_CASES: ReadonlyArray<UseCase> = [
  {
    term: "Dashboards",
    detail: "Metrics panes that share one screen.",
  },
  {
    term: "IDE-like tools",
    detail: "Editor, preview, and terminal, rearranged live.",
  },
  {
    term: "Trading consoles",
    detail: "Dense, keyboard-driven panels in one viewport.",
  },
  {
    term: "Content sites",
    detail: "SEO tiles — this page is one.",
  },
];

interface RoadmapItem {
  readonly term: string;
  readonly detail: string;
}

// Planned directions — explicitly NOT shipped today. The library currently
// renders to the DOM and ships a React adapter only; everything below is on the
// roadmap. Kept in sync with the `## Roadmap` section in both READMEs. The
// framing copy (the pane lead) makes the planned-vs-current distinction
// unmissable so the page never misrepresents today's capabilities.
export const ROADMAP_ITEMS: ReadonlyArray<RoadmapItem> = [
  {
    term: "Framework-agnostic core",
    detail: "Vanilla TypeScript engine; no React required.",
  },
  {
    term: "Framework adapters",
    detail: "Vue, Svelte, Solid, Angular, and Web Components.",
  },
  {
    term: "Canvas backend",
    detail: "Optional GPU path for dense pane counts.",
  },
  {
    term: "Rust + WASM core",
    detail: "Hot path for high-frame-rate tiling math.",
  },
];

export const ROADMAP_REST: ReadonlyArray<RoadmapItem> = ROADMAP_ITEMS;

interface DocPaneSpec {
  readonly id: string;
  readonly title: string;
  readonly accent: TilingTileAccent;
  // A short plain-text summary used by the prerender text mirror / llms.txt.
  readonly summary: string;
  readonly content: React.ReactNode;
}

// --- Mosaic typography primitives -----------------------------------------

export function Eyebrow({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber-300/80">
      {children}
    </span>
  );
}

// Section heading: Fraunces display serif preceded by a short gold tick — the
// coherent form vocabulary marker used across every pane (no icons).
export function SectionHeading({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="h-3.5 w-[2px] shrink-0 rounded-full bg-amber-300/70"
      />
      <h2 className="font-display text-[20px] font-medium leading-tight tracking-[-0.01em] text-stone-50">
        {children}
      </h2>
    </div>
  );
}

export function SectionLead({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <p className="max-w-[62ch] text-[15px] leading-[1.6] text-stone-300/90">
      {children}
    </p>
  );
}

export function Code({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <code className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[12px] text-amber-200/90">
      {children}
    </code>
  );
}

// A link styled in the mosaic accent. External destinations (absolute
// `http(s)://` URLs to another origin) open in a new tab with
// `rel="noopener noreferrer"`; same-site hrefs (e.g. `/docs`, hash
// anchors) stay in the current tab. Classification is by destination so the
// behavior is centralized here rather than repeated per anchor.
function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export function Link({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  const external: boolean = isExternalHref(href);
  return (
    <a
      href={href}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className="text-amber-200 underline decoration-amber-400/40 underline-offset-[3px] transition-colors hover:text-amber-100 hover:decoration-amber-300/70"
    >
      {children}
    </a>
  );
}

export function Pre({ children }: { children: string }): React.ReactElement {
  return (
    <pre className="overflow-x-auto rounded-md border border-white/[0.08] bg-[#0a0b0d] p-3.5 font-mono text-[12px] leading-relaxed text-stone-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <code>{children}</code>
    </pre>
  );
}

// --- Shared inline-rich content model (skin-agnostic) ---------------------
//
// Both pane presentations — Mosaic (dark technical atlas) and Minimal (light
// editorial) — render from THIS single source. The words live here exactly
// once; only the typography and layout differ per skin, so switching skins is a
// change of PRESENTATION, never a fork of the content. A paragraph is a small
// sequence of inline segments (plain text, inline code, emphasis, or a link) so
// each skin can decorate `code` / `em` / `link` in its own vocabulary while the
// prose stays identical.
export type DocInline =
  | string
  | { readonly code: string }
  | { readonly em: string }
  | { readonly link: string; readonly href: string };

export type DocParagraph = ReadonlyArray<DocInline>;

// Intro pane.
export const INTRO_HEADLINE_LEAD: string = "Rearrange the interface,";
export const INTRO_HEADLINE_ACCENT: string = "at runtime.";
export const INTRO_ONE_LINER: string =
  "A controlled tiling renderer for React — drag, resize, group, and keyboard-drive panes.";
export const INTRO_REACH_PARAGRAPH: string =
  "Built for dashboards, IDE-like tools, and operator consoles. You own the layout tree.";
export const CONTRIBUTING_EYEBROW: string = "contributing";
export const INTRO_CONTRIBUTING_PARAGRAPH: DocParagraph = [
  "hypr-tiling is built in the open and welcomes collaboration — framework adapters, rendering backends, bug reports, and ideas from the roadmap. To get involved, reach out at ",
  { link: "metelin@gmail.com", href: "mailto:metelin@gmail.com" },
  ".",
];
export const INTRO_LICENSE_TAIL: string =
  " · source-available · free commercial use · no competing use";
export const HYPRLAND_URL: string = "https://hypr.land";
export const INTRO_KUDOS_PARAGRAPH: DocParagraph = [
  "Kudos to ",
  { link: "Hyprland", href: HYPRLAND_URL },
  " — detach-and-drop, master/stack, and keyboard focus.",
];

// Use-cases pane lead (the list itself is `USE_CASES`).
export const USECASES_LEAD: string =
  "Any screen with several panes the user rearranges.";

// Install pane prose (snippets are `INSTALL_SNIPPET` / `INTEGRATION_EXAMPLE`).
export const INSTALL_INTRO_PARAGRAPH: DocParagraph = [
  "React 19 peers. Full walkthrough in the ",
  { link: "quickstart", href: "/docs#quickstart" },
  ".",
];
export const INSTALL_CONTROLLED_PARAGRAPH: DocParagraph = [
  "You own the tree; apply every edit from your app.",
];
export const INSTALL_VERSIONING_PARAGRAPH: DocParagraph = [
  "Versions follow calendar alignment, ",
  { code: "YY.M.R" },
  " (year, month, release). The number does not carry SemVer major semantics. The library is in active development; any release may break backward compatibility. Pin an exact version in your manifest and read the per-release notes in the ",
  { link: "changelog", href: "/docs#changelog" },
  " before you upgrade.",
];

export const WORKSPACES_HEADING: string = "Workspaces";
export const WORKSPACES_LEAD: DocParagraph = [
  "One layout per workspace, one active at a time. Switch with the tabs, a swipe, or Alt+1..9 — drag a pane onto a tab to move it there.",
];
export const WORKSPACES_SHIPPED: DocParagraph = [
  "You are using it now: this page is a set of three workspaces.",
];
export const WORKSPACES_HOWTO_LABEL: string = "Workspaces how-to \u2192";
export const WORKSPACES_HOWTO_HREF: string = "/docs#howto-workspaces";
export const WORKSPACES_ALSO_PLANNED: string = "Also planned";

// Roadmap pane lead (the list itself is `ROADMAP_ITEMS`).
export const ROADMAP_LEAD: DocParagraph = [
  { em: "Planned" },
  ", not shipped. React + DOM only today.",
];

// SEO + LLM pane.
export const DISCOVERABILITY_PARAGRAPHS: ReadonlyArray<DocParagraph> = [
  [
    "Every pane is real semantic HTML, prerendered. Crawlers and LLMs read it without JavaScript. A ",
    { code: "/llms.txt" },
    " mirror ships too.",
  ],
];

// Mosaic inline renderer: maps the shared segment model to the Mosaic
// vocabulary (gold inline code, gold links, neutral emphasis).
export function MosaicInline({
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
          return <Code key={index}>{segment.code}</Code>;
        }
        if ("em" in segment) {
          return (
            <em key={index} className="not-italic text-stone-200">
              {segment.em}
            </em>
          );
        }
        return (
          <Link key={index} href={segment.href}>
            {segment.link}
          </Link>
        );
      })}
    </>
  );
}

export const INTEGRATION_EXAMPLE: string = `import { TilingRenderer, DEFAULT_TILING_LAYOUT_CONFIG } from "@n-uf/hypr-tiling";

<TilingRenderer
  layout={layout}
  tiles={tiles}
  config={DEFAULT_TILING_LAYOUT_CONFIG}
  onLayoutChange={setLayout}
/>`;

function MosaicFactList({
  facts,
  sinceMark,
}: {
  facts: ReadonlyArray<FeatureFact>;
  sinceMark: boolean;
}): React.ReactElement {
  return (
    <dl className="flex flex-col divide-y divide-white/[0.05]">
      {facts.map(
        (fact: FeatureFact): React.ReactElement => (
          <div
            key={fact.term}
            className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0"
          >
            <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px] font-medium text-stone-100">
              {fact.term}
              {sinceMark ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-amber-200/70">
                  since 26.9.x
                </span>
              ) : null}
            </dt>
            <dd className="text-[15px] leading-[1.45] text-stone-400">
              {fact.detail}
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}

export const DOC_PANES: ReadonlyArray<DocPaneSpec> = [
  {
    id: "intro",
    title: "hypr-tiling",
    accent: "amber",
    summary:
      "Dynamic tiling for React. A recursive split-tree renderer for runtime-rearrangeable, resizable panes.",
    content: (
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-2">
          <Eyebrow>dynamic tiling · for react</Eyebrow>
          <h1 className="font-display text-[clamp(2rem,3.2vw,2.65rem)] font-medium leading-[1.02] tracking-[-0.015em] text-stone-50">
            {INTRO_HEADLINE_LEAD}{" "}
            <em className="font-display italic text-amber-200/90">
              {INTRO_HEADLINE_ACCENT}
            </em>
          </h1>
        </div>
        <p className="max-w-[62ch] text-[15px] leading-[1.45] text-stone-300/90">
          {INTRO_ONE_LINER}
        </p>
        <p className="max-w-[62ch] text-[15px] leading-[1.45] text-stone-300/90">
          {INTRO_REACH_PARAGRAPH}
        </p>
        <footer className="mt-auto border-t border-white/[0.08] pt-2 text-[11px] leading-[1.4] text-stone-500">
          <Link href={LICENSE_URL}>{LICENSE_NAME}</Link>
          {INTRO_LICENSE_TAIL}
          {" · "}
          <MosaicInline paragraph={INTRO_KUDOS_PARAGRAPH} />
        </footer>
      </div>
    ),
  },
  {
    id: "usecases",
    title: "use cases",
    accent: "amber",
    summary:
      "Dashboards, IDE-like tools, trading consoles, and content sites — any screen with several panes the user rearranges.",
    content: (
      <div className="flex flex-col gap-4">
        <SectionHeading>Use cases</SectionHeading>
        <SectionLead>{USECASES_LEAD}</SectionLead>
        <ul className="flex flex-col divide-y divide-white/[0.05]">
          {USE_CASES.map(
            (useCase: UseCase): React.ReactElement => (
              <li
                key={useCase.term}
                className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="text-[15px] font-medium text-stone-100">
                  {useCase.term}
                </span>
                <span className="max-w-[60ch] text-[15px] leading-[1.45] text-stone-400">
                  {useCase.detail}
                </span>
              </li>
            ),
          )}
        </ul>
      </div>
    ),
  },
  {
    id: "install",
    title: "install",
    accent: "amber",
    summary:
      "Install with pnpm add @n-uf/hypr-tiling react react-dom. Calendar YY.M.R versioning — pin exact releases and read the changelog before upgrading. React 19 peer deps. Render TilingRenderer with controlled layout state.",
    content: (
      <div className="flex flex-col gap-4">
        <SectionHeading>Install</SectionHeading>
        <Pre>{INSTALL_SNIPPET}</Pre>
        <SectionHeading>Versioning</SectionHeading>
        <SectionLead>
          <MosaicInline paragraph={INSTALL_VERSIONING_PARAGRAPH} />
        </SectionLead>
        <Pre>{INTEGRATION_EXAMPLE}</Pre>
        <SectionLead>
          <MosaicInline paragraph={INSTALL_INTRO_PARAGRAPH} />
        </SectionLead>
        <SectionLead>
          <MosaicInline paragraph={INSTALL_CONTROLLED_PARAGRAPH} />
        </SectionLead>
      </div>
    ),
  },
  {
    id: "features",
    title: "features",
    accent: "amber",
    summary:
      "Core: split tree, drag & drop, resize, tab groups, keyboard. Since 26.9.x: pane collapse, compact ghost, drag chrome, pane identity, persist layout, workspaces (TilingWorkspaceSet).",
    content: (
      <div className="flex flex-col gap-4">
        <SectionHeading>Ships today</SectionHeading>
        <div className="flex flex-col gap-3">
          <Eyebrow>core tiling</Eyebrow>
          <MosaicFactList facts={FEATURE_CORE} sinceMark={false} />
        </div>
        <div className="flex flex-col gap-3">
          <Eyebrow>since 26.9.x</Eyebrow>
          <MosaicFactList facts={FEATURE_RECENT} sinceMark={true} />
        </div>
      </div>
    ),
  },
  {
    id: "workspaces",
    title: "workspaces",
    accent: "amber",
    summary:
      "One layout per workspace, one active at a time. Switch with the tabs, a swipe, or Alt+1..9 — drag a pane onto a tab to move it there. This page is a set of three workspaces.",
    content: (
      <div className="flex flex-col gap-4">
        <SectionHeading>{WORKSPACES_HEADING}</SectionHeading>
        <SectionLead>
          <MosaicInline paragraph={WORKSPACES_LEAD} />
        </SectionLead>
        <SectionLead>
          <MosaicInline paragraph={WORKSPACES_SHIPPED} />
        </SectionLead>
        <p>
          <Link href={WORKSPACES_HOWTO_HREF}>{WORKSPACES_HOWTO_LABEL}</Link>
        </p>
        <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4">
          <Eyebrow>{WORKSPACES_ALSO_PLANNED}</Eyebrow>
          <ul className="flex flex-col divide-y divide-white/[0.05]">
            {ROADMAP_REST.map(
              (item: RoadmapItem): React.ReactElement => (
                <li
                  key={item.term}
                  className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-[15px] font-medium text-stone-100">
                    {item.term}
                  </span>
                  <span className="text-[15px] leading-[1.45] text-stone-400">
                    {item.detail}
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "discoverability",
    title: "seo + llm",
    accent: "amber",
    summary:
      "Panes emit real semantic DOM (headings, paragraphs, lists), not canvas. Prerendered to static HTML so crawlers and LLM fetchers read the content without executing JS.",
    content: (
      <div className="flex flex-col gap-4">
        <SectionHeading>SEO &amp; LLM friendly</SectionHeading>
        {DISCOVERABILITY_PARAGRAPHS.map(
          (paragraph: DocParagraph, index: number): React.ReactElement => (
            <SectionLead key={index}>
              <MosaicInline paragraph={paragraph} />
            </SectionLead>
          ),
        )}
      </div>
    ),
  },
];

// Which section of the task-first /docs IA a topic belongs to, used to group the
// sidebar and the llms.txt index. The reading order leads with the graceful path
// (Quickstart → "How do I…" recipes → minimal Concepts → runnable Examples) and
// DEMOTES the generated per-symbol reference to last — a fallback for when you
// already know the symbol name, never the front door.
type DocsSection =
  | "quickstart"
  | "howto"
  | "concepts"
  | "examples"
  | "changelog"
  | "reference";

interface DocsGuideTopic {
  // Stable anchor id on the /docs route (e.g. `quickstart`).
  readonly id: string;
  // Sidebar / heading label.
  readonly title: string;
  // Which IA section the topic belongs to (drives the sidebar grouping).
  readonly section: DocsSection;
  // Plain-text summary mirrored into llms.txt for LLM discoverability.
  readonly summary: string;
}

// Consumer-facing guide topics rendered on the /docs route. This is the single
// source for the docs sidebar, the llms.txt guide index, and the JSON-LD
// hasPart; the prose bodies + compiled snippets live in docs-page.tsx (JSX),
// keyed by these ids. Every topic documents ONLY the public `@n-uf/hypr-tiling`
// entry (the curated public API; `/devtools` is a documented opt-in and
// `/engine` is an off-site @beta escape hatch) — no architecture/internals.
//
// TASK-FIRST IA: consumer docs lead with the graceful path and frame every guide
// as an OUTCOME the reader wants, never as API enumeration. Order: Quickstart
// (golden path) → "How do I…" recipes (the heart) → minimal Concepts → runnable
// Examples → Changelog → the DEMOTED generated reference last.
export const DOCS_GUIDE_TOPICS: ReadonlyArray<DocsGuideTopic> = [
  {
    id: "quickstart",
    title: "Quickstart",
    section: "quickstart",
    summary:
      "The golden path in numbered, runnable steps: pnpm add @n-uf/hypr-tiling react react-dom, add the package dist to your Tailwind content glob, then render a minimal controlled TilingRenderer with a layout config and a renderTile callback — a working, resizable tiling layout in about 30 seconds.",
  },
  {
    id: "howto-initial-layout",
    title: "Define the initial layout",
    section: "howto",
    summary:
      "Build the starting layout as a plain, serialisable tree of leaf, split, and group nodes (TilingLayoutNode) that you own in state: a leaf holds one tile, a split divides space along an axis by a ratio, a group stacks leaves behind a tab strip.",
  },
  {
    id: "howto-render-tile",
    title: "Render your own content in a pane",
    section: "howto",
    summary:
      "Pass a renderTile callback (TilingRenderTileProps) to paint each pane's body and chrome. Root the pane on article[data-leaf-id] and forward onFocus / onHandlePointerDown / onPointerMove so drag, focus, and resize keep working while you own the visuals.",
  },
  {
    id: "howto-custom-chrome",
    title: "Render your own pane frame & header",
    section: "howto",
    summary:
      "renderTile is a FULL-PANE render prop, not a content slot — it returns the whole pane (frame + header + body) and receives every handle and state flag, so you can own the ENTIRE pane look-and-feel. Take the easy path with the optional helper primitives (TilingPaneRoot, TilingDragHandle, TilingPaneAction, TilingPaneBody), which encode the wiring rules so they can't be gotten wrong, or wire the raw DOM by hand: root on article[data-leaf-id]; wire onHandlePointerDown on your header (drag), onToggleMaximize, onFocus, and onToggleMultiSelect + onGroupMultiSelection (Alt/Opt+click grouping); style from isFocused / isMaximized / isDragSource and compose with theme tokens from useTilingTheme (resolveAccentText, resolveFocusFrame). Render the body only when paneBodyRenderMode is render-content so the drag ghost stays in sync. The ghost mounts on the overlay portal container (default document.body, see overlayPortalContainer).",
  },
  {
    id: "howto-theming",
    title: "Theme & color panes",
    section: "howto",
    summary:
      "Pick a built-in theme with the themeId prop (live switching, no remount), give a pane its own accent via tile.accent, or wrap a subtree in TilingThemeProvider and read the active TilingTheme with useTilingTheme. resolveTilingTheme maps an id to its token object. Host CSS variables / scoped dark must pass overlayPortalContainer (default document.body) so the drag ghost inherits them.",
  },
  {
    id: "howto-capabilities",
    title: "Choose which interactions are allowed",
    section: "howto",
    summary:
      "Every interaction (drag, resize, keyboard, grouping, maximize) is on by default. Narrow behavior through the single interaction prop (TilingInteractionCapabilities): pass a partial, or start from a preset like TILING_DASHBOARD_PRESET and override. resolveInteractionCapabilities gives you the fully-resolved shape.",
  },
  {
    id: "howto-save-restore",
    title: "Save & restore a layout",
    section: "howto",
    summary:
      "The layout is plain JSON you own, so persistence is just save/load: write it to storage in onLayoutChange, read it back on mount with a default fallback. No library-specific serializer.",
  },
  {
    id: "howto-workspaces",
    title: "Run multiple workspaces over one tile pool",
    section: "howto",
    summary:
      "Swap layout + onLayoutChange for workspaces + onWorkspacesChange (TilingWorkspaceSet): one active tree at a time, the whole tile pool in tiles, useTilingWorkspaceTabs for tablist semantics and tab drop targets, optional WORKSPACE_KEY_BINDINGS, interaction.workspaces for swipe / slide transition / springLoad, and useTilingWorkspaceSetController when the set is persisted with debounced tree commits.",
  },
  {
    id: "howto-commands",
    title: "Trigger actions from your own buttons",
    section: "howto",
    summary:
      "Take the renderer's imperative TilingCommandHandle with a ref and dispatch typed TilingCommands (set-split-ratio, group-leaves, toggle-maximize, …) from your own toolbar or menu — the same command set the keyboard and drag layers use. A command on a disabled capability is a safe no-op.",
  },
  {
    id: "howto-command-bar",
    title: "Build a command bar / keyboard shortcuts",
    section: "howto",
    summary:
      "ADVANCED. Build your own command bar or key bindings: derive TilingCommandGates from resolveInteractionCapabilities, then use isCommandEnabled to hide dead controls and keep keyboard bindings browser-graceful (only preventDefault when the command would actually run).",
  },
  {
    id: "howto-group-split-maximize",
    title: "Group, split & maximize panes",
    section: "howto",
    summary:
      "Grouping (Alt/Opt+G), splitting (drag a header), and maximizing (Alt+Enter) are built-in, and you can also drive them from code: dispatch group-leaves to fold leaves into a tabbed group, insert-adjacent to split, and toggle-maximize to maximize/restore a leaf. isMultiSelectModifierActive detects the platform multi-select modifier for your own affordances.",
  },
  {
    id: "concepts",
    title: "Concepts",
    section: "concepts",
    summary:
      "The minimum that unblocks the recipes: the layout tree (leaf / split / group nodes you own in state), who owns interactions (the renderer runs them; your app owns and persists the tree via onLayoutChange), and the capabilities model (everything on by default, narrowed through one interaction prop).",
  },
  {
    id: "examples",
    title: "Examples gallery",
    section: "examples",
    summary:
      "Whole runnable apps to copy wholesale: a metrics dashboard (master-stack of accented metric panes) and a terminal grid (monospace shell / logs / htop panes) — each a complete, controlled TilingRenderer.",
  },
  {
    id: "changelog",
    title: "Changelog",
    section: "changelog",
    summary:
      "Release notes for @n-uf/hypr-tiling, newest first, rendered from packages/hypr-tiling/CHANGELOG.md. Calendar versioning (YY.M.R) cannot signal a SemVer major — breaking changes are flagged in the notes. Includes Unreleased plus 26.9.8 (host group-drop target, onClearMultiSelection), 26.9.7 (reset-workspace / reset-workspaces, workspaceDefaults), 26.9.6 (drag-source pool parking, tab-drop follow), 26.9.5 (swipe gates), 26.9.4 (workspace navigation), 26.9.3 (TilingWorkspaceSet), 26.9.2 (compact ghost, external drop claim, titlebar-only pane collapse), 26.9.1 (overlay portal), 26.9.0 (dragChrome, paneIdentity), 26.7.2 (persisted layout, titlebar slot, layout integrity), 26.7.1, and 26.7.0.",
  },
  {
    id: "reference",
    title: "API reference",
    section: "reference",
    summary:
      "DEMOTED to last — a fallback for when you already know the symbol name, not the front door. The generated per-symbol reference for the curated public API (from source TSDoc via API Extractor + API Documenter), tiered Core (TilingRenderer, layout + queryTilingLayout, theming, commands) vs Advanced helpers (isCommandEnabled, capability/query utilities). Internal and devtools-only symbols are excluded.",
  },
];

// The `/llms.txt` mirror is built in `llms.ts` (`buildLlmsTxt`), the single
// source imported by the SSR prerender entry, so the large generated
// API-reference bundle stays out of the homepage client chunk.

