import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "@jest/globals";
import { renderContentHead, renderSectionHead } from "../content-head";
import { ArticlePage, SectionIndexPage } from "../content-page";
import { HOME_MAIN_KEYWORD } from "./constants";
import { renderIndexModule } from "./index-module";
import { draftsShown, isLive, isVisible } from "./live";
import { buildSitemap } from "./sitemap";
import { checkContentFiles, hiddenPublicFiles, type ContentFile } from "./site";
import type { ContentSite } from "./types";
import type { SiteContext } from "./validate";

const TODAY = "2026-11-05";
const GO_LIVE = "2026-12-01";

function context(showDrafts: boolean): SiteContext {
  return {
    today: TODAY,
    showDrafts,
    docsAnchors: new Set<string>(["quickstart"]),
    reservedKeywords: new Map<string, string>([[HOME_MAIN_KEYWORD, "the home page"]]),
    inspectImage: () => ({ bytes: 1000, width: 1200, height: 630 }),
  };
}

const DESCRIPTION =
  "A sample keyword description that is a single plain sentence with the main keyword, long enough to pass the lower limit of one hundred and twenty.";

interface PageSpec {
  readonly section?: "blog" | "use-cases";
  readonly slug: string;
  readonly keyword: string;
  readonly draft?: boolean;
  readonly related?: ReadonlyArray<string>;
  readonly body?: string;
}

function file(spec: PageSpec): ContentFile {
  const date = spec.draft === true ? GO_LIVE : "2026-11-01";
  const lines = [
    "---",
    `title: "Title of ${spec.slug}"`,
    `description: "${DESCRIPTION}"`,
    `h1: "Heading of ${spec.slug}"`,
    `mainKeyword: "${spec.keyword}"`,
    "kind: comparison",
    ...(spec.draft === true ? ["draft: true"] : []),
    `published: ${date}`,
    `updated: ${date}`,
    "author: n-uf",
    'takeaways: ["One fact.", "Two facts.", "Three facts."]',
    "faq:",
    '  - { q: "First?", a: "Yes." }',
    '  - { q: "Second?", a: "Yes." }',
    '  - { q: "Third?", a: "Yes." }',
    '  - { q: "Fourth?", a: "Yes." }',
    "sources:",
    '  - { title: "A source", url: "https://example.com/a", checked: 2026-11-01 }',
    `related: ${JSON.stringify(spec.related ?? ["/", "/docs#quickstart"])}`,
    "---",
    "",
    spec.body ?? `The ${spec.keyword} answer comes first.\n\n## A heading\n\nText.\n`,
  ];
  return { section: spec.section ?? "blog", name: `${spec.slug}.md`, raw: lines.join("\n") };
}

function load(specs: ReadonlyArray<PageSpec>, showDrafts: boolean): { site: ContentSite; problems: ReadonlyArray<string> } {
  const result = checkContentFiles(
    { files: specs.map(file), strays: [], rejected: [] },
    context(showDrafts),
  );
  return { site: result.site, problems: result.problems };
}

const LIVE: PageSpec = { slug: "live-page", keyword: "live thing" };
const DRAFT: PageSpec = { slug: "draft-page", keyword: "draft thing", draft: true };

describe("the live rule and the build mode", (): void => {
  it("a page is live unless its draft flag is true", (): void => {
    expect(isLive({})).toBe(true);
    expect(isLive({ draft: false })).toBe(true);
    expect(isLive({ draft: true })).toBe(false);
  });

  it("drafts are shown only on a Vercel preview or with SHOW_DRAFTS=1", (): void => {
    expect(draftsShown({})).toBe(false);
    expect(draftsShown({ VERCEL_ENV: "production" })).toBe(false);
    expect(draftsShown({ VERCEL_ENV: "development" })).toBe(false);
    expect(draftsShown({ SHOW_DRAFTS: "0" })).toBe(false);
    expect(draftsShown({ VERCEL_ENV: "preview" })).toBe(true);
    expect(draftsShown({ SHOW_DRAFTS: "1" })).toBe(true);
    expect(isVisible({ draft: true }, false)).toBe(false);
    expect(isVisible({ draft: true }, true)).toBe(true);
    expect(isVisible({ draft: false }, false)).toBe(true);
  });
});

describe("production mode hides drafts everywhere", (): void => {
  const { site, problems } = load([LIVE, DRAFT], false);
  const liveOnly = load([LIVE], false).site;

  it("checks a draft like any page but leaves it out of the site", (): void => {
    expect(problems).toEqual([]);
    expect(site.pages.map((page) => page.slug)).toEqual(["live-page"]);
    expect(site.hidden.map((page) => page.slug)).toEqual(["draft-page"]);
  });

  it("still reports a mistake inside a draft", (): void => {
    const bad = load([LIVE, { ...DRAFT, related: ["/blog/missing", "/docs"] }], false);
    expect(bad.problems).toEqual([expect.stringMatching(/draft-page\.md: related "\/blog\/missing" is not a page/)]);
  });

  // llms.txt lists `pagesOf(site, section)` exactly like the section index does
  // (it imports the changelog with Vite's ?raw, which Jest cannot load): the
  // build evidence greps dist/llms.txt instead.
  it("keeps the draft out of the sitemap, the client index and the section index", (): void => {
    expect(buildSitemap(site)).toBe(buildSitemap(liveOnly));
    expect(buildSitemap(site)).not.toContain("draft-page");
    expect(renderIndexModule(site)).toBe(renderIndexModule(liveOnly));
    expect(renderIndexModule(site)).not.toContain("draft-page");
    const index = renderToStaticMarkup(React.createElement(SectionIndexPage, { section: "blog", site }));
    expect(index).toContain("/blog/live-page");
    expect(index).not.toContain("draft-page");
    expect(renderSectionHead("blog", site)).not.toContain("draft-page");
  });

  it("does not list the draft in the rails or on a Read next card", (): void => {
    const html = renderToStaticMarkup(React.createElement(ArticlePage, { page: site.pages[0], site }));
    expect(html).not.toContain("draft-page");
    expect(html).not.toContain("Scheduled for");
  });

  it("removes the share image of a draft, and of a section that only has drafts", (): void => {
    expect(hiddenPublicFiles(site)).toEqual(["/og/blog-draft-page.png"]);
    const onlyDraft = load([DRAFT, { slug: "uc", section: "use-cases", keyword: "uc thing", draft: true }], false).site;
    expect([...hiddenPublicFiles(onlyDraft)].sort()).toEqual([
      "/og/blog-draft-page.png",
      "/og/blog.png",
      "/og/use-cases-uc.png",
      "/og/use-cases.png",
    ]);
  });

  it("an all-draft section behaves as an empty one: no sitemap entry, no index, no nav link", (): void => {
    const only = load([LIVE, { slug: "uc", section: "use-cases", keyword: "uc thing", draft: true }], false).site;
    expect(buildSitemap(only)).not.toContain("/use-cases");
    expect(renderIndexModule(only)).not.toContain("use-cases");
    const html = renderToStaticMarkup(React.createElement(ArticlePage, { page: only.pages[0], site: only }));
    expect(html).not.toContain('href="/use-cases"');
    expect(html).toContain('href="/blog"');
  });

  it("fails when a live page links to a draft, in the body or in related, and says which", (): void => {
    const linking = load(
      [
        { ...LIVE, body: "The live thing answer.\n\nSee [the draft](/blog/draft-page).\n", related: ["/blog/draft-page", "/docs"] },
        DRAFT,
      ],
      false,
    );
    expect(linking.problems).toEqual([
      expect.stringMatching(/live-page\.md: related "\/blog\/draft-page" points at the draft content\/blog\/draft-page\.md \(goes live 2026-12-01\)/),
      expect.stringMatching(/live-page\.md: link "\/blog\/draft-page" points at the draft content\/blog\/draft-page\.md/),
    ]);
  });

  it("fails a live link to a section index that only exists for drafts", (): void => {
    const linking = load(
      [{ ...LIVE, body: "The live thing answer.\n\nSee [all](/use-cases).\n" }, { slug: "uc", section: "use-cases", keyword: "uc thing", draft: true }],
      false,
    );
    expect(linking.problems).toEqual([expect.stringMatching(/link "\/use-cases" is not a page of this site/)]);
  });

  it("allows draft to draft and draft to live links", (): void => {
    const draftTwo: PageSpec = {
      slug: "draft-two",
      keyword: "draft two",
      draft: true,
      body: "The draft two answer.\n\nSee [one](/blog/draft-page) and [live](/blog/live-page).\n",
      related: ["/blog/draft-page", "/blog/live-page"],
    };
    const linking = load(
      [LIVE, { ...DRAFT, body: "The draft thing answer.\n\nSee [live](/blog/live-page).\n", related: ["/blog/live-page", "/blog/draft-two"] }, draftTwo],
      false,
    );
    expect(linking.problems).toEqual([]);
    expect(linking.site.pages.map((page) => page.slug)).toEqual(["live-page"]);
  });
});

describe("preview mode shows drafts like pages, marked and noindex", (): void => {
  const { site, problems } = load([LIVE, DRAFT], true);

  it("lists the draft in the section index and the client index", (): void => {
    expect(problems).toEqual([]);
    expect(site.hidden).toEqual([]);
    expect(site.pages.map((page) => page.slug)).toEqual(["draft-page", "live-page"]);
    expect(renderIndexModule(site)).toContain('"path": "/blog/draft-page"');
    const index = renderToStaticMarkup(React.createElement(SectionIndexPage, { section: "blog", site }));
    expect(index).toContain('href="/blog/draft-page"');
    expect(index).toContain("Scheduled for");
  });

  it("keeps the draft out of the sitemap, which only lists indexable pages", (): void => {
    expect(buildSitemap(site)).toContain("/blog/live-page");
    expect(buildSitemap(site)).not.toContain("draft-page");
  });

  it("shows a Scheduled for badge near the h1 and a noindex robots meta on the draft only", (): void => {
    const draft = site.pages.find((page) => page.slug === "draft-page");
    const live = site.pages.find((page) => page.slug === "live-page");
    if (draft == null || live == null) {
      throw new Error("pages missing");
    }
    const draftHtml = renderToStaticMarkup(React.createElement(ArticlePage, { page: draft, site }));
    expect(draftHtml).toMatch(/Scheduled for <time dateTime="2026-12-01">1 Dec 2026<\/time>/);
    expect(draftHtml.indexOf("Scheduled for")).toBeLessThan(draftHtml.indexOf("<h1"));
    expect(draftHtml.match(/<h1\b/g)).toHaveLength(1);
    const draftHead = renderContentHead(draft);
    expect(draftHead).toContain('<meta name="robots" content="noindex" />');
    expect(draftHead.match(/<meta name="robots"/g)).toHaveLength(1);
    expect(draftHead).not.toContain("index,follow");

    const liveHtml = renderToStaticMarkup(React.createElement(ArticlePage, { page: live, site }));
    expect(liveHtml).not.toMatch(/data-scheduled-badge/);
    expect(liveHtml).toContain("Published");
    expect(renderContentHead(live)).toContain('<meta name="robots" content="index,follow,max-image-preview:large" />');
  });

  it("a section index with live pages stays indexable; one with only drafts is noindex", (): void => {
    expect(renderSectionHead("blog", site)).toContain("index,follow");
    const only = load([DRAFT], true).site;
    expect(renderSectionHead("blog", only)).toContain('<meta name="robots" content="noindex" />');
  });

  it("only warns when a live page links to a draft: the link works here, a production build fails", (): void => {
    const linking = load(
      [{ ...LIVE, body: "The live thing answer.\n\nSee [the draft](/blog/draft-page).\n" }, DRAFT],
      true,
    );
    expect(linking.problems).toEqual([]);
    expect(linking.site.warnings.join("\n")).toMatch(/live-page\.md: link "\/blog\/draft-page" points at the draft/);
  });
});
