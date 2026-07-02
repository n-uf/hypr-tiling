// Compiled-example source registry — the anti-rot mechanism for the /docs
// guides. Each entry is the RAW TEXT of a real, type-checked module in this
// folder, pulled in via Vite's `?raw` loader. Because `?raw` is resolved at
// BUILD time (for both the client bundle and the SSR/prerender bundle), the
// string that renders in a <pre> IS the exact source of the sibling `.tsx`
// file — and every one of those files is covered by `pnpm typecheck` (and thus
// CI), so a snippet cannot silently drift from the current public
// `@n-uf/hypr-tiling` API without breaking the build.
//
// To add a guide snippet: create `docs-examples/<name>.tsx` using ONLY the
// public `.` API, add its `?raw` import here, and reference `EXAMPLE_SOURCES`
// (and, where a live demo is shown, the exported component) from docs-page.tsx.

import quickstartSource from "./quickstart.tsx?raw";
import initialLayoutSource from "./initial-layout.tsx?raw";
import renderTileSource from "./render-tile.tsx?raw";
import themingSource from "./theming.tsx?raw";
import capabilitiesSource from "./capabilities.tsx?raw";
import saveRestoreSource from "./save-restore.tsx?raw";
import commandsSource from "./commands.tsx?raw";
import commandBarSource from "./command-bar.tsx?raw";
import groupSplitMaximizeSource from "./group-split-maximize.tsx?raw";
import dashboardAppSource from "./dashboard-app.tsx?raw";
import terminalGridSource from "./terminal-grid.tsx?raw";

// The set of compiled examples, keyed by a stable id. `as const` keeps the key
// union exact so a docs page cannot reference a missing example.
export const EXAMPLE_SOURCES = {
  quickstart: quickstartSource,
  "initial-layout": initialLayoutSource,
  "render-tile": renderTileSource,
  theming: themingSource,
  capabilities: capabilitiesSource,
  "save-restore": saveRestoreSource,
  commands: commandsSource,
  "command-bar": commandBarSource,
  "group-split-maximize": groupSplitMaximizeSource,
  "dashboard-app": dashboardAppSource,
  "terminal-grid": terminalGridSource,
} as const;

export type ExampleId = keyof typeof EXAMPLE_SOURCES;
