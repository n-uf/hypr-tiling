import { parse as parseYaml } from "yaml";

export interface SplitFile {
  /** The parsed YAML, or null when the file has no usable front matter. */
  readonly data: Record<string, unknown> | null;
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
    return { data: null, body, problems: [`${file}: front matter is not valid YAML (${message})`] };
  }
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return {
      data: null,
      body,
      problems: [`${file}: front matter must be a YAML mapping of fields`],
    };
  }
  return { data: data as Record<string, unknown>, body, problems: [] };
}
