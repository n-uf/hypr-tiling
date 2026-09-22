// Child-process probe for __tests__/engine-entry-react-free.test.ts.
//
// Loads the BUILT engine entry (`dist/engine.mjs` via import, `dist/engine.cjs`
// via require) in a bare Node process where `react` / `react-dom` cannot be
// resolved (ESM: module-customization hooks; CJS: a `Module._resolveFilename`
// guard). Prints a single JSON line the test asserts on. Any React edge in the
// engine bundle surfaces here as a resolution error instead of the consumer's
// `createContext is not a function`.

import Module, { createRequire, register } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "..", "..", "dist");
const REACT_SPECIFIER = /^react(-dom)?(\/.*)?$/;

register("./forbid-react-resolve-hooks.mjs", import.meta.url);

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function guardedResolveFilename(request, parent, ...rest) {
  if (REACT_SPECIFIER.test(request)) {
    throw new Error(
      `engine-entry-react-free: "${request}" was required from ${parent?.filename ?? "<unknown>"} — the ./engine entry must not require React.`,
    );
  }
  return originalResolveFilename.call(this, request, parent, ...rest);
};

/** Shape the parent test asserts on. */
const report = {
  ok: false,
  error: null,
  esm: null,
  cjs: null,
};

function probe(namespace) {
  return {
    exportCount: Object.keys(namespace).length,
    accentHueCyanText: namespace.accentHue("cyan").text,
    baselineDragHopDurationMs: namespace.BASELINE_DRAG_HOP_DURATION_MS,
    instantDragDurationMs: namespace.INSTANT_DRAG_DURATION_MS,
    mainWorkspaceId: namespace.TILING_MAIN_WORKSPACE_ID,
    hasBuildDefaultDwindleLayout:
      typeof namespace.buildDefaultDwindleLayout === "function",
  };
}

try {
  const esm = await import(pathToFileURL(resolve(distDir, "engine.mjs")).href);
  report.esm = probe(esm);
  const require = createRequire(import.meta.url);
  const cjs = require(resolve(distDir, "engine.cjs"));
  report.cjs = probe(cjs);
  report.ok = true;
} catch (error) {
  report.error = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
}

process.stdout.write(`${JSON.stringify(report)}\n`);
process.exit(report.ok ? 0 : 1);
