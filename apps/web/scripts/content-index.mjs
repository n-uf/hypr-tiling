// Writes apps/web/src/content-index.generated.ts from apps/web/content/**/*.md.
// The file is not committed (it is git-ignored): it depends on the build mode
// (a production build lists live pages only, a preview build lists drafts too),
// and a daily publish commit that only flips `draft` must not leave it stale.
// So every script that needs it generates it first: prebuild, predev,
// pretypecheck and pretest in the web package. It also runs every content
// check (see src/content/validate.ts), so a bad page stops the build here,
// before the slower client and server builds, with the full list of problems.
//
//   node scripts/content-index.mjs                write the file
//   node scripts/content-index.mjs --check        run every check and the generator, write nothing
//   node scripts/content-index.mjs --show-drafts  same as SHOW_DRAFTS=1 (the dev server uses it)

import { rmSync, writeFileSync } from "node:fs";
import {
  ensureIndexModule,
  exitWithContentError,
  indexModulePath as outputPath,
  loadSiteModule,
  webRoot,
} from "./lib/site-module.mjs";

const check = process.argv.includes("--check");
if (process.argv.includes("--show-drafts")) {
  process.env.SHOW_DRAFTS = "1";
}

try {
  // --check writes nothing: if the index is missing, the stand-in the content
  // layer needs while it loads is removed again afterwards.
  const wroteStandIn = check && ensureIndexModule();
  const content = await loadSiteModule();
  if (wroteStandIn) {
    rmSync(outputPath, { force: true });
  }
  const site = content.loadSite(webRoot);
  const source = content.renderIndexModule(site);
  for (const warning of site.warnings) {
    console.warn(`content: warning: ${warning}`);
  }
  if (!check) {
    writeFileSync(outputPath, source, "utf8");
  }
  const drafts = site.pages.filter((page) => page.draft).length + site.hidden.length;
  console.log(
    `content-index: ${site.pages.length} page${site.pages.length === 1 ? "" : "s"}` +
      (drafts === 0 ? "" : ` (${site.hidden.length} of ${drafts} draft${drafts === 1 ? "" : "s"} left out)`) +
      (check ? ", checked, nothing written" : ""),
  );
} catch (error) {
  exitWithContentError(error);
}
