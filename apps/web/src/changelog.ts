// Single source for the /docs Changelog section: the library CHANGELOG.md,
// imported as raw text (Vite `?raw`, inlined at build for client + SSR) and
// parsed into typed release records. Do not duplicate release prose here.
// Package identity (version, repository) is read from packages/hypr-tiling/
// package.json at build time so the home Changelog widgets stay in lockstep.

import changelogMarkdown from "../../../packages/hypr-tiling/CHANGELOG.md?raw";
import libraryPackageJson from "../../../packages/hypr-tiling/package.json";

export const CHANGELOG_MARKDOWN: string = changelogMarkdown;

export type ChangelogInline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "strong"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly href: string };

export interface ChangelogBullet {
  readonly isBreaking: boolean;
  readonly inlines: ReadonlyArray<ChangelogInline>;
}

export type ChangelogBlock =
  | {
      readonly kind: "paragraph";
      readonly inlines: ReadonlyArray<ChangelogInline>;
    }
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "list"; readonly bullets: ReadonlyArray<ChangelogBullet> };

export interface ChangelogRelease {
  readonly id: string;
  readonly heading: string;
  readonly versionLabel: string;
  readonly date: string | null;
  readonly blocks: ReadonlyArray<ChangelogBlock>;
}

export interface ChangelogNavLeaf {
  readonly id: string;
  readonly label: string;
}

const VERSION_AT_HEAD: RegExp = /^(\d+\.\d+\.\d+)\b/;
const VERSION_WITH_DATE: RegExp = /^(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})\b/;
const INLINE_TOKEN: RegExp = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function parseInlines(raw: string): ReadonlyArray<ChangelogInline> {
  const out: Array<ChangelogInline> = [];
  let lastIndex: number = 0;
  const matcher: RegExp = new RegExp(INLINE_TOKEN.source, "g");
  let match: RegExpExecArray | null = matcher.exec(raw);
  while (match !== null) {
    const token: string = match[0];
    const start: number = match.index;
    if (start > lastIndex) {
      out.push({ kind: "text", text: raw.slice(lastIndex, start) });
    }
    if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
      out.push({ kind: "strong", text: token.slice(2, -2) });
    } else if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
      out.push({ kind: "code", text: token.slice(1, -1) });
    } else {
      const linkMatch: RegExpExecArray | null = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(
        token,
      );
      if (linkMatch !== null) {
        out.push({
          kind: "link",
          text: linkMatch[1] ?? "",
          href: linkMatch[2] ?? "",
        });
      } else {
        out.push({ kind: "text", text: token });
      }
    }
    lastIndex = start + token.length;
    match = matcher.exec(raw);
  }
  if (lastIndex < raw.length) {
    out.push({ kind: "text", text: raw.slice(lastIndex) });
  }
  return out;
}

function isBreakingBullet(raw: string): boolean {
  return /^\*\*BREAKING\b/.test(raw) || /^BREAKING\b/.test(raw);
}

function releaseId(heading: string): string {
  if (heading.toLowerCase().startsWith("unreleased")) {
    return "changelog-unreleased";
  }
  const versionMatch: RegExpExecArray | null = VERSION_AT_HEAD.exec(heading);
  const version: string = versionMatch?.[1] ?? heading;
  return `changelog-${version.replace(/\./g, "-")}`;
}

function releaseVersionLabel(heading: string): string {
  if (heading.toLowerCase().startsWith("unreleased")) {
    return "Unreleased";
  }
  const versionMatch: RegExpExecArray | null = VERSION_AT_HEAD.exec(heading);
  return versionMatch?.[1] ?? heading;
}

function releaseDate(heading: string): string | null {
  const dateMatch: RegExpExecArray | null = VERSION_WITH_DATE.exec(heading);
  return dateMatch?.[2] ?? null;
}

interface ParseAccumulator {
  preamble: Array<string>;
  releases: Array<ChangelogRelease>;
  currentHeading: string | null;
  blocks: Array<ChangelogBlock>;
  paragraphLines: Array<string>;
  bullets: Array<ChangelogBullet>;
  bulletBuffer: string | null;
}

function flushParagraph(acc: ParseAccumulator): void {
  if (acc.paragraphLines.length === 0) {
    return;
  }
  const text: string = acc.paragraphLines.join(" ").replace(/\s+/g, " ").trim();
  acc.paragraphLines = [];
  if (text === "") {
    return;
  }
  acc.blocks.push({ kind: "paragraph", inlines: parseInlines(text) });
}

function flushBullet(acc: ParseAccumulator): void {
  if (acc.bulletBuffer === null) {
    return;
  }
  const raw: string = acc.bulletBuffer.replace(/\s+/g, " ").trim();
  acc.bulletBuffer = null;
  if (raw === "") {
    return;
  }
  acc.bullets.push({
    isBreaking: isBreakingBullet(raw),
    inlines: parseInlines(raw),
  });
}

function flushList(acc: ParseAccumulator): void {
  flushBullet(acc);
  if (acc.bullets.length === 0) {
    return;
  }
  acc.blocks.push({ kind: "list", bullets: acc.bullets });
  acc.bullets = [];
}

function flushRelease(acc: ParseAccumulator): void {
  flushParagraph(acc);
  flushList(acc);
  if (acc.currentHeading === null) {
    return;
  }
  acc.releases.push({
    id: releaseId(acc.currentHeading),
    heading: acc.currentHeading,
    versionLabel: releaseVersionLabel(acc.currentHeading),
    date: releaseDate(acc.currentHeading),
    blocks: acc.blocks,
  });
  acc.currentHeading = null;
  acc.blocks = [];
}

function parseChangelog(markdown: string): {
  preamble: ReadonlyArray<string>;
  releases: ReadonlyArray<ChangelogRelease>;
} {
  const acc: ParseAccumulator = {
    preamble: [],
    releases: [],
    currentHeading: null,
    blocks: [],
    paragraphLines: [],
    bullets: [],
    bulletBuffer: null,
  };
  const lines: ReadonlyArray<string> = markdown.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (line.startsWith("# ") && acc.currentHeading === null) {
      continue;
    }
    if (line.startsWith("## ")) {
      if (acc.currentHeading === null) {
        const joined: string = acc.paragraphLines.join(" ").replace(/\s+/g, " ").trim();
        if (joined !== "") {
          acc.preamble.push(joined);
        }
        acc.paragraphLines = [];
      } else {
        flushRelease(acc);
      }
      acc.currentHeading = line.slice(3).trim();
      continue;
    }
    if (acc.currentHeading === null) {
      if (line.trim() === "") {
        const joined: string = acc.paragraphLines.join(" ").replace(/\s+/g, " ").trim();
        if (joined !== "") {
          acc.preamble.push(joined);
        }
        acc.paragraphLines = [];
      } else {
        acc.paragraphLines.push(line.trim());
      }
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph(acc);
      flushList(acc);
      acc.blocks.push({ kind: "heading", text: line.slice(4).trim() });
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph(acc);
      flushBullet(acc);
      acc.bulletBuffer = line.slice(2);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph(acc);
      flushList(acc);
      continue;
    }
    if (acc.bulletBuffer !== null) {
      acc.bulletBuffer = `${acc.bulletBuffer} ${line.trim()}`;
      continue;
    }
    acc.paragraphLines.push(line.trim());
  }
  if (acc.currentHeading === null) {
    const joined: string = acc.paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    if (joined !== "") {
      acc.preamble.push(joined);
    }
  } else {
    flushRelease(acc);
  }
  return { preamble: acc.preamble, releases: acc.releases };
}

const PARSED: {
  preamble: ReadonlyArray<string>;
  releases: ReadonlyArray<ChangelogRelease>;
} = parseChangelog(CHANGELOG_MARKDOWN);

export const CHANGELOG_PREAMBLE: ReadonlyArray<string> = PARSED.preamble;
export const CHANGELOG_RELEASES: ReadonlyArray<ChangelogRelease> = PARSED.releases;

export const CHANGELOG_NAV_LEAVES: ReadonlyArray<ChangelogNavLeaf> =
  CHANGELOG_RELEASES.map(
    (release: ChangelogRelease): ChangelogNavLeaf => ({
      id: release.id,
      label: release.versionLabel,
    }),
  );

interface LibraryPackageJson {
  readonly name: string;
  readonly version: string;
  readonly repository: {
    readonly type: string;
    readonly url: string;
  };
}

const LIBRARY_PACKAGE: LibraryPackageJson = libraryPackageJson;

export const LIBRARY_PACKAGE_NAME: string = LIBRARY_PACKAGE.name;
export const LIBRARY_VERSION: string = LIBRARY_PACKAGE.version;

function repositoryHttpsUrl(raw: string): string {
  return raw.replace(/^git\+/, "").replace(/\.git$/, "");
}

export const LIBRARY_REPOSITORY_URL: string = repositoryHttpsUrl(
  LIBRARY_PACKAGE.repository.url,
);

export const LIBRARY_NPM_URL: string =
  `https://www.npmjs.com/package/${LIBRARY_PACKAGE_NAME}`;

export function changelogInlinesText(
  inlines: ReadonlyArray<ChangelogInline>,
): string {
  return inlines
    .map((inline: ChangelogInline): string => inline.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function releaseLead(release: ChangelogRelease): string {
  for (const block of release.blocks) {
    if (block.kind === "paragraph") {
      const text: string = changelogInlinesText(block.inlines);
      if (text !== "") {
        return text;
      }
    }
  }
  for (const block of release.blocks) {
    if (block.kind === "list") {
      const first: ChangelogBullet | undefined = block.bullets[0];
      if (first != null) {
        const text: string = changelogInlinesText(first.inlines);
        if (text !== "") {
          return text;
        }
      }
    }
  }
  return "";
}

export function isPublishedRelease(release: ChangelogRelease): boolean {
  return release.versionLabel !== "Unreleased";
}

export function latestPublishedRelease(
  releases: ReadonlyArray<ChangelogRelease>,
): ChangelogRelease | null {
  for (const release of releases) {
    if (isPublishedRelease(release)) {
      return release;
    }
  }
  return releases[0] ?? null;
}

export interface BreakingReleaseGroup {
  readonly versionLabel: string;
  readonly releaseId: string;
  readonly bullets: ReadonlyArray<ChangelogBullet>;
}

export function breakingChangeGroups(
  releases: ReadonlyArray<ChangelogRelease>,
): ReadonlyArray<BreakingReleaseGroup> {
  const groups: Array<BreakingReleaseGroup> = [];
  for (const release of releases) {
    const bullets: Array<ChangelogBullet> = [];
    for (const block of release.blocks) {
      if (block.kind !== "list") {
        continue;
      }
      for (const bullet of block.bullets) {
        if (bullet.isBreaking) {
          bullets.push(bullet);
        }
      }
    }
    if (bullets.length > 0) {
      groups.push({
        versionLabel: release.versionLabel,
        releaseId: release.id,
        bullets,
      });
    }
  }
  return groups;
}

export function releaseBullets(
  release: ChangelogRelease,
): ReadonlyArray<ChangelogBullet> {
  const bullets: Array<ChangelogBullet> = [];
  for (const block of release.blocks) {
    if (block.kind === "list") {
      for (const bullet of block.bullets) {
        bullets.push(bullet);
      }
    }
  }
  return bullets;
}
