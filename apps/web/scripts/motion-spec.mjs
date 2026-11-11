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
//
// Then it drags panes with real mouse events, in both drop previews: the lifted
// pane must be held 1:1 under the pointer on every frame (checkHeld on the rect
// the page draws), stay on top (document.elementFromPoint) from the lift until
// its drop settle ends, land exactly in the indicator's rect, settle there with
// no overshoot or jump; in snap mode the others must make room in the slot it
// snaps into. A click changes nothing; a release over the pane's own place and
// Escape put the layout back exactly. The same checks hold through a page scroll
// mid-drag, under a scaled ancestor (scale 0.8), for a group merge (the indicator
// is the group body under its tab strip), in a master/stack layout and with
// paneIdentity "slot". With --shots it saves a frame mid-drag in each preview.

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const motionTesting = pathToFileURL(
  resolve(here, "../../../packages/hypr-tiling/node_modules/@n-uf/motion/dist/testing.js"),
).href;
const { checkContentScale, checkHeld, checkMonotonic, checkNoJumps, checkNoOvershoot, checkTempo } = await import(motionTesting);

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const baseUrl = option("url", "http://localhost:5301");
const tilesMode = option("tiles", "default");
const shotsDir = option("shots", null);
// Only the drag scenarios whose name contains this text (to iterate on one).
const only = option("only", null);

/** Installed in the page before it loads: collect one sample per pane per drawn frame. */
function installProbe() {
  const probe = { samples: [], frames: [], writes: 0, client: null };
  // The pointer as the page saw it last (capture on window: before the renderer's
  // listeners), in client px; read in page px at each write, so a scroll with
  // the pointer still moves it over the page.
  window.addEventListener(
    "pointermove",
    (event) => {
      probe.client = { x: event.clientX, y: event.clientY };
    },
    { capture: true },
  );
  Object.defineProperty(probe, "pointer", {
    get: () => (probe.client == null ? null : { x: probe.client.x + window.scrollX, y: probe.client.y + window.scrollY }),
  });
  // Hit-testing for the on-top check: a live drag makes the viewport inert
  // (pointer-events: none), which elementFromPoint honours; lift that for the
  // instant of the check only.
  const hitStyle = document.createElement("style");
  hitStyle.textContent = "html[data-spec-hit] [data-hpt-viewport], html[data-spec-hit] [data-hpt-viewport] * { pointer-events: auto !important; }";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(hitStyle));
  const pageRect = (b) => ({ x: b.left + window.scrollX, y: b.top + window.scrollY, width: b.width, height: b.height });
  /** The rect a wrapper is drawn at: its frame layer while it moves, else its own box. */
  const drawnRect = (wrapper) => {
    const frame = wrapper.querySelector(":scope > [data-hpt-leaf-frame]");
    const moving = wrapper.style.transform !== "";
    return pageRect((moving && frame != null ? frame : wrapper).getBoundingClientRect());
  };
  /** Whether the raised (dragged) pane is the topmost thing at a point of it: null, a failure, or undefined (nothing raised). */
  const onTop = () => {
    const raised = document.querySelector("[data-hpt-leaf-raised]");
    if (raised == null) return undefined;
    // An empty pane (its stable content not mounted yet) has nothing to be on top with.
    if (raised.querySelector(":scope > :not([data-hpt-leaf-frame]):not([data-hpt-leaf-affordance]) *, :scope > article") == null) return null;
    const r = drawnRect(raised);
    if (r.width <= 0 || r.height <= 0) return null;
    const p = probe.pointer;
    const inside = p != null && p.x > r.x + 1 && p.x < r.x + r.width - 1 && p.y > r.y + 1 && p.y < r.y + r.height - 1;
    // A lifted pane may be held anywhere in the window; one back in the tree
    // (settling) is shown only inside the viewport, so look there.
    const lifted = raised.closest("[data-hpt-lifted]") != null;
    const vp = document.querySelector("[data-hpt-viewport]")?.getBoundingClientRect();
    const bounds =
      lifted || vp == null
        ? { left: 1, top: 1, right: window.innerWidth - 1, bottom: window.innerHeight - 1 }
        : {
            left: Math.max(1, vp.left + 1),
            top: Math.max(1, vp.top + 1),
            right: Math.min(window.innerWidth - 1, vp.right - 1),
            bottom: Math.min(window.innerHeight - 1, vp.bottom - 1),
          };
    const x = Math.min(Math.max((inside ? p.x : r.x + r.width / 2) - window.scrollX, bounds.left), bounds.right);
    const y = Math.min(Math.max((inside ? p.y : r.y + r.height / 2) - window.scrollY, bounds.top), bounds.bottom);
    document.documentElement.setAttribute("data-spec-hit", "");
    const top = document.elementFromPoint(x, y);
    document.documentElement.removeAttribute("data-spec-hit");
    if (top == null || raised.contains(top)) return null;
    const under = top.closest("[data-hpt-leaf]")?.getAttribute("data-hpt-leaf");
    return `pane ${raised.getAttribute("data-hpt-leaf")} is under ${under ? `pane ${under}` : top.tagName.toLowerCase() + (top.hasAttribute("data-hpt-drop-indicator") ? " (drop indicator)" : "")} at (${Math.round(x)}, ${Math.round(y)})`;
  };
  const offsetOf = (element) => {
    let x = 0;
    let y = 0;
    for (let node = element; node != null; node = node.offsetParent) {
      x += node.offsetLeft;
      y += node.offsetTop;
    }
    return { x, y };
  };
  /**
   * Where a pane is laid out (page px, as drawn: under a scaled ancestor the
   * layout is scaled too): its offset inside the viewport, scaled and placed at
   * the viewport's box. The lifted pane's layer is fixed (offsets stop there):
   * its layout rect is the layer's own box.
   */
  const offsetRect = (element) => {
    const layer = element.closest("[data-hpt-lifted]");
    if (layer != null) return pageRect(layer.getBoundingClientRect());
    const viewport = element.closest("[data-hpt-viewport]");
    if (viewport == null) {
      const at = offsetOf(element);
      return { x: at.x, y: at.y, width: element.offsetWidth, height: element.offsetHeight };
    }
    const box = pageRect(viewport.getBoundingClientRect());
    const scale = viewport.offsetWidth > 0 ? box.width / viewport.offsetWidth : 1;
    const at = offsetOf(element);
    const origin = offsetOf(viewport);
    return {
      x: box.x + (at.x - origin.x) * scale,
      y: box.y + (at.y - origin.y) * scale,
      width: element.offsetWidth * scale,
      height: element.offsetHeight * scale,
    };
  };
  probe.onWrite = (time) => {
    for (const wrapper of document.querySelectorAll("[data-hpt-leaf]")) {
      const frame = wrapper.querySelector(":scope > [data-hpt-leaf-frame]");
      const moving = wrapper.style.transform !== "";
      const framed = frame != null && frame.style.display === "block";
      // A moving pane is measured by its frame layer only: no frame, no sample
      // to fall back on (the spec fails on it).
      const box = (moving ? frame : wrapper)?.getBoundingClientRect() ?? null;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(wrapper).transform === "none" ? undefined : getComputedStyle(wrapper).transform);
      probe.samples.push({
        t: time,
        // Several writes can share a stepped time (a held pane is drawn on every pointer move): pair by write.
        write: probe.writes,
        id: wrapper.getAttribute("data-hpt-leaf"),
        rect: box == null ? null : { x: box.left + window.scrollX, y: box.top + window.scrollY, width: box.width, height: box.height },
        wrapperRect: (() => {
          const b = wrapper.getBoundingClientRect();
          return { x: b.left + window.scrollX, y: b.top + window.scrollY, width: b.width, height: b.height };
        })(),
        target: offsetRect(wrapper),
        a: matrix.a,
        d: matrix.d,
        popping: wrapper.style.opacity !== "",
        frameMissing: frame == null,
        frameNotDrawn: moving && !framed,
        // A stable-identity pane mounts its content one commit after its slot:
        // an empty wrapper has no chrome to draw yet.
        empty: wrapper.querySelector(":scope > :not([data-hpt-leaf-frame]):not([data-hpt-leaf-affordance]) *, :scope > article") == null,
        lifted: wrapper.closest("[data-hpt-lifted]") != null,
        raised: wrapper.hasAttribute("data-hpt-leaf-raised"),
      });
    }
    const indicator = document.querySelector("[data-hpt-drop-indicator]");
    probe.frames.push({
      t: time,
      write: probe.writes,
      pointer: probe.pointer,
      indicator: indicator == null ? null : pageRect(indicator.getBoundingClientRect()),
      onTop: onTop(),
    });
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

/** In the page, once everything rests: what leaf motion left behind (nothing, if it is right). */
function leftovers() {
  const found = [];
  for (const wrapper of document.querySelectorAll("[data-hpt-leaf]")) {
    const id = wrapper.getAttribute("data-hpt-leaf");
    for (const property of ["transform", "transform-origin", "opacity", "position", "isolation"]) {
      if (wrapper.style.getPropertyValue(property) !== "") found.push(`${id}: wrapper ${property} = ${wrapper.style.getPropertyValue(property)}`);
    }
    const frame = wrapper.querySelector(":scope > [data-hpt-leaf-frame]");
    if (frame == null) found.push(`${id}: no frame layer`);
    else if (frame.style.display !== "none") found.push(`${id}: frame layer still drawn`);
    let content = [...wrapper.children].find((child) => !child.hasAttribute("data-hpt-leaf-frame") && !child.hasAttribute("data-hpt-leaf-affordance"));
    if (content?.hasAttribute("data-hpt-pane")) content = content.firstElementChild;
    if (content != null) {
      for (const property of ["clip-path", "transition", "box-shadow", "background-color"]) {
        const value = content.style.getPropertyValue(property);
        // clip-path / transition: the scene's panes set none inline, so any value is ours.
        // box-shadow / background-color: the neutral values leaf motion writes.
        const left = property === "clip-path" || property === "transition" ? value !== "" : value === "none" || value === "transparent";
        if (left) {
          found.push(`${id}: pane ${property} = ${value}`);
        }
      }
    }
  }
  if (document.querySelector("[data-hpt-leaf-motion-active]") != null) found.push("viewport still marked as gliding");
  // A drag leaves nothing behind once everything rests.
  if (document.querySelector("[data-hpt-leaf-raised]") != null) found.push("a pane still raised");
  if (document.querySelector("[data-hpt-lifted]") != null) found.push("a pane still lifted");
  if (document.querySelector("[data-hpt-drop-indicator]") != null) found.push("the drop indicator still shown");
  return found;
}

const KEYS = ["x", "y", "width", "height"];
const near = (a, b, tolerance = 0.75) => KEYS.every((k) => Math.abs(a[k] - b[k]) <= tolerance);

/**
 * Run one scenario: `act` runs in the page. Every pane in `expect.glide` must
 * glide (a "still" one fails the scenario), every pane in `expect.open` must pop
 * in; any other pane that moves is checked too.
 */
async function scenario(name, expected, act) {
  await waitIdle();
  await page.evaluate(() => {
    window.__HPT_MOTION_PROBE__.samples = [];
  });
  await page.evaluate(act);
  await waitIdle();
  const { samples, omega, rest } = await page.evaluate(
    (leftoversSource) => ({
      samples: window.__HPT_MOTION_PROBE__.samples,
      omega: window.__HPT_MOTION_PROBE__.omega,
      rest: new Function(`return (${leftoversSource})();`)(),
    }),
    leftovers.toString(),
  );
  const expectedT90 = (Math.log(10) / omega) * 1000;
  const byId = new Map();
  for (const sample of samples) {
    if (!byId.has(sample.id)) byId.set(sample.id, []);
    byId.get(sample.id).push(sample);
  }
  const lines = [];
  for (const [id, all] of byId) {
    const failures = [];
    if (all.some((s) => s.frameMissing)) failures.push("no frame layer on the wrapper");
    const frameless = all.filter((s) => s.frameNotDrawn && !s.empty);
    if (frameless.length > 0) failures.push(`moved without its frame layer drawn (${frameless.length} of ${all.length} frames, first t=${Math.round(frameless[0].t)})`);
    const emptyFrames = all.filter((s) => s.frameNotDrawn && s.empty).length;
    if (emptyFrames > 2) failures.push(`stayed empty for ${emptyFrames} frames while moving`);
    if (failures.length > 0) {
      lines.push({ id, kind: "broken", t90: null, failures });
      continue;
    }
    const to = all[all.length - 1].target;
    const scales = all.map((s) => ({ t: s.t, a: s.a, d: s.d }));
    if (all.some((s) => s.popping)) {
      // A pop-in: a uniform scale about the pane's own centre, growing, ending exactly on its layout.
      failures.push(...checkContentScale(scales).failures.map((f) => `pop-in: ${f}`));
      // The wrapper is what pops in (laid out at its target, scaled about its centre).
      let lastScale = 0;
      for (const s of all) {
        const box = s.wrapperRect;
        const sx = box.width / s.target.width;
        const sy = box.height / s.target.height;
        if (Math.abs(sx - sy) > 0.01) failures.push(`pop-in t=${Math.round(s.t)}: drawn ${sx.toFixed(3)} × ${sy.toFixed(3)} of its layout`);
        const cx = box.x + box.width / 2 - (s.target.x + s.target.width / 2);
        const cy = box.y + box.height / 2 - (s.target.y + s.target.height / 2);
        if (Math.abs(cx) > 1 || Math.abs(cy) > 1) failures.push(`pop-in t=${Math.round(s.t)}: centre off by ${cx.toFixed(1)}, ${cy.toFixed(1)} px`);
        if (sx < lastScale - 0.001) failures.push(`pop-in t=${Math.round(s.t)}: shrank`);
        lastScale = sx;
        // Once drawn, the frame layer sits exactly on the (scaled) wrapper.
        if (s.rect != null && !s.empty && !near(s.rect, box, 1)) failures.push(`pop-in t=${Math.round(s.t)}: frame layer off the pane`);
      }
      const last = all[all.length - 1];
      // Fully open: on its layout (offset sizes are whole pixels, hence 1 px), opacity cleared.
      if (!near(last.wrapperRect, to, 1) || last.popping) failures.push("pop-in did not end on its layout, fully open");
      lines.push({ id, kind: "opened (pop-in)", t90: null, failures });
      continue;
    }
    // The run toward the final target: from the frame its target was set on.
    const firstFinal = all.findIndex((s) => KEYS.every((k) => Math.abs(s.target[k] - to[k]) < 0.01));
    const run = all.slice(firstFinal);
    const from = run[0].rect;
    const moved = KEYS.some((k) => Math.abs(from[k] - to[k]) > 0.5);
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
  for (const id of expected.glide ?? []) {
    if (!lines.some((line) => line.id === id && line.kind === "glide")) {
      lines.push({ id, kind: "expected to glide", t90: null, failures: [`${id} did not glide`] });
    }
  }
  for (const id of expected.open ?? []) {
    if (!lines.some((line) => line.id === id && line.kind === "opened (pop-in)")) {
      lines.push({ id, kind: "expected to pop in", t90: null, failures: [`${id} did not pop in`] });
    }
  }
  if (rest.length > 0) {
    lines.push({ id: "-", kind: "at rest", t90: null, failures: rest });
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

await scenario("open (delta beside charlie)", { glide: ["c"], open: ["d"] }, () => {
  const lab = window.__motionLab;
  const replace = (node) => {
    if (node.kind === "leaf" && node.id === "leaf-c") {
      return { kind: "split", id: "split-cd", axis: "horizontal", ratio: 0.5, first: node, second: { kind: "leaf", id: "leaf-d", tileId: "d" } };
    }
    return node.kind === "split" ? { ...node, first: replace(node.first), second: replace(node.second) } : node;
  };
  lab.setLayout(replace(lab.layout()));
});

await scenario("close (delta)", { glide: ["c"] }, () => {
  const lab = window.__motionLab;
  const remove = (node) => {
    if (node.kind !== "split") return node;
    if (node.second.kind === "leaf" && node.second.id === "leaf-d") return node.first;
    if (node.first.kind === "leaf" && node.first.id === "leaf-d") return node.second;
    return { ...node, first: remove(node.first), second: remove(node.second) };
  };
  lab.setLayout(remove(lab.layout()));
});

await scenario("swap (alpha <-> charlie)", { glide: ["a", "c"] }, () => {
  window.__motionLab.dispatch({ kind: "swap-panes", sourceLeafId: "leaf-a", targetLeafId: "leaf-c" });
});

await scenario("keyboard move (move mode: aim right, commit)", { glide: ["a", "b", "c"] }, async () => {
  const lab = window.__motionLab;
  lab.dispatch({ kind: "enter-move-mode", leafId: "leaf-a" });
  await new Promise((r) => requestAnimationFrame(() => r()));
  lab.dispatch({ kind: "move-aim", direction: "right" });
  await new Promise((r) => requestAnimationFrame(() => r()));
  lab.dispatch({ kind: "commit-move-mode" });
});

await scenario("maximize (bravo)", { glide: ["b"] }, () => {
  window.__motionLab.dispatch({ kind: "maximize", leafId: "leaf-b" });
});

await scenario("restore (bravo glides back, the others pop in)", { glide: ["b"], open: ["a", "c"] }, () => {
  window.__motionLab.dispatch({ kind: "restore" });
});

await scenario("two layout changes 40 ms apart (root ratio 0.3, then 0.65)", { glide: ["a", "b", "c"] }, async () => {
  const lab = window.__motionLab;
  lab.setLayout({ ...lab.layout(), ratio: 0.3 });
  await new Promise((r) => setTimeout(r, 40));
  lab.setLayout({ ...lab.layout(), ratio: 0.65 });
});

// ── Drags (real mouse events) ───────────────────────────────────────────────

const INITIAL = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "leaf-a", tileId: "a" },
  second: {
    kind: "split",
    id: "right",
    axis: "vertical",
    ratio: 0.5,
    first: { kind: "leaf", id: "leaf-b", tileId: "b" },
    second: { kind: "leaf", id: "leaf-c", tileId: "c" },
  },
};

const nextFrame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));

/** Every pane's box at rest (page px, as drawn: a scaled ancestor scales it). */
const restRects = () =>
  page.evaluate(() => {
    const out = {};
    for (const wrapper of document.querySelectorAll("[data-hpt-leaf]")) {
      const b = wrapper.getBoundingClientRect();
      out[wrapper.getAttribute("data-hpt-leaf")] = { x: b.left + window.scrollX, y: b.top + window.scrollY, width: b.width, height: b.height };
    }
    return out;
  });

/** Move the mouse along a straight line in `steps`, one animation frame per step. */
async function glideMouse(from, to, steps) {
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await nextFrame();
  }
}

const overlapArea = (a, b) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

const rectText = (r) => (r == null ? "none" : `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`);

/**
 * One drag of pane `tileId`: press on its header, glide to `to` (stage 1), run
 * `during` (screenshots, Escape), release, wait for rest; then check what the
 * scenario expects. `expect.commit` false: the layout must come back unchanged.
 *
 * `start` (from the rest rects) presses somewhere other than the header, e.g. a
 * tab; the pane is then held where `homeTileId`'s pane was, by the offset of
 * the press from it. `expect.landing: "group"`: the pane lands in a group whose
 * whole slot (strip included) the indicator marks; `expect.groupFrame`: the
 * held pane is a group held by its frame (its strip rides on the pane);
 * `expect.merge`: the pane joins a group, so snap makes no room for it;
 * `via(rest)` returns points the pointer passes before `to`: the drop depends
 * only on where the pointer is released, so another path to the same point
 * must commit the same layout (checked by the path variants below);
 * `expect.crossesSlots`: the path crosses slots that put a pane in a group and
 * slots that do not, so a pane the preview mounts afresh may pop in on the way
 * (its jump check starts anew);
 * `expect.after(layout)` returns failures about the committed layout.
 */
async function dragScenario(name, { preview, tileId, homeTileId, start: startAt, to, via, steps = 30, nearStart = false, layout = INITIAL, setup, teardown, during, expect }) {
  if (only != null && !name.includes(only)) return;
  await page.evaluate((next) => window.__motionLab.setLayout(next), layout);
  await page.evaluate((p) => window.__motionLab.setDragPreview(p), preview);
  await waitIdle();
  if (setup != null) {
    await setup();
    await waitIdle();
  }
  const before = await page.evaluate(() => JSON.stringify(window.__motionLab.layout()));
  const rest = await restRects();
  const home = rest[homeTileId ?? tileId];
  const start = startAt != null ? await startAt(rest) : { x: home.x + 60, y: home.y + 14 };
  const grab = { x: start.x - home.x, y: start.y - home.y };
  const target = typeof to === "function" ? await to(rest) : to;
  await page.mouse.move(start.x, start.y);
  await page.evaluate(() => {
    window.__HPT_MOTION_PROBE__.samples = [];
    window.__HPT_MOTION_PROBE__.frames = [];
  });
  await page.mouse.down();
  // `via(rest)`: points the pointer passes first (the drop must not depend on them).
  let from = start;
  for (const point of via != null ? await via(rest) : []) {
    await glideMouse(from, point, Math.ceil(steps / 2));
    from = point;
  }
  await glideMouse(from, target, steps);
  await page.waitForTimeout(250);
  await nextFrame();
  // A group held by its frame: the lifted layer holds the group, and its strip
  // sits on the pane's edge (it rides with the pane, never left behind).
  const frameCheck =
    expect.groupFrame !== true
      ? null
      : await page.evaluate((id) => {
          const pane = document.querySelector(`[data-hpt-lifted] [data-hpt-leaf="${id}"]`);
          const strip = document.querySelector("[data-hpt-lifted] [data-group-id] [data-hpt-group-tab-placement]");
          if (pane == null || strip == null) return ["the lifted layer does not hold the group (pane and strip)"];
          const frame = pane.querySelector(":scope > [data-hpt-leaf-frame]");
          const p = (pane.style.transform !== "" && frame != null ? frame : pane).getBoundingClientRect();
          const s = strip.getBoundingClientRect();
          const failures = [];
          if (Math.abs(s.bottom - p.top) > 1.5) failures.push(`strip bottom ${Math.round(s.bottom)} is not on the pane's top ${Math.round(p.top)}`);
          if (Math.abs(s.left - p.left) > 1.5) failures.push(`strip left ${Math.round(s.left)} is not the pane's left ${Math.round(p.left)}`);
          return failures;
        }, tileId);
  if (during != null) await during();
  const releaseT = await page.evaluate(() => window.__HPT_MOTION_PROBE__.time ?? 0);
  await page.mouse.up();
  await waitIdle();
  const { samples, frames, omega, rest: left } = await page.evaluate(
    (leftoversSource) => ({
      samples: window.__HPT_MOTION_PROBE__.samples,
      frames: window.__HPT_MOTION_PROBE__.frames,
      omega: window.__HPT_MOTION_PROBE__.omega,
      rest: new Function(`return (${leftoversSource})();`)(),
    }),
    leftovers.toString(),
  );
  const after = await page.evaluate(() => JSON.stringify(window.__motionLab.layout()));
  const finalRects = await restRects();
  // The whole slot of the group the pane rests in (strip included), if any.
  const finalGroupRect = await page.evaluate((id) => {
    const group = document.querySelector(`[data-hpt-leaf="${id}"]`)?.closest("[data-group-id]");
    if (group == null) return null;
    const b = group.getBoundingClientRect();
    return { x: b.left + window.scrollX, y: b.top + window.scrollY, width: b.width, height: b.height };
  }, tileId);
  if (teardown != null) {
    await teardown();
    await waitIdle();
  }
  const lines = [];
  const add = (kind, failures, note = "") => lines.push({ id: tileId, kind, failures, note });

  const mine = samples.filter((s) => s.id === tileId);
  const liftedSamples = mine.filter((s) => s.lifted);
  const others = new Map();
  for (const s of samples) {
    if (s.id === tileId) continue;
    if (!others.has(s.id)) others.set(s.id, []);
    others.get(s.id).push(s);
  }

  if (expect.lift === false) {
    add("click", [
      ...(liftedSamples.length > 0 ? [`lifted on a click (${liftedSamples.length} frames)`] : []),
      ...(samples.some((s) => s.wrapperRect && s.target && !near(s.wrapperRect, s.target, 0.75)) ? ["a pane moved on a click"] : []),
      ...(after !== before ? ["the layout changed on a click"] : []),
    ]);
  } else {
    // Lifted: the pane left the tree for the pointer.
    if (liftedSamples.length === 0) add("lift", ["the pane was never lifted"]);
    if (frameCheck != null) add("held as a group", frameCheck);
    // Held 1:1 (indicator): the drawn rect is pointer − grab, at the lift size, on every frame it is held.
    if (preview === "indicator") {
      const held = [];
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        // A pane never shown before (a torn-off inactive tab) mounts its
        // content a commit after its slot: nothing is drawn to measure yet.
        if (s.id !== tileId || !s.lifted || s.rect == null || s.empty || s.frameNotDrawn) continue;
        const frame = frames.find((f) => f.write === s.write) ?? null;
        const p = frame?.pointer;
        if (p == null) continue;
        held.push({ t: s.t, rect: s.rect, expected: { x: p.x - grab.x, y: p.y - grab.y, width: home.width, height: home.height } });
      }
      const result = checkHeld(held, 1.5);
      add("held 1:1", held.length < 5 ? [`only ${held.length} held frames sampled`] : result.failures, `${held.length} frames`);
    }
    // On top: from the lift until its drop settle ends, nothing covers it; and it comes down after.
    const liftedFrames = frames.filter((f) => f.onTop !== undefined);
    const covered = liftedFrames.filter((f) => f.onTop != null).map((f) => `t=${Math.round(f.t)} ${f.onTop}`);
    const firstLiftT = liftedSamples[0]?.t ?? Infinity;
    const raisedGap = mine.filter((s) => s.t >= firstLiftT && !s.raised && s.wrapperRect && s.target && !near(s.rect ?? s.wrapperRect, s.target, 0.75));
    add(
      "on top",
      [
        ...covered,
        ...(liftedFrames.length === 0 ? ["never raised"] : []),
        ...raisedGap.slice(0, 3).map((s) => `t=${Math.round(s.t)} came down before its drop settled`),
        ...(left.some((l) => l.includes("raised")) ? ["still raised at rest"] : []),
      ],
      `${liftedFrames.length} frames`,
    );
    // The drop: from where it is drawn into its slot, no overshoot, monotonic, no jumps.
    const finalTarget = mine.at(-1)?.target ?? null;
    const lastLifted = mine.reduce((index, s, i) => (s.lifted ? i : index), -1);
    // From the frame its final target was set (after the drop, or after its snap into that slot).
    const sameTarget = (s) => finalTarget != null && KEYS.every((k) => Math.abs(s.target[k] - finalTarget[k]) < 0.01);
    let firstFinal = mine.length;
    for (let i = mine.length - 1; i > lastLifted && sameTarget(mine[i]); i--) firstFinal = i;
    const settleRun = mine.slice(firstFinal).filter((s) => s.rect != null);
    if (finalTarget != null && settleRun.length > 0) {
      const from = settleRun[0].rect;
      add("drop settle", [
        ...checkNoOvershoot(settleRun, from, finalTarget).failures,
        ...checkMonotonic(settleRun, finalTarget).failures,
        ...checkNoJumps(settleRun, omega, 1.5).failures,
      ], `${settleRun.length} frames from ${rectText(from)} to ${rectText(finalTarget)}`);
    }
    // The others: close the gap at the lift, move (or not) at the drop, never jump or overshoot.
    for (const [id, all] of others) {
      const to = all.at(-1).target;
      // From the frame its final target was set for good (a pane that left its
      // rest place and came back to it is on its way back, not at rest).
      let firstFinal = all.length - 1;
      while (firstFinal > 0 && KEYS.every((k) => Math.abs(all[firstFinal - 1].target[k] - to[k]) < 0.01)) firstFinal--;
      const run = all.slice(firstFinal).filter((s) => s.rect != null && !s.empty);
      // A pane the preview mounts afresh (an empty wrapper: it changed place in
      // the tree, e.g. from a split into a group) pops in: its jump check starts
      // anew with it. Only for a drag that crosses slots of both kinds.
      const runs = [[]];
      for (const s of all) {
        if (s.rect == null) continue;
        if (expect.crossesSlots === true && s.empty) runs.push([]);
        else runs.at(-1).push(s);
      }
      const failures = runs.flatMap((samples) => checkNoJumps(samples, omega, 1.5).failures.map((f) => `${id}: ${f}`));
      if (run.length > 1) {
        failures.push(...checkNoOvershoot(run, run[0].rect, to).failures.map((f) => `${id}: ${f}`));
        failures.push(...checkMonotonic(run, to).failures.map((f) => `${id}: ${f}`));
      }
      lines.push({ id, kind: "others glide", failures, note: "" });
    }
    if (expect.commit) {
      if (after === before) add("commit", ["the drop committed nothing"]);
      if (expect.group) {
        const inGroup = (node) =>
          node.kind === "group" ? node.members.some((m) => m.tileId === tileId) : node.kind === "split" ? inGroup(node.first) || inGroup(node.second) : false;
        add("group merge", inGroup(JSON.parse(after)) ? [] : [`pane ${tileId} did not end up in a group`]);
      }
      if (expect.after != null) {
        add("layout", expect.after(JSON.parse(after)));
      }
      if (preview === "indicator") {
        const indicated = [...frames].reverse().find((f) => f.indicator != null && f.t <= releaseT)?.indicator ?? null;
        const landed = expect.landing === "group" ? (finalGroupRect ?? finalRects[tileId]) : finalRects[tileId];
        add(
          "indicator == landing",
          indicated == null ? ["no drop indicator before the release"] : near(indicated, landed, 1) ? [] : [`indicator ${rectText(indicated)} but the pane landed at ${rectText(landed)}`],
          `${rectText(indicated)} → ${rectText(landed)}`,
        );
      }
      if (preview === "snap" && expect.merge !== true) {
        // (A merge makes no room: the pane lands inside the group it joins.)
        // Snapped: the pane sat in the tree at its slot, and once the others had
        // settled none of them overlapped that slot (they made room).
        const snapped = mine.filter((s) => s.t <= releaseT && !s.lifted && s.raised);
        const slot = snapped.at(-1)?.target ?? null;
        const failures = [];
        if (slot == null) failures.push("never snapped into a slot");
        else {
          if (!near(slot, finalRects[tileId], 1)) failures.push(`snapped into ${rectText(slot)} but landed at ${rectText(finalRects[tileId])}`);
          for (const [id, all] of others) {
            const atSnap = all.filter((s) => s.t <= releaseT).at(-1);
            if (atSnap && overlapArea(atSnap.target, slot) > 1) failures.push(`pane ${id} (${rectText(atSnap.target)}) still in the slot ${rectText(slot)}`);
          }
        }
        add("snap makes room", failures, rectText(slot));
      }
    } else if (after !== before) {
      add("home", ["the layout changed; it should have come back as it was at the lift"]);
    } else {
      add("home", [], "layout back as it was");
    }
  }
  if (left.length > 0) lines.push({ id: "-", kind: "at rest", failures: left, note: "" });
  const ok = lines.every((line) => line.failures.length === 0);
  failed ||= !ok;
  results.push({ name, ok, lines });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} [${preview}]`);
  for (const line of lines) {
    console.log(`  ${line.id}: ${line.kind}${line.note ? ` (${line.note})` : ""}`);
    for (const failure of line.failures.slice(0, 8)) console.log(`    ✗ ${failure}`);
  }
}

/** Over bravo's lower edge (bravo fills the right column, the whole width once alpha is lifted). */
const overBravoBottom = (rest) => ({ x: rest.b.x + rest.b.width * 0.5 - 300, y: rest.b.y + rest.b.height * 0.9 });

for (const preview of ["indicator", "snap"]) {
  await dragScenario("drag alpha onto bravo's lower edge", {
    preview,
    tileId: "a",
    to: overBravoBottom,
    expect: { commit: true },
    during: async () => {
      if (shotsDir != null) {
        mkdirSync(shotsDir, { recursive: true });
        await page.screenshot({ path: resolve(shotsDir, `drag-${preview}-${tilesMode}.png`) });
      }
    },
  });
}
await dragScenario("drag charlie onto alpha (swap)", {
  preview: "indicator",
  tileId: "c",
  to: (rest) => ({ x: rest.a.x + rest.a.width * 0.5, y: rest.a.y + rest.a.height * 0.5 }),
  expect: { commit: true },
});
await dragScenario("click (below the threshold) is a no-op", {
  preview: "indicator",
  tileId: "a",
  to: (rest) => ({ x: rest.a.x + 62, y: rest.a.y + 15 }),
  steps: 2,
  expect: { lift: false },
});
await dragScenario("release over its own place restores the layout", {
  preview: "indicator",
  tileId: "a",
  to: (rest) => ({ x: rest.a.x + 200, y: rest.a.y + 260 }),
  expect: { commit: false },
});
await dragScenario("Escape restores the layout", {
  preview: "snap",
  tileId: "a",
  to: overBravoBottom,
  expect: { commit: false },
  during: async () => {
    await page.keyboard.press("Escape");
    await nextFrame();
  },
});

// The page scrolls under a held pane (the pointer still): the pane stays under
// the pointer, and the drop still lands where the indicator said.
let scrollRest = null;
await dragScenario("page scroll mid-drag, then drop on bravo's lower edge", {
  preview: "indicator",
  tileId: "a",
  to: (rest) => ({ x: rest.b.x + 120, y: rest.b.y + 120 }),
  setup: async () => {
    await page.evaluate(() => {
      const root = document.getElementById("root");
      root.dataset.specStyle = root.getAttribute("style") ?? "";
      root.style.height = "900px";
      for (const element of [document.documentElement, document.body]) {
        element.dataset.specStyle = element.getAttribute("style") ?? "";
        element.style.height = "auto";
        element.style.overflow = "visible";
      }
      const spacer = document.createElement("div");
      spacer.id = "spec-scroll-spacer";
      spacer.style.height = "600px";
      document.body.appendChild(spacer);
      window.scrollTo(0, 0);
    });
    scrollRest = await restRects();
  },
  during: async () => {
    const from = { x: scrollRest.b.x + 120, y: scrollRest.b.y + 120 };
    await page.evaluate(() => window.scrollBy(0, 150));
    await nextFrame();
    await nextFrame();
    const scrollY = await page.evaluate(() => window.scrollY);
    if (scrollY < 100) throw new Error(`the page did not scroll (scrollY ${scrollY})`);
    const target = overBravoBottom(scrollRest);
    await glideMouse(from, { x: target.x, y: target.y - scrollY }, 20);
    await page.waitForTimeout(250);
    await nextFrame();
  },
  teardown: async () => {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.getElementById("spec-scroll-spacer")?.remove();
      for (const element of [document.getElementById("root"), document.documentElement, document.body]) {
        element.setAttribute("style", element.dataset.specStyle ?? "");
        delete element.dataset.specStyle;
      }
    });
  },
  expect: { commit: true },
});

// A scaled ancestor (the host root at scale 0.8): client px are not layout px;
// the pane is still held 1:1 under the pointer and lands where indicated.
await dragScenario("drag under a scaled ancestor (scale 0.8)", {
  preview: "indicator",
  tileId: "a",
  // Right of alpha's own (scaled) place, so the release is a drop, not home.
  to: (rest) => ({ x: rest.b.x + rest.b.width * 0.5, y: rest.b.y + rest.b.height * 0.9 }),
  setup: async () => {
    await page.evaluate(() => {
      const root = document.getElementById("root");
      root.style.transform = "scale(0.8)";
      root.style.transformOrigin = "0 0";
    });
  },
  teardown: async () => {
    await page.evaluate(() => {
      const root = document.getElementById("root");
      root.style.transform = "";
      root.style.transformOrigin = "";
    });
  },
  expect: { commit: true },
});

// alpha | group-bc [bravo*, charlie]
const GROUPED = {
  ...INITIAL,
  second: {
    kind: "group",
    id: "group-bc",
    members: [
      { kind: "leaf", id: "leaf-b", tileId: "b" },
      { kind: "leaf", id: "leaf-c", tileId: "c" },
    ],
    activeMemberId: "leaf-b",
  },
};

/** The centre-right of a group's tab strip (page px), at rest. */
const stripPoint = (groupId) =>
  page.evaluate((id) => {
    const strip = document.querySelector(`[data-group-id="${id}"] [data-hpt-group-tab-placement]`);
    if (strip == null) throw new Error(`no tab strip for ${id}`);
    const b = strip.getBoundingClientRect();
    return { x: b.left + b.width * 0.75 + window.scrollX, y: b.top + b.height / 2 + window.scrollY };
  }, groupId);

// A group merge; the indicator is the rect the pane lands in (the group body).
// Custom tiles make their header a group drop target: charlie onto bravo's
// title bar groups them. The built-in pane has none, so there alpha goes onto
// the tab strip of an existing bravo + charlie group.
if (tilesMode === "custom") {
  await dragScenario("drag charlie's header onto bravo's title bar (group merge)", {
    preview: "indicator",
    tileId: "c",
    to: (rest) => ({ x: rest.b.x + rest.b.width * 0.5, y: rest.b.y + 14 }),
    expect: { commit: true, group: true },
  });
} else {
  await dragScenario("drag alpha onto the bravo + charlie tab strip (group merge)", {
    preview: "indicator",
    tileId: "a",
    layout: GROUPED,
    to: () =>
      page.evaluate(() => {
        const strip = document.querySelector("[data-hpt-group-tab-placement]");
        if (strip == null) throw new Error("no group tab strip");
        const b = strip.getBoundingClientRect();
        return { x: b.left + b.width * 0.75 + window.scrollX, y: b.top + b.height / 2 + window.scrollY };
      }),
    expect: { commit: true, group: true },
  });
}

// A master/stack layout: alpha is the master, bravo and charlie the stack.
const MASTER = { ...INITIAL, layoutMode: "master", masterCount: 1 };
await dragScenario("master/stack: drag charlie onto alpha's lower edge", {
  preview: "indicator",
  tileId: "c",
  layout: MASTER,
  to: (rest) => ({ x: rest.a.x + rest.a.width * 0.5, y: rest.a.y + rest.a.height * 0.92 }),
  expect: { commit: true },
});

// Tab groups move as one. The active pane's title bar lifts the whole group:
// held 1:1 by its frame (the strip rides on the pane), on top, the others
// close its slot, and it lands as the same group where the indicator was.
const groupBcIntact = (layout) => {
  const find = (node) => (node.kind === "group" ? (node.id === "group-bc" ? node : null) : node.kind === "split" ? find(node.first) ?? find(node.second) : null);
  const group = find(layout);
  if (group == null) return ["group-bc is gone"];
  const members = group.members.map((m) => m.id).join(",");
  return [
    ...(members !== "leaf-b,leaf-c" ? [`members ${members}, expected leaf-b,leaf-c`] : []),
    ...(group.activeMemberId !== "leaf-b" ? [`active tab ${group.activeMemberId}, expected leaf-b`] : []),
  ];
};
// Under both drop previews: snap to slot is the web default.
for (const preview of ["indicator", "snap"]) {
  await dragScenario("drag the bravo + charlie group by its title bar onto alpha's lower edge", {
    preview,
    tileId: "b",
    layout: GROUPED,
    to: (rest) => ({ x: rest.a.x + rest.a.width * 0.5, y: rest.a.y + rest.a.height * 0.9 }),
    // Under snap the group sits in the tree at its slot (no lifted layer to hold by its frame).
    expect: { commit: true, landing: "group", groupFrame: preview === "indicator", crossesSlots: preview === "snap", after: groupBcIntact },
  });
  // The same release point by another path: over alpha's title bar first (a
  // merge slot with custom panes), then straight down. The drop is the one
  // under the pointer when it is released, not the first slot it settled into.
  await dragScenario("drag the bravo + charlie group onto alpha's lower edge, over alpha's title bar first", {
    preview,
    tileId: "b",
    layout: GROUPED,
    to: (rest) => ({ x: rest.a.x + rest.a.width * 0.5, y: rest.a.y + rest.a.height * 0.9 }),
    via: (rest) => [{ x: rest.a.x + rest.a.width * 0.5, y: rest.a.y + 14 }],
    expect: { commit: true, landing: "group", groupFrame: preview === "indicator", crossesSlots: preview === "snap", after: groupBcIntact },
  });
}
await dragScenario("drag the bravo + charlie group by its strip, Escape puts it back", {
  preview: "indicator",
  tileId: "b",
  layout: GROUPED,
  start: () => stripPoint("group-bc"),
  to: (rest) => ({ x: rest.a.x + rest.a.width * 0.5, y: rest.a.y + rest.a.height * 0.5 }),
  expect: { commit: false, groupFrame: true },
  during: async () => {
    await page.keyboard.press("Escape");
    await nextFrame();
  },
});

// A tab tears off just that pane: charlie (an inactive tab) is held where the
// group's pane is, and dropped beside alpha; bravo is left alone (a group of
// one is its bare pane).
await dragScenario("tear charlie's tab off onto alpha's lower edge", {
  preview: "indicator",
  tileId: "c",
  homeTileId: "b",
  layout: GROUPED,
  start: () =>
    page.evaluate(() => {
      const tab = document.querySelector('[data-group-id="group-bc"] [data-member-index="1"]');
      if (tab == null) throw new Error("no charlie tab");
      const b = tab.getBoundingClientRect();
      return { x: b.left + b.width / 2 + window.scrollX, y: b.top + b.height / 2 + window.scrollY };
    }),
  to: (rest) => ({ x: rest.a.x + rest.a.width * 0.5, y: rest.a.y + rest.a.height * 0.9 }),
  expect: {
    commit: true,
    after: (layout) => {
      const groups = [];
      const tileIds = [];
      let beside = false;
      const walk = (node) => {
        if (node.kind === "group") {
          groups.push(node);
          for (const member of node.members) tileIds.push(member.tileId);
        } else if (node.kind === "leaf") {
          tileIds.push(node.tileId);
        } else {
          // Charlie sits beside alpha: the two are the children of one split (alpha first: its lower edge).
          if (node.first.kind === "leaf" && node.first.tileId === "a" && node.second.kind === "leaf" && node.second.tileId === "c") beside = true;
          walk(node.first);
          walk(node.second);
        }
      };
      walk(layout);
      const sorted = [...tileIds].sort().join(",");
      return [
        ...(groups.length === 0 ? [] : [`groups left: ${groups.map((g) => g.id).join(", ")}`]),
        ...(sorted === "a,b,c" ? [] : [`panes ${sorted}, expected exactly a,b,c (one pane lost or duplicated)`]),
        ...(beside ? [] : ["charlie is not beside alpha (alpha first, charlie second)"]),
      ];
    },
  },
});

// A whole group dropped on another pane's title bar (custom tiles) or group
// strip (built-in panes) merges: every pane joins as a tab, its active tab active.
const TWO_GROUPS = {
  ...GROUPED,
  first: {
    kind: "group",
    id: "group-ad",
    members: [
      { kind: "leaf", id: "leaf-a", tileId: "a" },
      { kind: "leaf", id: "leaf-d", tileId: "d" },
    ],
    activeMemberId: "leaf-a",
  },
};
// The drop depends only on where the pointer is released: the same merge by a
// straight path, from below (over the target's lower edge first) and from the
// side (over its left edge first) commits the same members in the same order.
const mergedOrder = { order: null };
const mergePaths = [
  { label: "", via: undefined },
  { label: ", from below", via: (rest) => [{ x: rest.a.x + rest.a.width * 0.5, y: rest.a.y + rest.a.height * 0.9 }] },
  { label: ", from the left edge", via: (rest) => [{ x: rest.a.x + 8, y: rest.a.y + rest.a.height * 0.5 }] },
];
for (const preview of ["indicator", "snap"]) {
  for (const path of mergePaths) {
    await dragScenario(
      `${tilesMode === "custom" ? "merge the bravo + charlie group into alpha by its title bar" : "merge the bravo + charlie group into the alpha + delta group by its strip"}${path.label}`,
      {
        preview,
        tileId: "b",
        layout: tilesMode === "custom" ? GROUPED : TWO_GROUPS,
        to: tilesMode === "custom" ? (rest) => ({ x: rest.a.x + rest.a.width * 0.5, y: rest.a.y + 14 }) : () => stripPoint("group-ad"),
        via: path.via,
        expect: {
          commit: true,
          merge: true,
          crossesSlots: preview === "snap",
          landing: "group",
          groupFrame: preview === "indicator",
          after: (layout) => {
            const find = (node) => (node.kind === "group" ? (node.members.some((m) => m.id === "leaf-b") ? node : null) : node.kind === "split" ? find(node.first) ?? find(node.second) : null);
            const group = find(layout);
            const ids = group?.members.map((m) => m.id) ?? [];
            const expected = tilesMode === "custom" ? ["leaf-a", "leaf-b", "leaf-c"] : ["leaf-a", "leaf-d", "leaf-b", "leaf-c"];
            const order = ids.join(",");
            mergedOrder.order ??= order;
            return [
              ...(expected.every((id) => ids.includes(id)) && ids.length === expected.length ? [] : [`merged members ${ids.join(",")}, expected ${expected.join(",")}`]),
              ...(group?.activeMemberId === "leaf-b" ? [] : [`active tab ${group?.activeMemberId}, expected leaf-b`]),
              ...(order === mergedOrder.order ? [] : [`tab order ${order}, but another path to the same point gave ${mergedOrder.order}`]),
            ];
          },
        },
      },
    );
  }
}
await page.evaluate((layout) => window.__motionLab.setLayout(layout), INITIAL);
await waitIdle();
await page.evaluate(() => window.__motionLab.setDragPreview("indicator"));

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

// paneIdentity "slot" (the server-rendered default): the lifted pane is a
// fresh mount, held and dropped the same way.
await page.goto(`${baseUrl}/motion-spec.html?identity=slot${tilesMode === "custom" ? "&tiles=custom" : ""}`);
await page.waitForFunction(() => window.__motionLab?.ready === true && document.querySelectorAll("[data-hpt-leaf]").length === 3);
await waitIdle();
await dragScenario("slot identity: drag alpha onto bravo's lower edge", {
  preview: "indicator",
  tileId: "a",
  to: overBravoBottom,
  expect: { commit: true },
});
await dragScenario("slot identity: Escape restores the layout", {
  preview: "snap",
  tileId: "a",
  to: overBravoBottom,
  expect: { commit: false },
  during: async () => {
    await page.keyboard.press("Escape");
    await nextFrame();
  },
});

await browser.close();
console.log(failed ? "motion spec: FAILED" : "motion spec: all scenarios passed");
process.exit(failed ? 1 : 0);
