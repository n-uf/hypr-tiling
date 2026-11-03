import * as React from "react";
import { renderToString } from "react-dom/server";
import { resolve } from "node:path";
import { DocsPage } from "../docs-page";
import { loadContentSite } from "./site";
import type { ContentSite } from "./types";

// Build-time loader shared by the prebuild script (content-index.mjs, render-og.mjs)
// and the prerender (via entry-server.tsx). Server only: it reads files and
// renders /docs, so nothing in the browser bundle imports it.

/** Every `id` on the prerendered /docs page: what a `/docs#anchor` link may name. */
export function docsAnchorIds(): ReadonlySet<string> {
  const html: string = renderToString(
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
export function loadSite(webRoot: string): ContentSite {
  return loadContentSite({
    contentRoot: resolve(webRoot, "content"),
    publicRoot: resolve(webRoot, "public"),
    docsAnchors: docsAnchorIds(),
  });
}

export { renderIndexModule } from "./index-module";
export { ContentProblemsError } from "./types";
