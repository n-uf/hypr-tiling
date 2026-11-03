// Client-safe constants for the content sections (use cases and blog). Nothing
// here imports React, Node or the markdown parser, so the home page and /docs can
// import it without pulling the content layer into the browser bundle.

/** The live origin, no trailing slash. */
export const SITE_ORIGIN: string = "https://hypr-tiling.n-uf.com";

/** The sections that hold markdown pages, in the order the nav lists them. */
export const CONTENT_SECTIONS = ["use-cases", "blog"] as const;
export type ContentSection = (typeof CONTENT_SECTIONS)[number];

/** Names of a section: `plural` in nav and breadcrumbs, `chip` on the "Read next" cards. */
export const SECTION_LABELS: Readonly<
  Record<ContentSection, { readonly plural: string; readonly chip: string }>
> = {
  "use-cases": { plural: "Use cases", chip: "Use case" },
  blog: { plural: "Blog", chip: "Blog" },
};

/** Head and heading copy of each section's index page (checked by a unit test against the page limits). */
export const SECTION_INDEX_COPY: Readonly<
  Record<
    ContentSection,
    {
      readonly title: string;
      readonly description: string;
      readonly h1: string;
      readonly lede: string;
    }
  >
> = {
  "use-cases": {
    title: "hypr-tiling use cases: screens users rearrange",
    description:
      "Guides to building dashboards, dockable panels and split-pane screens in React with hypr-tiling, a tiling layout engine for screens users rearrange.",
    h1: "Use cases for hypr-tiling",
    lede: "Each guide takes one job, such as a dashboard users rearrange, and shows how a tiled layout does it in React, with code from the docs and honest notes on when another library fits better.",
  },
  blog: {
    title: "hypr-tiling blog: React layout libraries compared",
    description:
      "Comparisons and explainers on React layout libraries, tiling and docking, written by n-uf, the maker of hypr-tiling, with the sources checked and dated.",
    h1: "The hypr-tiling blog",
    lede: "Comparisons and explainers about React layout libraries, tiling and docking. Facts about other projects come from their own pages, and every source is listed with the day it was checked.",
  },
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
