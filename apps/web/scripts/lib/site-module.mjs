// Bundles src/content/build.tsx with Vite (server build, dependencies left
// external) into node_modules/.cache and imports it. That lets the plain-Node
// build scripts reuse the TypeScript content layer, so the checks the unit
// tests cover are the checks the build runs.

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export { webRoot };

export async function loadSiteModule() {
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
