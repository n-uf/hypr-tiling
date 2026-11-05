import { CONTENT_SECTIONS, SITE_ORIGIN, sectionPath } from "./constants";
import { isLive } from "./live";
import { pagesOf, type ContentSite } from "./types";

/**
 * sitemap.xml: the pages that exist, each in the form its canonical uses.
 * `/` and `/docs` carry no lastmod (there is no real per-page date for them);
 * a content page's lastmod is its `updated`, a section index's is the latest
 * `updated` among its pages. `/llms.txt` is a text file, not a page, so it is
 * not listed.
 */
export function buildSitemap(site: ContentSite): string {
  const entries: Array<{ readonly loc: string; readonly lastmod?: string }> = [
    { loc: `${SITE_ORIGIN}/` },
    { loc: `${SITE_ORIGIN}/docs` },
  ];
  for (const section of CONTENT_SECTIONS) {
    // Live pages only: a draft shown in a preview build is noindex, and a
    // noindex page does not belong in a sitemap.
    const pages = pagesOf(site, section).filter(isLive);
    if (pages.length === 0) {
      continue;
    }
    entries.push({
      loc: `${SITE_ORIGIN}${sectionPath(section)}`,
      lastmod: pages.map((page): string => page.updated).sort().at(-1),
    });
    for (const page of pages) {
      entries.push({ loc: page.url, lastmod: page.updated });
    }
  }
  const urls: string = entries
    .map(
      (entry): string =>
        `  <url>\n    <loc>${entry.loc}</loc>\n${entry.lastmod == null ? "" : `    <lastmod>${entry.lastmod}</lastmod>\n`}  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
