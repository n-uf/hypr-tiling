// Bundles src/content/build.tsx with Vite (server build, dependencies left
// external) into node_modules/.cache and imports it. That lets the plain-Node
// build scripts reuse the TypeScript content layer, so the checks the unit
// tests cover are the checks the build runs.

import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export { webRoot };

/** The generated client index (git-ignored); the home page and /docs import it. */
export const indexModulePath = resolve(webRoot, "src/content-index.generated.ts");

/**
 * The content layer renders /docs to find its anchors, and /docs imports the
 * generated client index, which does not exist yet on a fresh checkout (it is
 * git-ignored) and is what the caller is about to write. An empty stand-in
 * breaks that circle: the anchors do not depend on the index entries. Returns
 * true when it wrote the stand-in, false when the real file was already there.
 */
export function ensureIndexModule() {
  if (existsSync(indexModulePath)) {
    return false;
  }
  writeFileSync(
    indexModulePath,
    [
      "// Empty stand-in written by scripts/lib/site-module.mjs until the real index is generated.",
      'import type { ContentIndexEntry } from "./content/constants";',
      "export const CONTENT_INDEX: ReadonlyArray<ContentIndexEntry> = [];",
      "",
    ].join("\n"),
    "utf8",
  );
  return true;
}

export async function loadSiteModule() {
  ensureIndexModule();
  const outDir = resolve(webRoot, "node_modules/.cache/content-site");
  await build({
    root: webRoot,
    configFile: resolve(webRoot, "vite.config.ts"),
    logLevel: "warn",
    build: {
      ssr: resolve(webRoot, "src/content/build.tsx"),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: "site.mjs", format: "es" } },
    },
  });
  return import(pathToFileURL(resolve(outDir, "site.mjs")).href);
}

/** Print a content error the way the build should show it, and exit 1. */
export function exitWithContentError(error) {
  if (error?.name === "ContentProblemsError") {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
