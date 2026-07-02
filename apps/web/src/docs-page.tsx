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
import { EXAMPLE_SOURCES, type ExampleId } from "./docs-examples/sources";
import { Quickstart } from "./docs-examples/quickstart";
import { RenderTileExample } from "./docs-examples/render-tile";
import { ThemingExample } from "./docs-examples/theming";
import { CapabilitiesExample } from "./docs-examples/capabilities";
import { CommandsExample } from "./docs-examples/commands";
import { CommandBarExample } from "./docs-examples/command-bar";
import { GroupSplitMaximizeExample } from "./docs-examples/group-split-maximize";
import { DashboardApp } from "./docs-examples/dashboard-app";
import { TerminalGridApp } from "./docs-examples/terminal-grid";

// The prerendered /docs route: a TASK-FIRST consumer documentation experience.
// A "consumer" is a developer who USES `@n-uf/hypr-tiling` in their app; the docs
// describe only the public API surface (the hand-authored `.` facade enforced by
// API Extractor). Contributor material (architecture / internals) and the @beta
// `/engine` escape hatch live off this site — see CONTRIBUTING.md and
// apps/web/_agent/docs-ia.md.
//
// Governing principle: consumer docs are TASK-FIRST, not symbol-first. A reader
// must grasp-and-run immediately, never reverse-engineer intent from a bare
// signature. Code is the primary medium; prose frames it. Reading order leads
// with the graceful path and DEMOTES the generated reference to last:
//
//   1. Hero        — one value sentence + a live layout + its copy-paste source.
//   2. Quickstart  — the golden path, numbered + runnable, to a working layout.
//   3. How do I…    — outcome-framed recipes (the heart): each a goal sentence, a
//                    complete compiled snippet, the knobs, and related links.
//   4. Concepts    — only what unblocks the recipes (tree / ownership / caps).
//   5. Examples    — whole runnable apps to copy wholesale.
//   6. Reference   — the generated per-symbol reference, DEMOTED and tiered Core
//                    vs Advanced: "for when you already know the name."
//
// The guide snippets are the RAW SOURCE of real, type-checked modules under
// `docs-examples/` (embedded via Vite `?raw`, inlined at build for the SSR
// prerender), so what renders IS the compiled file — a snippet cannot silently
// rot against the current public API without breaking `pnpm typecheck` / CI.
//
// Styling reuses the homepage "mosaic" vocabulary (graphite canvas, single gold
// accent, Fraunces headings, Inter body, JetBrains Mono code). The injected API
// HTML is styled through the scoped `.ht-api` rules below. The reference bundle
// stays code-split.

// Authored config snippet (a Tailwind config, not a runnable module — kept as an
// authored string). The runnable TS/TSX snippets are all compiled examples.
const TAILWIND_CONTENT_SNIPPET: string = `// tailwind.config.{js,ts}
export default {
  content: [
    "./src/**/*.{ts,tsx}",
    // Required: hypr-tiling ships utility classes in its dist output.
    // Without this glob Tailwind purges the pane / divider / ghost classes.
    "./node_modules/@n-uf/hypr-tiling/dist/**/*.{js,mjs,cjs}",
  ],
};`;

// --- Primitives -----------------------------------------------------------

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

// A sized, bordered frame that hosts a LIVE demo. The demo is a real, controlled
// TilingRenderer app from `docs-examples/`; the same file's source is shown next
// to it. TilingRenderer renders its pre-measurement tree during SSR (no effects),
// so the frame prerenders cleanly and hydrates.
function DemoFrame({
  height = 300,
  children,
}: {
  height?: number;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-300/70">
        live result
      </span>
      <div
        className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#0a0b0d] p-2"
        style={{ height }}
      >
        {children}
      </div>
    </div>
  );
}

// Embed the compiled source of a `docs-examples/` module. The text IS the file.
function ExampleSource({ id }: { id: ExampleId }): React.ReactElement {
  return <Pre>{EXAMPLE_SOURCES[id]}</Pre>;
}

// Related-links row for a guide: resolves each symbol name against
// API_REFERENCE_SECTIONS and emits a deep link only when the symbol is actually
// on the public barrel — broken anchors and accidental `@internal` references
// are structurally impossible.
function ReferenceLinks({
  symbols,
}: {
  symbols: ReadonlyArray<string>;
}): React.ReactElement | null {
  const resolved: ReadonlyArray<ApiReferenceSection> = symbols
    .map(
      (name): ApiReferenceSection | undefined =>
        API_REFERENCE_SECTIONS.find(
          (section): boolean =>
            section.name === name || section.name === `${name}()`,
        ),
    )
    .filter((section): section is ApiReferenceSection => section != null);
  if (resolved.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-500">
        Related in the reference
      </span>
      <div className="flex flex-wrap gap-1.5">
        {resolved.map(
          (section): React.ReactElement => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono text-[11px] text-amber-200/85 transition-colors hover:border-amber-300/40 hover:text-amber-100"
            >
              {section.name}
            </a>
          ),
        )}
      </div>
    </div>
  );
}

// A "How do I…" recipe: goal sentence → compiled snippet (+ optional live demo)
// → the knobs → related reference links. Outcome-framed, never API enumeration.
function HowTo({
  id,
  title,
  goal,
  exampleId,
  demo,
  knobs,
  symbols,
}: {
  id: string;
  title: string;
  goal: React.ReactNode;
  exampleId: ExampleId;
  demo?: React.ReactNode;
  knobs: React.ReactNode;
  symbols: ReadonlyArray<string>;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 scroll-mt-24" id={id}>
      <h3 className="font-display text-[19px] font-medium leading-snug tracking-[-0.01em] text-stone-100">
        {title}
      </h3>
      <SectionLead>{goal}</SectionLead>
      <ExampleSource id={exampleId} />
      {demo != null ? <DemoFrame>{demo}</DemoFrame> : null}
      <p className="max-w-[62ch] text-[12px] leading-[1.7] text-stone-400">
        {knobs}
      </p>
      <ReferenceLinks symbols={symbols} />
    </div>
  );
}

// --- Navigation -----------------------------------------------------------

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

const SECTION_LABEL: Record<string, string> = {
  quickstart: "Start here",
  howto: "How do I…",
  concepts: "Concepts",
  examples: "Examples",
  reference: "Reference",
};

const SECTION_ORDER: ReadonlyArray<string> = [
  "quickstart",
  "howto",
  "concepts",
  "examples",
  "reference",
];

function SidebarGroup({
  section,
}: {
  section: string;
}): React.ReactElement | null {
  const topics = DOCS_GUIDE_TOPICS.filter(
    (topic): boolean => topic.section === section,
  );
  if (topics.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-300/70">
        {SECTION_LABEL[section] ?? section}
      </span>
      {topics.map((topic) => (
        <a
          key={topic.id}
          href={`#${topic.id}`}
          className="text-stone-400 transition-colors hover:text-amber-100"
        >
          {topic.title}
        </a>
      ))}
    </div>
  );
}

function DocsSidebar(): React.ReactElement {
  return (
    <aside className="hidden lg:block">
      <nav className="sticky top-[68px] flex max-h-[calc(100vh-84px)] flex-col gap-5 overflow-y-auto pr-2 pb-10 text-[13px]">
        {SECTION_ORDER.map(
          (section): React.ReactElement | null => (
            <SidebarGroup key={section} section={section} />
          ),
        )}
      </nav>
    </aside>
  );
}

// --- API reference (DEMOTED, last) ----------------------------------------
// The generated per-symbol reference, tiered Core vs Advanced. Core = the
// front-line consumer surface (the renderer, the layout tree + queryTilingLayout,
// theming, commands/dispatch). Advanced = the power-user helpers and the resolved
// / debug / keymap type surface (isCommandEnabled, capability + query utilities).

const CORE_REFERENCE_NAMES: ReadonlySet<string> = new Set<string>([
  // Renderer & tiles
  "TilingRenderer",
  "TilingRendererProps",
  "TilingRenderTileProps",
  "TilingTile",
  "TilingTileAccent",
  // Layout tree + read
  "TilingLayoutNode",
  "TilingLeafNode",
  "TilingSplitNode",
  "TilingGroupNode",
  "TilingLayoutConfig",
  "DEFAULT_TILING_LAYOUT_CONFIG",
  "queryTilingLayout()",
  "TilingLayoutQuery",
  // Commands / dispatch
  "TilingCommand",
  "TilingCommandHandle",
  // Theming
  "TilingThemeProvider()",
  "TilingTheme",
  "useTilingTheme()",
  "TilingThemeId",
  "TILING_THEMES",
  "DEFAULT_TILING_THEME_ID",
  "resolveTilingTheme()",
  // Interaction (front-line)
  "TilingInteractionCapabilities",
  "TILING_DASHBOARD_PRESET",
  "resolveInteractionCapabilities()",
]);

function isCoreSection(section: ApiReferenceSection): boolean {
  return CORE_REFERENCE_NAMES.has(section.name);
}

function ReferenceCard({
  section,
}: {
  section: ApiReferenceSection;
}): React.ReactElement {
  return (
    <article
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
  );
}

function ReferenceTier({
  id,
  eyebrow,
  title,
  lead,
  sections,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: React.ReactNode;
  sections: ReadonlyArray<ApiReferenceSection>;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-5 scroll-mt-24" id={id}>
      <div className="flex flex-col gap-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="font-display text-[20px] font-medium leading-tight tracking-[-0.01em] text-stone-100">
          {title}
        </h3>
        <SectionLead>{lead}</SectionLead>
      </div>
      {sections.map(
        (section): React.ReactElement => (
          <ReferenceCard key={section.id} section={section} />
        ),
      )}
    </div>
  );
}

function ApiReference(): React.ReactElement {
  const core: ReadonlyArray<ApiReferenceSection> =
    API_REFERENCE_SECTIONS.filter(isCoreSection);
  const advanced: ReadonlyArray<ApiReferenceSection> =
    API_REFERENCE_SECTIONS.filter(
      (section): boolean => !isCoreSection(section),
    );
  return (
    <section className="flex flex-col gap-8 border-t border-white/[0.08] pt-10">
      <GuideHeading id="reference" eyebrow="reference · for when you already know the name">
        API reference
      </GuideHeading>
      <SectionLead>
        The generated per-symbol reference for the curated public API surface,
        produced from the library&rsquo;s source TSDoc via API Extractor and API
        Documenter. This is a <em className="not-italic text-stone-200">fallback</em>{" "}
        — reach for it once you already know a symbol name; the guides above are
        the way in. Internal and devtools-only symbols are excluded, so every
        entry is part of the supported consumer contract. The full
        machine-readable report lives in the{" "}
        <Link href={API_REFERENCE_URL}>API report</Link>.
      </SectionLead>
      <ReferenceTier
        id="reference-core"
        eyebrow="reference · core"
        title="Core"
        lead={
          <>
            The symbols you reach for first: the{" "}
            <Code>TilingRenderer</Code>, the layout tree and{" "}
            <Code>queryTilingLayout</Code>, theming, and commands / dispatch.
          </>
        }
        sections={core}
      />
      <ReferenceTier
        id="reference-advanced"
        eyebrow="reference · advanced helpers"
        title="Advanced helpers"
        lead={
          <>
            Power-user helpers and the resolved / capability / debug type surface
            — <Code>isCommandEnabled</Code> and the capability + query utilities
            you only need for custom command bars, keyboard layers, and
            observability. Each carries a consumer-usage <Code>@example</Code> in
            its hover-docs.
          </>
        }
        sections={advanced}
      />
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

// --- Numbered quickstart step ---------------------------------------------

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/[0.08] font-mono text-[11px] text-amber-100">
          {n}
        </span>
        <h3 className="font-display text-[17px] font-medium text-stone-100">
          {title}
        </h3>
      </div>
      <div className="flex flex-col gap-2.5 border-l border-white/[0.08] pl-[1.85rem]">
        {children}
      </div>
    </div>
  );
}

// --- Concepts card --------------------------------------------------------

function ConceptCard({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.015] p-4">
      <span className="text-[13px] font-medium text-stone-100">{term}</span>
      <span className="max-w-[62ch] text-[12px] leading-[1.7] text-stone-400">
        {children}
      </span>
    </div>
  );
}

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
          {/* 1. HERO — one value sentence + a live layout + its copy-paste source. */}
          <div className="flex flex-col gap-5" id="hero">
            <div className="flex flex-col gap-4">
              <Eyebrow>consumer documentation</Eyebrow>
              <h1 className="font-display text-[clamp(2rem,3vw,2.6rem)] font-medium leading-[1.05] tracking-[-0.015em] text-stone-50">
                Render a tiling layout in React — in one paste.
              </h1>
              <SectionLead>
                {PACKAGE_NAME} is a controlled tiling renderer: you own a layout
                tree in state, and the component drags, drops, resizes, groups,
                and keyboard-controls its panes at runtime. Paste the block below
                and you have a working, resizable layout — the guides take it from
                there. These docs cover only the public API; contributors working
                on the library start from <Code>CONTRIBUTING.md</Code>.
              </SectionLead>
            </div>
            <ExampleSource id="quickstart" />
            <DemoFrame height={260}>
              <Quickstart />
            </DemoFrame>
          </div>

          {/* 2. QUICKSTART — the golden path, numbered + runnable. */}
          <GuideSection id="quickstart" eyebrow="golden path" title="Quickstart">
            <SectionLead>
              Three steps to the layout above. Every step is runnable; there are
              no concept detours here — those come after, only as needed.
            </SectionLead>
            <Step n={1} title="Install">
              <SectionLead>
                Add the package and its React 19 peers.
              </SectionLead>
              <Pre>{INSTALL_SNIPPET}</Pre>
            </Step>
            <Step n={2} title="Add the Tailwind content glob">
              <SectionLead>
                The library ships utility classes in its <Code>dist</Code>, not
                CSS. Add that directory to your Tailwind <Code>content</Code> globs
                or the pane, divider, and drag-ghost classes get purged.
              </SectionLead>
              <Pre>{TAILWIND_CONTENT_SNIPPET}</Pre>
            </Step>
            <Step n={3} title="Render a controlled TilingRenderer">
              <SectionLead>
                Own the layout tree in state, pass a <Code>config</Code> and a{" "}
                <Code>renderTile</Code> callback, and apply every edit the renderer
                reports through <Code>onLayoutChange</Code>. This is the exact
                source behind the live panes above — resize them by dragging the
                divider.
              </SectionLead>
              <ExampleSource id="quickstart" />
            </Step>
            <SectionLead>
              Next: paint your own pane content in{" "}
              <Link href="#howto-render-tile">Render your own content</Link>, then
              skim <Link href="#concepts">Concepts</Link> when you want the mental
              model.
            </SectionLead>
          </GuideSection>

          {/* 3. HOW DO I… — the heart: outcome-framed recipes. */}
          <GuideSection id="howto" eyebrow="recipes" title="How do I…">
            <SectionLead>
              Each recipe is an outcome you want, a complete snippet that compiles
              against the current public API, the two or three knobs that matter,
              and where to look next.
            </SectionLead>

            <HowTo
              id="howto-initial-layout"
              title="Define the initial layout"
              goal={
                <>
                  Describe the starting arrangement as a plain, serialisable tree
                  you own in state — a leaf holds one tile, a split divides space
                  by a ratio, a group stacks leaves behind a tab strip.
                </>
              }
              exampleId="initial-layout"
              knobs={
                <>
                  Every node needs a stable <Code>id</Code>; a leaf&rsquo;s{" "}
                  <Code>tileId</Code> points into your <Code>tiles</Code>. Splits
                  carry an <Code>axis</Code> (<Code>"horizontal"</Code> /{" "}
                  <Code>"vertical"</Code>) and a <Code>ratio</Code> in{" "}
                  <Code>[0,1]</Code>; groups carry an <Code>activeMemberId</Code>.
                  The whole object is JSON — persist and restore it verbatim.
                </>
              }
              symbols={[
                "TilingLayoutNode",
                "TilingLeafNode",
                "TilingSplitNode",
                "TilingGroupNode",
                "TilingTile",
              ]}
            />

            <HowTo
              id="howto-render-tile"
              title="Render your own content in a pane"
              goal={
                <>
                  Take over what each pane draws with a <Code>renderTile</Code>{" "}
                  callback while the renderer keeps owning layout, resize, and drag.
                </>
              }
              exampleId="render-tile"
              demo={<RenderTileExample />}
              knobs={
                <>
                  Root the pane on <Code>article[data-leaf-id]</Code> and forward{" "}
                  <Code>onFocus</Code>, <Code>onPointerMove</Code>, and{" "}
                  <Code>onPointerLeave</Code>; put <Code>onHandlePointerDown</Code>{" "}
                  on your drag handle (the header). Everything else on{" "}
                  <Code>TilingRenderTileProps</Code> (<Code>isFocused</Code>,{" "}
                  <Code>isMaximized</Code>, the <Code>tile</Code> payload) is
                  presentation state you style from.
                </>
              }
              symbols={["TilingRenderTileProps", "TilingRendererProps", "TilingTile"]}
            />

            <HowTo
              id="howto-theming"
              title="Theme & color panes"
              goal={
                <>
                  Restyle the whole surface with a built-in theme, or give an
                  individual pane its own accent — switching is live, with no
                  remount.
                </>
              }
              exampleId="theming"
              demo={<ThemingExample />}
              knobs={
                <>
                  Set <Code>themeId</Code> (<Code>"neon-terminal"</Code> /{" "}
                  <Code>"clean-flat"</Code> / <Code>"mosaic"</Code>) for the whole
                  renderer; set <Code>tile.accent</Code> for one pane.{" "}
                  <Code>useTilingTheme()</Code> reads the active theme inside a
                  pane; <Code>resolveTilingTheme</Code> maps an id to its token
                  object for <Code>TilingThemeProvider</Code>.
                </>
              }
              symbols={[
                "TilingThemeProvider",
                "useTilingTheme",
                "resolveTilingTheme",
                "TilingThemeId",
                "TilingTheme",
              ]}
            />

            <HowTo
              id="howto-capabilities"
              title="Choose which interactions are allowed"
              goal={
                <>
                  Turn interactions on or off — everything is enabled by default,
                  so you subtract what you don&rsquo;t want through one prop.
                </>
              }
              exampleId="capabilities"
              demo={<CapabilitiesExample />}
              knobs={
                <>
                  Pass a partial <Code>TilingInteractionCapabilities</Code> to the{" "}
                  <Code>interaction</Code> prop, or spread a preset like{" "}
                  <Code>TILING_DASHBOARD_PRESET</Code> and override.{" "}
                  <Code>resolveInteractionCapabilities</Code> returns the
                  fully-defaulted shape when you need to read effective values.
                </>
              }
              symbols={[
                "TilingInteractionCapabilities",
                "TILING_DASHBOARD_PRESET",
                "resolveInteractionCapabilities",
                "TilingResizeCapability",
              ]}
            />

            <HowTo
              id="howto-save-restore"
              title="Save & restore a layout"
              goal={
                <>
                  Persist the arrangement across reloads. Because the tree is plain
                  JSON you own, this is just save on change and load on mount.
                </>
              }
              exampleId="save-restore"
              knobs={
                <>
                  Write the layout to storage inside <Code>onLayoutChange</Code>{" "}
                  and read it back in your <Code>useState</Code> initializer with a
                  default fallback. Validate the parsed shape before trusting it in
                  production. No library-specific serializer is involved.
                </>
              }
              symbols={["TilingLayoutNode", "TilingRendererProps"]}
            />

            <HowTo
              id="howto-commands"
              title="Trigger actions from your own buttons"
              goal={
                <>
                  Drive the layout from a toolbar, menu, or any control you build —
                  split, group, resize, maximize — without touching the tree by
                  hand.
                </>
              }
              exampleId="commands"
              demo={<CommandsExample />}
              knobs={
                <>
                  Take the renderer&rsquo;s <Code>TilingCommandHandle</Code> with a
                  ref and call <Code>dispatch</Code> with a typed{" "}
                  <Code>TilingCommand</Code> (<Code>set-split-ratio</Code>,{" "}
                  <Code>toggle-split-axis</Code>, <Code>group-leaves</Code>, …). A
                  command targeting a disabled capability is a safe no-op, so you
                  never have to guard the happy path.
                </>
              }
              symbols={["TilingCommandHandle", "TilingCommand"]}
            />

            <HowTo
              id="howto-command-bar"
              title="Build a command bar / keyboard shortcuts"
              goal={
                <>
                  <span className="mr-2 rounded border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200">
                    advanced
                  </span>
                  Wire your own command bar or key bindings that only surface — and
                  only fire — when the target command would actually do something.
                </>
              }
              exampleId="command-bar"
              demo={<CommandBarExample />}
              knobs={
                <>
                  Derive <Code>TilingCommandGates</Code> from{" "}
                  <Code>resolveInteractionCapabilities</Code>, then call{" "}
                  <Code>isCommandEnabled(command, gates)</Code> to hide dead
                  controls and keep a keyboard binding browser-graceful (only{" "}
                  <Code>preventDefault</Code> when the command runs). This is the
                  same gate the renderer uses for its built-in shortcut chips.
                </>
              }
              symbols={[
                "isCommandEnabled",
                "TilingCommandGates",
                "resolveInteractionCapabilities",
                "resolveJumpedPaneId",
              ]}
            />

            <HowTo
              id="howto-group-split-maximize"
              title="Group, split & maximize panes"
              goal={
                <>
                  Fold panes into a tabbed group, split space, or maximize a pane —
                  as built-in gestures and from your own code.
                </>
              }
              exampleId="group-split-maximize"
              demo={<GroupSplitMaximizeExample />}
              knobs={
                <>
                  Users can Alt/Opt+G to group, drag a header to split, and
                  Alt+Enter to maximize out of the box. From code, dispatch{" "}
                  <Code>group-leaves</Code>, <Code>insert-adjacent</Code>, and{" "}
                  <Code>toggle-maximize</Code>. For custom multi-select affordances,{" "}
                  <Code>isMultiSelectModifierActive</Code> reports whether the
                  platform modifier is held.
                </>
              }
              symbols={[
                "TilingCommand",
                "TilingCommandHandle",
                "isMultiSelectModifierActive",
                "MultiSelectModifierState",
              ]}
            />
          </GuideSection>

          {/* 4. CONCEPTS — only what unblocks the recipes. */}
          <GuideSection id="concepts" eyebrow="mental model" title="Concepts">
            <SectionLead>
              Three ideas unblock everything above. That is deliberately all —
              there is no architecture here.
            </SectionLead>
            <div className="flex flex-col gap-3">
              <ConceptCard term="The layout is a tree you own">
                A layout is a recursive tree of three node kinds:{" "}
                <Code>leaf</Code> (one tile), <Code>split</Code> (two children
                divided by a ratio along an axis), and <Code>group</Code> (leaves
                stacked behind a tab strip). It is plain, serialisable data held in{" "}
                <em className="not-italic text-stone-200">your</em> state.
              </ConceptCard>
              <ConceptCard term="The renderer runs interactions; you own the tree">
                <Code>TilingRenderer</Code> is controlled. It performs drag, resize,
                grouping, focus, and keyboard control, then reports the resulting
                tree through <Code>onLayoutChange</Code> — it never mutates state
                behind your back. You apply the edit (or persist / diff / veto it).
              </ConceptCard>
              <ConceptCard term="Interactions are capabilities, on by default">
                Every interaction is enabled unless you narrow it. The single{" "}
                <Code>interaction</Code> prop (
                <Code>TilingInteractionCapabilities</Code>) subtracts or reshapes
                behavior; presets are just pre-filled partials. You configure by
                turning things off, not wiring things on.
              </ConceptCard>
            </div>
          </GuideSection>

          {/* 5. EXAMPLES — whole runnable apps to copy wholesale. */}
          <GuideSection id="examples" eyebrow="copy wholesale" title="Examples gallery">
            <SectionLead>
              Complete, controlled <Code>TilingRenderer</Code> apps. Each file is
              runnable as-is and type-checked against the public API — copy one and
              start editing.
            </SectionLead>

            <div className="flex flex-col gap-4 scroll-mt-24" id="examples-dashboard">
              <h3 className="font-display text-[19px] font-medium text-stone-100">
                Metrics dashboard
              </h3>
              <SectionLead>
                A master-stack of accented metric panes on the{" "}
                <Code>clean-flat</Code> theme.
              </SectionLead>
              <DemoFrame height={340}>
                <DashboardApp />
              </DemoFrame>
              <ExampleSource id="dashboard-app" />
            </div>

            <div className="flex flex-col gap-4 scroll-mt-24" id="examples-terminal">
              <h3 className="font-display text-[19px] font-medium text-stone-100">
                Terminal grid
              </h3>
              <SectionLead>
                Monospace shell / logs / htop panes on the{" "}
                <Code>neon-terminal</Code> theme — the Hyprland homage, in the
                terminal.
              </SectionLead>
              <DemoFrame height={340}>
                <TerminalGridApp />
              </DemoFrame>
              <ExampleSource id="terminal-grid" />
            </div>
          </GuideSection>

          {/* 6. REFERENCE — DEMOTED, last, tiered Core vs Advanced. */}
          <ApiReference />

          <footer className="border-t border-white/[0.08] pt-6 text-[12px] leading-[1.7] text-stone-500">
            hypr-tiling follows calendar versioning; breaking changes and release
            notes live in the{" "}
            <Link href={CHANGELOG_URL}>CHANGELOG.md</Link>. Source-available under{" "}
            <Link href={LICENSE_URL}>{LICENSE_NAME}</Link> · free commercial use ·
            no competing use.
          </footer>
        </main>
      </div>
    </div>
  );
}
