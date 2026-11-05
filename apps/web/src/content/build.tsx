import * as React from "react";
import { renderToString } from "react-dom/server";
import { resolve } from "node:path";
import { DocsPage } from "../docs-page";
import { QUICKSTART_HREF, RAIL_DOCS_LINKS } from "../content-page";
import { loadContentSite } from "./site";
import { ContentProblemsError, type ContentSite } from "./types";

// Build-time loader shared by the prebuild script (content-index.mjs, render-og.mjs)
// and the prerender (via entry-server.tsx). Server only: it reads files and
// renders /docs, so nothing in the browser bundle imports it.

/**
 * Every `id` on the prerendered /docs page: what a `/docs#anchor` link may name.
 * Pass the page's HTML when the caller already rendered it.
 */
export function docsAnchorIds(docsHtml?: string): ReadonlySet<string> {
  const html: string =
    docsHtml ??
    renderToString(
      <React.StrictMode>
        <DocsPage />
      </React.StrictMode>,
    );
  const ids = new Set<string>();
  for (const match of html.matchAll(/\sid="([^"]+)"/g)) {
    ids.add(match[1]);
  }
  return ids;
}

/** Load and check `apps/web/content`. `webRoot` is the `apps/web` folder. Throws `ContentProblemsError`. */
export function loadSite(
  webRoot: string,
  docsHtml?: string,
  options: { readonly skipImageChecks?: boolean; readonly showDrafts?: boolean } = {},
): ContentSite {
  const docsAnchors: ReadonlySet<string> = docsAnchorIds(docsHtml);
  // The docs links the page chrome itself carries must exist too.
  const missing: ReadonlyArray<string> = [
    ...RAIL_DOCS_LINKS.map((link): string => link.href),
    QUICKSTART_HREF,
  ].filter((href): boolean => !docsAnchors.has(href.split("#")[1] ?? ""));
  if (missing.length > 0) {
    throw new ContentProblemsError(
      missing.map((href): string => `content-page.tsx: the page chrome links to ${href}, which is not an anchor on /docs`),
    );
  }
  return loadContentSite({
    contentRoot: resolve(webRoot, "content"),
    publicRoot: resolve(webRoot, "public"),
    docsAnchors,
    skipImageChecks: options.skipImageChecks,
    showDrafts: options.showDrafts,
  });
}

export { renderIndexModule } from "./index-module";
export { ContentProblemsError } from "./types";
export { SECTION_INDEX_COPY, SECTION_LABELS } from "./constants";
