// Flips scheduled pages live: every content page with `draft: true` whose
// `published` date (its go-live date, UTC) is today or earlier gets `draft: false`.
// Only that one line of the page changes. Run daily by .github/workflows/publish.yml,
// which commits the result as `publish: <slug>[, <slug>]`.
//
//   node apps/web/scripts/publish-due.mjs                    flip the due pages, print what changed
//   node apps/web/scripts/publish-due.mjs --dry-run          print the due pages, change nothing
//   node apps/web/scripts/publish-due.mjs --today 2026-12-01 pretend it is that UTC day (tests, previews)
//   node apps/web/scripts/publish-due.mjs --content <dir>    read pages from <dir> (default apps/web/content)
//   node apps/web/scripts/publish-due.mjs --pages-file <f>   also write the page list to <f> (real run, something due)
//
// Exit 0 when nothing is due (and prints so); exit 1 on a bad argument or a
// draft whose `published` date it cannot read, so a typo never silently
// keeps a page offline. Node only, no dependencies: the workflow needs no install.
// When $GITHUB_OUTPUT is set, a real run also writes `slugs=<section/slug>[, ...]`
// there (a log aid). With --pages-file <f> a real run that flipped something also writes the page list
// the workflow hands to its push job: one repo path per line, `apps/web/content/<section>/<slug>.md`,
// sorted bytewise and unique, newline-terminated. The push job compares it with the patch it is given.

import { appendFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SLUG_FILE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// The repo path a page list names, whatever --content says: the push job's guard only accepts these paths.
const REPO_CONTENT = "apps/web/content";

function fail(message) {
  console.error(`publish-due: ${message}`);
  process.exit(1);
}

function isRealDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return DATE.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    today: new Date().toISOString().slice(0, 10),
    content: resolve(dirname(fileURLToPath(import.meta.url)), "..", "content"),
    pagesFile: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--today" || arg === "--content" || arg === "--pages-file") {
      const value = argv[index + 1];
      if (value == null || value.startsWith("--")) {
        fail(`${arg} needs a value`);
      }
      index += 1;
      if (arg === "--today") {
        if (!isRealDate(value)) {
          fail(`--today must be a real date written YYYY-MM-DD, found "${value}"`);
        }
        options.today = value;
      } else if (arg === "--content") {
        options.content = resolve(value);
      } else {
        options.pagesFile = resolve(value);
      }
    } else {
      fail(`unknown argument "${arg}" (use --dry-run, --today YYYY-MM-DD, --content <dir>, --pages-file <file>)`);
    }
  }
  return options;
}

/** Every `<section>/<slug>.md` under the content folder, sorted. */
function pageFiles(contentRoot) {
  const files = [];
  let sections = [];
  try {
    sections = readdirSync(contentRoot).filter((name) => !name.startsWith(".")).sort();
  } catch {
    fail(`cannot read the content folder ${contentRoot}`);
  }
  for (const section of sections) {
    const folder = join(contentRoot, section);
    if (!statSync(folder).isDirectory()) {
      continue;
    }
    for (const name of readdirSync(folder).sort()) {
      const match = name.match(SLUG_FILE);
      if (match != null && statSync(join(folder, name)).isFile()) {
        files.push({ section, slug: match[1], path: join(folder, name) });
      }
    }
  }
  return files;
}

/**
 * Look at one page. Returns null for a live page, otherwise the draft's go-live
 * date and the text with its `draft: true` line set to `draft: false`.
 * Works on the raw text so line endings and every other line stay untouched.
 */
function inspect(raw, label) {
  const block = raw.match(/^(﻿?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/);
  if (block == null) {
    return null;
  }
  const lines = block[2].split("\n");
  // The field must be written exactly `draft: true` or `draft: false` (a
  // trailing comment is fine). The content validator enforces the same form;
  // here any other spelling of the key (`draft : true`, `"draft": true`,
  // `draft: True`) stops the run rather than being skipped as a live page.
  const STRICT = /^draft: (true|false)[ \t]*(?:#.*)?\r?$/;
  const odd = lines.find((line) => /^["']?draft["']?[ \t]*:/.test(line) && !STRICT.test(line));
  if (odd != null) {
    fail(`${label} writes the draft field as \`${odd.replace(/\r$/, "")}\`; write exactly \`draft: true\` or \`draft: false\`, nothing was changed`);
  }
  const draftAt = lines.findIndex((line) => /^draft: true[ \t]*(?:#.*)?\r?$/.test(line));
  if (draftAt < 0) {
    return null;
  }
  const dates = lines
    .map((line) => line.match(/^published:[ \t]*(?:"(\d{4}-\d{2}-\d{2})"|'(\d{4}-\d{2}-\d{2})'|(\d{4}-\d{2}-\d{2}))[ \t]*(?:#.*)?\r?$/))
    .filter((match) => match != null);
  const published = dates.length === 1 ? (dates[0][1] ?? dates[0][2] ?? dates[0][3]) : null;
  if (published == null || !isRealDate(published)) {
    fail(`${label} is a draft but has no readable \`published: YYYY-MM-DD\` go-live date; fix it, nothing was changed`);
  }
  const flipped = [...lines];
  flipped[draftAt] = lines[draftAt].replace(/^draft: true/, "draft: false");
  return { published, text: block[1] + flipped.join("\n") + raw.slice(block[1].length + block[2].length) };
}

const options = parseArgs(process.argv.slice(2));
const due = [];
let scheduled = 0;
for (const file of pageFiles(options.content)) {
  const label = `${file.section}/${file.slug}`;
  const draft = inspect(readFileSync(file.path, "utf8"), label);
  if (draft == null) {
    continue;
  }
  if (draft.published <= options.today) {
    due.push({ ...file, label, published: draft.published, text: draft.text });
  } else {
    scheduled += 1;
  }
}

console.log(
  `publish-due: today ${options.today} (UTC), ${due.length} due, ${scheduled} still scheduled${options.dryRun ? " (dry run, nothing changed)" : ""}`,
);
for (const page of due) {
  if (options.dryRun) {
    console.log(`due ${page.label} (go-live ${page.published})`);
  } else {
    writeFileSync(page.path, page.text, "utf8");
    console.log(`flipped ${page.label} (go-live ${page.published}): draft: true -> draft: false`);
  }
}

if (!options.dryRun && due.length > 0 && process.env.GITHUB_OUTPUT != null && process.env.GITHUB_OUTPUT !== "") {
  const slugs = [...new Set(due.map((page) => page.label))].join(", ");
  appendFileSync(process.env.GITHUB_OUTPUT, `slugs=${slugs}\n`);
}

if (!options.dryRun && due.length > 0 && options.pagesFile != null) {
  // Plain code-unit order, which is also `LC_ALL=C sort` and the order git lists paths in.
  const paths = [...new Set(due.map((page) => `${REPO_CONTENT}/${page.section}/${page.slug}.md`))].sort();
  writeFileSync(options.pagesFile, `${paths.join("\n")}\n`, "utf8");
}
