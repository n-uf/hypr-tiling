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
  /** Go-live date of a draft (default 2026-12-01). */
  readonly published?: string;
  /** The raw line written for the draft flag, when not the strict `draft: true`. */
  readonly draftLine?: string;
  readonly related?: ReadonlyArray<string>;
  readonly body?: string;
}

function file(spec: PageSpec): ContentFile {
  const date = spec.draft === true ? (spec.published ?? GO_LIVE) : "2026-11-01";
  const lines = [
    "---",
    `title: "Title of ${spec.slug}"`,
    `description: "${DESCRIPTION}"`,
    `h1: "Heading of ${spec.slug}"`,
    `mainKeyword: "${spec.keyword}"`,
    "kind: comparison",
    ...(spec.draft === true ? [spec.draftLine ?? "draft: true"] : []),
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

  describe("a draft linking to a draft that goes live later", (): void => {
    const early: PageSpec = { slug: "zz-early", keyword: "zz early", draft: true, published: "2026-12-01" };
    const late: PageSpec = { slug: "zz-late", keyword: "zz late", draft: true, published: "2026-12-10" };
    const message = /zz-early\.md: link "\/blog\/zz-late": this draft goes live 2026-12-01 but links to the draft content\/blog\/zz-late\.md that goes live 2026-12-10/;

    it.each([false, true])("fails by body link and by related, with showDrafts=%s", (showDrafts): void => {
      const linking = load(
        [
          { ...early, body: "The zz early answer.\n\nSee [late](/blog/zz-late).\n", related: ["/blog/zz-late", "/docs"] },
          late,
        ],
        showDrafts,
      );
      expect(linking.problems).toEqual([
        expect.stringMatching(/zz-early\.md: related "\/blog\/zz-late": this draft goes live 2026-12-01 but links to the draft/),
        expect.stringMatching(message),
      ]);
    });

    it("is fine the other way round, on the same day, and inside a live block", (): void => {
      expect(
        load([{ ...early, related: ["/blog/zz-late", "/docs"] }, late], false).problems,
      ).toHaveLength(1);
      expect(load([{ ...late, body: "The zz late answer.\n\nSee [early](/blog/zz-early).\n", related: ["/blog/zz-early", "/docs"] }, early], false).problems).toEqual([]);
      const sameDay: PageSpec = { ...late, published: "2026-12-01" };
      expect(load([{ ...early, body: "The zz early answer.\n\nSee [late](/blog/zz-late).\n" }, sameDay], false).problems).toEqual([]);
      const gated: PageSpec = {
        ...early,
        body: "The zz early answer.\n\n{{live:/blog/zz-late}}See [late](/blog/zz-late).{{/live}}\n",
      };
      expect(load([gated, late], false).problems).toEqual([]);
    });
  });
});

describe("live blocks: link lines that merge with the draft", (): void => {
  const SENTENCE = "See [the draft](/blog/draft-page) for more.";
  const withBlock = (extra: Partial<PageSpec> = {}): PageSpec => ({
    ...LIVE,
    body: `The live thing answer comes first.\n\nBefore. {{live:/blog/draft-page}}${SENTENCE}{{/live}} After.\n`,
    ...extra,
  });

  it("production removes the sentence, its link and the space before it until the target is live", (): void => {
    const { site, problems } = load([withBlock(), DRAFT], false);
    expect(problems).toEqual([]);
    const html = site.pages[0].bodyHtml;
    expect(html).not.toContain("draft-page");
    expect(html).not.toContain("{{");
    expect(html).toContain("<p>Before. After.</p>");
  });

  it("preview shows the sentence with its link, markers gone", (): void => {
    const { site, problems } = load([withBlock(), DRAFT], true);
    expect(problems).toEqual([]);
    const html = site.pages.find((page) => page.slug === "live-page")?.bodyHtml ?? "";
    expect(html).toContain('<a href="/blog/draft-page"');
    expect(html).toMatch(/<p>Before\. See <a [^>]*>the draft<\/a> for more\. After\.<\/p>/);
    expect(html).not.toContain("{{");
  });

  it("shows the sentence in production once the target is live (the flip)", (): void => {
    const flipped: PageSpec = { slug: "draft-page", keyword: "draft thing" };
    const { site, problems } = load([withBlock(), flipped], false);
    expect(problems).toEqual([]);
    expect(site.pages.find((page) => page.slug === "live-page")?.bodyHtml).toMatch(
      /<p>Before\. See <a href="\/blog\/draft-page"[^>]*>the draft<\/a> for more\. After\.<\/p>/,
    );
  });

  it("works in the lede when a sentence outside the block stays, and fails when the block is the whole lede", (): void => {
    const partial = load(
      [{ ...LIVE, body: `Plain lede. {{live:/blog/draft-page}}${SENTENCE}{{/live}}\n\nSecond paragraph.\n` }, DRAFT],
      false,
    );
    expect(partial.problems).toEqual([]);
    expect(partial.site.pages[0].ledeHtml).toContain("Plain lede.");
    expect(partial.site.pages[0].ledeHtml).not.toContain("draft-page");
    const whole = load(
      [{ ...LIVE, body: `{{live:/blog/draft-page}}${SENTENCE}{{/live}}\n\nSecond paragraph.\n` }, DRAFT],
      false,
    );
    expect(whole.problems).toEqual([expect.stringMatching(/a \{\{live:\.\.\.\}\} block makes up the whole first paragraph/)]);
  });

  it("drops a later paragraph that holds nothing but a hidden block", (): void => {
    const { site, problems } = load(
      [{ ...LIVE, body: `Lede.\n\n{{live:/blog/draft-page}}${SENTENCE}{{/live}}\n\nLast paragraph.\n` }, DRAFT],
      false,
    );
    expect(problems).toEqual([]);
    expect(site.pages[0].bodyHtml).toBe("<p>Last paragraph.</p>\n");
  });

  it("still fails a bare link from a live page to the draft, next to a block", (): void => {
    const bare = load(
      [{ ...withBlock(), body: `Answer.\n\n{{live:/blog/draft-page}}${SENTENCE}{{/live}} And [again](/blog/draft-page).\n` }, DRAFT],
      false,
    );
    expect(bare.problems).toEqual([expect.stringMatching(/link "\/blog\/draft-page" points at the draft .*wrap the sentence in \{\{live:\/blog\/draft-page\}\}/)]);
  });

  it("a link inside a block to a different draft than the block's target still fails", (): void => {
    const other: PageSpec = { slug: "other-draft", keyword: "other draft", draft: true };
    const mismatch = load(
      [{ ...LIVE, body: "Answer.\n\n{{live:/blog/draft-page}}See [other](/blog/other-draft).{{/live}}\n" }, DRAFT, other],
      false,
    );
    expect(mismatch.problems).toEqual([expect.stringMatching(/link "\/blog\/other-draft" points at the draft/)]);
  });

  const bad = (body: string): ReadonlyArray<string> => load([{ ...LIVE, body: `Answer.\n\n${body}\n` }, DRAFT], false).problems;

  it("fails a bad target: missing page, itself, a non-content path, an anchor, no path", (): void => {
    expect(bad("{{live:/blog/missing}}Text.{{/live}}")).toEqual([expect.stringMatching(/names a page that does not exist/)]);
    expect(bad("{{live:/blog/live-page}}Text.{{/live}}")).toEqual([expect.stringMatching(/names the page itself/)]);
    expect(bad("{{live:/docs}}Text.{{/live}}")).toEqual([expect.stringMatching(/needs the path of a use-case or blog page/)]);
    expect(bad("{{live:/blog/draft-page#x}}Text.{{/live}}")).toEqual([expect.stringMatching(/needs the path of a use-case or blog page/)]);
    expect(bad("{{live:}}Text.{{/live}}")).toEqual([expect.stringMatching(/needs the path of a use-case or blog page/)]);
  });

  it("fails a nested block", (): void => {
    expect(bad("{{live:/blog/draft-page}}A {{live:/blog/draft-page}}B{{/live}}{{/live}}")).toEqual(
      expect.arrayContaining([expect.stringMatching(/starts inside the open/), expect.stringMatching(/stray \{\{\/live\}\}/)]),
    );
  });

  it("fails a stray close, an unclosed open and a malformed marker", (): void => {
    expect(bad("Text.{{/live}}")).toEqual([expect.stringMatching(/stray \{\{\/live\}\}/)]);
    expect(bad("{{live:/blog/draft-page}}Never closed.")).toEqual([expect.stringMatching(/never closed with \{\{\/live\}\}/)]);
    expect(bad("{{live /blog/draft-page}}Text.{{/live}}")).toEqual(
      expect.arrayContaining([expect.stringMatching(/malformed live marker/)]),
    );
  });

  it("fails a block that crosses a paragraph break", (): void => {
    expect(bad("{{live:/blog/draft-page}}First paragraph.\n\nSecond paragraph.{{/live}}")).toEqual(
      expect.arrayContaining([expect.stringMatching(/crosses a paragraph break/)]),
    );
  });

  it("fails a block in a loose list item, a quote, a table cell, inline code or a code fence", (): void => {
    const inList = bad("- First item\n\n- {{live:/blog/draft-page}}A loose item{{/live}}\n\n- Third item");
    expect(inList).toEqual([expect.stringMatching(/not in a list, quote, table, heading or code \(it is inside <(?:ul|li)>\)/)]);
    expect(bad("> {{live:/blog/draft-page}}A quoted sentence{{/live}}")).toEqual([
      expect.stringMatching(/it is inside <blockquote>/),
    ]);
    expect(bad("| A | B |\n|---|---|\n| {{live:/blog/draft-page}}x{{/live}} | y |")).toEqual([
      expect.stringMatching(/it is inside <(?:table|td)>/),
    ]);
    expect(bad("Use `{{live:/blog/draft-page}}hi{{/live}}` like this.")).toEqual([
      expect.stringMatching(/it is inside <code>/),
    ]);
    expect(bad("```\n{{live:/blog/draft-page}}hi{{/live}}\n```")).toEqual([expect.stringMatching(/it is inside <pre>/)]);
  });

  it("fails a block in a heading or a list, and one that cuts through a link", (): void => {
    expect(bad("## {{live:/blog/draft-page}}A heading{{/live}}")).toEqual([expect.stringMatching(/has to sit in a plain paragraph/)]);
    expect(bad("- {{live:/blog/draft-page}}An item{{/live}}")).toEqual([expect.stringMatching(/has to sit in a plain paragraph/)]);
    expect(bad("A [link {{live:/blog/draft-page}}text](/docs) more{{/live}}")).toEqual([expect.stringMatching(/cuts through a link/)]);
  });

  it("leaves a block around a link to a page that is already live visible, in either mode", (): void => {
    const live2: PageSpec = { slug: "live-two", keyword: "live two" };
    const { site, problems } = load(
      [{ ...LIVE, body: "Answer.\n\n{{live:/blog/live-two}}See [two](/blog/live-two).{{/live}}\n" }, live2],
      false,
    );
    expect(problems).toEqual([]);
    expect(site.pages.find((page) => page.slug === "live-page")?.bodyHtml).toContain('href="/blog/live-two"');
  });
});

describe("what production renders decides the keyword and length hints", (): void => {
  const keywordBody = "Plain lede words here. {{live:/blog/draft-page}}The live thing is the point.{{/live}}\n";
  const hints = (specs: ReadonlyArray<PageSpec>): string =>
    load(specs, false).site.warnings.filter((warning) => warning.includes("live-page.md")).join("\n");

  it("does not count a hidden block's text towards the main keyword in the first paragraph", (): void => {
    expect(hints([{ ...LIVE, body: keywordBody }, DRAFT])).toMatch(/mainKeyword "live thing" is not in the .*first paragraph/);
    // once the target is live the sentence is part of the page, and the hint goes away
    const flipped: PageSpec = { slug: "draft-page", keyword: "draft thing" };
    expect(hints([{ ...LIVE, body: keywordBody }, flipped])).not.toMatch(/first paragraph/);
  });

  it("does not count a hidden block's words towards the length target", (): void => {
    const body = "Plain lede words here. {{live:/blog/draft-page}}one two three four five.{{/live}}\n";
    const words = (specs: ReadonlyArray<PageSpec>): number =>
      Number(hints(specs).match(/(\d+) words in the body/)?.[1]);
    const flipped: PageSpec = { slug: "draft-page", keyword: "draft thing" };
    expect(words([{ ...LIVE, body }, DRAFT])).toBe(4);
    expect(words([{ ...LIVE, body }, flipped])).toBe(9);
  });
});

describe("live markers in the front matter", (): void => {
  it("are reported, not rendered into the title or the head", (): void => {
    const result = checkContentFiles(
      {
        files: [
          {
            ...file(LIVE),
            raw: file(LIVE).raw.replace('title: "Title of live-page"', 'title: "Title {{live:/blog/draft-page}}x{{/live}}"'),
          },
        ],
        strays: [],
        rejected: [],
      },
      context(false),
    );
    expect(result.problems).toEqual([
      expect.stringMatching(/live-page\.md: a \{\{live\.\.\.\}\} marker in the front matter .*body only/),
    ]);
  });

  it.each([
    ["description", `description: "${DESCRIPTION}"`, `description: "${DESCRIPTION} {{/live}}"`],
    ["h1", 'h1: "Heading of live-page"', 'h1: "Heading {{live:/blog/draft-page}}"'],
    ["takeaways", '"One fact."', '"One {{live:/blog/draft-page}} fact."'],
    ["faq", '{ q: "First?", a: "Yes." }', '{ q: "First?", a: "Yes {{/live}}." }'],
  ])("also in %s", (_field, from, to): void => {
    const original = file(LIVE);
    expect(original.raw).toContain(from);
    const result = checkContentFiles(
      { files: [{ ...original, raw: original.raw.replace(from, to) }], strays: [], rejected: [] },
      context(false),
    );
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.stringMatching(/a \{\{live\.\.\.\}\} marker in the front matter/)]),
    );
  });
});

describe("the draft field spelling and past go-live dates", (): void => {
  it.each(["draft : true", '"draft": true', "draft: True", "draft:  yes"])(
    "refuses the spelling `%s` so the publish script cannot miss it",
    (draftLine): void => {
      const result = load([LIVE, { ...DRAFT, draftLine }], false);
      expect(result.problems).toEqual(
        expect.arrayContaining([expect.stringMatching(/the draft field is written `.*`; write exactly `draft: true` or `draft: false`/)]),
      );
    },
  );

  it("accepts the strict form, with a trailing comment too", (): void => {
    expect(load([LIVE, { ...DRAFT, draftLine: "draft: true  # held for the release" }], false).problems).toEqual([]);
  });

  it("warns, without failing, when a draft's go-live date is already past", (): void => {
    const past = load([{ ...DRAFT, published: "2026-11-01" }], false);
    expect(past.problems).toEqual([]);
    expect(past.site.warnings.join("\n")).toMatch(
      /draft-page\.md: the draft's go-live date 2026-11-01 is already past \(today is 2026-11-05\); it goes live on the next publish run/,
    );
    expect(load([DRAFT], false).site.warnings.join("\n")).not.toMatch(/already past/);
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
