import * as React from "react";
import {
  API_REFERENCE_URL,
  CHANGELOG_URL,
  Code,
  DOCS_GUIDE_TOPICS,
  Eyebrow,
  INSTALL_SNIPPET,
  LICENSE_NAME,
  LICENSE_URL,
  Link,
  PACKAGE_NAME,
  Pre,
  REPO_URL,
  SectionLead,
} from "./docs";
import {
  API_REFERENCE_SECTIONS,
  type ApiReferenceSection,
} from "./api-reference/generated";

// The prerendered /docs route: hand-written guides followed by the generated
// public-API reference. Rendered by both the SSR prerender (static HTML for
// crawlers / LLM fetchers) and the client (hydration). The API reference bodies
// are pre-rendered HTML strings from `pnpm api:docs`, injected verbatim so no
// Markdown parser ships to the browser and the two passes stay byte-identical.
//
// Styling reuses the homepage "mosaic" vocabulary (graphite canvas, single gold
// accent, Fraunces headings, Inter body, JetBrains Mono code). The injected API
// HTML is styled through the scoped `.ht-api` rules below since the Tailwind CDN
// build carries no typography plugin.

const GETTING_STARTED_SNIPPET: string = `import { TilingRenderer, DEFAULT_TILING_LAYOUT_CONFIG } from "@n-uf/hypr-tiling";
import type { TilingLayoutNode, TilingTile } from "@n-uf/hypr-tiling";
import { useState } from "react";

const tiles: TilingTile[] = [
  { id: "a", title: "editor", content: <Editor /> },
  { id: "b", title: "preview", content: <Preview /> },
];

const initial: TilingLayoutNode = {
  kind: "split", id: "root", axis: "horizontal", ratio: 0.5,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

export function Workspace() {
  const [layout, setLayout] = useState(initial);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      onLayoutChange={setLayout}
    />
  );
}`;

const TAILWIND_CONTENT_SNIPPET: string = `// tailwind.config.{js,ts}
export default {
  content: [
    "./src/**/*.{ts,tsx}",
    // Required: hypr-tiling ships utility classes in its dist output.
    // Without this glob Tailwind purges the pane / divider / ghost classes.
    "./node_modules/@n-uf/hypr-tiling/dist/**/*.{js,mjs,cjs}",
  ],
};`;

const CAPABILITIES_SNIPPET: string = `import type { TilingInteractionCapabilities } from "@n-uf/hypr-tiling";

// Every capability is on by default; pass a partial to narrow behavior.
const interaction: TilingInteractionCapabilities = {
  dragAndDrop: { enabled: true },
  resize: { enabled: true },
  keyboard: { enabled: true },
  grouping: { enabled: true },
};`;

const GROUPING_SNIPPET: string = `import { canGroupMultiSelection, groupLeaves } from "@n-uf/hypr-tiling";

// selection is a ReadonlySet<string> of leaf ids (insertion order preserved).
if (canGroupMultiSelection(layout, selection)) {
  const next = groupLeaves(layout, [...selection]);
  setLayout(next);
}`;

function GuideHeading({
  id,
  eyebrow,
  children,
}: {
  id: string;
  eyebrow: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 scroll-mt-24" id={id}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-display text-[26px] font-medium leading-tight tracking-[-0.015em] text-stone-50">
        {children}
      </h2>
    </div>
  );
}

function GuideSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-4 border-t border-white/[0.08] pt-10">
      <GuideHeading id={id} eyebrow={eyebrow}>
        {title}
      </GuideHeading>
      {children}
    </section>
  );
}

const API_KIND_ORDER: ReadonlyArray<string> = [
  "variable",
  "function",
  "interface",
  "type",
];

const API_KIND_LABEL: Record<string, string> = {
  variable: "Variables & constants",
  function: "Functions",
  interface: "Interfaces",
  type: "Type aliases",
};

function sectionsByKind(kind: string): ReadonlyArray<ApiReferenceSection> {
  return API_REFERENCE_SECTIONS.filter(
    (section): boolean => section.kind === kind,
  );
}

function DocsNav({
  navigate,
}: {
  navigate?: (to: string) => void;
}): React.ReactElement {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#0c0d0f]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <a
          href="/"
          onClick={(event: React.MouseEvent<HTMLAnchorElement>): void => {
            if (navigate != null) {
              event.preventDefault();
              navigate("/");
            }
          }}
          className="flex items-center gap-2.5 font-display text-[15px] font-medium text-stone-50 transition-colors hover:text-amber-100"
        >
          <span
            aria-hidden
            className="h-3.5 w-[2px] shrink-0 rounded-full bg-amber-300/70"
          />
          hypr-tiling
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-300/70">
            docs
          </span>
        </a>
        <nav className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.16em] text-stone-400">
          <a
            href="/"
            onClick={(event: React.MouseEvent<HTMLAnchorElement>): void => {
              if (navigate != null) {
                event.preventDefault();
                navigate("/");
              }
            }}
            className="transition-colors hover:text-amber-100"
          >
            Home
          </a>
          <a
            href="/showcase"
            onClick={(event: React.MouseEvent<HTMLAnchorElement>): void => {
              if (navigate != null) {
                event.preventDefault();
                navigate("/showcase");
              }
            }}
            className="transition-colors hover:text-amber-100"
          >
            Showcase
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-amber-100"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

function DocsSidebar(): React.ReactElement {
  return (
    <aside className="hidden lg:block">
      <nav className="sticky top-[68px] flex max-h-[calc(100vh-84px)] flex-col gap-5 overflow-y-auto pr-2 pb-10 text-[13px]">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-300/70">
            Guides
          </span>
          {DOCS_GUIDE_TOPICS.filter(
            (topic): boolean => topic.id !== "api-reference",
          ).map((topic) => (
            <a
              key={topic.id}
              href={`#${topic.id}`}
              className="text-stone-400 transition-colors hover:text-amber-100"
            >
              {topic.title}
            </a>
          ))}
        </div>
        {API_KIND_ORDER.map((kind) => {
          const items = sectionsByKind(kind);
          if (items.length === 0) {
            return null;
          }
          return (
            <div key={kind} className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-300/70">
                {API_KIND_LABEL[kind] ?? kind}
              </span>
              {items.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="truncate font-mono text-[12px] text-stone-400 transition-colors hover:text-amber-100"
                >
                  {section.name}
                </a>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function ApiReference(): React.ReactElement {
  return (
    <section className="flex flex-col gap-6 border-t border-white/[0.08] pt-10">
      <GuideHeading id="api-reference" eyebrow="generated from source tsdoc">
        API reference
      </GuideHeading>
      <SectionLead>
        The curated public API surface, generated from the library&rsquo;s TSDoc
        via API Extractor and API Documenter. Internal and devtools-only symbols
        are excluded. The full machine-readable report is published in the{" "}
        <Link href={API_REFERENCE_URL}>API report</Link>.
      </SectionLead>
      {API_KIND_ORDER.map((kind) => {
        const items = sectionsByKind(kind);
        if (items.length === 0) {
          return null;
        }
        return (
          <div key={kind} className="flex flex-col gap-5">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.24em] text-amber-300/70">
              {API_KIND_LABEL[kind] ?? kind}
            </h3>
            {items.map((section) => (
              <article
                key={section.id}
                id={section.id}
                className="ht-api scroll-mt-24 rounded-lg border border-white/[0.07] bg-white/[0.015] p-5"
              >
                <div className="mb-3 flex items-baseline gap-2.5">
                  <h4 className="font-mono text-[15px] font-medium text-stone-50">
                    {section.name}
                  </h4>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
                    {section.kind}
                  </span>
                </div>
                <div dangerouslySetInnerHTML={{ __html: section.html }} />
              </article>
            ))}
          </div>
        );
      })}
    </section>
  );
}

const API_PROSE_STYLES: string = `
.ht-api p { margin: 0 0 0.75rem; font-size: 13px; line-height: 1.7; color: rgb(214 211 209 / 0.9); }
.ht-api p:last-child { margin-bottom: 0; }
.ht-api h2 { margin: 1.25rem 0 0.5rem; font-family: Fraunces, ui-serif, Georgia, serif; font-size: 15px; font-weight: 500; color: rgb(250 250 249); }
.ht-api a { color: rgb(253 230 138); text-decoration: underline; text-decoration-color: rgb(251 191 36 / 0.4); text-underline-offset: 3px; }
.ht-api a:hover { color: rgb(254 243 199); }
.ht-api code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; color: rgb(253 230 138 / 0.92); }
.ht-api pre { overflow-x: auto; margin: 0.5rem 0 0.9rem; border-radius: 0.5rem; border: 1px solid rgb(255 255 255 / 0.08); background: #0a0b0d; padding: 0.85rem 0.9rem; }
.ht-api pre code { color: rgb(214 211 209); font-size: 12px; line-height: 1.65; }
.ht-api table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 0.9rem; font-size: 12px; }
.ht-api th, .ht-api td { border: 1px solid rgb(255 255 255 / 0.08); padding: 0.45rem 0.6rem; text-align: left; vertical-align: top; }
.ht-api th { color: rgb(214 211 209); font-weight: 500; background: rgb(255 255 255 / 0.02); }
.ht-api th p, .ht-api td p { margin: 0; font-size: 12px; }
.ht-api ul, .ht-api ol { margin: 0 0 0.75rem; padding-left: 1.15rem; font-size: 13px; line-height: 1.7; color: rgb(214 211 209 / 0.9); }
`;

export function DocsPage({
  navigate,
}: {
  navigate?: (to: string) => void;
}): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0c0d0f] font-sans text-stone-100">
      <style dangerouslySetInnerHTML={{ __html: API_PROSE_STYLES }} />
      <DocsNav navigate={navigate} />
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <DocsSidebar />
        <main className="flex min-w-0 flex-col gap-10">
          <div className="flex flex-col gap-4">
            <Eyebrow>documentation</Eyebrow>
            <h1 className="font-display text-[clamp(2rem,3vw,2.6rem)] font-medium leading-[1.05] tracking-[-0.015em] text-stone-50">
              {PACKAGE_NAME} documentation
            </h1>
            <SectionLead>
              Guides for installing and integrating hypr-tiling, the core layout
              and interaction model, common recipes, and the generated reference
              for the public API. Every page is prerendered to static HTML.
            </SectionLead>
          </div>

          <GuideSection
            id="getting-started"
            eyebrow="guide"
            title="Getting started"
          >
            <SectionLead>
              Install the scoped package with its React 19 peers, then render{" "}
              <Code>TilingRenderer</Code> as a controlled component: your app
              owns the layout tree in state and applies every edit the renderer
              reports through <Code>onLayoutChange</Code>.
            </SectionLead>
            <Pre>{INSTALL_SNIPPET}</Pre>
            <Pre>{GETTING_STARTED_SNIPPET}</Pre>
          </GuideSection>

          <GuideSection
            id="install"
            eyebrow="guide"
            title="Install & Tailwind setup"
          >
            <SectionLead>
              hypr-tiling targets <Code>react</Code> and <Code>react-dom</Code>{" "}
              version 19 as peer dependencies.
            </SectionLead>
            <Pre>{INSTALL_SNIPPET}</Pre>
            <SectionLead>
              The library ships Tailwind utility classes in its{" "}
              <Code>dist</Code> output. If your app uses Tailwind, add the
              package&rsquo;s dist directory to your <Code>content</Code> globs
              so the pane, divider, and drag-ghost classes are not purged from
              your build:
            </SectionLead>
            <Pre>{TAILWIND_CONTENT_SNIPPET}</Pre>
          </GuideSection>

          <GuideSection
            id="core-concepts"
            eyebrow="guide"
            title="Core concepts"
          >
            <h3 className="font-display text-[16px] font-medium text-stone-100">
              Layout tree
            </h3>
            <SectionLead>
              A layout is a recursive tree of nodes you own in state:{" "}
              <Code>leaf</Code> nodes hold a tile, <Code>split</Code> nodes
              divide space along an axis by a ratio, and <Code>group</Code>{" "}
              nodes stack leaves behind a tab strip. See{" "}
              <Link href="#api-tilinglayoutnode">TilingLayoutNode</Link> and the{" "}
              <Link href="#api-tilingsplitnode">split</Link> /{" "}
              <Link href="#api-tilingleafnode">leaf</Link> /{" "}
              <Link href="#api-tilinggroupnode">group</Link> node types.
            </SectionLead>
            <h3 className="font-display text-[16px] font-medium text-stone-100">
              Interaction capabilities
            </h3>
            <SectionLead>
              Drag-and-drop, resize, keyboard control, grouping, and maximize
              are all enabled by default and configured through the single{" "}
              <Code>interaction</Code> prop (
              <Link href="#api-tilinginteractioncapabilities">
                TilingInteractionCapabilities
              </Link>
              ). Pass a partial to narrow behavior.
            </SectionLead>
            <Pre>{CAPABILITIES_SNIPPET}</Pre>
            <h3 className="font-display text-[16px] font-medium text-stone-100">
              Theming
            </h3>
            <SectionLead>
              Choose a built-in theme with the <Code>themeId</Code> prop, or wrap
              a subtree in <Code>TilingThemeProvider</Code> and read the active{" "}
              <Link href="#api-tilingtheme">TilingTheme</Link> with{" "}
              <Code>useTilingTheme</Code>. Theme switching is live — no remount.
            </SectionLead>
          </GuideSection>

          <GuideSection id="recipes" eyebrow="guide" title="Recipes">
            <h3 className="font-display text-[16px] font-medium text-stone-100">
              Multi-select grouping
            </h3>
            <SectionLead>
              Fold several selected leaves into one tabbed group. Gate the
              control with{" "}
              <Link href="#api-cangroupmultiselection">
                canGroupMultiSelection
              </Link>{" "}
              and apply the change with{" "}
              <Link href="#api-groupleaves">groupLeaves</Link>.
            </SectionLead>
            <Pre>{GROUPING_SNIPPET}</Pre>
            <h3 className="font-display text-[16px] font-medium text-stone-100">
              Drag &amp; FLIP behavior
            </h3>
            <SectionLead>
              Dragging a pane header detaches the source, freezes the tree, and
              floats a cursor-following ghost that hops between seats; the move
              commits on release (swap, edge-insert, split-container-insert, or
              group-merge). FLIP-animated survivor reflow and a self-healing
              recovery backstop guarantee the tree never strands mid-transition.
            </SectionLead>
            <h3 className="font-display text-[16px] font-medium text-stone-100">
              /devtools observability
            </h3>
            <SectionLead>
              The <Code>@n-uf/hypr-tiling/devtools</Code> entry point exposes
              opt-in overlays for drop-intent resolution and pane hit-zone
              debugging — useful when tuning custom interaction behavior. These
              symbols are excluded from the production reference below.
            </SectionLead>
          </GuideSection>

          <GuideSection
            id="migration"
            eyebrow="guide"
            title="Migration & changelog"
          >
            <SectionLead>
              hypr-tiling follows calendar versioning. Breaking changes and
              release notes are tracked in the package{" "}
              <Link href={CHANGELOG_URL}>CHANGELOG.md</Link>. The curated public
              API surface is enforced by API Extractor, so any addition or
              removal is visible in the <Link href={API_REFERENCE_URL}>API report</Link>{" "}
              and mirrored in the reference below.
            </SectionLead>
            <p className="text-[12px] leading-[1.6] text-stone-500">
              <Link href={LICENSE_URL}>{LICENSE_NAME}</Link> · source-available ·
              free commercial use · no competing use
            </p>
          </GuideSection>

          <ApiReference />
        </main>
      </div>
    </div>
  );
}
