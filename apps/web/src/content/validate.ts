import {
  CONTENT_SECTIONS,
  SECTION_LABELS,
  sectionPath,
  type ContentSection,
} from "./constants";
import { isLive, isVisible } from "./live";
import { LIVE_TARGET } from "./live-blocks";
import { RESERVED_HEADING_IDS } from "./markdown";
import {
  CONTENT_KINDS,
  type ContentFaq,
  type ContentFrontMatter,
  type ContentKind,
  type ContentPage,
  type ContentSource,
} from "./types";

// The build-time checks for the content pages. Every function returns its
// problems instead of throwing, so one build lists everything that is wrong.

export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 155;
export const TAKEAWAYS_MIN = 3;
export const TAKEAWAYS_MAX = 5;
export const FAQ_MIN = 4;
export const FAQ_MAX = 5;
export const RELATED_MIN = 2;
export const RELATED_MAX = 4;
export const MAX_LINKS_TO_ONE_TARGET = 2;
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_MAX_BYTES = 150 * 1024;
export const SITE_HOST = "hypr-tiling.n-uf.com";

const FIELDS: ReadonlyArray<string> = [
  "title",
  "description",
  "h1",
  "mainKeyword",
  "kind",
  "published",
  "updated",
  "author",
  "takeaways",
  "faq",
  "sources",
  "related",
];

/** Optional fields: absent means the default (`draft: false`). */
const OPTIONAL_FIELDS: ReadonlyArray<string> = ["draft"];

const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;

/** Length in characters as a reader counts them (a code point is one). */
export function charLength(value: string): number {
  return Array.from(value).length;
}

export function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed: Date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Compare keywords and the text around them loosely: case, hyphens and a plural
 * "s" do not matter, so "react-mosaic alternatives" matches "react mosaic alternative".
 */
export function normalizeKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((word): boolean => word !== "")
    .map((word): string => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word))
    .join(" ");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function describeType(value: unknown): string {
  if (value === null) {
    return "empty";
  }
  return Array.isArray(value) ? "a list" : typeof value;
}

export interface FrontMatterResult {
  readonly frontMatter: ContentFrontMatter | null;
  readonly problems: ReadonlyArray<string>;
}

/** Check a parsed front-matter mapping field by field. `today` is `YYYY-MM-DD`. */
export function readFrontMatter(
  data: Record<string, unknown>,
  file: string,
  today: string,
): FrontMatterResult {
  const problems: Array<string> = [];
  const bad = (message: string): void => {
    problems.push(`${file}: ${message}`);
  };

  for (const key of Object.keys(data)) {
    if (!FIELDS.includes(key) && !OPTIONAL_FIELDS.includes(key)) {
      bad(`unknown front matter field "${key}" (allowed: ${[...FIELDS, ...OPTIONAL_FIELDS].join(", ")})`);
    }
  }
  for (const key of FIELDS) {
    if (!(key in data) || data[key] === null || data[key] === undefined) {
      bad(`front matter field "${key}" is missing`);
    }
  }

  const text = (key: string): string | null => {
    const value: unknown = data[key];
    if (value === undefined || value === null) {
      return null;
    }
    if (!isNonEmptyString(value)) {
      bad(`"${key}" must be a non-empty text, found ${describeType(value)}`);
      return null;
    }
    return value.trim();
  };

  const title: string | null = text("title");
  if (title != null && charLength(title) > TITLE_MAX) {
    bad(`title is ${charLength(title)} characters; the limit is ${TITLE_MAX}`);
  }
  const description: string | null = text("description");
  if (description != null) {
    const length: number = charLength(description);
    if (length < DESCRIPTION_MIN || length > DESCRIPTION_MAX) {
      bad(`description is ${length} characters; it must be ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX}`);
    }
  }
  const h1: string | null = text("h1");
  const mainKeyword: string | null = text("mainKeyword");

  let kind: ContentKind | null = null;
  const kindValue: string | null = text("kind");
  if (kindValue != null) {
    if ((CONTENT_KINDS as ReadonlyArray<string>).includes(kindValue)) {
      kind = kindValue as ContentKind;
    } else {
      bad(`kind "${kindValue}" is not one of ${CONTENT_KINDS.join(", ")}`);
    }
  }

  let draft = false;
  if (data.draft !== undefined && data.draft !== null) {
    if (typeof data.draft === "boolean") {
      draft = data.draft;
    } else {
      bad(`draft must be true or false, found ${JSON.stringify(data.draft)}`);
    }
  }

  // A draft's `published` is its go-live date, so it may be in the future.
  const dateField = (key: "published" | "updated"): string | null => {
    const value: unknown = data[key];
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== "string" || !isRealDate(value)) {
      bad(`${key} must be a date written YYYY-MM-DD, found ${JSON.stringify(value)}`);
      return null;
    }
    if (value > today && !draft) {
      bad(`${key} ${value} is in the future (today is ${today}); dates must be real (a scheduled page needs draft: true)`);
    }
    return value;
  };
  const published: string | null = dateField("published");
  const updated: string | null = dateField("updated");
  if (published != null && updated != null) {
    if (draft && updated !== published) {
      bad(`a draft's updated (${updated}) must equal its published go-live date (${published})`);
    } else if (!draft && updated < published) {
      bad(`updated ${updated} is before published ${published}`);
    }
  }

  const authorValue: unknown = data.author;
  if (authorValue !== undefined && authorValue !== null && authorValue !== "n-uf") {
    bad(`author must be "n-uf", found ${JSON.stringify(authorValue)}`);
  }

  const takeaways: Array<string> = [];
  if (data.takeaways !== undefined && data.takeaways !== null) {
    if (!Array.isArray(data.takeaways)) {
      bad(`takeaways must be a list, found ${describeType(data.takeaways)}`);
    } else {
      if (data.takeaways.length < TAKEAWAYS_MIN || data.takeaways.length > TAKEAWAYS_MAX) {
        bad(`takeaways has ${data.takeaways.length} entries; it needs ${TAKEAWAYS_MIN} to ${TAKEAWAYS_MAX}`);
      }
      data.takeaways.forEach((entry: unknown, index: number): void => {
        if (isNonEmptyString(entry)) {
          takeaways.push(entry.trim());
        } else {
          bad(`takeaways[${index}] must be a non-empty text`);
        }
      });
    }
  }

  const faq: Array<ContentFaq> = [];
  if (data.faq !== undefined && data.faq !== null) {
    if (!Array.isArray(data.faq)) {
      bad(`faq must be a list, found ${describeType(data.faq)}`);
    } else {
      if (data.faq.length < FAQ_MIN || data.faq.length > FAQ_MAX) {
        bad(`faq has ${data.faq.length} entries; it needs ${FAQ_MIN} to ${FAQ_MAX}`);
      }
      data.faq.forEach((entry: unknown, index: number): void => {
        const item = entry as { q?: unknown; a?: unknown } | null;
        if (item != null && isNonEmptyString(item.q) && isNonEmptyString(item.a)) {
          faq.push({ q: item.q.trim(), a: item.a.trim() });
        } else {
          bad(`faq[${index}] needs a non-empty q and a`);
        }
      });
    }
  }

  const sources: Array<ContentSource> = [];
  if (data.sources !== undefined && data.sources !== null) {
    if (!Array.isArray(data.sources)) {
      bad(`sources must be a list, found ${describeType(data.sources)}`);
    } else {
      data.sources.forEach((entry: unknown, index: number): void => {
        const item = entry as { title?: unknown; url?: unknown; checked?: unknown } | null;
        const label = `sources[${index}]`;
        let ok = true;
        if (item == null || !isNonEmptyString(item.title)) {
          bad(`${label} needs a title`);
          ok = false;
        }
        if (item == null || typeof item.url !== "string" || !/^https:\/\/[^\s/]+\S*$/.test(item.url)) {
          bad(`${label} needs an https url, found ${JSON.stringify(item?.url ?? null)}`);
          ok = false;
        }
        if (item == null || typeof item.checked !== "string" || !isRealDate(item.checked)) {
          bad(`${label} needs a checked date written YYYY-MM-DD, found ${JSON.stringify(item?.checked ?? null)}`);
          ok = false;
        } else if (item.checked > today) {
          bad(`${label} checked ${item.checked} is in the future (today is ${today})`);
          ok = false;
        }
        if (ok && item != null) {
          sources.push({
            title: (item.title as string).trim(),
            url: item.url as string,
            checked: item.checked as string,
          });
        }
      });
    }
  }

  const related: Array<string> = [];
  if (data.related !== undefined && data.related !== null) {
    if (!Array.isArray(data.related)) {
      bad(`related must be a list, found ${describeType(data.related)}`);
    } else {
      if (data.related.length < RELATED_MIN || data.related.length > RELATED_MAX) {
        bad(`related has ${data.related.length} entries; it needs ${RELATED_MIN} to ${RELATED_MAX}`);
      }
      data.related.forEach((entry: unknown, index: number): void => {
        if (isNonEmptyString(entry)) {
          related.push(entry.trim());
        } else {
          bad(`related[${index}] must be a site path such as /docs`);
        }
      });
    }
  }

  if (
    problems.length > 0 ||
    title == null ||
    description == null ||
    h1 == null ||
    mainKeyword == null ||
    kind == null ||
    published == null ||
    updated == null
  ) {
    return { frontMatter: null, problems };
  }
  return {
    frontMatter: {
      title,
      description,
      h1,
      mainKeyword,
      kind,
      draft,
      published,
      updated,
      author: "n-uf",
      takeaways,
      faq,
      sources,
      related,
    },
    problems,
  };
}

export interface ImageInfo {
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}

export interface SiteContext {
  /** `YYYY-MM-DD`, UTC. */
  readonly today: string;
  /** Every id on the prerendered /docs page. */
  readonly docsAnchors: ReadonlySet<string>;
  /** Main keywords held by pages that are not content pages: keyword -> where. */
  readonly reservedKeywords: ReadonlyMap<string, string>;
  /** The PNG at a path under public/ (e.g. `/og/blog-x.png`), or null when it does not exist. */
  readonly inspectImage: (publicPath: string) => ImageInfo | null;
  /** Build mode (see live.ts `draftsShown`): drafts appear and may be linked. Default false, production. */
  readonly showDrafts?: boolean;
}

/**
 * The page paths a link may point to: every page (drafts too, so a link to one
 * is reported as such, not as a typo) and the sections that will have an index
 * page in this build.
 */
export function sitePaths(pages: ReadonlyArray<ContentPage>, showDrafts: boolean = false): ReadonlySet<string> {
  const paths = new Set<string>(["/", "/docs"]);
  for (const section of CONTENT_SECTIONS) {
    if (pages.some((page): boolean => page.section === section && isVisible(page, showDrafts))) {
      paths.add(sectionPath(section));
    }
  }
  for (const page of pages) {
    paths.add(page.path);
  }
  return paths;
}

interface ResolvedHref {
  readonly path: string;
  readonly hash: string | null;
}

/** Why an internal href does not resolve, or null if it does. */
function checkInternalHref(
  href: string,
  from: ContentPage | null,
  pages: ReadonlyArray<ContentPage>,
  paths: ReadonlySet<string>,
  docsAnchors: ReadonlySet<string>,
): string | null {
  let target: ResolvedHref;
  if (href.startsWith("#")) {
    target = { path: from?.path ?? "", hash: href.slice(1) };
  } else {
    const hashAt: number = href.indexOf("#");
    const withoutHash: string = hashAt >= 0 ? href.slice(0, hashAt) : href;
    if (withoutHash.includes("?")) {
      return `"${href}" has a query string; link to the page itself`;
    }
    target = { path: withoutHash, hash: hashAt >= 0 ? href.slice(hashAt + 1) : null };
  }
  if (target.path.length > 1 && target.path.endsWith("/")) {
    return `"${href}" ends with a slash; site paths have none (${target.path.replace(/\/+$/, "")})`;
  }
  if (!paths.has(target.path)) {
    return `"${href}" is not a page of this site`;
  }
  if (target.hash == null) {
    return null;
  }
  if (target.path === "/docs") {
    return docsAnchors.has(target.hash) ? null : `"${href}" is not an anchor on /docs`;
  }
  const page: ContentPage | undefined = pages.find((candidate): boolean => candidate.path === target.path);
  if (page == null) {
    return `"${href}" points to an anchor on a page that has none`;
  }
  const known: boolean =
    page.headings.some((heading): boolean => heading.id === target.hash) ||
    RESERVED_HEADING_IDS.has(target.hash);
  return known ? null : `"${href}" is not a heading on ${page.path}`;
}

/** The checks that need every page: keywords, links, related paths, share images. */
export function validateSite(
  pages: ReadonlyArray<ContentPage>,
  context: SiteContext,
): { readonly problems: ReadonlyArray<string>; readonly warnings: ReadonlyArray<string> } {
  const problems: Array<string> = [];
  const warnings: Array<string> = [];
  const showDrafts: boolean = context.showDrafts === true;
  const paths: ReadonlySet<string> = sitePaths(pages, showDrafts);
  const draftPaths = new Map<string, ContentPage>(
    pages.filter((page): boolean => !isLive(page)).map((page): [string, ContentPage] => [page.path, page]),
  );
  // A live page must never link to a draft: in production the target is a 404.
  // A draft may link to a live page, and to a draft that goes live the same
  // day or earlier; one that goes live later would be a 404 in between, in both
  // modes. A link inside `{{live:/target}}...{{/live}}` is exempt: the sentence
  // is not rendered until its target is live. In preview the live-to-draft link
  // works (the draft is shown), so it is only a warning there.
  const draftLinkProblem = (
    page: ContentPage,
    kind: "related" | "link",
    href: string,
    gated?: Map<string, number>,
  ): void => {
    const bare: string = href.split("#")[0];
    const target: ContentPage | undefined = draftPaths.get(bare);
    if (target == null) {
      return;
    }
    const gatedLeft: number = gated?.get(bare) ?? 0;
    if (kind === "link" && gated != null && gatedLeft > 0) {
      gated.set(bare, gatedLeft - 1);
      return;
    }
    const fix = `wrap the sentence in {{live:${bare}}}...{{/live}}`;
    if (!isLive(page)) {
      if (target.published > page.published) {
        problems.push(
          `${page.file}: ${kind} "${href}": this draft goes live ${page.published} but links to the draft ${target.file} that goes live ${target.published}; ${kind === "link" ? fix : "drop it from related"}, or move the go-live dates`,
        );
      }
      return;
    }
    const message = `${page.file}: ${kind} "${href}" points at the draft ${target.file} (goes live ${target.published}); a live page may link to it only after it is published (${kind === "link" ? fix : "related cannot be wrapped: add it in the publish follow-up"})`;
    if (showDrafts) {
      warnings.push(`${message} (this build shows drafts, a production build fails)`);
    } else {
      problems.push(message);
    }
  };

  const keywordOwner = new Map<string, string>(
    [...context.reservedKeywords].map(([keyword, owner]): [string, string] => [normalizeKeyword(keyword), owner]),
  );
  for (const page of pages) {
    const key: string = normalizeKeyword(page.mainKeyword);
    const owner: string | undefined = keywordOwner.get(key);
    if (owner != null) {
      problems.push(
        `${page.file}: mainKeyword "${page.mainKeyword}" is already taken by ${owner}; every page needs its own`,
      );
    } else {
      keywordOwner.set(key, page.file);
    }
  }

  for (const page of pages) {
    for (const related of page.related) {
      const why: string | null = checkInternalHref(related, page, pages, paths, context.docsAnchors);
      if (!related.startsWith("/") || related.startsWith("//")) {
        problems.push(`${page.file}: related "${related}" must be a site path starting with /`);
      } else if (why != null) {
        problems.push(`${page.file}: related ${why}`);
      } else {
        draftLinkProblem(page, "related", related);
      }
    }

    // Live blocks: each must name a content page other than this one, and its
    // links to that page are the ones the draft rule lets through.
    const gated = new Map<string, number>();
    for (const block of page.liveBlocks) {
      if (block.target === page.path) {
        problems.push(`${page.file}: {{live:${block.target}}} names the page itself`);
      } else if (
        // (a malformed target is already reported by the syntax check)
        LIVE_TARGET.test(block.target) &&
        !pages.some((candidate): boolean => candidate.path === block.target)
      ) {
        problems.push(
          `${page.file}: {{live:${block.target}}} names a page that does not exist; it must be a use-case or blog page of this site`,
        );
      }
      for (const href of block.hrefs) {
        if (href.split("#")[0] === block.target) {
          gated.set(block.target, (gated.get(block.target) ?? 0) + 1);
        }
      }
    }

    if (!isLive(page) && page.published < context.today) {
      warnings.push(
        `${page.file}: the draft's go-live date ${page.published} is already past (today is ${context.today}); it goes live on the next publish run, with that past date`,
      );
    }

    const perTarget = new Map<string, number>();
    for (const link of page.links) {
      const href: string = link.href;
      if (/^https:\/\//i.test(href)) {
        let host: string | null = null;
        try {
          host = new URL(href).host;
        } catch {
          problems.push(`${page.file}: link "${href}" is not a valid URL`);
        }
        if (host === SITE_HOST) {
          problems.push(`${page.file}: link "${href}" points at this site; write it as a relative path`);
        }
        continue;
      }
      if (!href.startsWith("/") && !href.startsWith("#")) {
        problems.push(`${page.file}: link "${href}" must be a relative site path or an https URL`);
        continue;
      }
      const why: string | null = href.startsWith("//")
        ? `"${href}" is not a site path`
        : checkInternalHref(href, page, pages, paths, context.docsAnchors);
      if (why != null) {
        problems.push(`${page.file}: link ${why}`);
        continue;
      }
      if (!href.startsWith("#")) {
        draftLinkProblem(page, "link", href, gated);
        const target: string = href.split("#")[0];
        perTarget.set(target, (perTarget.get(target) ?? 0) + 1);
      }
    }
    for (const [target, count] of perTarget) {
      if (count > MAX_LINKS_TO_ONE_TARGET) {
        problems.push(
          `${page.file}: ${count} links to ${target}; the limit is ${MAX_LINKS_TO_ONE_TARGET} per target`,
        );
      }
    }

    problems.push(...imageProblems(page.ogPath, page.file, context));
  }

  for (const section of CONTENT_SECTIONS) {
    if (pages.some((page): boolean => page.section === section)) {
      problems.push(
        ...imageProblems(sectionOgPath(section), `${sectionPath(section)} (index page)`, context),
      );
    }
  }

  for (const page of pages) {
    warnings.push(...pageWarnings(page));
  }
  return { problems, warnings };
}

/** Share image path of a section's index page. */
export function sectionOgPath(section: ContentSection): string {
  return `/og/${section}.png`;
}

function imageProblems(ogPath: string, owner: string, context: SiteContext): ReadonlyArray<string> {
  const image: ImageInfo | null = context.inspectImage(ogPath);
  const fix = "run `pnpm --filter hypr-tiling-web og` and commit the PNGs";
  if (image == null) {
    return [`${owner}: share image public${ogPath} is missing (${fix})`];
  }
  const found: Array<string> = [];
  if (image.width !== OG_WIDTH || image.height !== OG_HEIGHT) {
    found.push(`public${ogPath} is ${image.width}x${image.height}; share images are ${OG_WIDTH}x${OG_HEIGHT}`);
  }
  if (image.bytes > OG_MAX_BYTES) {
    found.push(`public${ogPath} is ${Math.round(image.bytes / 1024)} KB; keep it under ${OG_MAX_BYTES / 1024} KB`);
  }
  return found.map((message): string => `${owner}: share image ${message}`);
}

const WORD_TARGETS: Readonly<Record<ContentSection, readonly [number, number]>> = {
  "use-cases": [1200, 1800],
  blog: [1500, 2500],
};

/** Hints that do not fail the build: keyword placement and length targets from the SEO brief. */
function pageWarnings(page: ContentPage): ReadonlyArray<string> {
  const warnings: Array<string> = [];
  const keyword: string = normalizeKeyword(page.mainKeyword);
  const has = (text: string): boolean => normalizeKeyword(text).includes(keyword);
  const missing: Array<string> = [];
  if (!has(page.title)) {
    missing.push("title");
  }
  if (!has(page.description)) {
    missing.push("description");
  }
  if (!has(page.h1)) {
    missing.push("h1");
  }
  if (page.ledeText === "") {
    warnings.push(`${page.file}: the body does not start with a paragraph (the direct answer)`);
  } else if (!has(page.ledeText)) {
    missing.push("first paragraph");
  }
  if (missing.length > 0) {
    warnings.push(`${page.file}: mainKeyword "${page.mainKeyword}" is not in the ${missing.join(", ")}`);
  }
  const [min, max] = WORD_TARGETS[page.section];
  if (page.wordCount < min || page.wordCount > max) {
    warnings.push(
      `${page.file}: ${page.wordCount} words in the body; ${SECTION_LABELS[page.section].plural.toLowerCase()} aim for ${min} to ${max}`,
    );
  }
  return warnings;
}
