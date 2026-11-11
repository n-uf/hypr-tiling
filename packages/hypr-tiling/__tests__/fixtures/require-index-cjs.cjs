// Probe for `__tests__/dist-cjs-require.test.ts`: run with
// `node --no-experimental-require-module` (what a Node without require(esm)
// does — < 20.19 and 22.0–22.11 — and what CJS jest does). Requires the built
// CommonJS entries and server-renders a two-pane layout through them. Prints one
// JSON line: { ok, error, leaves, frames }.
"use strict";

const { resolve } = require("node:path");

const report = { ok: false, error: null, leaves: 0, frames: 0 };
try {
  const dist = resolve(__dirname, "..", "..", "dist");
  const tiling = require(resolve(dist, "index.cjs"));
  require(resolve(dist, "devtools.cjs"));
  const React = require("react");
  const { renderToString } = require("react-dom/server");
  const html = renderToString(
    React.createElement(tiling.TilingRenderer, {
      layout: {
        kind: "split",
        id: "root",
        axis: "horizontal",
        ratio: 0.5,
        first: { kind: "leaf", id: "left", tileId: "a" },
        second: { kind: "leaf", id: "right", tileId: "b" },
      },
      tiles: [
        { id: "a", title: "alpha" },
        { id: "b", title: "bravo" },
      ],
      config: tiling.DEFAULT_TILING_LAYOUT_CONFIG,
      onLayoutChange: () => undefined,
    }),
  );
  report.leaves = (html.match(/data-hpt-leaf="/g) ?? []).length;
  report.frames = (html.match(/data-hpt-leaf-frame=""/g) ?? []).length;
  report.ok = report.leaves === 2 && report.frames === 2;
} catch (error) {
  report.error = String(error && error.stack ? error.stack : error);
}
process.stdout.write(`${JSON.stringify(report)}\n`);
