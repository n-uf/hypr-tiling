import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Hand-rolled static prerender for this Vite SPA: the lightest mechanism that
// puts the homepage's semantic content into the initial HTML (no SSG framework).
// Order: `vite build` (client) -> `vite build --ssr` (server bundle) -> this
// script injects the rendered head + body into dist/index.html and writes
// dist/llms.txt.

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "dist");
const publicDir = resolve(here, "public");
const workspaceAssetsDir = resolve(here, "..", "..", "assets");
const serverEntry = resolve(here, "dist-server/entry-server.mjs");
const templatePath = resolve(distDir, "index.html");

const { render, renderHead, renderDocs, renderDocsHead, renderShowcaseHead, llmsTxt } =
  await import(serverEntry);

const appHtml = render();
const headHtml = renderHead();
const docsHtml = renderDocs();
const docsHeadHtml = renderDocsHead();
const showcaseHeadHtml = renderShowcaseHead();

const template = readFileSync(templatePath, "utf8");

if (!template.includes("<!--app-html-->")) {
  throw new Error("prerender: <!--app-html--> marker missing from dist/index.html");
}
if (!template.includes("<!--app-head-->")) {
  throw new Error("prerender: <!--app-head--> marker missing from dist/index.html");
}

const finalHtml = template
  .replace("<!--app-head-->", headHtml)
  .replace("<!--app-html-->", appHtml);

// The /docs route reuses the same built client template (hashed asset paths are
// absolute, so they resolve from /docs too) with the docs-specific head + body.
const docsFinalHtml = template
  .replace("<!--app-head-->", docsHeadHtml)
  .replace("<!--app-html-->", docsHtml);

// `/showcase` stays client-rendered, but this route still needs an
// indexable-noindex signal in the initial HTML response for crawlers.
const showcaseFinalHtml = template
  .replace("<!--app-head-->", showcaseHeadHtml)
  .replace("<!--app-html-->", "");

const robotsTxt = `User-agent: *
Allow: /

Sitemap: https://hypr-tiling.n-uf.com/sitemap.xml
`;

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://hypr-tiling.n-uf.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://hypr-tiling.n-uf.com/docs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://hypr-tiling.n-uf.com/showcase</loc>
    <changefreq>weekly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>https://hypr-tiling.n-uf.com/llms.txt</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>
`;

const distSocialDir = resolve(distDir, "social");
mkdirSync(distSocialDir, { recursive: true });

const socialImageSource = resolve(
  workspaceAssetsDir,
  "hypr-tiling-social-preview.png",
);
const socialImageDestination = resolve(
  distSocialDir,
  "hypr-tiling-social-preview.png",
);

if (!existsSync(socialImageSource)) {
  throw new Error(`prerender: missing social image at ${socialImageSource}`);
}

copyFileSync(socialImageSource, socialImageDestination);

const faviconSourceCandidates = [
  resolve(publicDir, "favicon.png"),
  resolve(workspaceAssetsDir, "hypr-tiling-logo.png"),
];
const faviconSource = faviconSourceCandidates.find((path) => existsSync(path));
if (faviconSource == null) {
  throw new Error("prerender: no favicon source found in public/ or assets/");
}
copyFileSync(faviconSource, resolve(distDir, "favicon.png"));

const docsDir = resolve(distDir, "docs");
mkdirSync(docsDir, { recursive: true });
const showcaseHtmlPath = resolve(distDir, "showcase.html");

writeFileSync(templatePath, finalHtml, "utf8");
writeFileSync(resolve(docsDir, "index.html"), docsFinalHtml, "utf8");
writeFileSync(showcaseHtmlPath, showcaseFinalHtml, "utf8");
writeFileSync(resolve(distDir, "llms.txt"), llmsTxt(), "utf8");
writeFileSync(resolve(distDir, "robots.txt"), robotsTxt, "utf8");
writeFileSync(resolve(distDir, "sitemap.xml"), sitemapXml, "utf8");

console.log(
  `prerender: wrote dist/index.html (${finalHtml.length} bytes), dist/docs/index.html (${docsFinalHtml.length} bytes), dist/showcase.html (${showcaseFinalHtml.length} bytes), llms.txt, robots.txt, sitemap.xml, social image, and favicon`,
);
