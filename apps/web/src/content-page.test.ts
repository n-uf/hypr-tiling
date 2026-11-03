import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "@jest/globals";
import { ArticlePage, SectionIndexPage } from "./content-page";
import { HOME_MAIN_KEYWORD } from "./content/constants";
import { checkContentFiles } from "./content/site";
import type { ContentSite } from "./content/types";
import type { SiteContext } from "./content/validate";

const CONTEXT: SiteContext = {
  today: "2026-11-03",
  docsAnchors: new Set<string>(["quickstart", "reference", "howto-save-restore"]),
  reservedKeywords: new Map<string, string>([[HOME_MAIN_KEYWORD, "the home page"]]),
  inspectImage: () => ({ bytes: 1000, width: 1200, height: 630 }),
};

const FRONT = `---
title: "Sample keyword page"
description: "A sample keyword description that is a single plain sentence with the main keyword, long enough to pass the lower limit of one hundred and twenty."
h1: "A sample keyword page"
mainKeyword: "sample keyword"
kind: comparison
published: 2026-11-01
updated: 2026-11-02
author: n-uf
takeaways: ["One fact.", "Two facts.", "Three facts."]
faq:
  - { q: "First?", a: "Yes." }
  - { q: "Second?", a: "Yes." }
  - { q: "Third?", a: "Yes." }
  - { q: "Fourth?", a: "Yes." }
sources:
  - { title: "A source", url: "https://example.com/a", checked: 2026-11-01 }
related: ["/", "/docs#quickstart"]
---

The sample keyword answer comes first, in one paragraph.

## Why it matters

Text with a [link](/docs#quickstart) and \`code\`.

| A | B |
|---|---|
| 1 | 2 |

### A detail

\`\`\`ts
const x = 1;
\`\`\`
`;

function site(): ContentSite {
  const result = checkContentFiles(
    { files: [{ section: "blog", name: "sample.md", raw: FRONT }], strays: [], rejected: [] },
    CONTEXT,
  );
  expect(result.problems).toEqual([]);
  return result.site;
}

describe("the article page", (): void => {
  const content: ContentSite = site();
  const html: string = renderToStaticMarkup(React.createElement(ArticlePage, { page: content.pages[0], site: content }));

  it("reads without JavaScript: no script, one h1 holding only the title", (): void => {
    expect(html).not.toContain("<script");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>A sample keyword page<\/h1>/);
  });

  it("has the byline, lede, takeaways, body, install block, FAQ, sources and read-next cards", (): void => {
    expect(html).toContain("By <b");
    expect(html).toContain('dateTime="2026-11-01"');
    expect(html).toContain("The sample keyword answer comes first");
    expect(html).toContain("Key takeaways");
    expect(html).toContain("One fact.");
    expect(html).toContain("<table");
    expect(html).toContain("pnpm add @n-uf/hypr-tiling");
    expect(html.match(/id="install"/g)).toHaveLength(1);
    expect(html.match(/<details/g)).toHaveLength(4);
    expect(html).toContain("checked");
    expect(html).toContain('href="https://example.com/a"');
    expect(html.match(/id="read-next"/g)).toHaveLength(1);
  });

  it("every On this page link points at an id that exists", (): void => {
    const rail = html.match(/aria-label="On this page"[\s\S]*?<\/aside>/)?.[0] ?? "";
    const targets = [...rail.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    expect(targets).toEqual(["why-it-matters", "faq", "sources"]);
    for (const target of targets) {
      expect(html).toContain(`id="${target}"`);
    }
  });

  it("links the section and the docs from the rails with plain anchors", (): void => {
    expect(html).toContain('href="/blog/sample"');
    expect(html).toContain('href="/docs#quickstart"');
    expect(html).toContain('aria-current="page"');
  });
});

describe("the section index page", (): void => {
  it("lists the page with its description and dates, with one h1", (): void => {
    const content = site();
    const html = renderToStaticMarkup(React.createElement(SectionIndexPage, { section: "blog", site: content }));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('href="/blog/sample"');
    expect(html).toContain("A sample keyword description");
    expect(html).not.toContain("<script");
  });
});
