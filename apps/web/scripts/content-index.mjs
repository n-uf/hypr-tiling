// Writes apps/web/src/content-index.generated.ts from apps/web/content/**/*.md.
// Runs as part of the web build's prebuild step. It also runs every content
// check (see src/content/validate.ts), so a bad page stops the build here,
// before the slower client and server builds, with the full list of problems.
//
//   node scripts/content-index.mjs            write the file
//   node scripts/content-index.mjs --check    fail if the committed file is out of date

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exitWithContentError, loadSiteModule, webRoot } from "./lib/site-module.mjs";

const outputPath = resolve(webRoot, "src/content-index.generated.ts");
const check = process.argv.includes("--check");

try {
  const content = await loadSiteModule();
  const site = content.loadSite(webRoot);
  const source = content.renderIndexModule(site);
  for (const warning of site.warnings) {
    console.warn(`content: warning: ${warning}`);
  }
  if (check) {
    if (readFileSync(outputPath, "utf8") !== source) {
      console.error(
        "content-index: src/content-index.generated.ts is out of date; run `pnpm --filter hypr-tiling-web prebuild` and commit it.",
      );
      process.exit(1);
    }
  } else {
    writeFileSync(outputPath, source, "utf8");
  }
  console.log(`content-index: ${site.pages.length} page${site.pages.length === 1 ? "" : "s"}`);
} catch (error) {
  exitWithContentError(error);
}
