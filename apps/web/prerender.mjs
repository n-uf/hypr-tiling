import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Hand-rolled static prerender for this Vite SPA: the lightest mechanism that
// puts the homepage's semantic content into the initial HTML (no SSG framework).
// Order: `vite build` (client) -> `vite build --ssr` (server bundle) -> this
// script injects the rendered head + body into dist/index.html and writes
// dist/llms.txt.

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "dist");
const serverEntry = resolve(here, "dist-server/entry-server.mjs");
const templatePath = resolve(distDir, "index.html");

const { render, renderHead, llmsTxt } = await import(serverEntry);

const appHtml = render();
const headHtml = renderHead();

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

writeFileSync(templatePath, finalHtml, "utf8");
writeFileSync(resolve(distDir, "llms.txt"), llmsTxt(), "utf8");

console.log(
  `prerender: wrote dist/index.html (${finalHtml.length} bytes) + dist/llms.txt`,
);
