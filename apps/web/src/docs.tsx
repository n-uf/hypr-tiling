import * as React from "react";
import type { DynamicTileAccent } from "@n-uf/hypr-tiling";

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

interface DocPaneSpec {
  readonly id: string;
  readonly title: string;
  readonly accent: DynamicTileAccent;
  // A short plain-text summary used by the prerender text mirror / llms.txt.
  readonly summary: string;
  readonly content: React.ReactNode;
}

// --- Mosaic typography primitives -----------------------------------------

function Eyebrow({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber-300/80">
      {children}
    </span>
  );
}

// Section heading: Fraunces display serif preceded by a short gold tick — the
// coherent form vocabulary marker used across every pane (no icons).
function SectionHeading({
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

function SectionLead({
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

function Code({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <code className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[12px] text-amber-200/90">
      {children}
    </code>
  );
}

function Link({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <a
      href={href}
      className="text-amber-200 underline decoration-amber-400/40 underline-offset-[3px] transition-colors hover:text-amber-100 hover:decoration-amber-300/70"
    >
      {children}
    </a>
  );
}

function Pre({ children }: { children: string }): React.ReactElement {
  return (
    <pre className="overflow-x-auto rounded-md border border-white/[0.08] bg-[#0a0b0d] p-3.5 font-mono text-[12px] leading-relaxed text-stone-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <code>{children}</code>
    </pre>
  );
}

const INTEGRATION_EXAMPLE: string = `import {
  DynamicTilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type DynamicLayoutNode,
  type DynamicTile,
} from "@n-uf/hypr-tiling";
import { useState } from "react";

const tiles: DynamicTile[] = [
  { id: "a", title: "editor", content: <Editor /> },
  { id: "b", title: "preview", content: <Preview /> },
];

const initialLayout: DynamicLayoutNode = {
  kind: "split", id: "root", axis: "vertical", ratio: 0.5,
  first: { kind: "leaf", id: "l", tileId: "a" },
  second: { kind: "leaf", id: "r", tileId: "b" },
};

export function Workspace() {
  const [layout, setLayout] = useState(initialLayout);
  return (
    <DynamicTilingRenderer
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
      <div className="flex flex-col gap-5">
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
      "Install with pnpm add @n-uf/hypr-tiling react react-dom. React 19 peer deps. Render DynamicTilingRenderer with controlled layout state.",
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

// Plain-text content mirror for /llms.txt (Markdown, LLM-fetch friendly).
export function buildLlmsTxt(): string {
  const lines: string[] = [];
  lines.push(`# ${PACKAGE_NAME}`);
  lines.push("");
  lines.push(`> ${CANONICAL_DESCRIPTION}`);
  lines.push("");
  lines.push(`Homepage: ${SITE_URL}`);
  lines.push(`Showcase: ${SHOWCASE_URL}`);
  lines.push(`Repository: ${REPO_URL}`);
  lines.push(`Install: ${INSTALL_SNIPPET}`);
  lines.push("");
  for (const pane of DOC_PANES) {
    lines.push(`## ${pane.title}`);
    lines.push("");
    lines.push(pane.summary);
    lines.push("");
  }
  lines.push("## Features");
  lines.push("");
  for (const fact of FEATURE_FACTS) {
    lines.push(`- ${fact.term}: ${fact.detail}`);
  }
  lines.push("");
  return lines.join("\n");
}
