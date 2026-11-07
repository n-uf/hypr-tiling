// The committed site icons: right sizes, a valid .ico with 16, 32 and 48 inside, and the
// head links in index.html that point at them. (render-icons.mjs makes the files; it needs Chrome, this does not.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildIco, pngSize, readIco } from "./lib/ico.mjs";

const publicFile = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url));

test("icon-192.png is 192x192 and apple-touch-icon.png is 180x180", () => {
  assert.deepEqual(pngSize(publicFile("icon-192.png")), { width: 192, height: 192 });
  assert.deepEqual(pngSize(publicFile("apple-touch-icon.png")), { width: 180, height: 180 });
});

test("favicon.ico holds 16, 32 and 48 pixel PNGs", () => {
  const images = readIco(publicFile("favicon.ico"));
  assert.deepEqual(
    images.map((image) => [image.declaredWidth, image.width, image.height]),
    [
      [16, 16, 16],
      [32, 32, 32],
      [48, 48, 48],
    ],
  );
});

test("favicon.svg is square (100x100 viewBox)", () => {
  assert.match(publicFile("favicon.svg").toString("utf8"), /viewBox="0 0 100 100"/);
});

test("buildIco rejects non-square, oversized and non-PNG input", () => {
  assert.throws(() => buildIco([]), /no images/);
  assert.throws(() => buildIco([Buffer.from("not a png at all, just text bytes")]), /not a PNG/);
});

test("index.html links the svg, png and ico icons and the apple touch icon, and no old favicon.png", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
  assert.match(html, /<link rel="icon" href="\/icon-192\.png" sizes="192x192" type="image\/png"/);
  assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="48x48"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.doesNotMatch(html, /favicon\.png/);
});
