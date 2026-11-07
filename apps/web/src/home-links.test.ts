import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "@jest/globals";
import { CanvasPaneContent } from "./content-canvas";
import { CONTENT_INDEX } from "./content-index.generated";
import { EditorialPaneContent } from "./content-editorial";
import type { ContentIndexEntry } from "./content/constants";
import { HOME_MAIN_KEYWORD } from "./content/constants";
import { checkContentFiles } from "./content/site";
import { toIndexEntry } from "./content/types";
import type { SiteContext } from "./content/validate";
import { DOC_PANES, guideGroups, guideLabel } from "./docs";
import { PrerenderedHomeLayoutContext, type HomeLayout } from "./mobile-home/use-viewport";

// The home page links every live content page one by one (the sitelinks Google
// builds come from links like these), and never a draft.

const SKINS: ReadonlyArray<{ readonly name: string; readonly pane: (id: string) => React.ReactNode }> = [
  {
    name: "mosaic",
    pane: (id: string): React.ReactNode => DOC_PANES.find((pane) => pane.id === id)?.content,
  },
  { name: "editorial", pane: (id: string): React.ReactNode => React.createElement(EditorialPaneContent, { paneId: id }) },
  { name: "canvas", pane: (id: string): React.ReactNode => React.createElement(CanvasPaneContent, { paneId: id }) },
];

function html(node: React.ReactNode, layout: HomeLayout): string {
  return renderToStaticMarkup(
    React.createElement(PrerenderedHomeLayoutContext.Provider, { value: layout }, node),
  );
}

const hrefs = (markup: string): ReadonlyArray<string> =>
  [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

describe("the guide link labels", (): void => {
  const entry = (title: string): ContentIndexEntry => ({
    section: "blog",
    slug: "x",
    path: "/blog/x",
    title,
    h1: "H1",
    description: "D",
  });

  it("shorten a title at its colon, or keep it whole", (): void => {
    expect(guideLabel(entry("React dockable panels: drag, tab and undock panes"))).toBe("React dockable panels");
    expect(guideLabel(entry("React drag and drop dashboard with tiled panels"))).toBe(
      "React drag and drop dashboard with tiled panels",
    );
    expect(guideLabel(entry(": odd"))).toBe(": odd");
  });
});

describe("the home's links to the content pages", (): void => {
  it("the build has pages to link (the generated index is not empty)", (): void => {
    expect(CONTENT_INDEX.length).toBeGreaterThan(0);
  });

  for (const skin of SKINS) {
    it(`${skin.name}: the Use cases tile links every page in the index, with a short anchor`, (): void => {
      const markup: string = html(skin.pane("usecases"), "desktop");
      for (const entry of CONTENT_INDEX) {
        expect(hrefs(markup)).toContain(entry.path);
        expect(markup).toContain(`>${guideLabel(entry)}</a>`);
      }
    });

    it(`${skin.name}: the mobile intro tile links the docs, the sections and every page`, (): void => {
      const links = hrefs(html(skin.pane("intro"), "mobile"));
      expect(links).toEqual(expect.arrayContaining(["/docs", "/use-cases", "/blog"]));
      for (const entry of CONTENT_INDEX) {
        expect(links).toContain(entry.path);
      }
    });

    it(`${skin.name}: the desktop intro tile keeps its links row and takes no page links`, (): void => {
      const links = hrefs(html(skin.pane("intro"), "desktop"));
      expect(links).toEqual(expect.arrayContaining(["/docs", "/use-cases", "/blog"]));
      for (const entry of CONTENT_INDEX) {
        expect(links).not.toContain(entry.path);
      }
    });
  }
});

describe("a draft gets no home link", (): void => {
  const CONTEXT: SiteContext = {
    today: "2026-11-05",
    showDrafts: false,
    docsAnchors: new Set<string>(["quickstart"]),
    reservedKeywords: new Map<string, string>([[HOME_MAIN_KEYWORD, "the home page"]]),
    inspectImage: () => ({ bytes: 1000, width: 1200, height: 630 }),
  };
  const page = (slug: string, keyword: string, draft: boolean): { section: "blog"; name: string; raw: string } => ({
    section: "blog",
    name: `${slug}.md`,
    raw: [
      "---",
      `title: "Title of ${slug}: with a tail"`,
      'description: "A sample keyword description that is a single plain sentence with the main keyword, long enough to pass the lower limit of one hundred and twenty."',
      `h1: "Heading of ${slug}"`,
      `mainKeyword: "${keyword}"`,
      "kind: comparison",
      ...(draft ? ["draft: true"] : []),
      `published: ${draft ? "2026-12-01" : "2026-11-01"}`,
      `updated: ${draft ? "2026-12-01" : "2026-11-01"}`,
      "author: n-uf",
      'takeaways: ["One fact.", "Two facts.", "Three facts."]',
      "faq:",
      '  - { q: "First?", a: "Yes." }',
      '  - { q: "Second?", a: "Yes." }',
      '  - { q: "Third?", a: "Yes." }',
      '  - { q: "Fourth?", a: "Yes." }',
      "sources:",
      '  - { title: "A source", url: "https://example.com/a", checked: 2026-11-01 }',
      'related: ["/", "/docs#quickstart"]',
      "---",
      "",
      `The ${keyword} answer comes first.`,
      "",
    ].join("\n"),
  });

  it("the index a production build writes lists the live page, so the home links it and not the draft", (): void => {
    const result = checkContentFiles(
      { files: [page("live-page", "live thing", false), page("draft-page", "draft thing", true)], strays: [], rejected: [] },
      CONTEXT,
    );
    expect(result.problems).toEqual([]);
    const groups = guideGroups(result.site.pages.map(toIndexEntry));
    expect(groups).toEqual([
      {
        section: "blog",
        heading: "Blog articles",
        links: [{ label: "Title of live-page", href: "/blog/live-page" }],
      },
    ]);
    expect(JSON.stringify(groups)).not.toContain("draft-page");
  });

  it("an empty index has no guide groups", (): void => {
    expect(guideGroups([])).toEqual([]);
  });
});
