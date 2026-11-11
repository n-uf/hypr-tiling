#!/usr/bin/env node
// Frame-sampled browser spec of pane motion (leaf motion, @n-uf/motion settle).
//
//   pnpm --filter hypr-tiling-web motion:spec [-- --url http://localhost:5301] [--tiles custom] [--shots <dir>]
//
// Needs the web app's vite dev server running (default http://localhost:5301:
// `pnpm --filter hypr-tiling-web exec vite --port 5301 --strictPort`) and the
// Chromium playwright-core finds in ~/Library/Caches/ms-playwright. NOT wired into
// CI: CI has no browser. Run it by hand after touching pane motion.
//
// It loads the dev-only scene (motion-spec.html), drives open, close, swap, a
// keyboard move, maximize / restore and two layout changes 40 ms apart, and
// samples every pane once per animation frame IN the page: the leaf motion's dev
// hook (window.__HPT_MOTION_PROBE__.onWrite) is called right after each frame is
// drawn, with the stepped time, and the page reads what is on screen then (the
// drawn rect from the frame layer or the wrapper, the layout rect from offset
// geometry, the wrapper's transform matrix). The checks from @n-uf/motion/testing
// run here in node: no overshoot, monotonic, no jumps (on stepped time), content
// never stretched (matrix a = d; a pure glide is not scaled at all) and the tempo
// (90 % within ln(10)/ω ± 25 %). With --shots it also saves a screenshot 60 ms into
// a swap and one at rest.

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const motionTesting = pathToFileURL(
  resolve(here, "../../../packages/hypr-tiling/node_modules/@n-uf/motion/dist/testing.js"),
).href;
const { checkContentScale, checkMonotonic, checkNoJumps, checkNoOvershoot, checkTempo } = await import(motionTesting);

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const baseUrl = option("url", "http://localhost:5301");
const tilesMode = option("tiles", "default");
const shotsDir = option("shots", null);

/** Installed in the page before it loads: collect one sample per pane per drawn frame. */
function installProbe() {
  const probe = { samples: [], writes: 0 };
  const offsetRect = (element) => {
    let x = 0;
    let y = 0;
    for (let node = element; node != null; node = node.offsetParent) {
      x += node.offsetLeft;
      y += node.offsetTop;
    }
    return { x, y, width: element.offsetWidth, height: element.offsetHeight };
  };
  probe.onWrite = (time) => {
    for (const wrapper of document.querySelectorAll("[data-hpt-leaf]")) {
      const frame = wrapper.querySelector(":scope > [data-hpt-leaf-frame]");
      const framed = frame != null && frame.style.display === "block";
      const box = (framed ? frame : wrapper).getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(getComputedStyle(wrapper).transform === "none" ? undefined : getComputedStyle(wrapper).transform);
      probe.samples.push({
        t: time,
        id: wrapper.getAttribute("data-hpt-leaf"),
        rect: { x: box.left + window.scrollX, y: box.top + window.scrollY, width: box.width, height: box.height },
        target: offsetRect(wrapper),
        a: matrix.a,
        d: matrix.d,
        popping: wrapper.style.opacity !== "",
      });
    }
  };
  window.__HPT_MOTION_PROBE__ = probe;
}

/**
 * The Chromium to run: MOTION_SPEC_CHROMIUM, else the newest headless shell (or
 * full Chromium) already in the playwright cache, whatever revision this
 * playwright-core would download, else playwright-core's own default.
 */
function findChromium() {
  if (process.env.MOTION_SPEC_CHROMIUM) return process.env.MOTION_SPEC_CHROMIUM;
  const cache = resolve(homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(cache)) return undefined;
  const candidates = [
    ["chromium_headless_shell-", "chrome-headless-shell-mac-arm64/chrome-headless-shell"],
    ["chromium_headless_shell-", "chrome-headless-shell-mac-x64/chrome-headless-shell"],
    ["chromium-", "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium"],
    ["chromium-", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"],
  ];
  const dirs = readdirSync(cache).sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
  for (const [prefix, binary] of candidates) {
    for (const dir of dirs) {
      const path = resolve(cache, dir, binary);
      if (dir.startsWith(prefix) && existsSync(path)) return path;
    }
  }
  return undefined;
}

// Headless Chromium paces animation frames unevenly (~25 per second, often two
// callbacks back to back), which quantizes the tempo check to 40 ms steps.
// Unlimited frames sample the motion every ~2 ms instead; --native-frames
// keeps the browser's own pacing (the rules are still checked, the tempo
// reading is just coarser).
const browser = await chromium.launch({
  headless: true,
  executablePath: findChromium(),
  args: args.includes("--native-frames") ? [] : ["--disable-frame-rate-limit"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.addInitScript(installProbe);
await page.goto(`${baseUrl}/motion-spec.html${tilesMode === "custom" ? "?tiles=custom" : ""}`);
await page.waitForFunction(() => window.__motionLab?.ready === true && document.querySelectorAll("[data-hpt-leaf]").length === 3);

const waitIdle = async () => {
  let last = -1;
  for (let i = 0; i < 100; i++) {
    const writes = await page.evaluate(() => window.__HPT_MOTION_PROBE__.writes);
    if (writes === last) return;
    last = writes;
    await page.waitForTimeout(250);
  }
  throw new Error("motion never came to rest");
};

const fmt = (n) => (n == null ? "n/a" : `${Math.round(n)} ms`);
const results = [];
let failed = false;

/** Run one scenario: `act` runs in the page; every pane that moved is checked. */
async function scenario(name, act) {
  await waitIdle();
  await page.evaluate(() => {
    window.__HPT_MOTION_PROBE__.samples = [];
  });
  await page.evaluate(act);
  await waitIdle();
  const { samples, omega } = await page.evaluate(() => ({
    samples: window.__HPT_MOTION_PROBE__.samples,
    omega: window.__HPT_MOTION_PROBE__.omega,
  }));
  const expectedT90 = (Math.log(10) / omega) * 1000;
  const byId = new Map();
  for (const sample of samples) {
    if (!byId.has(sample.id)) byId.set(sample.id, []);
    byId.get(sample.id).push(sample);
  }
  const lines = [];
  for (const [id, all] of byId) {
    const to = all[all.length - 1].target;
    // The run toward the final target: from the frame its target was set on.
    const firstFinal = all.findIndex((s) => ["x", "y", "width", "height"].every((k) => Math.abs(s.target[k] - to[k]) < 0.01));
    const run = all.slice(firstFinal);
    const from = run[0].rect;
    const moved = ["x", "y", "width", "height"].some((k) => Math.abs(from[k] - to[k]) > 0.5);
    const failures = [];
    const scales = all.map((s) => ({ t: s.t, a: s.a, d: s.d }));
    if (all.some((s) => s.popping)) {
      failures.push(...checkContentScale(scales).failures.map((f) => `pop-in: ${f}`));
      lines.push({ id, kind: "opened (pop-in)", t90: null, failures });
      continue;
    }
    failures.push(...checkContentScale(scales, { uniformOnly: false }).failures);
    failures.push(...checkNoJumps(all, omega, 1.5).failures);
    if (!moved) {
      if (failures.length > 0 || all.length > 1) lines.push({ id, kind: "still", t90: null, failures });
      continue;
    }
    failures.push(...checkNoOvershoot(run, from, to).failures);
    failures.push(...checkMonotonic(run, to).failures);
    const tempo = checkTempo(run, from, to, expectedT90, 0.25, run[0].t);
    failures.push(...tempo.failures);
    lines.push({ id, kind: "glide", t90: tempo.t90, frames: run.length, failures });
  }
  const moving = lines.filter((line) => line.kind !== "still");
  if (moving.length === 0) {
    lines.push({ id: "-", kind: "nothing moved", t90: null, failures: ["the scenario moved no pane"] });
  }
  const ok = lines.every((line) => line.failures.length === 0);
  failed ||= !ok;
  results.push({ name, ok, expectedT90, lines });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} (ω ${omega}, expected t90 ${fmt(expectedT90)})`);
  for (const line of lines) {
    console.log(`  ${line.id}: ${line.kind}${line.t90 != null ? `, t90 ${fmt(line.t90)} over ${line.frames} frames` : ""}`);
    for (const failure of line.failures.slice(0, 8)) console.log(`    ✗ ${failure}`);
  }
}

await scenario("open (delta beside charlie)", () => {
  const lab = window.__motionLab;
  const replace = (node) => {
    if (node.kind === "leaf" && node.id === "leaf-c") {
      return { kind: "split", id: "split-cd", axis: "horizontal", ratio: 0.5, first: node, second: { kind: "leaf", id: "leaf-d", tileId: "d" } };
    }
    return node.kind === "split" ? { ...node, first: replace(node.first), second: replace(node.second) } : node;
  };
  lab.setLayout(replace(lab.layout()));
});

await scenario("close (delta)", () => {
  const lab = window.__motionLab;
  const remove = (node) => {
    if (node.kind !== "split") return node;
    if (node.second.kind === "leaf" && node.second.id === "leaf-d") return node.first;
    if (node.first.kind === "leaf" && node.first.id === "leaf-d") return node.second;
    return { ...node, first: remove(node.first), second: remove(node.second) };
  };
  lab.setLayout(remove(lab.layout()));
});

await scenario("swap (alpha <-> charlie)", () => {
  window.__motionLab.dispatch({ kind: "swap-panes", sourceLeafId: "leaf-a", targetLeafId: "leaf-c" });
});

await scenario("keyboard move (move mode: aim right, commit)", async () => {
  const lab = window.__motionLab;
  lab.dispatch({ kind: "enter-move-mode", leafId: "leaf-a" });
  await new Promise((r) => requestAnimationFrame(() => r()));
  lab.dispatch({ kind: "move-aim", direction: "right" });
  await new Promise((r) => requestAnimationFrame(() => r()));
  lab.dispatch({ kind: "commit-move-mode" });
});

await scenario("maximize (bravo)", () => {
  window.__motionLab.dispatch({ kind: "maximize", leafId: "leaf-b" });
});

await scenario("restore", () => {
  window.__motionLab.dispatch({ kind: "restore" });
});

await scenario("two layout changes 40 ms apart (root ratio 0.3, then 0.65)", async () => {
  const lab = window.__motionLab;
  lab.setLayout({ ...lab.layout(), ratio: 0.3 });
  await new Promise((r) => setTimeout(r, 40));
  lab.setLayout({ ...lab.layout(), ratio: 0.65 });
});

if (shotsDir != null) {
  mkdirSync(shotsDir, { recursive: true });
  await waitIdle();
  await page.evaluate(() => {
    window.__motionLab.dispatch({ kind: "swap-panes", sourceLeafId: "leaf-a", targetLeafId: "leaf-b" });
  });
  await page.waitForTimeout(60);
  await page.screenshot({ path: resolve(shotsDir, `swap-60ms-${tilesMode}.png`) });
  await waitIdle();
  await page.screenshot({ path: resolve(shotsDir, `swap-rest-${tilesMode}.png`) });
  console.log(`screenshots in ${shotsDir}`);
}

await browser.close();
console.log(failed ? "motion spec: FAILED" : "motion spec: all scenarios passed");
process.exit(failed ? 1 : 0);
