// Renders the site icons in apps/web/public/ from public/favicon.svg (the
// source, a 100x100 square with its own rounded corners). The files are
// committed; run this only after changing the SVG:
//
//   pnpm --filter hypr-tiling-web icons
//
//   icon-192.png          192x192, rounded corners transparent (the manifest-size icon Google reads)
//   apple-touch-icon.png  180x180, full bleed on the SVG's own dark colour (iOS rounds it and fills
//                         transparent corners with black)
//   favicon.ico           16, 32 and 48 px PNGs inside (the /favicon.ico fallback), each rendered
//                         from the SVG at its size, not scaled down from a bigger one
//
// Needs Google Chrome (Playwright drives the installed browser, channel "chrome");
// no network, no fonts.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { buildIco } from "./lib/ico.mjs";

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");
const svg = readFileSync(resolve(publicDir, "favicon.svg"));
const dataUrl = `data:image/svg+xml;base64,${svg.toString("base64")}`;
// The background colour behind the full-bleed apple icon: the SVG's own square.
const APPLE_BACKGROUND = "#0c0d0f";

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  async function render(size, background) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:${background ?? "transparent"}">` +
        `<img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`,
    );
    await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
    return page.screenshot({ type: "png", omitBackground: background == null, clip: { x: 0, y: 0, width: size, height: size } });
  }

  writeFileSync(resolve(publicDir, "icon-192.png"), await render(192));
  writeFileSync(resolve(publicDir, "apple-touch-icon.png"), await render(180, APPLE_BACKGROUND));
  writeFileSync(resolve(publicDir, "favicon.ico"), buildIco([await render(16), await render(32), await render(48)]));
  console.log("icons: wrote icon-192.png, apple-touch-icon.png and favicon.ico");
} finally {
  await browser.close();
}
