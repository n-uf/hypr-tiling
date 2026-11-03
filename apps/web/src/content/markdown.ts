import { Marked, type RendererObject, type Token, type Tokens } from "marked";
import type { ContentHeading, ContentLink } from "./types";

// Markdown -> HTML for the content pages, at build time only (the prerender and
// the prebuild script). The bodies never reach the client bundle: nothing in
// the browser imports this module. Raw HTML, images and an h1 in a body are
// reported as problems instead of being rendered; everything else (H2 to H4,
// paragraphs, lists, tables, fenced code, links, inline code, bold, italic,
// quotes) maps to the classes below. Elements that need no per-element class
// (p, ul, ol, li, strong, em, blockquote, hr) are styled by the page's wrapper.

/** Ids the page template uses for its own sections; a body heading may not take them. */
export const RESERVED_HEADING_IDS: ReadonlySet<string> = new Set<string>([
  "faq",
  "sources",
  "read-next",
  "install",
  "key-takeaways",
  "on-this-page",
  "content",
  "top",
]);

const LINK_CLASS: string =
  "text-amber-200 underline decoration-amber-400/40 underline-offset-[3px] transition-colors hover:text-amber-100 hover:decoration-amber-300/70";
const CODESPAN_CLASS: string =
  "rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[12.5px] text-amber-200/90";
const PRE_CLASS: string =
  "my-4 overflow-x-auto rounded-md border border-white/[0.08] bg-[#0a0b0d] p-3.5 font-mono text-[12.5px] leading-relaxed text-stone-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
const TABLE_WRAP_CLASS: string =
  "my-4 overflow-x-auto rounded-lg border border-white/[0.07]";
const TH_CLASS: string =
  "min-w-[7rem] bg-[#16171b] px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300/80";
const TD_CLASS: string =
  "min-w-[7rem] border-t border-white/[0.07] px-3 py-2 align-top text-stone-300/90";
const LEDE_CLASS: string = "my-5 text-[17.5px] leading-[1.6] text-stone-200";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `Why tiling? (and docking)` -> `why-tiling-and-docking`. */
export function slugifyHeading(text: string): string {
  const slug: string = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "section" : slug;
}

export function plainText(token: Token | Tokens.TableCell): string {
  const node = token as {
    readonly type?: string;
    readonly text?: string;
    readonly tokens?: ReadonlyArray<Token>;
    readonly items?: ReadonlyArray<Token>;
    readonly header?: ReadonlyArray<Tokens.TableCell>;
    readonly rows?: ReadonlyArray<ReadonlyArray<Tokens.TableCell>>;
  };
  if (node.type === "table") {
    const cells: Array<Tokens.TableCell> = [
      ...(node.header ?? []),
      ...(node.rows ?? []).flat(),
    ];
    return cells.map(plainText).join(" ");
  }
  if (node.items != null) {
    return node.items.map(plainText).join(" ");
  }
  if (node.tokens != null) {
    return node.tokens.map(plainText).join("");
  }
  return node.text ?? "";
}

export interface MarkdownResult {
  readonly ledeHtml: string;
  readonly bodyHtml: string;
  readonly headings: ReadonlyArray<ContentHeading>;
  readonly links: ReadonlyArray<ContentLink>;
  /** Plain text of the first paragraph (empty if the body does not start with one). */
  readonly ledeText: string;
  readonly wordCount: number;
  readonly problems: ReadonlyArray<string>;
}

type HeadingToken = Tokens.Heading & { id?: string };
type ParagraphToken = Tokens.Paragraph & { lede?: boolean };

const renderer: RendererObject = {
  heading(token: Tokens.Heading): string {
    const { depth, tokens, id } = token as HeadingToken;
    const inner: string = this.parser.parseInline(tokens);
    const idAttr: string = id == null ? "" : ` id="${escapeHtml(id)}"`;
    if (depth === 2) {
      return (
        `<h2${idAttr} class="mb-2 mt-10 flex scroll-mt-16 items-baseline gap-3 font-display text-[24px] font-medium leading-[1.25] tracking-[-0.01em] text-stone-50">` +
        `<span aria-hidden="true" class="h-5 w-[3px] shrink-0 translate-y-[2px] rounded-sm bg-amber-400"></span>` +
        `<span>${inner}</span></h2>\n`
      );
    }
    if (depth === 3) {
      return `<h3${idAttr} class="mb-1.5 mt-6 scroll-mt-16 font-display text-[19px] font-medium leading-[1.3] text-stone-100">${inner}</h3>\n`;
    }
    return `<h${depth}${idAttr} class="mb-1 mt-5 scroll-mt-16 text-[15px] font-semibold text-stone-100">${inner}</h${depth}>\n`;
  },
  paragraph(token: Tokens.Paragraph): string {
    const inner: string = this.parser.parseInline(token.tokens);
    if ((token as ParagraphToken).lede === true) {
      return `<p class="${LEDE_CLASS}">${inner}</p>\n`;
    }
    return `<p>${inner}</p>\n`;
  },
  code(token: Tokens.Code): string {
    const lang: string = (token.lang ?? "").trim().split(/\s+/)[0] ?? "";
    const langClass: string = lang === "" ? "" : ` class="language-${escapeHtml(lang)}"`;
    return `<pre tabindex="0" class="${PRE_CLASS}"><code${langClass}>${escapeHtml(token.text)}</code></pre>\n`;
  },
  codespan(token: Tokens.Codespan): string {
    return `<code class="${CODESPAN_CLASS}">${escapeHtml(token.text)}</code>`;
  },
  link(token: Tokens.Link): string {
    const inner: string = this.parser.parseInline(token.tokens);
    // Only site paths, same-page anchors and https URLs become hrefs; the
    // site-level check reports anything else, and it never renders as a link.
    if (!/^(\/(?!\/)|#|https:\/\/)/i.test(token.href)) {
      return inner;
    }
    const external: boolean = /^https:\/\//i.test(token.href);
    const attrs: string = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    const title: string = token.title == null || token.title === "" ? "" : ` title="${escapeHtml(token.title)}"`;
    return `<a href="${escapeHtml(token.href)}"${title}${attrs} class="${LINK_CLASS}">${inner}</a>`;
  },
  table(token: Tokens.Table): string {
    const alignClass = (align: Tokens.TableCell["align"]): string =>
      align === "center" ? " text-center" : align === "right" ? " text-right" : "";
    const head: string = token.header
      .map(
        (cell): string =>
          `<th scope="col" class="${TH_CLASS}${alignClass(cell.align)}">${this.parser.parseInline(cell.tokens)}</th>`,
      )
      .join("");
    const rows: string = token.rows
      .map(
        (row): string =>
          `<tr>${row
            .map(
              (cell): string =>
                `<td class="${TD_CLASS}${alignClass(cell.align)}">${this.parser.parseInline(cell.tokens)}</td>`,
            )
            .join("")}</tr>`,
      )
      .join("");
    return (
      `<div tabindex="0" class="${TABLE_WRAP_CLASS}"><table class="w-full border-collapse text-[13.5px]">` +
      `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`
    );
  },
  // Raw HTML and images are reported as problems; if they get this far they
  // render as visible text rather than markup.
  html(token: Tokens.HTML | Tokens.Tag): string {
    return escapeHtml(token.text);
  },
  image(token: Tokens.Image): string {
    return escapeHtml(token.text);
  },
};

const marked: Marked = new Marked({ gfm: true, breaks: false, renderer });

function snippet(raw: string): string {
  const flat: string = raw.replace(/\s+/g, " ").trim();
  return flat.length > 50 ? `${flat.slice(0, 50)}...` : flat;
}

/**
 * Lex a body, collect what the build checks need (headings with ids, links,
 * problems) and render it. `file` only prefixes the problem messages.
 */
export function processMarkdown(body: string, file: string): MarkdownResult {
  const tokens: Token[] = marked.lexer(body);
  const problems: Array<string> = [];
  const headings: Array<ContentHeading> = [];
  const links: Array<ContentLink> = [];
  const taken = new Set<string>(RESERVED_HEADING_IDS);
  let words = 0;

  marked.walkTokens(tokens, (token: Token): void => {
    if (token.type === "heading") {
      const heading = token as HeadingToken;
      const text: string = plainText(heading).trim();
      if (heading.depth === 1) {
        problems.push(
          `${file}: the body has an h1 ("${snippet(text)}"); the page's h1 comes from the front matter, so remove the # heading`,
        );
      }
      let id: string = slugifyHeading(text);
      const base: string = id;
      for (let n = 2; taken.has(id); n += 1) {
        id = `${base}-${n}`;
      }
      taken.add(id);
      heading.id = id;
      if (heading.depth >= 2) {
        headings.push({ id, text, depth: heading.depth });
      }
    } else if (token.type === "html" && !(token as Tokens.HTML).raw.startsWith("</")) {
      problems.push(
        `${file}: raw HTML in the body ("${snippet((token as Tokens.HTML).raw)}"); use markdown only`,
      );
    } else if (token.type === "image") {
      problems.push(
        `${file}: an image in the body ("${snippet(token.raw)}"); the content pages do not render images yet`,
      );
    } else if (token.type === "link") {
      const link = token as Tokens.Link;
      links.push({ href: link.href, text: plainText(link).trim() });
    }
  });

  for (const token of tokens) {
    if (token.type !== "code" && token.type !== "space" && token.type !== "def") {
      words += plainText(token).split(/\s+/).filter(Boolean).length;
    }
  }

  const first: Token | undefined = tokens.find((token): boolean => token.type !== "space");
  let ledeHtml = "";
  let ledeText = "";
  let rest: Token[] = tokens;
  if (first != null && first.type === "paragraph") {
    (first as ParagraphToken).lede = true;
    ledeText = plainText(first).trim();
    const at: number = tokens.indexOf(first);
    ledeHtml = marked.parser([first]);
    rest = [...tokens.slice(0, at), ...tokens.slice(at + 1)];
  }
  // `parser` needs the lexer's link table only for reference links, which the
  // lexer already resolved into link tokens.
  const bodyHtml: string = marked.parser(rest);

  return { ledeHtml, bodyHtml, headings, links, ledeText, wordCount: words, problems };
}
