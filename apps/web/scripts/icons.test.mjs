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

// PNG colour type byte of the IHDR chunk: 6 is RGBA (has an alpha channel), 2 is RGB (opaque).
const colorType = (png) => png[25];

test("the transparent icons keep an alpha channel; the apple icon is an opaque square", () => {
  assert.equal(colorType(publicFile("icon-192.png")), 6);
  for (const image of readIco(publicFile("favicon.ico"))) {
    assert.equal(colorType(image.png), 6);
  }
  assert.equal(colorType(publicFile("apple-touch-icon.png")), 2);
});

test("favicon.svg is the mark on its own: a square viewBox and no background rect", () => {
  const svg = publicFile("favicon.svg").toString("utf8");
  assert.match(svg, /viewBox="3 3 94 94"/);
  assert.doesNotMatch(svg, /<rect width="100" height="100"/);
});

test("buildIco rejects non-square, oversized and non-PNG input", () => {
  assert.throws(() => buildIco([]), /no images/);
  assert.throws(() => buildIco([Buffer.from("not a png at all, just text bytes")]), /not a PNG/);
});

test("index.html links the svg, png and ico icons and the apple touch icon, and no old favicon.png", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
  assert.match(html, /<link rel="icon" href="\/icon-192\.png" sizes="192x192" type="image\/png"/);
  assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="16x16 32x32 48x48"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.doesNotMatch(html, /favicon\.png/);
});
