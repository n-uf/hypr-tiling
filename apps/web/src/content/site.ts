import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CONTENT_SECTIONS,
  DOCS_MAIN_KEYWORD,
  HOME_MAIN_KEYWORD,
  sectionPath,
  type ContentSection,
} from "./constants";
import { splitFrontMatter } from "./front-matter";
import { processMarkdown } from "./markdown";
import {
  ContentProblemsError,
  type ContentFrontMatter,
  type ContentPage,
  type ContentSite,
} from "./types";
import {
  readFrontMatter,
  validateSite,
  type ImageInfo,
  type SiteContext,
} from "./validate";

export const SITE_ORIGIN: string = "https://hypr-tiling.n-uf.com";

const SLUG_FILE: RegExp = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export interface ContentFile {
  readonly section: ContentSection;
  /** The file name, e.g. `react-mosaic-alternatives.md`. */
  readonly name: string;
  readonly raw: string;
}

export interface ContentDirectory {
  /** Entries of `content/` itself that are not a section folder. */
  readonly strays: ReadonlyArray<string>;
  /** Names inside a section folder that are not `<slug>.md` files. */
  readonly rejected: ReadonlyArray<{ readonly section: ContentSection; readonly name: string }>;
  readonly files: ReadonlyArray<ContentFile>;
}

/** Read `content/<section>/<slug>.md` files. Dotfiles (`.DS_Store`) are ignored. */
export function readContentDirectory(root: string): ContentDirectory {
  const strays: Array<string> = [];
  const rejected: Array<{ section: ContentSection; name: string }> = [];
  const files: Array<ContentFile> = [];
  let top: ReadonlyArray<string> = [];
  try {
    top = readdirSync(root).filter((name): boolean => !name.startsWith("."));
  } catch {
    top = [];
  }
  for (const name of top) {
    if (!(CONTENT_SECTIONS as ReadonlyArray<string>).includes(name)) {
      strays.push(name);
    }
  }
  for (const section of CONTENT_SECTIONS) {
    let names: ReadonlyArray<string> = [];
    try {
      names = readdirSync(join(root, section)).filter((name): boolean => !name.startsWith("."));
    } catch {
      names = [];
    }
    for (const name of [...names].sort()) {
      const full: string = join(root, section, name);
      if (SLUG_FILE.test(name) && statSync(full).isFile()) {
        files.push({ section, name, raw: readFileSync(full, "utf8") });
      } else {
        rejected.push({ section, name });
      }
    }
  }
  return { strays, rejected, files };
}

export interface LoadResult {
  readonly site: ContentSite;
  readonly problems: ReadonlyArray<string>;
}

/** Parse and check every file. Returns the problems; `loadContentSite` throws on them. */
export function checkContentFiles(
  directory: ContentDirectory,
  context: SiteContext,
): LoadResult {
  const problems: Array<string> = [];
  for (const name of directory.strays) {
    problems.push(
      `content/${name}: not a section folder; only content/use-cases and content/blog hold pages`,
    );
  }
  for (const { section, name } of directory.rejected) {
    problems.push(
      `content/${section}/${name}: only <slug>.md files (lower case, hyphens) become pages; keep drafts and review copies outside content/`,
    );
  }

  const pages: Array<ContentPage> = [];
  for (const file of directory.files) {
    const match: RegExpMatchArray | null = file.name.match(SLUG_FILE);
    if (match == null) {
      continue;
    }
    const slug: string = match[1];
    const label = `content/${file.section}/${file.name}`;
    const split = splitFrontMatter(file.raw, label);
    problems.push(...split.problems);
    const markdown = processMarkdown(split.body, label);
    problems.push(...markdown.problems);
    if (split.data == null) {
      continue;
    }
    const checked = readFrontMatter(split.data, label, context.today);
    problems.push(...checked.problems);
    const frontMatter: ContentFrontMatter | null = checked.frontMatter;
    if (frontMatter == null) {
      continue;
    }
    const path = `${sectionPath(file.section)}/${slug}`;
    pages.push({
      ...frontMatter,
      section: file.section,
      slug,
      path,
      file: label,
      url: `${SITE_ORIGIN}${path}`,
      ogPath: `/og/${file.section}-${slug}.png`,
      ledeHtml: markdown.ledeHtml,
      ledeText: markdown.ledeText,
      bodyHtml: markdown.bodyHtml,
      headings: markdown.headings,
      links: markdown.links,
      wordCount: markdown.wordCount,
    });
  }

  pages.sort(
    (a, b): number =>
      b.published.localeCompare(a.published) ||
      b.updated.localeCompare(a.updated) ||
      a.slug.localeCompare(b.slug),
  );
  const site = validateSite(pages, context);
  problems.push(...site.problems);
  return { site: { pages, warnings: site.warnings }, problems };
}

export interface LoadOptions {
  /** The `content/` folder. */
  readonly contentRoot: string;
  /** The `public/` folder (share images are looked up under `public/og`). */
  readonly publicRoot: string;
  readonly docsAnchors: ReadonlySet<string>;
  /** `YYYY-MM-DD`; defaults to today, UTC. */
  readonly today?: string;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Read the dimensions of a PNG from its header, or null if it is not a PNG. */
export function readPngInfo(buffer: Buffer, bytes: number): ImageInfo | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    return null;
  }
  return { bytes, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function inspectPublicPng(publicRoot: string, publicPath: string): ImageInfo | null {
  const file: string = resolve(publicRoot, `.${publicPath}`);
  try {
    const bytes: number = statSync(file).size;
    return readPngInfo(readFileSync(file).subarray(0, 32), bytes) ?? { bytes, width: 0, height: 0 };
  } catch {
    return null;
  }
}

/** Load, parse and check the whole `content/` folder. Throws `ContentProblemsError` listing every problem. */
export function loadContentSite(options: LoadOptions): ContentSite {
  const result: LoadResult = checkContentFiles(readContentDirectory(options.contentRoot), {
    today: options.today ?? process.env.CONTENT_TODAY ?? todayUtc(),
    docsAnchors: options.docsAnchors,
    reservedKeywords: new Map<string, string>([
      [HOME_MAIN_KEYWORD, "the home page"],
      [DOCS_MAIN_KEYWORD, "the docs page"],
    ]),
    inspectImage: (publicPath: string): ImageInfo | null =>
      inspectPublicPng(options.publicRoot, publicPath),
  });
  if (result.problems.length > 0) {
    throw new ContentProblemsError(result.problems);
  }
  return result.site;
}
