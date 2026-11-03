// Renders the 1200x630 share images in apps/web/public/og/: one per use-case and
// blog page (`<section>-<slug>.png`) and one per section index (`<section>.png`).
// The PNGs are committed; the build fails when a page has none (see
// src/content/validate.ts). Run after adding a page or changing an h1:
//
//   pnpm --filter hypr-tiling-web og            render every image
//   pnpm --filter hypr-tiling-web og -- --only blog-react-mosaic-alternatives
//
// Needs Google Chrome (Playwright drives the installed browser, channel "chrome")
// and network access once per run for the Fraunces, Inter and JetBrains Mono
// fonts the site itself uses.

import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { exitWithContentError, loadSiteModule, webRoot } from "./lib/site-module.mjs";

const WIDTH = 1200;
const HEIGHT = 630;
const FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=block";
// Product names that must not break across lines (hyphenated words are kept whole automatically).
const NAMES_ON_ONE_LINE = ["Golden Layout", "React Grid Layout", "React Mosaic", "Hyprland"];

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Escapes the text and keeps hyphenated words and product names on one line (no-break spaces). */
export function headingHtml(text) {
  let out = escapeHtml(text);
  for (const name of NAMES_ON_ONE_LINE) {
    out = out.replace(new RegExp(name, "gi"), (match) => match.replace(/ /g, "\u00a0"));
  }
  return out.replace(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g, (word) => `<span class="nb">${word}</span>`);
}

function headingSize(text) {
  const length = [...text].length;
  if (length <= 34) return 74;
  if (length <= 52) return 64;
  if (length <= 70) return 56;
  if (length <= 90) return 48;
  return 42;
}

export function ogHtml({ label, heading, footer }) {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS_CSS}"><style>
*{box-sizing:border-box}
html,body{margin:0}
body{width:${WIDTH}px;height:${HEIGHT}px;background:#0c0d0f;color:#fafaf9;position:relative;overflow:hidden;font-family:Inter,sans-serif}
.nb{white-space:nowrap}
.brand{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:12px;font:600 30px/1 Inter,sans-serif;color:#fafaf9}
.brand i{display:block;width:5px;height:30px;border-radius:3px;background:#fbbf24}
.label{position:absolute;left:72px;top:150px;font:500 20px/1 "JetBrains Mono",monospace;letter-spacing:.32em;text-transform:uppercase;color:rgba(252,211,77,.85)}
h1{position:absolute;left:72px;top:196px;width:690px;margin:0;font:500 ${headingSize(heading)}px/1.07 Fraunces,serif;letter-spacing:-.015em;color:#fafaf9;text-wrap:balance}
.foot{position:absolute;left:72px;bottom:60px;font:500 22px/1 "JetBrains Mono",monospace;letter-spacing:.04em;color:#a8a29e}
.foot b{color:rgba(252,211,77,.85);font-weight:500}
.tiles{position:absolute;left:816px;top:64px;width:312px;height:502px;display:grid;grid-template-columns:1.12fr .88fr;grid-template-rows:1fr 1fr;gap:10px}
.pane{position:relative;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#121316;overflow:hidden}
.pane::before{content:"";display:block;height:26px;border-bottom:1px solid rgba(255,255,255,.07);background:#16171b}
.pane::after{content:"";position:absolute;left:14px;right:14px;top:50px;height:60px;background:repeating-linear-gradient(#26262a 0 7px,transparent 7px 20px);border-radius:3px}
.pane.a{grid-row:1/3;border-color:rgba(251,191,36,.5)}
.pane.a::after{height:150px}
</style></head><body>
<div class="brand"><i></i>hypr-tiling</div>
<div class="label">${escapeHtml(label)}</div>
<h1>${headingHtml(heading)}</h1>
<div class="foot">${footer}</div>
<div class="tiles"><div class="pane a"></div><div class="pane"></div><div class="pane"></div></div>
</body></html>`;
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

try {
  const content = await loadSiteModule();
  // The images do not exist yet on a first run, so the share-image checks are skipped here.
  const site = content.loadSite(webRoot, undefined, { skipImageChecks: true });
  const jobs = [];
  const sections = [...new Set(site.pages.map((page) => page.section))];
  for (const section of sections) {
    const copy = content.SECTION_INDEX_COPY[section];
    jobs.push({
      name: section,
      label: content.SECTION_LABELS[section].plural,
      heading: copy.h1,
      footer: `<b>hypr-tiling.n-uf.com</b>/${section}`,
    });
  }
  for (const page of site.pages) {
    jobs.push({
      name: `${page.section}-${page.slug}`,
      label: content.SECTION_LABELS[page.section].chip,
      heading: page.h1,
      footer: "<b>hypr-tiling.n-uf.com</b> \u00b7 by n-uf",
    });
  }

  const outDir = resolve(webRoot, "public/og");
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(outDir)) {
    if (file.endsWith(".png") && !jobs.some((job) => `${job.name}.png` === file)) {
      rmSync(resolve(outDir, file));
      console.log(`og: removed stale ${file}`);
    }
  }

  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    for (const job of jobs) {
      if (only != null && job.name !== only) continue;
      await page.setContent(ogHtml(job), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const fontsOk = await page.evaluate(
        () =>
          document.fonts.check('500 64px Fraunces') &&
          document.fonts.check('600 30px Inter') &&
          document.fonts.check('500 20px "JetBrains Mono"'),
      );
      if (!fontsOk) {
        throw new Error("og: the Fraunces, Inter or JetBrains Mono font did not load (network?); not writing a fallback-font image");
      }
      const file = resolve(outDir, `${job.name}.png`);
      await page.screenshot({ path: file, type: "png" });
      console.log(`og: ${job.name}.png (${Math.round(statSync(file).size / 1024)} KB)`);
    }
  } finally {
    await browser.close();
  }
} catch (error) {
  exitWithContentError(error);
}
