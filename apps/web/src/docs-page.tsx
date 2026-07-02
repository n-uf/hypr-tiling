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

// The prerendered /docs route: a CONSUMER-facing documentation system. A
// "consumer" is a developer who USES `@n-uf/hypr-tiling` in their app; the docs
// describe only the public API surface (the hand-authored `.` facade enforced by
// API Extractor). Contributor material (architecture / internals) and the @beta
// `/engine` escape hatch live off this site — see CONTRIBUTING.md and
// apps/web/_agent/docs-ia.md.
//
// Two-lane information architecture:
//   1. API map        — a short landing section that routes the reader.
//   2. Lane A         — Fast track: one copy-paste path to the first tiles.
//   3. Lane B         — Full public-API spectrum: the consumer surface grouped
//                       by capability, each group linking into the generated
//                       per-symbol reference, which follows last.
//
// Styling reuses the homepage "mosaic" vocabulary (graphite canvas, single gold
// accent, Fraunces headings, Inter body, JetBrains Mono code). The injected API
// HTML is styled through the scoped `.ht-api` rules below since the Tailwind CDN
// build carries no typography plugin. The reference bundle stays code-split.

// Lane A — Fast track. One copy-paste-runnable path optimized for
// time-to-first-tile: a minimal controlled TilingRenderer with a layout config,
// a tile registry, and a renderTile callback that paints each tile. No concept
// deep-dives; those live in Lane B.
const FAST_TRACK_SNIPPET: string = `import { TilingRenderer, DEFAULT_TILING_LAYOUT_CONFIG } from "@n-uf/hypr-tiling";
import type { TilingLayoutNode, TilingTile, TilingRenderTileProps } from "@n-uf/hypr-tiling";
import { useState } from "react";

const tiles: TilingTile[] = [
  { id: "a", title: "editor" },
  { id: "b", title: "preview" },
];

const initial: TilingLayoutNode = {
  kind: "split", id: "root", axis: "horizontal", ratio: 0.5,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

export function Workspace() {
  const [layout, setLayout] = useState<TilingLayoutNode>(initial);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      onLayoutChange={setLayout}
      renderTile={({ tile }: TilingRenderTileProps) => (
        <div style={{ padding: 12 }}>{tile.title}</div>
      )}
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

// Lane B snippets — one focused example per capability group.
const LAYOUT_MUTATION_SNIPPET: string = `import { TilingRenderer, queryTilingLayout } from "@n-uf/hypr-tiling";
import type { TilingCommandHandle } from "@n-uf/hypr-tiling";
import { useRef } from "react";

// You own the tree in state and receive every UI-driven edit through
// onLayoutChange. To edit it programmatically, take the renderer's
// TilingCommandHandle ref and dispatch a typed TilingCommand:
const ref = useRef<TilingCommandHandle>(null);
ref.current?.dispatch({ kind: "set-split-ratio", splitId: "root", ratio: 0.66 });
ref.current?.dispatch({ kind: "group-leaves", leafIds: ["l", "r"] });

// Inspect the tree — leaf ids, splits, groups, tile order, directional
// neighbors — without walking it by hand:
const { leafIds, splits, neighborLeafId } = queryTilingLayout(layout);`;

const CAPABILITIES_SNIPPET: string = `import type { TilingInteractionCapabilities } from "@n-uf/hypr-tiling";
import { TILING_DASHBOARD_PRESET } from "@n-uf/hypr-tiling";

// Every capability is on by default; pass a partial to narrow behavior,
// or start from a preset and override.
const interaction: TilingInteractionCapabilities = {
  ...TILING_DASHBOARD_PRESET,
  resize: { enabled: true },
  grouping: { enabled: true },
};`;

const THEMING_SNIPPET: string = `import { TilingThemeProvider, useTilingTheme } from "@n-uf/hypr-tiling";

// Wrap a subtree and read the active theme with the hook. Switching themeId
// is live — no remount.
function Toolbar() {
  const theme = useTilingTheme();
  return <span>{theme.id}</span>;
}`;

const GROUPING_SNIPPET: string = `import { isMultiSelectModifierActive } from "@n-uf/hypr-tiling";
import type { TilingCommandHandle } from "@n-uf/hypr-tiling";

// Multi-select + group is a built-in interaction: Alt/Opt+click to add a leaf
// to the selection, Alt/Opt+G to fold the selection into a tabbed group. Detect
// the platform multi-select modifier for your own affordances:
const multiSelect = isMultiSelectModifierActive(event);

// selection is a ReadonlySet<string> of leaf ids (insertion order preserved).
// Apply the group programmatically through the renderer command handle:
ref.current?.dispatch({ kind: "group-leaves", leafIds: [...selection] });`;

const DEVTOOLS_SNIPPET: string = `// Opt-in, advanced. A renderer-only consumer never imports this subpath.
import { TilingObservabilityPanel } from "@n-uf/hypr-tiling/devtools";`;

// --- Capability groups (Lane B) -------------------------------------------
// Each group is task-oriented and links into the generated per-symbol reference
// cards. Symbol names are resolved against API_REFERENCE_SECTIONS so a link is
// only emitted when the symbol is actually on the public barrel — broken
// anchors and accidental references to `@internal` symbols are impossible.

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
    .filter(
      (section): section is ApiReferenceSection => section != null,
    );
  if (resolved.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-500">
        In the reference
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

// A Lane B capability section: task-oriented prose, an optional focused
// example, and the reference-card links for the symbols the capability exposes.
function CapabilitySection({
  id,
  title,
  symbols,
  children,
}: {
  id: string;
  title: string;
  symbols: ReadonlyArray<string>;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <GuideSection id={id} eyebrow="capability" title={title}>
      {children}
      <ReferenceLinks symbols={symbols} />
    </GuideSection>
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

const LANE_LABEL: Record<string, string> = {
  start: "Start here",
  spectrum: "Full SDK spectrum",
};

function SidebarLane({
  lane,
}: {
  lane: "start" | "spectrum";
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-300/70">
        {LANE_LABEL[lane]}
      </span>
      {DOCS_GUIDE_TOPICS.filter(
        (topic): boolean => topic.lane === lane,
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
  );
}

function DocsSidebar(): React.ReactElement {
  return (
    <aside className="hidden lg:block">
      <nav className="sticky top-[68px] flex max-h-[calc(100vh-84px)] flex-col gap-5 overflow-y-auto pr-2 pb-10 text-[13px]">
        <SidebarLane lane="start" />
        <SidebarLane lane="spectrum" />
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-300/70">
            Reference
          </span>
          <a
            href="#api-reference"
            className="text-stone-400 transition-colors hover:text-amber-100"
          >
            API reference
          </a>
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
        are excluded, so every symbol below is part of the supported consumer
        contract. The full machine-readable report is published in the{" "}
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

// API map (landing) — three concrete routes into the docs, kept terse.
function ApiMap(): React.ReactElement {
  return (
    <section className="flex flex-col gap-4 scroll-mt-24" id="api-map">
      <Eyebrow>api map</Eyebrow>
      <h2 className="font-display text-[26px] font-medium leading-tight tracking-[-0.015em] text-stone-50">
        Where to start
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <a
          href="#fast-track"
          className="group flex flex-col gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.015] p-4 transition-colors hover:border-amber-300/40"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-300/70">
            Brand-new
          </span>
          <span className="text-[14px] font-medium text-stone-100 group-hover:text-amber-100">
            Take the Fast track
          </span>
          <span className="text-[12px] leading-[1.6] text-stone-400">
            One copy-paste path to your first rendered tiles.
          </span>
        </a>
        <a
          href="#cap-renderer"
          className="group flex flex-col gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.015] p-4 transition-colors hover:border-amber-300/40"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-300/70">
            Know what you need
          </span>
          <span className="text-[14px] font-medium text-stone-100 group-hover:text-amber-100">
            Jump to a capability
          </span>
          <span className="text-[12px] leading-[1.6] text-stone-400">
            The full public-API spectrum, grouped by task.
          </span>
        </a>
        <a
          href="#api-reference"
          className="group flex flex-col gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.015] p-4 transition-colors hover:border-amber-300/40"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-300/70">
            Look up a symbol
          </span>
          <span className="text-[14px] font-medium text-stone-100 group-hover:text-amber-100">
            Go to the reference
          </span>
          <span className="text-[12px] leading-[1.6] text-stone-400">
            Generated per-symbol cards for the public barrel.
          </span>
        </a>
      </div>
    </section>
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
          <div className="flex flex-col gap-4">
            <Eyebrow>consumer documentation</Eyebrow>
            <h1 className="font-display text-[clamp(2rem,3vw,2.6rem)] font-medium leading-[1.05] tracking-[-0.015em] text-stone-50">
              {PACKAGE_NAME} documentation
            </h1>
            <SectionLead>
              Everything a consumer needs to render tiling layouts with{" "}
              hypr-tiling: a fast track to the first tiles, the full public-API
              surface grouped by capability, and the generated per-symbol
              reference. These docs cover only the public API; contributors
              working on the library itself start from{" "}
              <Code>CONTRIBUTING.md</Code>. Every page is prerendered to static
              HTML.
            </SectionLead>
          </div>

          <ApiMap />

          <GuideSection id="fast-track" eyebrow="lane a · quickstart" title="Fast track">
            <SectionLead>
              The shortest path to a working layout. Install the package with its
              React 19 peers, register its <Code>dist</Code> in your Tailwind{" "}
              <Code>content</Code> glob (the library ships utility classes, not
              CSS), then render a controlled <Code>TilingRenderer</Code>: you own
              the layout tree in state and apply every edit it reports through{" "}
              <Code>onLayoutChange</Code>.
            </SectionLead>
            <Pre>{INSTALL_SNIPPET}</Pre>
            <SectionLead>
              Add the package&rsquo;s dist directory to your Tailwind{" "}
              <Code>content</Code> globs so the pane, divider, and drag-ghost
              classes are not purged from your build:
            </SectionLead>
            <Pre>{TAILWIND_CONTENT_SNIPPET}</Pre>
            <SectionLead>
              A minimal renderer: a layout config, a two-tile registry, and a{" "}
              <Code>renderTile</Code> callback that paints each tile. This
              renders two draggable, resizable panes.
            </SectionLead>
            <Pre>{FAST_TRACK_SNIPPET}</Pre>
            <SectionLead>
              Next steps: narrow behavior in{" "}
              <Link href="#cap-interaction">Interaction capabilities</Link>,
              mutate the tree in{" "}
              <Link href="#cap-layout">Layout tree &amp; mutation</Link>, restyle
              in <Link href="#cap-theming">Theming</Link>, or look up any symbol
              in the <Link href="#api-reference">reference</Link>.
            </SectionLead>
          </GuideSection>

          <CapabilitySection
            id="cap-renderer"
            title="Renderer & props"
            symbols={[
              "TilingRenderer",
              "TilingRendererProps",
              "TilingRenderTileProps",
              "TilingTile",
            ]}
          >
            <SectionLead>
              <Code>TilingRenderer</Code> is the single entry component and a
              controlled component: <Code>layout</Code>, <Code>tiles</Code>,{" "}
              <Code>config</Code>, and <Code>onLayoutChange</Code> are the four
              required props; everything else is optional and resolves to a
              documented default. Supply a <Code>renderTile</Code> callback (
              <Code>TilingRenderTileProps</Code>) to render custom pane bodies,
              or omit it for the default tile surface. A <Code>TilingTile</Code>{" "}
              only requires <Code>id</Code> and <Code>title</Code>.
            </SectionLead>
          </CapabilitySection>

          <CapabilitySection
            id="cap-layout"
            title="Layout tree & mutation"
            symbols={[
              "TilingLayoutNode",
              "TilingLeafNode",
              "TilingSplitNode",
              "TilingGroupNode",
              "TilingLayoutConfig",
              "DEFAULT_TILING_LAYOUT_CONFIG",
              "queryTilingLayout",
              "TilingLayoutQuery",
              "TilingCommand",
              "TilingCommandHandle",
              "TilingCommandGates",
              "isCommandEnabled",
            ]}
          >
            <SectionLead>
              A layout is a recursive tree you own in state: <Code>leaf</Code>{" "}
              nodes hold a tile, <Code>split</Code> nodes divide space along an
              axis by a ratio, and <Code>group</Code> nodes stack leaves behind a
              tab strip (<Code>TilingLayoutNode</Code> is the union). Read it with{" "}
              <Code>queryTilingLayout</Code>, which returns a{" "}
              <Code>TilingLayoutQuery</Code> view (leaf ids, splits, groups, tile
              order, and a directional-neighbor lookup) so you never walk the tree
              by hand. Edit it two ways: declaratively, by applying the tree the
              renderer reports through <Code>onLayoutChange</Code>; or
              imperatively, by dispatching a typed <Code>TilingCommand</Code>{" "}
              through the renderer&rsquo;s <Code>TilingCommandHandle</Code> ref (
              gate a command first with <Code>isCommandEnabled</Code> +{" "}
              <Code>TilingCommandGates</Code>). Every edit stays diffable and
              persistable.
            </SectionLead>
            <Pre>{LAYOUT_MUTATION_SNIPPET}</Pre>
            <SectionLead>
              Power users driving the tree headlessly (no renderer) can reach the
              raw pure reducers — <Code>insertLeafAdjacent</Code>,{" "}
              <Code>groupLeaves</Code>, <Code>swapLeafTiles</Code>,{" "}
              <Code>updateSplitRatio</Code>, and the rest — on the{" "}
              <Code>@n-uf/hypr-tiling/engine</Code> escape hatch. That entry is{" "}
              <Code>@beta</Code> with no stability guarantees and is kept off this
              reference; prefer the command handle above.
            </SectionLead>
          </CapabilitySection>

          <CapabilitySection
            id="cap-interaction"
            title="Interaction capabilities & presets"
            symbols={[
              "TilingInteractionCapabilities",
              "ResolvedTilingInteractionCapabilities",
              "resolveInteractionCapabilities",
              "TILING_INTERACTION_CAPABILITY_DEFAULTS",
              "TILING_DASHBOARD_PRESET",
              "TilingResizeCapability",
              "TilingMaximizeCapability",
              "TilingPaneSwitchingCapability",
              "TilingPaneTitleBarControlsCapability",
              "TilingSlotCommitmentCapability",
            ]}
          >
            <SectionLead>
              Drag-and-drop, resize, keyboard control, grouping, and maximize are
              all enabled by default and configured through the single{" "}
              <Code>interaction</Code> prop (
              <Code>TilingInteractionCapabilities</Code>). Pass a partial to
              narrow behavior, or start from a preset like{" "}
              <Code>TILING_DASHBOARD_PRESET</Code>.{" "}
              <Code>resolveInteractionCapabilities</Code> materializes the fully
              resolved shape.
            </SectionLead>
            <Pre>{CAPABILITIES_SNIPPET}</Pre>
          </CapabilitySection>

          <CapabilitySection
            id="cap-theming"
            title="Theming"
            symbols={[
              "TilingThemeProvider",
              "TilingTheme",
              "useTilingTheme",
              "TilingThemeId",
              "TILING_THEMES",
              "DEFAULT_TILING_THEME_ID",
              "resolveTilingTheme",
            ]}
          >
            <SectionLead>
              Choose a built-in theme with the <Code>themeId</Code> prop, or wrap
              a subtree in <Code>TilingThemeProvider</Code> and read the active{" "}
              <Code>TilingTheme</Code> with <Code>useTilingTheme</Code>. Theme
              switching is live — no remount. <Code>TILING_THEMES</Code> and{" "}
              <Code>resolveTilingTheme</Code> back the registry.
            </SectionLead>
            <Pre>{THEMING_SNIPPET}</Pre>
          </CapabilitySection>

          <CapabilitySection
            id="cap-grouping"
            title="Multi-select & grouping"
            symbols={[
              "isMultiSelectModifierActive",
              "MultiSelectModifierState",
              "TilingCommand",
              "TilingCommandHandle",
            ]}
          >
            <SectionLead>
              Fold several selected leaves into one tabbed group. This is a
              built-in interaction: Alt/Opt+click adds a leaf to the selection and
              Alt/Opt+G groups it — no wiring required. For your own affordances,{" "}
              <Code>isMultiSelectModifierActive</Code> (over a{" "}
              <Code>MultiSelectModifierState</Code>) tells you whether the
              platform multi-select modifier is held, and you can apply a group
              programmatically by dispatching the <Code>group-leaves</Code>{" "}
              <Code>TilingCommand</Code> through the renderer&rsquo;s{" "}
              <Code>TilingCommandHandle</Code>. The lower-level selection reducers
              (<Code>toggleLeafMultiSelection</Code>,{" "}
              <Code>canGroupMultiSelection</Code>, <Code>pruneMultiSelection</Code>
              ) are power-user internals on the <Code>@beta</Code>{" "}
              <Code>@n-uf/hypr-tiling/engine</Code> escape hatch.
            </SectionLead>
            <Pre>{GROUPING_SNIPPET}</Pre>
          </CapabilitySection>

          <CapabilitySection
            id="cap-drag"
            title="Drag / FLIP & recovery"
            symbols={[
              "TilingDragRecoveryCapability",
              "ResolvedTilingDragRecoveryCapability",
              "TilingTouchDragCapability",
              "ResolvedTilingTouchDragCapability",
              "DEFAULT_DRAG_ANIMATION_SPEED_PERCENT",
              "DEFAULT_DRAG_HOP_EASING",
              "DEFAULT_DRAG_REFLOW_EASING",
              "BASELINE_DRAG_HOP_DURATION_MS",
            ]}
          >
            <SectionLead>
              Dragging a pane header detaches the source, freezes the tree, and
              floats a cursor-following ghost that hops between seats; the move
              commits on release. FLIP-animated survivor reflow and a
              self-healing recovery backstop guarantee the tree never strands
              mid-transition. As a consumer you tune the motion through props on{" "}
              <Code>TilingRendererProps</Code> — <Code>dragAnimationEnabled</Code>
              , <Code>dragHopEasing</Code>, <Code>dragReflowEasing</Code>,{" "}
              <Code>ghostTransitSpeedPercent</Code> — and configure touch-drag and
              recovery through the capabilities below. The deep-engine drag math
              is <Code>@internal</Code> and excluded from the surface.
            </SectionLead>
          </CapabilitySection>

          <CapabilitySection
            id="cap-devtools"
            title="Devtools (opt-in)"
            symbols={[
              "TilingObservabilityColorConfig",
              "TilingObservabilityColorEnableConfig",
              "TilingDropIntentDebugState",
              "TilingLiveHitLogState",
              "TilingPaneHitZoneOverlayDebugState",
            ]}
          >
            <SectionLead>
              Advanced and opt-in. The{" "}
              <Code>@n-uf/hypr-tiling/devtools</Code> subpath exposes
              observability overlays (the <Code>TilingObservabilityPanel</Code>{" "}
              and its seed defaults) for drop-intent resolution and pane hit-zone
              debugging — useful when tuning custom interaction behavior. It lives
              on its own entry point so a renderer-only consumer never pulls the
              panel into its bundle, and it is intentionally kept out of the fast
              track. The observability <em>types</em> referenced by public
              renderer props remain on the main entry and appear in the reference
              below; the panel implementation does not.
            </SectionLead>
            <Pre>{DEVTOOLS_SNIPPET}</Pre>
          </CapabilitySection>

          <GuideSection
            id="migration"
            eyebrow="release"
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
