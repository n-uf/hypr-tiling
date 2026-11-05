import type { ContentIndexEntry, ContentSection } from "./constants";
import type { LiveBlock } from "./live-blocks";

export const CONTENT_KINDS = [
  "use-case",
  "how-to",
  "what-is",
  "comparison",
  "best-tools",
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export interface ContentSource {
  readonly title: string;
  readonly url: string;
  /** `YYYY-MM-DD`: the day the source was read. */
  readonly checked: string;
}

export interface ContentFaq {
  readonly q: string;
  readonly a: string;
}

/** The validated front matter of a page (see the SEO brief for what each field means). */
export interface ContentFrontMatter {
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly mainKeyword: string;
  readonly kind: ContentKind;
  /**
   * Scheduled page: `published` is its go-live date and may be in the future,
   * `updated` equals it. Production builds hide it (see live.ts).
   */
  readonly draft: boolean;
  readonly published: string;
  readonly updated: string;
  readonly author: "n-uf";
  readonly takeaways: ReadonlyArray<string>;
  readonly faq: ReadonlyArray<ContentFaq>;
  readonly sources: ReadonlyArray<ContentSource>;
  readonly related: ReadonlyArray<string>;
}

export interface ContentHeading {
  readonly id: string;
  readonly text: string;
  readonly depth: number;
}

export interface ContentLink {
  readonly href: string;
  readonly text: string;
}

export interface ContentPage extends ContentFrontMatter, ContentIndexEntry {
  /** `content/<section>/<slug>.md`, for messages. */
  readonly file: string;
  /** The page's absolute URL on the live host. */
  readonly url: string;
  /** Share image path, `/og/<section>-<slug>.png`. */
  readonly ogPath: string;
  /** The first paragraph, rendered (the page's lede). Empty when the body does not start with a paragraph. */
  readonly ledeHtml: string;
  /** Plain text of the first paragraph. */
  readonly ledeText: string;
  /** The rest of the body, rendered. */
  readonly bodyHtml: string;
  /** H2 and H3 headings of the body, with their ids. */
  readonly headings: ReadonlyArray<ContentHeading>;
  readonly links: ReadonlyArray<ContentLink>;
  readonly wordCount: number;
  /** The page's `{{live:/path}}...{{/live}}` blocks; `ledeHtml`, `bodyHtml` and `ledeText` already have them resolved. */
  readonly liveBlocks: ReadonlyArray<LiveBlock>;
}

export interface ContentSite {
  /**
   * The pages that appear in this build, newest first (published, then
   * updated, then slug): every live page, plus the drafts when drafts are
   * shown (preview mode). Everything that lists or renders pages reads this.
   */
  readonly pages: ReadonlyArray<ContentPage>;
  /** Drafts left out of this build (production mode): validated, never rendered or listed. */
  readonly hidden: ReadonlyArray<ContentPage>;
  /** Problems that do not fail the build (keyword placement, length targets). */
  readonly warnings: ReadonlyArray<string>;
}

export function pagesOf(
  site: ContentSite,
  section: ContentSection,
): ReadonlyArray<ContentPage> {
  return site.pages.filter((page): boolean => page.section === section);
}

export function toIndexEntry(page: ContentPage): ContentIndexEntry {
  return {
    section: page.section,
    slug: page.slug,
    path: page.path,
    title: page.title,
    h1: page.h1,
    description: page.description,
  };
}

export class ContentProblemsError extends Error {
  readonly problems: ReadonlyArray<string>;
  constructor(problems: ReadonlyArray<string>) {
    super(
      `content: ${problems.length} problem${problems.length === 1 ? "" : "s"} found; the build stops until they are fixed:\n` +
        problems.map((problem, index): string => `  ${index + 1}. ${problem}`).join("\n"),
    );
    this.name = "ContentProblemsError";
    this.problems = problems;
  }
}
