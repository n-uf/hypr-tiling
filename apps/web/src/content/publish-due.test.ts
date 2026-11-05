import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";

// scripts/publish-due.mjs is plain Node (the workflow runs it without an install),
// so it is tested as the workflow runs it: a child process on a temp copy of a
// content folder, never the real content.

const SCRIPT = resolve(__dirname, "../../scripts/publish-due.mjs");

function page(fields: string, body = "Body text.\n"): string {
  return `---\ntitle: "T"\n${fields}\nh1: "H"\n---\n\n${body}`;
}

const FILES: Readonly<Record<string, string>> = {
  "blog/due-draft.md": page("draft: true\npublished: 2026-11-05\nupdated: 2026-11-05"),
  "blog/future-draft.md": page("draft: true\npublished: 2026-12-01\nupdated: 2026-12-01"),
  "blog/live-page.md": page("published: 2026-11-01\nupdated: 2026-11-02"),
  "blog/explicit-false.md": page("draft: false\npublished: 2026-11-01\nupdated: 2026-11-01"),
  "use-cases/overdue-quoted.md": page('draft: true  # held for the release\npublished: "2026-10-20"\nupdated: "2026-10-20"'),
};

const root = mkdtempSync(join(tmpdir(), "publish-due-"));
let content = "";
let counter = 0;

function seed(extra: Readonly<Record<string, string>> = {}): void {
  counter += 1;
  content = join(root, `content-${counter}`);
  for (const [name, text] of Object.entries({ ...FILES, ...extra })) {
    mkdirSync(join(content, name.split("/")[0]), { recursive: true });
    writeFileSync(join(content, name), text, "utf8");
  }
}

function read(name: string): string {
  return readFileSync(join(content, name), "utf8");
}

function run(args: ReadonlyArray<string>, env: Record<string, string> = {}): string {
  return execFileSync("node", [SCRIPT, "--content", content, ...args], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: "", ...env },
  });
}

function dueLines(output: string): ReadonlyArray<string> {
  return output.split("\n").filter((line) => line.startsWith("due ") || line.startsWith("flipped "));
}

beforeEach((): void => {
  seed();
});

afterAll((): void => {
  rmSync(root, { recursive: true, force: true });
});

describe("publish-due", (): void => {
  it("--dry-run lists only the due drafts and changes nothing", (): void => {
    const before = Object.keys(FILES).map(read);
    const output = run(["--dry-run", "--today", "2026-11-05"]);
    expect(dueLines(output)).toEqual([
      "due blog/due-draft (go-live 2026-11-05)",
      "due use-cases/overdue-quoted (go-live 2026-10-20)",
    ]);
    expect(output).toContain("2 due, 1 still scheduled (dry run, nothing changed)");
    expect(Object.keys(FILES).map(read)).toEqual(before);
  });

  it("a real run flips only the due drafts, and only their draft line", (): void => {
    const before = Object.fromEntries(Object.keys(FILES).map((name) => [name, read(name)]));
    const output = run(["--today", "2026-11-05"]);
    expect(dueLines(output)).toEqual([
      "flipped blog/due-draft (go-live 2026-11-05): draft: true -> draft: false",
      "flipped use-cases/overdue-quoted (go-live 2026-10-20): draft: true -> draft: false",
    ]);
    expect(read("blog/due-draft.md")).toBe(before["blog/due-draft.md"].replace("draft: true", "draft: false"));
    // The trailing comment and the quoted dates stay as written.
    expect(read("use-cases/overdue-quoted.md")).toBe(
      before["use-cases/overdue-quoted.md"].replace("draft: true  # held", "draft: false  # held"),
    );
    for (const untouched of ["blog/future-draft.md", "blog/live-page.md", "blog/explicit-false.md"]) {
      expect(read(untouched)).toBe(before[untouched]);
    }
  });

  it("--today moves the date: the future draft is due on its go-live day, not the day before", (): void => {
    expect(dueLines(run(["--dry-run", "--today", "2026-11-30"]))).toHaveLength(2);
    expect(dueLines(run(["--dry-run", "--today", "2026-12-01"]))).toEqual([
      "due blog/due-draft (go-live 2026-11-05)",
      "due blog/future-draft (go-live 2026-12-01)",
      "due use-cases/overdue-quoted (go-live 2026-10-20)",
    ]);
  });

  it("is idempotent and exits 0 when nothing is due", (): void => {
    run(["--today", "2026-11-05"]);
    const output = run(["--today", "2026-11-05"]);
    expect(dueLines(output)).toEqual([]);
    expect(output).toContain("0 due, 1 still scheduled");
    expect(read("blog/future-draft.md")).toContain("draft: true");
  });

  it("keeps CRLF line endings and the body", (): void => {
    const crlf = page("draft: true\npublished: 2026-11-01\nupdated: 2026-11-01", "Line one.\n\nLine two.\n").replace(/\n/g, "\r\n");
    seed({ "blog/crlf.md": crlf });
    run(["--today", "2026-11-05"]);
    expect(read("blog/crlf.md")).toBe(crlf.replace("draft: true", "draft: false"));
  });

  it("writes the flipped slugs to $GITHUB_OUTPUT for the commit message", (): void => {
    const out = join(root, `output-${counter}.txt`);
    writeFileSync(out, "", "utf8");
    run(["--today", "2026-11-05"], { GITHUB_OUTPUT: out });
    expect(readFileSync(out, "utf8")).toBe("slugs=blog/due-draft, use-cases/overdue-quoted\n");
    const dry = join(root, `dry-${counter}.txt`);
    writeFileSync(dry, "", "utf8");
    run(["--dry-run", "--today", "2026-12-31"], { GITHUB_OUTPUT: dry });
    expect(readFileSync(dry, "utf8")).toBe("");
  });

  it("names pages as section/slug, so one slug in two sections stays two entries", (): void => {
    seed({
      "blog/shared.md": page("draft: true\npublished: 2026-11-01\nupdated: 2026-11-01"),
      "use-cases/shared.md": page("draft: true\npublished: 2026-11-01\nupdated: 2026-11-01"),
    });
    const out = join(root, `shared-${counter}.txt`);
    writeFileSync(out, "", "utf8");
    run(["--today", "2026-11-05"], { GITHUB_OUTPUT: out });
    expect(readFileSync(out, "utf8")).toBe(
      "slugs=blog/due-draft, blog/shared, use-cases/overdue-quoted, use-cases/shared\n",
    );
  });

  it("--pages-file writes the flipped pages as sorted repo paths, one per line, only on a real run with something due", (): void => {
    seed({
      "blog/shared.md": page("draft: true\npublished: 2026-11-01\nupdated: 2026-11-01"),
      "use-cases/shared.md": page("draft: true\npublished: 2026-11-01\nupdated: 2026-11-01"),
    });
    const list = join(root, `pages-${counter}.txt`);
    run(["--dry-run", "--today", "2026-11-05", "--pages-file", list]);
    expect(() => readFileSync(list, "utf8")).toThrow();
    run(["--today", "2026-12-31", "--pages-file", list, "--content", content]);
    expect(readFileSync(list, "utf8")).toBe(
      [
        "apps/web/content/blog/due-draft.md",
        "apps/web/content/blog/future-draft.md",
        "apps/web/content/blog/shared.md",
        "apps/web/content/use-cases/overdue-quoted.md",
        "apps/web/content/use-cases/shared.md",
      ].join("\n") + "\n",
    );
    const none = join(root, `none-${counter}.txt`);
    run(["--today", "2026-12-31", "--pages-file", none]);
    expect(() => readFileSync(none, "utf8")).toThrow();
  });

  it.each(["draft : true",'"draft": true', "draft: True", "draft: TRUE", "'draft': true"])(
    "refuses the draft spelling `%s` instead of skipping the page as live",
    (spelling): void => {
      seed({ "blog/odd.md": page(`${spelling}\npublished: 2026-11-01\nupdated: 2026-11-01`) });
      const before = read("blog/due-draft.md");
      const result = spawnSync("node", [SCRIPT, "--content", content, "--today", "2026-11-05"], { encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/blog\/odd writes the draft field as .*write exactly `draft: true` or `draft: false`/);
      expect(read("blog/due-draft.md")).toBe(before);
    },
  );

  it("fails loudly, changing nothing, on a draft whose go-live date it cannot read", (): void => {
    seed({ "blog/broken.md": page("draft: true\nupdated: 2026-11-01") });
    const before = read("blog/due-draft.md");
    const result = spawnSync("node", [SCRIPT, "--content", content, "--today", "2026-11-05"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/blog\/broken is a draft but has no readable `published: YYYY-MM-DD`/);
    expect(read("blog/due-draft.md")).toBe(before);
  });

  it("rejects a bad --today", (): void => {
    const result = spawnSync("node", [SCRIPT, "--content", content, "--today", "2026-13-40"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--today must be a real date/);
  });
});
