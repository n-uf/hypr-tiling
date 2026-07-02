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
// Canonical homepage base. The redesigned docs homepage lives at the site root;
// the full interactive showcase lives at its own `/showcase` sub-route (a
// client-only surface, not part of this prerendered SEO mirror).
export const SITE_URL: string = "https://hypr-tiling.n-uf.com/";
export const SHOWCASE_URL: string = "https://hypr-tiling.n-uf.com/showcase";
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

interface FeatureFact {
  readonly term: string;
  readonly detail: string;
}

// Verified against the published export surface (packages/hypr-tiling/index.ts).
export const FEATURE_FACTS: ReadonlyArray<FeatureFact> = [
  {
    term: "Recursive split-tree layout",
    detail:
      "A layout is a tree of leaf, split, and group nodes. Binary splits carry a ratio and an axis; the renderer is a controlled component driven by your layout state.",
  },
  {
    term: "Drag-and-drop tiling",
    detail:
      "Hyprland-style live drag: the source detaches, the tree freezes, a cursor-following ghost hops between seats, and the move commits on release — resolving to swap, edge-insert, split-container-insert, or group-merge.",
  },
  {
    term: "Resize & sizing modes",
    detail:
      "Drag split dividers, or pin a pane to a measured pixel extent per dimension (static) versus ratio-distributed (flexible). Panes can acquire space directionally.",
  },
  {
    term: "Master / stack layout",
    detail:
      "Any subtree can switch to a master-area-plus-stack arrangement with a configurable master count and orientation — the classic tiling-WM master layout.",
  },
  {
    term: "Tabbed grouping",
    detail:
      "Collapse several leaves into one slot as a stacked group with a tab strip; only the active member renders and is hit-tested.",
  },
  {
    term: "Full keyboard control",
    detail:
      "Directional focus, a pane switcher (cycle / jump / overlay), maximize, keyboard move-mode, and master/group commands — all behind a remappable keymap and a typed command API.",
  },
  {
    term: "Theming engine",
    detail:
      "Built-in themes, eight accent hues, a theme provider with hooks, and live theme switching with no remount. This page ships a bespoke mosaic theme.",
  },
  {
    term: "Self-healing drag recovery",
    detail:
      "A frame-deadline animation backstop, an idle watchdog, transient-style teardown, and a visibilitychange reconcile guarantee a drag never strands the tree mid-transition.",
  },
];

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
    term: "Dynamic / content sites",
    detail:
      "Real, SEO-indexable content arranged as tiles instead of a single scroll — this page dogfoods it: the docs live in prerendered panes.",
  },
  {
    term: "Dashboards",
    detail:
      "Analytics, metrics, and monitoring consoles where several resizable panes share one screen.",
  },
  {
    term: "IDE-like tools",
    detail:
      "Editor, preview, and terminal workspaces a user splits, stacks, and rearranges at runtime.",
  },
  {
    term: "Trading & operator consoles",
    detail:
      "Dense, keyboard-driven control surfaces that pack many live panels into a fixed viewport.",
  },
  {
    term: "Admin & data apps",
    detail:
      "Table, detail, and activity panes side by side, resized to fit the task at hand.",
  },
  {
    term: "Observability & log explorers",
    detail:
      "Query, results, and trace panes rearranged on the fly while chasing an incident.",
  },
  {
    term: "Web terminals & consoles",
    detail:
      "Browser-based shells, multiplexed sessions, and live log streams split and resized Hyprland-style — the tiling homage made literal, in the terminal.",
  },
  {
    term: "Realtime trading terminals",
    detail:
      "Bloomberg-style desks — live charts, order books, watchlists, and order entry packed into dense panes that stream and rearrange in realtime.",
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
    detail:
      "A dependency-free vanilla TypeScript core so the tiling engine runs without any framework — the layout tree, the drag/FLIP state machine, and the self-healing recovery logic decoupled from React, ready to drive any view layer.",
  },
  {
    term: "First-class adapters for every major framework",
    detail:
      "React ships today; planned official adapters for Vue, Svelte, Solid, Angular, and standard Web Components, each a thin binding over the same vanilla core so behavior stays identical across frameworks.",
  },
  {
    term: "Canvas rendering backend",
    detail:
      "An optional canvas / GPU-accelerated render path for very high pane counts and animation-heavy scenes where DOM reflow is the bottleneck. The semantic DOM path stays the default; canvas is opt-in for density.",
  },
  {
    term: "Rust + WebAssembly core",
    detail:
      "Porting the hot layout, drag, and geometry math to a Rust \u2192 WebAssembly core for deterministic, high-frame-rate behavior — unlocking more window-manager-like UX: virtual workspaces, snap zones, persistent session layouts, fully keyboard-driven tiling, and per-monitor-style multi-viewport arrangements.",
  },
];

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
    <p className="max-w-[62ch] text-[13px] leading-[1.7] text-stone-300/90">
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
// `rel="noopener noreferrer"`; same-site hrefs (e.g. `/showcase`, hash
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

const INTEGRATION_EXAMPLE: string = `import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
} from "@n-uf/hypr-tiling";
import { useState } from "react";

const tiles: TilingTile[] = [
  { id: "a", title: "editor", content: <Editor /> },
  { id: "b", title: "preview", content: <Preview /> },
];

const initialLayout: TilingLayoutNode = {
  kind: "split", id: "root", axis: "vertical", ratio: 0.5,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

export function Workspace() {
  const [layout, setLayout] = useState(initialLayout);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      onLayoutChange={setLayout}
    />
  );
}`;

export const DOC_PANES: ReadonlyArray<DocPaneSpec> = [
  {
    id: "intro",
    title: "hypr-tiling",
    accent: "amber",
    summary:
      "Dynamic tiling for React. A recursive split-tree renderer for runtime-rearrangeable, resizable panes.",
    content: (
      <div className="flex min-h-full flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Eyebrow>dynamic tiling · for react</Eyebrow>
          <h1 className="font-display text-[clamp(2rem,3.4vw,2.9rem)] font-medium leading-[1.02] tracking-[-0.015em] text-stone-50">
            Rearrange the interface,{" "}
            <em className="font-display italic text-amber-200/90">at runtime.</em>
          </h1>
        </div>
        <SectionLead>{CANONICAL_DESCRIPTION}</SectionLead>
        <SectionLead>
          Reach for it where users live inside dense, multi-panel screens —
          IDE-like tools, trading and operator consoles, analytics dashboards —
          and your app keeps strict, controlled ownership of the layout state.
        </SectionLead>
        <p className="max-w-[62ch] border-l-2 border-amber-300/30 pl-3 text-[12px] leading-[1.6] text-stone-400">
          This page <em className="not-italic text-stone-200">is</em> a
          hypr-tiling layout. Every section is a real pane: focus it, drag its
          header, resize the dividers, maximize it — or drive it from the live
          controls pane.
        </p>
        <div className="mt-auto flex flex-col gap-1.5 border-t border-white/[0.08] pt-3">
          <Eyebrow>contributing</Eyebrow>
          <p className="max-w-[62ch] text-[12px] leading-[1.6] text-stone-400">
            hypr-tiling is built in the open and welcomes collaboration —
            framework adapters, rendering backends, bug reports, and ideas from
            the roadmap. To get involved, reach out at{" "}
            <Link href="mailto:metelin@gmail.com">metelin@gmail.com</Link>.
          </p>
        </div>
        <footer className="border-t border-white/[0.08] pt-3 text-[11px] leading-[1.5] text-stone-500">
          <Link href={LICENSE_URL}>{LICENSE_NAME}</Link> · source-available ·
          free commercial use · no competing use
        </footer>
      </div>
    ),
  },
  {
    id: "usecases",
    title: "use cases",
    accent: "amber",
    summary:
      "Built for dynamic/content sites, analytics dashboards, IDE-like tools, trading and operator consoles, admin and data apps, and observability/log explorers — any screen with multiple resizable, rearrangeable panes.",
    content: (
      <div className="flex flex-col gap-4">
        <SectionHeading>Use cases</SectionHeading>
        <SectionLead>
          Reach for hypr-tiling where users live across multiple panels and
          rearrange them as the work demands.
        </SectionLead>
        <ul className="flex flex-col divide-y divide-white/[0.05]">
          {USE_CASES.map(
            (useCase: UseCase): React.ReactElement => (
              <li
                key={useCase.term}
                className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="text-[13px] font-medium text-stone-100">
                  {useCase.term}
                </span>
                <span className="max-w-[60ch] text-[12px] leading-[1.6] text-stone-400">
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
      "Install with pnpm add @n-uf/hypr-tiling react react-dom. React 19 peer deps. Render TilingRenderer with controlled layout state.",
    content: (
      <div className="flex flex-col gap-4">
        <SectionHeading>Install &amp; integrate</SectionHeading>
        <SectionLead>
          Add the scoped package and its React peers. The library targets{" "}
          <Code>react</Code> and <Code>react-dom</Code> version 19.
        </SectionLead>
        <Pre>{INSTALL_SNIPPET}</Pre>
        <SectionLead>
          The renderer is a controlled component: you own the layout tree in
          state and apply every change it reports through{" "}
          <Code>onLayoutChange</Code>.
        </SectionLead>
        <Pre>{INTEGRATION_EXAMPLE}</Pre>
      </div>
    ),
  },
  {
    id: "features",
    title: "features",
    accent: "amber",
    summary:
      FEATURE_FACTS.map((f: FeatureFact): string => f.term).join(", ") + ".",
    content: (
      <div className="flex flex-col gap-4">
        <SectionHeading>Features</SectionHeading>
        <dl className="flex flex-col divide-y divide-white/[0.05]">
          {FEATURE_FACTS.map(
            (fact: FeatureFact): React.ReactElement => (
              <div
                key={fact.term}
                className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
              >
                <dt className="text-[13px] font-medium text-stone-100">
                  {fact.term}
                </dt>
                <dd className="max-w-[60ch] text-[12px] leading-[1.6] text-stone-400">
                  {fact.detail}
                </dd>
              </div>
            ),
          )}
        </dl>
      </div>
    ),
  },
  {
    id: "roadmap",
    title: "roadmap",
    accent: "amber",
    summary:
      "Planned, not-yet-shipped directions: a framework-agnostic vanilla core, first-class adapters for Vue/Svelte/Solid/Angular/Web Components, an optional canvas rendering backend, and a Rust + WebAssembly core with more window-manager-like UX (virtual workspaces, snap zones, persistent layouts).",
    content: (
      <div className="flex flex-col gap-4">
        <SectionHeading>Roadmap</SectionHeading>
        <SectionLead>
          Where hypr-tiling is headed. These are{" "}
          <em className="not-italic text-stone-200">planned</em> directions, not
          shipped features today — the library currently renders to the DOM and
          ships a React adapter only. The items below describe where the project
          is going.
        </SectionLead>
        <ul className="flex flex-col divide-y divide-white/[0.05]">
          {ROADMAP_ITEMS.map(
            (item: RoadmapItem): React.ReactElement => (
              <li
                key={item.term}
                className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="text-[13px] font-medium text-stone-100">
                  {item.term}
                </span>
                <span className="max-w-[60ch] text-[12px] leading-[1.6] text-stone-400">
                  {item.detail}
                </span>
              </li>
            ),
          )}
        </ul>
      </div>
    ),
  },
  {
    id: "model",
    title: "model & kudos",
    accent: "amber",
    summary:
      "The layout is a serialisable split-tree you own in state; the renderer projects it to pixels and reports edits. Inspired by the Hyprland Wayland compositor.",
    content: (
      <div className="flex flex-col gap-4">
        <SectionHeading>The model</SectionHeading>
        <SectionLead>
          A layout is a plain, serialisable tree: <Code>leaf</Code> nodes hold a
          tile, <Code>split</Code> nodes divide space along an axis by a ratio,
          and <Code>group</Code> nodes stack leaves behind tabs. You hold the
          tree in state; the renderer projects it to pixels, runs the
          interaction, and reports every edit back — nothing is hidden inside the
          component. It is yours to persist, diff, and restore.
        </SectionLead>
        <h3 className="font-display text-[15px] font-medium text-stone-100">
          Kudos to Hyprland
        </h3>
        <SectionLead>
          The interaction model is inspired by{" "}
          <Link href="https://hypr.land">Hyprland</Link>, the dynamic-tiling
          Wayland compositor, and its tiling-first philosophy: detach-and-drop
          movement, master/stack layouts, and keyboard-driven focus. Kudos to
          its maintainers and contributors for advancing modern tiling workflow
          design.
        </SectionLead>
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
        <SectionLead>
          Tiling does not have to cost discoverability. Every pane body is real
          semantic markup — headings, paragraphs, lists, code — emitted into the
          document, never painted onto a canvas or hidden behind a transform.
          All panes render at once, so unfocused sections stay in the DOM.
        </SectionLead>
        <SectionLead>
          Because the content lives in the DOM, it prerenders. This homepage
          ships its full text in the initial static HTML, with the interactive
          tiling layered on as progressive enhancement — so crawlers and LLM
          assistants that fetch and cite docs read the real content without
          running JavaScript. A <Code>/llms.txt</Code> mirror is served for the
          same reason.
        </SectionLead>
      </div>
    ),
  },
];

// Which section of the task-first /docs IA a topic belongs to, used to group the
// sidebar and the llms.txt index. The reading order leads with the graceful path
// (Quickstart → "How do I…" recipes → minimal Concepts → runnable Examples) and
// DEMOTES the generated per-symbol reference to last — a fallback for when you
// already know the symbol name, never the front door.
type DocsSection = "quickstart" | "howto" | "concepts" | "examples" | "reference";

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
// Examples → the DEMOTED generated reference last.
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
    id: "howto-theming",
    title: "Theme & color panes",
    section: "howto",
    summary:
      "Pick a built-in theme with the themeId prop (live switching, no remount), give a pane its own accent via tile.accent, or wrap a subtree in TilingThemeProvider and read the active TilingTheme with useTilingTheme. resolveTilingTheme maps an id to its token object.",
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

