// Tests for check-flip-patch.sh, the push job's guard: it must accept a flip of `draft: true` lines and
// refuse anything else. Each case builds a patch in a scratch git repo and runs the script there.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./check-flip-patch.sh", import.meta.url));
const page = (draft, extra = "", body = "") =>
  `---\ntitle: "A page"\npublished: 2026-11-09\nupdated: 2026-11-09\ndraft: ${draft}\nauthor: n-uf\n---\n\nBody text.${extra}\n${body}`;
// The fixtures go live on 2026-11-09; the script reads "today" from FLIP_TODAY in the tests.
const DUE_DAY = "2026-11-09";

let repo;
const git = (...args) => {
  const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
};
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
};
/** The build job's page list file for "blog/a, use-cases/b" (the way publish-due.mjs --pages-file writes it). */
const pageList = (slugs) => {
  const file = path.join(repo, "..", `pages-${Math.random().toString(36).slice(2)}.txt`);
  const lines = slugs.split(", ").map((slug) => `apps/web/content/${slug}.md`);
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
};
/** Make the edits, save them as the build job would (git diff --binary), restore the tree, run the check. */
const check = (edit, slugs, today = DUE_DAY) => {
  edit();
  const patch = path.join(repo, "..", `flip-${Math.random().toString(36).slice(2)}.patch`);
  spawnSync("sh", ["-c", `git add -N . && git diff --binary -- . > "${patch}"`], { cwd: repo });
  git("reset", "-q", "--hard");
  git("clean", "-q", "-fd");
  return spawnSync("bash", [SCRIPT, patch, pageList(slugs)], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, FLIP_TODAY: today },
  });
};

const roots = [];
beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flip-check-"));
  roots.push(root);
  repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  write("apps/web/content/blog/a-post.md", page("true"));
  write("apps/web/content/use-cases/b-case.md", page("true"));
  write("apps/web/content/blog/live-post.md", page("false", "", "\n```yaml\ndraft: true\n```\n"));
  write("apps/web/app/page.tsx", "export default 1;\n");
  git("add", ".");
  git("commit", "-q", "-m", "fixture");
});
after(() => roots.forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

test("accepts a draft flip and prints the commit message", () => {
  const r = check(() => write("apps/web/content/blog/a-post.md", page("false")), "blog/a-post");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "publish: blog/a-post");
  assert.match(git("diff", "--cached", "--name-only"), /apps\/web\/content\/blog\/a-post\.md/);
});

test("accepts flips in two sections, in path order", () => {
  const r = check(() => {
    write("apps/web/content/blog/a-post.md", page("false"));
    write("apps/web/content/use-cases/b-case.md", page("false"));
  }, "blog/a-post, use-cases/b-case");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "publish: blog/a-post, use-cases/b-case");
});

test("refuses a flip that also changes the body (a non-draft hunk)", () => {
  const r = check(() => write("apps/web/content/blog/a-post.md", page("false", " Injected.")), "blog/a-post");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /exactly one line|other than a draft/);
});

test("refuses a change to a line that isn't the draft line", () => {
  const r = check(
    () => write("apps/web/content/blog/a-post.md", page("true").replace("author: n-uf", "author: evil")),
    "blog/a-post",
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /other than a draft: true line/);
});

test("refuses turning a live page back into a draft", () => {
  const r = check(
    () => write("apps/web/content/blog/live-post.md", page("true", "", "\n```yaml\ndraft: true\n```\n")),
    "blog/live-post",
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /other than a draft: true line/);
});

test("refuses a page that isn't due yet", () => {
  const r = check(() => write("apps/web/content/blog/a-post.md", page("false")), "blog/a-post", "2026-11-08");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /isn't due/);
});

test("refuses flipping a `draft: true` line in the body (a code sample), not the front matter", () => {
  const r = check(
    () => write("apps/web/content/blog/live-post.md", page("false", "", "\n```yaml\ndraft: false\n```\n")),
    "blog/live-post",
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /outside the front matter/);
});

test("refuses a change outside the content pages", () => {
  const r = check(() => {
    write("apps/web/content/blog/a-post.md", page("false"));
    write("apps/web/app/page.tsx", "export default 2;\n");
  }, "blog/a-post");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /files other than/);
});

test("refuses a new file, even one that looks like a flip", () => {
  const r = check(() => write("apps/web/content/blog/new-post.md", page("false")), "blog/new-post");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /creates, deletes|exactly one line/);
});

test("refuses pages other than the ones the build reported", () => {
  const r = check(() => write("apps/web/content/blog/a-post.md", page("false")), "use-cases/b-case");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not the pages in the page list/);
});

test("refuses a page list that misses a changed page", () => {
  const fewer = check(() => {
    write("apps/web/content/blog/a-post.md", page("false"));
    write("apps/web/content/use-cases/b-case.md", page("false"));
  }, "blog/a-post");
  assert.notEqual(fewer.status, 0);
  assert.match(fewer.stderr, /not the pages in the page list/);
});

test("refuses a page list that names one more page than the patch changes", () => {
  const more = check(() => write("apps/web/content/blog/a-post.md", page("false")), "blog/a-post, use-cases/b-case");
  assert.notEqual(more.status, 0);
  assert.match(more.stderr, /not the pages in the page list/);
});

test("refuses a page list that is empty, unsorted, has a duplicate or a line that is no page path", () => {
  const edit = () => {
    write("apps/web/content/blog/a-post.md", page("false"));
    write("apps/web/content/use-cases/b-case.md", page("false"));
  };
  const withList = (text, message) => {
    edit();
    const patch = path.join(repo, "..", `lists-${Math.random().toString(36).slice(2)}.patch`);
    spawnSync("sh", ["-c", `git add -N . && git diff --binary -- . > "${patch}"`], { cwd: repo });
    git("reset", "-q", "--hard");
    const list = path.join(repo, "..", `bad-${Math.random().toString(36).slice(2)}.txt`);
    fs.writeFileSync(list, text);
    const r = spawnSync("bash", [SCRIPT, patch, list], { cwd: repo, encoding: "utf8", env: { ...process.env, FLIP_TODAY: DUE_DAY } });
    assert.notEqual(r.status, 0, text);
    assert.match(r.stderr, message, text);
    untouched(git("rev-parse", "HEAD").trim());
  };
  const a = "apps/web/content/blog/a-post.md\n";
  const b = "apps/web/content/use-cases/b-case.md\n";
  withList("", /missing or empty/);
  withList(b + a, /not sorted and unique/);
  withList(a + a + b, /not sorted and unique/);
  withList(`${a}\n${b}`, /not apps\/web\/content/);
  withList(`${a}${b}apps/web/app/page.tsx\n`, /not apps\/web\/content/);
  withList(`${a}apps/web/content/blog/../../app/page.tsx\n`, /not apps\/web\/content/);
});

test("accepts a flip on a page larger than the pipe buffer (no SIGPIPE under pipefail)", () => {
  const long = `\n${"A long paragraph of text that makes the page big. ".repeat(3000)}\n`;
  write("apps/web/content/blog/a-post.md", page("true", "", long));
  git("commit", "-q", "-am", "long page");
  const r = check(() => write("apps/web/content/blog/a-post.md", page("false", "", long)), "blog/a-post");
  assert.ok(fs.statSync(path.join(repo, "apps/web/content/blog/a-post.md")).size > 100_000);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "publish: blog/a-post");
});

test("accepts a quoted published day and refuses a flip with no published day", () => {
  write("apps/web/content/blog/a-post.md", page("true").replace("published: 2026-11-09", 'published: "2026-11-09"'));
  write("apps/web/content/use-cases/b-case.md", page("true").replace("published: 2026-11-09\n", ""));
  git("commit", "-q", "-am", "quoted and missing dates");
  const ok = check(
    () => write("apps/web/content/blog/a-post.md", page("false").replace("published: 2026-11-09", 'published: "2026-11-09"')),
    "blog/a-post",
  );
  assert.equal(ok.status, 0, ok.stderr);
  const bad = check(
    () => write("apps/web/content/use-cases/b-case.md", page("false").replace("published: 2026-11-09\n", "")),
    "use-cases/b-case",
  );
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /no published day/);
});

test("refuses an empty patch", () => {
  const r = check(() => {}, "blog/a-post");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /changes nothing|does not apply/);
});

// Cases added for hypr-tiling (the tampered patches of its push-job simulation).
test("refuses an added line that is not `draft: false`", () => {
  const r = check(
    () => write("apps/web/content/blog/a-post.md", page("true").replace("draft: true", "title: hacked")),
    "blog/a-post",
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not the removed draft lines|other than a draft: true line/);
});

test("refuses a flip that also changes the published day (two lines)", () => {
  const r = check(
    () => write("apps/web/content/blog/a-post.md", page("false").replace("published: 2026-11-09", "published: 2026-01-01")),
    "blog/a-post",
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /exactly one line/);
});

// (One check per test: the script applies the patch to the repo it runs in.)
test("refuses a flip plus an extra changed title line", () => {
  const both = check(
    () => write("apps/web/content/blog/a-post.md", page("false").replace('title: "A page"', 'title: "X page"')),
    "blog/a-post",
  );
  assert.notEqual(both.status, 0);
  assert.match(both.stderr, /exactly one line/);
});

test("refuses a changed title alone", () => {
  const alone = check(
    () => write("apps/web/content/blog/a-post.md", page("true").replace('title: "A page"', 'title: "X page"')),
    "blog/a-post",
  );
  assert.notEqual(alone.status, 0);
  assert.match(alone.stderr, /other than a draft: true line/);
});

test("refuses deleting a page", () => {
  // (git add -N does not record a deletion, so this patch is made against HEAD.)
  fs.rmSync(path.join(repo, "apps/web/content/blog/a-post.md"));
  const patch = path.join(repo, "..", "delete.patch");
  spawnSync("sh", ["-c", `git diff --binary HEAD -- . > "${patch}"`], { cwd: repo });
  git("reset", "-q", "--hard");
  const del = spawnSync("bash", [SCRIPT, patch, pageList("blog/a-post")], { cwd: repo, encoding: "utf8", env: { ...process.env, FLIP_TODAY: DUE_DAY } });
  assert.notEqual(del.status, 0);
  assert.match(del.stderr, /creates, deletes|exactly one line/);
});

test("refuses a mode change", () => {
  const mode = check(() => {
    write("apps/web/content/blog/a-post.md", page("false"));
    fs.chmodSync(path.join(repo, "apps/web/content/blog/a-post.md"), 0o755);
  }, "blog/a-post");
  assert.notEqual(mode.status, 0);
});

test("refuses a patch over 64 KB", () => {
  const huge = `\n${"x".repeat(70_000)}\n`;
  write("apps/web/content/blog/a-post.md", page("true", "", huge));
  git("commit", "-q", "-am", "huge page");
  const r = check(() => write("apps/web/content/blog/a-post.md", page("false", "", huge.replace("x", "y"))), "blog/a-post");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /too large|exactly one line/);
});

test("refuses a patch over 64 KB even when it is a valid flip of many lines", () => {
  const patch = path.join(os.tmpdir(), `big-${Math.random().toString(36).slice(2)}.patch`);
  fs.writeFileSync(patch, `${"# padding\n".repeat(7000)}`);
  const r = spawnSync("bash", [SCRIPT, patch, pageList("blog/a-post")], { cwd: repo, encoding: "utf8", env: { ...process.env, FLIP_TODAY: DUE_DAY } });
  fs.rmSync(patch);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /too large/);
});

// The patch is judged before anything is written: a refusal leaves the working tree, the index and HEAD as they were.
const untouched = (headBefore) => {
  assert.equal(git("status", "--porcelain"), "", "the working tree and the index are untouched");
  assert.equal(git("rev-parse", "HEAD").trim(), headBefore);
};

test("refuses a patch that touches or creates a file outside the content pages, writing nothing", () => {
  const head = git("rev-parse", "HEAD").trim();
  const edits = {
    "a flip plus an edit of another file": [
      () => {
        write("apps/web/content/blog/a-post.md", page("false"));
        write("apps/web/app/page.tsx", "export default 2;\n");
      },
      /files other than/,
    ],
    "a new file outside the content pages": [() => write("apps/web/app/evil.ts", "export default 1;\n"), /files other than/],
    "a new file in content with a name that is no slug": [
      () => write("apps/web/content/blog/Bad_Name.md", page("false")),
      /files other than/,
    ],
    "a flip plus a new page next to it": [
      () => {
        write("apps/web/content/blog/a-post.md", page("false"));
        write("apps/web/content/blog/new-post.md", page("false"));
      },
      /creates, deletes/,
    ],
  };
  for (const [name, [edit, message]] of Object.entries(edits)) {
    const r = check(edit, "blog/a-post");
    assert.notEqual(r.status, 0, name);
    assert.match(r.stderr, message, name);
    untouched(head);
  }
});

test("refuses a mode change and a patch that does not apply, writing nothing", () => {
  const head = git("rev-parse", "HEAD").trim();
  const mode = check(() => {
    write("apps/web/content/blog/a-post.md", page("false"));
    fs.chmodSync(path.join(repo, "apps/web/content/blog/a-post.md"), 0o755);
  }, "blog/a-post");
  assert.notEqual(mode.status, 0);
  assert.match(mode.stderr, /creates, deletes, renames or changes the mode/);
  untouched(head);

  // A flip patch made against a version of the page that main has since changed next to the flipped line (its author line).
  write("apps/web/content/blog/a-post.md", page("false"));
  const patch = path.join(repo, "..", "stale.patch");
  fs.writeFileSync(patch, git("diff", "--binary"));
  git("reset", "-q", "--hard");
  write("apps/web/content/blog/a-post.md", page("true").replace("author: n-uf", "author: other"));
  git("commit", "-q", "-am", "main moved");
  const moved = git("rev-parse", "HEAD").trim();
  const r = spawnSync("bash", [SCRIPT, patch, pageList("blog/a-post")], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, FLIP_TODAY: DUE_DAY },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /does not apply/);
  untouched(moved);
});

// --rebased: HEAD is the flip commit after a retried push's rebase; the patch is its format-patch.
/** Commit the flip on a branch, move main with `moveMain`, rebase the flip onto it and run the guard in --rebased mode. */
const recheck = (moveMain, { extraOnFlip, slugs = "blog/a-post", today = DUE_DAY } = {}) => {
  git("switch", "-q", "-c", "publish-flip");
  write("apps/web/content/blog/a-post.md", page("false"));
  git("commit", "-q", "-am", "publish: blog/a-post");
  const original = path.join(repo, "..", `orig-${Math.random().toString(36).slice(2)}.patch`);
  fs.writeFileSync(original, git("format-patch", "-1", "--stdout", "--binary", "HEAD"));
  git("switch", "-q", "main");
  moveMain();
  git("commit", "-q", "-am", "main moved");
  git("switch", "-q", "publish-flip");
  git("rebase", "-q", "main");
  extraOnFlip?.();
  const rebasedPatch = path.join(repo, "..", `rebased-${Math.random().toString(36).slice(2)}.patch`);
  fs.writeFileSync(rebasedPatch, git("format-patch", "-1", "--stdout", "--binary", "HEAD"));
  const head = git("rev-parse", "HEAD").trim();
  const r = spawnSync("bash", [SCRIPT, "--rebased", extraOnFlip ? original : rebasedPatch, pageList(slugs)], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, FLIP_TODAY: today },
  });
  return { r, head };
};

test("--rebased accepts a clean rebase and leaves the work tree, index and HEAD alone", () => {
  const { r, head } = recheck(() => write("apps/web/app/page.tsx", "export default 3;\n"));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "publish: blog/a-post");
  untouched(head);
  assert.equal(git("rev-list", "--count", "main..HEAD").trim(), "1");
});

test("--rebased accepts a rebase over a main that edited the same page elsewhere (body text)", () => {
  const { r, head } = recheck(() =>
    write("apps/web/content/blog/a-post.md", page("true").replace("Body text.", "Body text, edited.")),
  );
  assert.equal(r.status, 0, r.stderr);
  untouched(head);
});

test("--rebased refuses when main moved the page's published day into the future", () => {
  const { r, head } = recheck(() =>
    write("apps/web/content/blog/a-post.md", page("true").replace("published: 2026-11-09", "published: 2026-12-01")),
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /isn't due: published 2026-12-01/);
  untouched(head);
});

test("--rebased refuses a rebased commit that holds more than the patch it is checked with", () => {
  const { r, head } = recheck(() => write("apps/web/app/page.tsx", "export default 3;\n"), {
    extraOnFlip: () => {
      write("apps/web/app/page.tsx", "export default 4;\n");
      git("commit", "-q", "-a", "--amend", "--no-edit");
    },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /more than the checked patch/);
  untouched(head);
});

test("--rebased refuses a HEAD that is not exactly one commit on its base", () => {
  const { r } = recheck(() => write("apps/web/app/page.tsx", "export default 3;\n"), {
    extraOnFlip: () => git("commit", "-q", "--allow-empty", "-m", "an extra commit"),
  });
  // the patch is the flip alone, but HEAD~1 is now the flip commit: the patch no longer applies to it
  assert.notEqual(r.status, 0);
});

test("--rebased refuses pages other than the ones the build reported", () => {
  const { r } = recheck(() => write("apps/web/app/page.tsx", "export default 3;\n"), { slugs: "use-cases/b-case" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not the pages in the page list/);
});
