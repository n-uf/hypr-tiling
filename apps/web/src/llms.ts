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
    "Guides and the generated API reference are published as prerendered static HTML at the /docs route:",
  );
  lines.push("");
  for (const topic of DOCS_GUIDE_TOPICS) {
    lines.push(`- [${topic.title}](${DOCS_URL}#${topic.id}): ${topic.summary}`);
  }
  lines.push("");
  lines.push("## API reference");
  lines.push("");
  lines.push(
    `The curated public API surface (generated from source TSDoc). Full report: ${API_REFERENCE_URL}`,
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
    "hypr-tiling welcomes collaboration — framework adapters, rendering backends, bug reports, and roadmap ideas. To get involved, email metelin@gmail.com.",
  );
  lines.push("");
  return lines.join("\n");
}
