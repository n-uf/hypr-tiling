// Client-safe constants for the content sections (use cases and blog). Nothing
// here imports React, Node or the markdown parser, so the home page and /docs can
// import it without pulling the content layer into the browser bundle.

/** The sections that hold markdown pages, in the order the nav lists them. */
export const CONTENT_SECTIONS = ["use-cases", "blog"] as const;
export type ContentSection = (typeof CONTENT_SECTIONS)[number];

export const SECTION_LABELS: Readonly<
  Record<ContentSection, { readonly plural: string; readonly singular: string }>
> = {
  "use-cases": { plural: "Use cases", singular: "Use case" },
  blog: { plural: "Blog", singular: "Article" },
};

/** The fields of a page the client may know about (no body, no sources). */
export interface ContentIndexEntry {
  readonly section: ContentSection;
  readonly slug: string;
  /** Site path, no trailing slash: `/use-cases/<slug>`. */
  readonly path: string;
  readonly title: string;
  readonly h1: string;
  readonly description: string;
}

/** Main keywords the home page and /docs already hold; no content page may take them. */
export const HOME_MAIN_KEYWORD: string = "react tiling window manager";
export const DOCS_MAIN_KEYWORD: string = "hypr-tiling documentation";

export function sectionPath(section: ContentSection): string {
  return `/${section}`;
}

/** Entries of one section, in the order they were generated (newest first). */
export function entriesOf(
  index: ReadonlyArray<ContentIndexEntry>,
  section: ContentSection,
): ReadonlyArray<ContentIndexEntry> {
  return index.filter((entry): boolean => entry.section === section);
}

/** The sections that have at least one page (an empty section has no index page and no nav link). */
export function nonEmptySections(
  index: ReadonlyArray<ContentIndexEntry>,
): ReadonlyArray<ContentSection> {
  return CONTENT_SECTIONS.filter(
    (section): boolean => entriesOf(index, section).length > 0,
  );
}
