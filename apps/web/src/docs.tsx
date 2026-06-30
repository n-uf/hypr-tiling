import * as React from "react";
import type { DynamicTileAccent } from "@n-uf/hypr-tiling";

// Single source of truth for the homepage's documentation surface. The same
// section content is rendered (a) inside the tiling panes for the interactive
// page and (b) into the prerendered HTML for crawlers / LLM fetchers. Plain-text
// mirrors used by `<meta>`, JSON-LD, and `llms.txt` live alongside the JSX so
// the quotable copy stays consistent across every surface.

export const PACKAGE_NAME: string = "@n-uf/hypr-tiling";
export const SITE_URL: string = "https://hypr-tiling.n-uf.dev";
export const REPO_URL: string = "https://github.com/n-uf/hypr-tiling";

export const PAGE_TITLE: string =
  "hypr-tiling — dynamic tiling for React";

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
      "Directional focus, a pane switcher (cycle / jump / overlay), maximize, keyboard move-mode, and master/group commands — all behind a remappable keymap.",
  },
  {
    term: "Theming engine",
    detail:
      "Two built-in themes (neon-terminal, clean-flat), eight accent hues, a theme provider with hooks, and live theme switching with no remount.",
  },
  {
    term: "Self-healing drag recovery",
    detail:
      "A frame-deadline animation backstop, an idle watchdog, transient-style teardown, and a visibilitychange reconcile guarantee a drag never strands the tree mid-transition.",
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

function SectionLead({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="text-[13px] leading-relaxed text-slate-200">{children}</p>
  );
}

function Code({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <code className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-[12px] text-cyan-200">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }): React.ReactElement {
  return (
    <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[12px] leading-relaxed text-slate-100">
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
    accent: "cyan",
    summary:
      "Dynamic tiling for React. A recursive split-tree renderer for runtime-rearrangeable, resizable panes.",
    content: (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">
          Dynamic tiling for React
        </h1>
        <SectionLead>{CANONICAL_DESCRIPTION}</SectionLead>
        <SectionLead>
          Reach for it when users need to rearrange dense, multi-panel screens
          at runtime — IDE-like tools, trading and operator consoles, analytics
          dashboards — while your app keeps strict, controlled ownership of the
          layout state.
        </SectionLead>
        <p className="text-[12px] leading-relaxed text-slate-400">
          This page is itself a hypr-tiling layout: every section below is a
          pane you can focus, drag, resize, and maximize. Grab a pane header to
          rearrange it.
        </p>
      </div>
    ),
  },
  {
    id: "install",
    title: "install & integrate",
    accent: "emerald",
    summary:
      "Install with pnpm add @n-uf/hypr-tiling react react-dom. React 19 peer deps. Render DynamicTilingRenderer with controlled layout state.",
    content: (
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-50">
          Install &amp; integrate
        </h2>
        <SectionLead>
          Install the scoped package and its React peers. The library targets{" "}
          <Code>react</Code> and <Code>react-dom</Code> version 19.
        </SectionLead>
        <Pre>{INSTALL_SNIPPET}</Pre>
        <SectionLead>
          The renderer is a controlled component: you own the layout tree in
          state and apply every change it reports through <Code>onLayoutChange</Code>.
        </SectionLead>
        <Pre>{INTEGRATION_EXAMPLE}</Pre>
      </div>
    ),
  },
  {
    id: "features",
    title: "features",
    accent: "violet",
    summary: FEATURE_FACTS.map((f: FeatureFact): string => f.term).join(", ") + ".",
    content: (
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-50">Features</h2>
        <dl className="flex flex-col gap-2.5">
          {FEATURE_FACTS.map((fact: FeatureFact): React.ReactElement => (
            <div key={fact.term} className="flex flex-col gap-0.5">
              <dt className="text-[13px] font-semibold text-slate-100">
                {fact.term}
              </dt>
              <dd className="text-[12px] leading-relaxed text-slate-300">
                {fact.detail}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    ),
  },
  {
    id: "model",
    title: "what & why",
    accent: "amber",
    summary:
      "The layout is a serialisable split-tree you own in state; the renderer projects it to pixels and reports edits. Inspired by the Hyprland Wayland compositor.",
    content: (
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-50">What &amp; why</h2>
        <SectionLead>
          A layout is a plain, serialisable tree: <Code>leaf</Code> nodes hold a
          tile, <Code>split</Code> nodes divide space along an axis by a ratio,
          and <Code>group</Code> nodes stack leaves behind tabs. You hold that
          tree in state; the renderer projects it to pixels, runs the
          interaction, and reports every edit back. Nothing about the layout is
          hidden inside the component — it is yours to persist, diff, and
          restore.
        </SectionLead>
        <h3 className="text-[13px] font-semibold text-slate-100">
          Kudos to Hyprland
        </h3>
        <SectionLead>
          The interaction model is inspired by{" "}
          <a
            href="https://hypr.land"
            className="text-cyan-300 underline decoration-cyan-500/40 underline-offset-2 hover:text-cyan-200"
          >
            Hyprland
          </a>
          , the dynamic-tiling Wayland compositor, and its tiling-first
          philosophy: detach-and-drop movement, master/stack layouts, and
          keyboard-driven focus. Kudos to its maintainers and contributors for
          advancing modern tiling workflow design.
        </SectionLead>
      </div>
    ),
  },
  {
    id: "discoverability",
    title: "seo & llm friendly",
    accent: "sky",
    summary:
      "Panes emit real semantic DOM (headings, paragraphs, lists), not canvas. Prerendered to static HTML so crawlers and LLM fetchers read the content without executing JS.",
    content: (
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-50">
          SEO &amp; LLM friendly
        </h2>
        <SectionLead>
          Tiling does not have to cost you discoverability. Every pane body is
          real semantic markup — headings, paragraphs, lists, code — emitted
          into the document, not painted onto a canvas or hidden behind a
          transform. All panes render at once, so unfocused sections stay in the
          DOM.
        </SectionLead>
        <SectionLead>
          Because the content lives in the DOM, it prerenders. This homepage
          ships its full text in the initial static HTML, with the interactive
          tiling layered on as progressive enhancement — so search crawlers and
          LLM assistants that fetch and cite docs read the real content even
          without running JavaScript. A <Code>/llms.txt</Code> mirror is served
          for the same reason.
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
