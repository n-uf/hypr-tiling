// `{{live:/blog/other}}A sentence that links to [it](/blog/other).{{/live}}`
//
// A live block wraps part of one paragraph. The sentence shows only once the
// page at /blog/other is live (in a preview build, where drafts are shown, a
// draft counts as shown); a production build removes it until then. So a link
// line to a page that is still a draft merges together with the draft and
// appears on the flip day with no second commit. A bare link from a live page
// to a draft still fails the build (see validate.ts).
//
// The markers are plain text for the markdown renderer, so they pass through
// it untouched; `findLiveBlocks` reads them from the rendered HTML (which also
// tells which links sit inside which block) and `resolveLiveBlocks` removes or
// unwraps each block once the site knows which targets are shown.

/** A site path of a content page: `/<section>/<slug>`. */
export const LIVE_TARGET: RegExp = /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface LiveBlock {
  /** The page whose going live reveals the sentence. */
  readonly target: string;
  /** Every internal href inside the block, anchors and all. */
  readonly hrefs: ReadonlyArray<string>;
  /** Words of text inside the block (what a build that removes it loses). */
  readonly words: number;
}

const TOKEN: RegExp = /\{\{(?:live:([^}\n]*)|(\/live))\}\}/g;
const BLOCK: RegExp = /(\s?)\{\{live:([^}\n]*)\}\}([\s\S]*?)\{\{\/live\}\}/g;

/**
 * Syntax of the markers in a raw markdown body: no stray or unclosed marker,
 * no nesting, nothing across a paragraph break, and a target shaped like a
 * content page path (that it names a real page is checked with the site).
 */
export function checkLiveSyntax(body: string, file: string): ReadonlyArray<string> {
  const problems: Array<string> = [];
  let open: { readonly target: string; readonly at: number } | null = null;
  for (const match of body.matchAll(TOKEN)) {
    const at: number = match.index ?? 0;
    if (match[2] !== undefined) {
      if (open == null) {
        problems.push(`${file}: a stray {{/live}} with no {{live:/path}} before it`);
      } else {
        if (/\n[ \t]*\n/.test(body.slice(open.at, at))) {
          problems.push(
            `${file}: the {{live:${open.target}}} block crosses a paragraph break; wrap a sentence of one paragraph`,
          );
        }
        open = null;
      }
      continue;
    }
    const target: string = (match[1] ?? "").trim();
    if (open != null) {
      problems.push(`${file}: {{live:${target}}} starts inside the open {{live:${open.target}}} block; live blocks do not nest`);
    }
    if (!LIVE_TARGET.test(target)) {
      problems.push(
        `${file}: {{live:${target}}} needs the path of a use-case or blog page, like {{live:/blog/some-page}} (no anchor, no trailing slash)`,
      );
    }
    open = { target, at };
  }
  if (open != null) {
    problems.push(`${file}: the {{live:${open.target}}} block is never closed with {{/live}}`);
  }
  const leftover: string = body.replace(TOKEN, "");
  if (/\{\{\/?live|live:[^\s]*\}\}/.test(leftover)) {
    problems.push(`${file}: a malformed live marker; the form is {{live:/section/slug}}...{{/live}}`);
  }
  return problems;
}

/** Read the blocks of rendered HTML (or text). Problems here are about the HTML, not the syntax. */
export function findLiveBlocks(
  html: string,
  file: string,
): { readonly blocks: ReadonlyArray<LiveBlock>; readonly problems: ReadonlyArray<string> } {
  const blocks: Array<LiveBlock> = [];
  const problems: Array<string> = [];
  for (const match of html.matchAll(BLOCK)) {
    const target: string = match[2].trim();
    const inner: string = match[3];
    const at: number = match.index ?? 0;
    const hrefs: Array<string> = [...inner.matchAll(/\shref="([^"]*)"/g)]
      .map((href): string => href[1].replace(/&amp;/g, "&"))
      .filter((href): boolean => href.startsWith("/") || href.startsWith("#"));
    const words: number = inner.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
    blocks.push({ target, hrefs, words });
    // The block has to sit in a plain paragraph: walk the tags open around it,
    // and refuse a list, quote, table, heading or code element anywhere in the
    // stack (a hidden block would leave an empty <li>, or a stray <code></code>).
    const open: ReadonlyArray<string> = openTags(html.slice(0, at));
    const refused: string | undefined = open.find((name): boolean => REFUSED_AROUND_BLOCK.test(name));
    if (refused != null || !open.includes("p")) {
      problems.push(
        `${file}: the {{live:${target}}} block has to sit in a plain paragraph, not in a list, quote, table, heading or code (${refused != null ? `it is inside <${refused}>` : "it is not inside a paragraph"})`,
      );
    }
    if (!tagsBalance(inner)) {
      problems.push(`${file}: the {{live:${target}}} block cuts through a link or other formatting; wrap whole sentences`);
    }
  }
  return { blocks, problems };
}

const REFUSED_AROUND_BLOCK: RegExp = /^(?:li|ol|ul|blockquote|table|td|th|h[1-6]|code|pre)$/;
const VOID_TAGS: ReadonlyArray<string> = ["br", "hr", "img", "input", "wbr"];

/** The names of the elements still open at the end of an HTML chunk, outermost first. */
function openTags(html: string): ReadonlyArray<string> {
  const stack: Array<string> = [];
  for (const tag of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi)) {
    const name: string = tag[2].toLowerCase();
    if (tag[3] === "/" || VOID_TAGS.includes(name)) {
      continue;
    }
    if (tag[1] === "/") {
      const at: number = stack.lastIndexOf(name);
      if (at >= 0) {
        stack.length = at;
      }
    } else {
      stack.push(name);
    }
  }
  return stack;
}

/** The text with every marker turned into a space, for counting words. */
export function stripLiveMarkers(text: string): string {
  return text.replace(TOKEN, " ");
}

function tagsBalance(html: string): boolean {
  const stack: Array<string> = [];
  for (const tag of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi)) {
    const name: string = tag[2].toLowerCase();
    if (tag[3] === "/" || ["br", "hr", "img"].includes(name)) {
      continue;
    }
    if (tag[1] === "/") {
      if (stack.pop() !== name) {
        return false;
      }
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

/**
 * Unwrap the blocks whose target is shown and drop the others, together with
 * the one space in front of each. `shown` gets the block's target path.
 */
export function resolveLiveBlocks(text: string, shown: (target: string) => boolean): string {
  return text
    .replace(BLOCK, (_all: string, space: string, target: string, inner: string): string =>
      shown(target.trim()) ? `${space}${inner}` : "",
    )
    .replace(/<p(?: [^>]*)?>\s*<\/p>\n?/g, "");
}
