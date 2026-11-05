import { parse as parseYaml } from "yaml";

export interface SplitFile {
  /** The parsed YAML, or null when the file has no usable front matter. */
  readonly data: Record<string, unknown> | null;
  /** The raw text between the two `---` lines ("" when there is no block). */
  readonly block: string;
  readonly body: string;
  readonly problems: ReadonlyArray<string>;
}

/**
 * Split a content file into its YAML front matter and its markdown body.
 * The front matter is the block between a first line `---` and the next line
 * `---`. Problems are returned, never thrown, so the caller can list every
 * problem of every file at once.
 */
export function splitFrontMatter(raw: string, file: string): SplitFile {
  const text: string = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match: RegExpMatchArray | null = text.match(
    /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/,
  );
  if (match == null) {
    return {
      data: null,
      block: "",
      body: text,
      problems: [`${file}: no front matter (the file must start with a --- block)`],
    };
  }
  const body: string = text.slice(match[0].length);
  let data: unknown;
  try {
    data = parseYaml(match[1], { schema: "core" });
  } catch (error) {
    const message: string = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { data: null, block: match[1], body, problems: [`${file}: front matter is not valid YAML (${message})`] };
  }
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return {
      data: null,
      block: match[1],
      body,
      problems: [`${file}: front matter must be a YAML mapping of fields`],
    };
  }
  return { data: data as Record<string, unknown>, block: match[1], body, problems: [] };
}

/**
 * The `draft` field must be written exactly `draft: true` or `draft: false`
 * (a trailing comment is fine): the publish script edits that line by pattern,
 * and a spelling YAML also accepts (`draft : true`, `"draft": true`,
 * `draft: True`) would be skipped by it, leaving the page offline for good.
 */
export function draftSpellingProblems(block: string, file: string): ReadonlyArray<string> {
  const strict: RegExp = /^draft: (?:true|false)[ \t]*(?:#.*)?$/;
  return block
    .split("\n")
    .filter((line): boolean => /^["']?draft["']?[ \t]*:/.test(line) && !strict.test(line))
    .map(
      (line): string =>
        `${file}: the draft field is written \`${line.trim()}\`; write exactly \`draft: true\` or \`draft: false\` (the publish script edits that line)`,
    );
}
