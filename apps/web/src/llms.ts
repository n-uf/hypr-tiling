import {
  API_REFERENCE_URL,
  CANONICAL_DESCRIPTION,
  DOC_PANES,
  DOCS_GUIDE_TOPICS,
  DOCS_URL,
  FEATURE_FACTS,
  INSTALL_SNIPPET,
  LICENSE_NAME,
  LICENSE_URL,
  PACKAGE_NAME,
  REPO_URL,
  ROADMAP_ITEMS,
  SHOWCASE_URL,
  SITE_URL,
} from "./docs";
import { API_REFERENCE_SECTIONS } from "./api-reference/generated";

// Plain-text content mirror for /llms.txt (Markdown, LLM-fetch friendly). Lives
// in its own module — imported only by the SSR prerender entry — so the large
// generated API-reference bundle stays out of the homepage client chunk.
export function buildLlmsTxt(): string {
  const lines: string[] = [];
  lines.push(`# ${PACKAGE_NAME}`);
  lines.push("");
  lines.push(`> ${CANONICAL_DESCRIPTION}`);
  lines.push("");
  lines.push(`Homepage: ${SITE_URL}`);
  lines.push(`Documentation: ${DOCS_URL}`);
  lines.push(`Showcase: ${SHOWCASE_URL}`);
  lines.push(`Repository: ${REPO_URL}`);
  lines.push(`Install: ${INSTALL_SNIPPET}`);
  lines.push(`License: ${LICENSE_NAME} (${LICENSE_URL})`);
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
  lines.push("## Roadmap (planned, not yet shipped)");
  lines.push("");
  for (const item of ROADMAP_ITEMS) {
    lines.push(`- ${item.term}: ${item.detail}`);
  }
  lines.push("");
  lines.push(`## Documentation (${DOCS_URL})`);
  lines.push("");
  lines.push(
    "Consumer documentation, prerendered as static HTML at the /docs route. A consumer is a developer who uses @n-uf/hypr-tiling in their app; these docs cover only the public API surface (the hand-authored `.` facade). The information architecture is TASK-FIRST: it leads with the graceful path and frames every guide as an outcome, not an API list. The left sidebar is a full-tree spine with an IntersectionObserver scroll-spy (active anchor highlights and auto-scrolls into view), a collapsible per-category API-reference tree, and a right-rail on-this-page mini-TOC; every anchor is a plain #id so the single prerendered page stays crawlable with no JS. Reading order — Overview + Quickstart (the golden copy-paste path to a working layout), then the \"How do I…\" recipes (the heart: define the initial layout, render your own pane content, render your own pane frame & header for a fully custom look-and-feel, theme panes, choose which interactions are allowed, save & restore, trigger actions from your own buttons, build a command bar / keyboard shortcuts, group / split / maximize), then a minimal Concepts section, then a gallery of whole runnable apps. The generated per-symbol reference is DEMOTED to last — a fallback for when you already know a symbol name, not the way in. Every guide snippet is the raw source of a real, type-checked example module, so it always compiles against the current public API. Start with these topics:",
  );
  lines.push("");
  for (const topic of DOCS_GUIDE_TOPICS) {
    lines.push(`- [${topic.title}](${DOCS_URL}#${topic.id}): ${topic.summary}`);
  }
  lines.push("");
  lines.push("## API reference (fallback — for when you already know the name)");
  lines.push("");
  lines.push(
    `The curated public API surface, generated from source TSDoc. It is DEMOTED below the guides above and grouped by category — Core (Renderer & tiles, Layout & query, Theming, Commands) and Advanced helpers (isCommandEnabled, the interaction-capability shapes, and the query / keymap / debug utilities) — browsable from the sidebar reference tree. Prefer the task-first guides; reach here to look up a symbol you already know. Full machine-readable report: ${API_REFERENCE_URL}`,
  );
  lines.push("");
  const apiKinds: ReadonlyArray<string> = [
    "variable",
    "function",
    "interface",
    "type",
  ];
  for (const kind of apiKinds) {
    const inKind = API_REFERENCE_SECTIONS.filter(
      (section): boolean => section.kind === kind,
    );
    if (inKind.length === 0) {
      continue;
    }
    lines.push(`### ${kind}s`);
    lines.push("");
    for (const section of inKind) {
      lines.push(`- [${section.name}](${DOCS_URL}#${section.id})`);
    }
    lines.push("");
  }
  lines.push("## Contributing");
  lines.push("");
  lines.push(
    "hypr-tiling welcomes collaboration — framework adapters, rendering backends, bug reports, and roadmap ideas. Contributors working ON the library (architecture, internals, maintenance) start from CONTRIBUTING.md in the repository root; that material is intentionally kept off this consumer documentation site. To get involved, email metelin@gmail.com.",
  );
  lines.push("");
  return lines.join("\n");
}
