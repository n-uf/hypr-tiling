import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { DOCS_MAIN_KEYWORD, HOME_MAIN_KEYWORD, nonEmptySections } from "./constants";
import { splitFrontMatter } from "./front-matter";
import { escapeLinkText } from "./format";
import { renderIndexModule } from "./index-module";
import { processMarkdown } from "./markdown";
import {
  checkContentFiles,
  readContentDirectory,
  readPngInfo,
  type ContentFile,
} from "./site";
import { toIndexEntry } from "./types";
import { normalizeKeyword, readFrontMatter, type ImageInfo, type SiteContext } from "./validate";

const TODAY = "2026-11-03";
const GOOD_IMAGE: ImageInfo = { bytes: 60_000, width: 1200, height: 630 };

const CONTEXT: SiteContext = {
  today: TODAY,
  docsAnchors: new Set<string>(["overview", "quickstart", "howto-save-restore"]),
  reservedKeywords: new Map<string, string>([
    [HOME_MAIN_KEYWORD, "the home page"],
    [DOCS_MAIN_KEYWORD, "the docs page"],
  ]),
  inspectImage: (): ImageInfo => GOOD_IMAGE,
};

const DESCRIPTION =
  "A sample keyword description that is a single plain sentence with the main keyword, long enough to pass the lower limit of one hundred and twenty.";

function frontMatter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    title: "Sample keyword page",
    description: DESCRIPTION,
    h1: "A sample keyword page",
    mainKeyword: "sample keyword",
    kind: "use-case",
    published: "2026-11-01",
    updated: "2026-11-02",
    author: "n-uf",
    takeaways: ["One.", "Two.", "Three."],
    faq: [
      { q: "A?", a: "Yes." },
      { q: "B?", a: "Yes." },
      { q: "C?", a: "Yes." },
      { q: "D?", a: "Yes." },
    ],
    sources: [{ title: "Source", url: "https://example.com/a", checked: "2026-11-01" }],
    related: ["/", "/docs"],
  };
  const merged: Record<string, unknown> = { ...base, ...overrides };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) {
      delete merged[key];
    }
  }
  return merged;
}

function yamlOf(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([key, value]): string => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
}

function file(
  name: string,
  overrides: Record<string, unknown> = {},
  body = "A sample keyword answer comes first.\n\n## First heading\n\nText.\n",
  section: ContentFile["section"] = "blog",
): ContentFile {
  return { section, name, raw: `---\n${yamlOf(frontMatter(overrides))}\n---\n\n${body}` };
}

function check(
  files: ReadonlyArray<ContentFile>,
  context: SiteContext = CONTEXT,
  extra: { strays?: string[]; rejected?: Array<{ section: ContentFile["section"]; name: string }> } = {},
): ReadonlyArray<string> {
  return checkContentFiles(
    { files, strays: extra.strays ?? [], rejected: extra.rejected ?? [] },
    context,
  ).problems;
}

describe("splitFrontMatter", (): void => {
  it("splits YAML from the body and keeps dates as text", (): void => {
    const split = splitFrontMatter("---\npublished: 2026-11-04\ntitle: x\n---\n\nBody.\n", "f.md");
    expect(split.problems).toEqual([]);
    expect(split.data).toEqual({ published: "2026-11-04", title: "x" });
    expect(split.body.trim()).toBe("Body.");
  });

  it("reports a missing block, bad YAML and a non-mapping", (): void => {
    expect(splitFrontMatter("Just text", "f.md").problems[0]).toMatch(/no front matter/);
    expect(splitFrontMatter("---\na: [1\n---\n", "f.md").problems[0]).toMatch(/not valid YAML/);
    expect(splitFrontMatter("---\n- a\n- b\n---\n", "f.md").problems[0]).toMatch(/mapping/);
  });
});

describe("front matter checks", (): void => {
  const run = (overrides: Record<string, unknown>): ReadonlyArray<string> =>
    readFrontMatter(frontMatter(overrides), "f.md", TODAY).problems;

  it("accepts a complete page", (): void => {
    const result = readFrontMatter(frontMatter(), "f.md", TODAY);
    expect(result.problems).toEqual([]);
    expect(result.frontMatter?.author).toBe("n-uf");
  });

  it("rejects a title over 60 characters and counts characters, not bytes", (): void => {
    expect(run({ title: "x".repeat(61) })).toEqual([expect.stringMatching(/title is 61 characters/)]);
    expect(run({ title: "—".repeat(60) })).toEqual([]);
  });

  it("holds the description to 120 to 155 characters", (): void => {
    expect(run({ description: "x".repeat(119) })[0]).toMatch(/119 characters/);
    expect(run({ description: "x".repeat(156) })[0]).toMatch(/156 characters/);
    expect(run({ description: "x".repeat(120) })).toEqual([]);
    expect(run({ description: "x".repeat(155) })).toEqual([]);
  });

  it("requires h1 and mainKeyword", (): void => {
    expect(run({ h1: undefined })).toEqual([expect.stringMatching(/"h1" is missing/)]);
    expect(run({ mainKeyword: undefined })).toEqual([expect.stringMatching(/"mainKeyword" is missing/)]);
    expect(run({ h1: "  " })[0]).toMatch(/h1/);
  });

  it("limits kind to the five kinds", (): void => {
    for (const kind of ["use-case", "how-to", "what-is", "comparison", "best-tools"]) {
      expect(run({ kind })).toEqual([]);
    }
    expect(run({ kind: "guide" })[0]).toMatch(/kind "guide" is not one of/);
  });

  it("wants real YYYY-MM-DD dates, updated not before published, nothing in the future", (): void => {
    expect(run({ published: "4 Nov 2026" })[0]).toMatch(/published must be a date written YYYY-MM-DD/);
    expect(run({ updated: "2026-02-30" })[0]).toMatch(/updated must be a date/);
    expect(run({ published: "2026-11-02", updated: "2026-11-01" })[0]).toMatch(/updated 2026-11-01 is before published/);
    expect(run({ published: "2026-11-04", updated: "2026-11-04" })).toEqual([
      expect.stringMatching(/published 2026-11-04 is in the future/),
      expect.stringMatching(/updated 2026-11-04 is in the future/),
    ]);
    expect(run({ published: TODAY, updated: TODAY })).toEqual([]);
  });

  it("wants author n-uf", (): void => {
    expect(run({ author: "someone" })[0]).toMatch(/author must be "n-uf"/);
  });

  it("wants 3 to 5 takeaways and 4 to 5 FAQ entries", (): void => {
    expect(run({ takeaways: ["a", "b"] })[0]).toMatch(/takeaways has 2 entries/);
    expect(run({ takeaways: ["a", "b", "c", "d", "e", "f"] })[0]).toMatch(/takeaways has 6 entries/);
    expect(run({ faq: [{ q: "a?", a: "b" }] })[0]).toMatch(/faq has 1 entries/);
    expect(run({ faq: Array.from({ length: 6 }, () => ({ q: "a?", a: "b" })) })[0]).toMatch(/faq has 6 entries/);
    expect(run({ faq: [{ q: "a?" }, { q: "b?", a: "c" }, { q: "c?", a: "d" }, { q: "d?", a: "e" }] })[0]).toMatch(
      /faq\[0\] needs a non-empty q and a/,
    );
  });

  it("wants every source to have an https url and a checked date", (): void => {
    const problems = run({
      sources: [
        { title: "a", url: "http://example.com", checked: "2026-11-01" },
        { title: "b", url: "https://example.com", checked: "yesterday" },
        { title: "c", url: "https://example.com" },
        { url: "https://example.com", checked: "2026-11-01" },
      ],
    });
    expect(problems).toEqual([
      expect.stringMatching(/sources\[0\] needs an https url/),
      expect.stringMatching(/sources\[1\] needs a checked date/),
      expect.stringMatching(/sources\[2\] needs a checked date/),
      expect.stringMatching(/sources\[3\] needs a title/),
    ]);
    expect(run({ sources: [{ title: "a", url: "https://example.com", checked: "2026-11-09" }] })[0]).toMatch(
      /checked 2026-11-09 is in the future/,
    );
  });

  it("flags unknown fields and wants 2 to 4 related paths", (): void => {
    expect(run({ tags: ["x"] })[0]).toMatch(/unknown front matter field "tags"/);
    expect(run({ related: ["/"] })[0]).toMatch(/related has 1 entries/);
  });
});

describe("keyword matching", (): void => {
  it("ignores case, hyphens and a plural s", (): void => {
    expect(normalizeKeyword("react-mosaic alternatives")).toBe(normalizeKeyword("React mosaic alternative"));
    expect(normalizeKeyword("Dashboards  in React")).toBe("dashboard in react");
    expect(normalizeKeyword("class")).toBe("class");
  });

  it("no longer warns when the hyphenated and plural forms match", (): void => {
    const result = checkContentFiles(
      {
        files: [
          file("one.md", { mainKeyword: "react mosaic alternative", title: "React-mosaic alternatives", h1: "Alternatives to react-mosaic", description: DESCRIPTION.replace("sample keyword", "react-mosaic alternatives") }, "The react-mosaic alternatives are many.\n\n## A\n"),
        ],
        strays: [],
        rejected: [],
      },
      CONTEXT,
    );
    expect(result.site.warnings.filter((warning) => /mainKeyword/.test(warning))).toEqual([]);
  });
});

describe("markdown checks", (): void => {
  it("renders headings with ids, the first paragraph as the lede, tables and code", (): void => {
    const result = processMarkdown(
      "The answer **first**.\n\n## Why? (and how)\n\nText with `code`.\n\n### Detail\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst a = <b>;\n```\n",
      "f.md",
    );
    expect(result.problems).toEqual([]);
    expect(result.ledeHtml).toContain("text-[17.5px]");
    expect(result.ledeHtml).toContain("<strong>first</strong>");
    expect(result.headings).toEqual([
      { id: "why-and-how", text: "Why? (and how)", depth: 2 },
      { id: "detail", text: "Detail", depth: 3 },
    ]);
    expect(result.bodyHtml).toContain('<h2 id="why-and-how"');
    expect(result.bodyHtml).toContain("<table");
    expect(result.bodyHtml).toContain("const a = &lt;b&gt;;");
    expect(result.bodyHtml).not.toContain("The answer");
  });

  it("gives repeated headings unique ids and keeps off the template's ids", (): void => {
    const result = processMarkdown("Lede.\n\n## Same\n\n## Same\n\n## FAQ\n", "f.md");
    expect(result.headings.map((heading) => heading.id)).toEqual(["same", "same-2", "faq-2"]);
  });

  it("reports an h1, raw HTML and images in the body", (): void => {
    const result = processMarkdown("# Title\n\nText <b>bold</b>.\n\n![alt](/a.png)\n\n<div>x</div>\n", "f.md");
    expect(result.problems).toEqual([
      expect.stringMatching(/the body has an h1/),
      expect.stringMatching(/raw HTML/),
      expect.stringMatching(/an image in the body/),
      expect.stringMatching(/raw HTML/),
    ]);
  });

  it("only renders hrefs that are site paths, anchors or https URLs", (): void => {
    const html = processMarkdown("[a](javascript:alert(1)) [b](//evil.example/x) [c](/ok) [d](#top)\n", "f.md").ledeHtml;
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("evil.example");
    expect(html).toContain('href="/ok"');
    expect(html).toContain('href="#top"');
  });

  it("opens only https links in a new tab", (): void => {
    const html = processMarkdown("See [docs](/docs) and [npm](https://www.npmjs.com/).\n", "f.md").ledeHtml;
    expect(html).toMatch(/<a href="\/docs" class=/);
    expect(html).toMatch(/<a href="https:\/\/www.npmjs.com\/" target="_blank" rel="noopener noreferrer"/);
  });
});

describe("page set checks", (): void => {
  it("accepts two good pages that link to each other and the docs", (): void => {
    const problems = check([
      file("one.md", { mainKeyword: "one thing", related: ["/", "/blog/two"] }, "Sample keyword one thing.\n\nSee [two](/blog/two#first-heading) and [docs](/docs#quickstart).\n"),
      file("two.md", { mainKeyword: "two things", related: ["/docs", "/blog/one"] }),
    ]);
    expect(problems).toEqual([]);
  });

  it("refuses a main keyword another page, the home page or the docs already hold", (): void => {
    const problems = check([
      file("one.md", { mainKeyword: "Same Keyword" }),
      file("two.md", { mainKeyword: "same  keyword" }),
      file("three.md", { mainKeyword: "React tiling window manager" }),
      file("four.md", { mainKeyword: "hypr-tiling documentation" }),
    ]);
    expect(problems).toEqual([
      expect.stringMatching(/four\.md: mainKeyword .* taken by the docs page/),
      expect.stringMatching(/three\.md: mainKeyword .* taken by the home page/),
      expect.stringMatching(/two\.md: mainKeyword "same {2}keyword" is already taken by content\/blog\/one\.md/),
    ]);
  });

  it("checks related paths", (): void => {
    const problems = check([
      file("one.md", { related: ["/docs", "/blog/missing", "/use-cases", "relative"] }),
    ]);
    expect(problems).toEqual([
      expect.stringMatching(/related "\/blog\/missing" is not a page of this site/),
      expect.stringMatching(/related "\/use-cases" is not a page of this site/),
      expect.stringMatching(/related "relative" must be a site path starting with \//),
    ]);
  });

  it("checks body links: pages, docs anchors, own headings, slashes, hosts", (): void => {
    const body = [
      "Lede.",
      "",
      "[a](/nope) [b](/docs#nope) [c](/docs#quickstart) [d](#first-heading) [e](#nope)",
      "[f](/docs/) [g](http://example.com) [h](https://hypr-tiling.n-uf.com/docs) [i](../x) [j](/docs?a=1)",
      "",
      "## First heading",
      "",
    ].join("\n");
    const problems = check([file("one.md", {}, body)]);
    expect(problems).toEqual([
      expect.stringMatching(/link "\/nope" is not a page of this site/),
      expect.stringMatching(/link "\/docs#nope" is not an anchor on \/docs/),
      expect.stringMatching(/link "#nope" is not a page of this site|link "#nope" is not a heading/),
      expect.stringMatching(/link "\/docs\/" ends with a slash/),
      expect.stringMatching(/link "http:\/\/example.com" must be a relative site path or an https URL/),
      expect.stringMatching(/"https:\/\/hypr-tiling.n-uf.com\/docs" points at this site/),
      expect.stringMatching(/link "..\/x" must be a relative/),
      expect.stringMatching(/link "\/docs\?a=1" has a query string/),
    ]);
  });

  it("reports a malformed https URL instead of crashing", (): void => {
    expect(check([file("one.md", {}, "Lede.\n\n[a](https://exa mple.com/)\n\n[b](https://[bad/)\n")]).join("\n")).toMatch(
      /is not a valid URL|must be a relative/,
    );
  });

  it("allows two links to one target and fails the third, ignoring the anchor", (): void => {
    const two = "Lede.\n\n[a](/docs) and [b](/docs#quickstart).\n";
    const three = "Lede.\n\n[a](/docs) and [b](/docs#quickstart) and [c](/docs#overview).\n";
    expect(check([file("one.md", {}, two)])).toEqual([]);
    expect(check([file("one.md", {}, three)])).toEqual([
      expect.stringMatching(/3 links to \/docs; the limit is 2 per target/),
    ]);
  });

  it("only lets <slug>.md files become pages", (): void => {
    const problems = check([file("one.md")], CONTEXT, {
      rejected: [
        { section: "blog", name: "one.draft.md" },
        { section: "use-cases", name: "Notes.txt" },
      ],
      strays: ["drafts"],
    });
    expect(problems).toEqual([
      expect.stringMatching(/content\/drafts: not a section folder/),
      expect.stringMatching(/content\/blog\/one\.draft\.md: only <slug>\.md files/),
      expect.stringMatching(/content\/use-cases\/Notes\.txt: only <slug>\.md files/),
    ]);
  });

  it("wants a 1200x630 share image under 150 KB for every page and every non-empty section", (): void => {
    const missing = check([file("one.md")], { ...CONTEXT, inspectImage: (): null => null });
    expect(missing).toEqual([
      expect.stringMatching(/one\.md: share image public\/og\/blog-one\.png is missing/),
      expect.stringMatching(/\/blog \(index page\): share image public\/og\/blog\.png is missing/),
    ]);
    const wrong = check([file("one.md")], {
      ...CONTEXT,
      inspectImage: (): ImageInfo => ({ bytes: 200_000, width: 800, height: 600 }),
    });
    expect(wrong).toHaveLength(4);
    expect(wrong[0]).toMatch(/is 800x600; share images are 1200x630/);
    expect(wrong[1]).toMatch(/is 195 KB; keep it under 150 KB/);
  });

  it("lists every problem of every page together", (): void => {
    const problems = check([
      file("one.md", { title: "x".repeat(70), kind: "nope" }),
      file("two.md", { takeaways: ["a"] }),
    ]);
    expect(problems).toHaveLength(3);
  });

  it("warns, without failing, about keyword placement and length", (): void => {
    const result = checkContentFiles(
      { files: [file("one.md", { h1: "Something else" }, "No keyword up here.\n\n## Heading\n")], strays: [], rejected: [] },
      CONTEXT,
    );
    expect(result.problems).toEqual([]);
    expect(result.site.warnings[0]).toMatch(/mainKeyword "sample keyword" is not in the h1, first paragraph/);
    expect(result.site.warnings[1]).toMatch(/words in the body/);
  });
});

describe("readContentDirectory", (): void => {
  it("reads <slug>.md files and sets everything else aside", (): void => {
    const root = mkdtempSync(join(tmpdir(), "content-"));
    mkdirSync(join(root, "blog"));
    mkdirSync(join(root, "use-cases"));
    mkdirSync(join(root, "scratch"));
    writeFileSync(join(root, "blog", "good-one.md"), "x");
    writeFileSync(join(root, "blog", "good-one.draft.md"), "x");
    writeFileSync(join(root, "blog", "Bad_Name.md"), "x");
    writeFileSync(join(root, "blog", ".DS_Store"), "x");
    writeFileSync(join(root, "use-cases", "notes.review.md"), "x");
    const directory = readContentDirectory(root);
    expect(directory.files.map((entry) => `${entry.section}/${entry.name}`)).toEqual(["blog/good-one.md"]);
    expect(directory.rejected.map((entry) => `${entry.section}/${entry.name}`)).toEqual([
      "use-cases/notes.review.md",
      "blog/Bad_Name.md",
      "blog/good-one.draft.md",
    ]);
    expect(directory.strays).toEqual(["scratch"]);
  });

  it("treats a missing folder as empty", (): void => {
    expect(readContentDirectory(join(tmpdir(), "does-not-exist-content"))).toEqual({
      strays: [],
      rejected: [],
      files: [],
    });
  });
});

describe("share image header", (): void => {
  it("reads the size of a PNG and refuses other files", (): void => {
    const header = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
    header.writeUInt32BE(1200, 16);
    header.writeUInt32BE(630, 20);
    expect(readPngInfo(header, 999)).toEqual({ bytes: 999, width: 1200, height: 630 });
    expect(readPngInfo(Buffer.alloc(32), 1)).toBeNull();
  });
});

describe("the generated index", (): void => {
  it("lists section, slug, path, title, h1 and description only", (): void => {
    const result = checkContentFiles({ files: [file("one.md")], strays: [], rejected: [] }, CONTEXT);
    const entry = toIndexEntry(result.site.pages[0]);
    expect(Object.keys(entry)).toEqual(["section", "slug", "path", "title", "h1", "description"]);
    const source = renderIndexModule(result.site);
    expect(source).toContain('"path": "/blog/one"');
    expect(source).not.toContain("takeaways");
    expect(source).not.toContain("First heading");
    expect(renderIndexModule(result.site)).toBe(source);
    expect(nonEmptySections([entry])).toEqual(["blog"]);
  });
});

describe("llms.txt link text", (): void => {
  it("escapes brackets and parentheses", (): void => {
    expect(escapeLinkText("A [b] (c) \\ d")).toBe("A \\[b\\] \\(c\\) \\\\ d");
  });
});
