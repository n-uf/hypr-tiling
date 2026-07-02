import {
  CANONICAL_DESCRIPTION,
  DISCOVERABILITY_PARAGRAPHS,
  FEATURE_FACTS,
  INSTALL_CONTROLLED_PARAGRAPH,
  INSTALL_INTRO_PARAGRAPH,
  INSTALL_SNIPPET,
  INTEGRATION_EXAMPLE,
  INTRO_CONTRIBUTING_PARAGRAPH,
  INTRO_DOGFOOD_PARAGRAPH,
  INTRO_HEADLINE_ACCENT,
  INTRO_HEADLINE_LEAD,
  INTRO_LICENSE_TAIL,
  INTRO_REACH_PARAGRAPH,
  LICENSE_NAME,
  MODEL_BODY_PARAGRAPH,
  MODEL_KUDOS_HEADING,
  MODEL_KUDOS_PARAGRAPH,
  ROADMAP_ITEMS,
  ROADMAP_LEAD,
  USE_CASES,
  USECASES_LEAD,
  type DocInline,
  type DocParagraph,
} from "./docs";

// Skin-neutral per-pane content metrics for the homepage. All three skins
// (Mosaic, Editorial, Canvas) render the SAME documentation model, so the metric
// payload is derived ONCE here — off the shared `./docs` constants each pane body
// renders from — and every skin STYLES the same numbers in its own footer. There
// are no hardcoded per-pane counts: edit the content and the metrics track it.
//
// For each pane we concatenate its reading text (prose leads, inline-segment
// paragraphs, and term/detail index rows), then derive a character count, a word
// count, and an estimated read time at ~200 wpm. Panes without measurable text
// return `null`, so each skin's footer can degrade gracefully.

export interface PaneContentMetrics {
  readonly chars: number;
  readonly words: number;
  readonly readMinutes: number;
}

// Words-per-minute constant for the read-time estimate.
const READING_WPM: number = 200;

// The shared `{ term, detail }` shape used by the use-case / feature / roadmap
// index lists in the docs model.
interface TermDetail {
  readonly term: string;
  readonly detail: string;
}

// Flatten a paragraph's inline segments (text / code / emphasis / link label)
// to their reading text.
function inlineText(paragraph: DocParagraph): string {
  return paragraph
    .map((segment: DocInline): string => {
      if (typeof segment === "string") {
        return segment;
      }
      if ("code" in segment) {
        return segment.code;
      }
      if ("em" in segment) {
        return segment.em;
      }
      return segment.link;
    })
    .join("");
}

// Flatten a term/detail index (use cases, features, roadmap) to its text.
function termDetailText(items: ReadonlyArray<TermDetail>): string {
  return items
    .map((item: TermDetail): string => `${item.term} ${item.detail}`)
    .join(" ");
}

// The reading text each documentation pane presents, assembled from the same
// shared content constants the pane bodies render — so the metrics track any
// content edit automatically, with no per-pane numbers to maintain. Keyed by the
// pane id (`tile.id`) shared by all three skins.
const PANE_TEXT: Record<string, string> = {
  intro: [
    INTRO_HEADLINE_LEAD,
    INTRO_HEADLINE_ACCENT,
    CANONICAL_DESCRIPTION,
    INTRO_REACH_PARAGRAPH,
    inlineText(INTRO_DOGFOOD_PARAGRAPH),
    inlineText(INTRO_CONTRIBUTING_PARAGRAPH),
    `${LICENSE_NAME}${INTRO_LICENSE_TAIL}`,
  ].join(" "),
  usecases: [USECASES_LEAD, termDetailText(USE_CASES)].join(" "),
  install: [
    inlineText(INSTALL_INTRO_PARAGRAPH),
    INSTALL_SNIPPET,
    inlineText(INSTALL_CONTROLLED_PARAGRAPH),
    INTEGRATION_EXAMPLE,
  ].join(" "),
  features: termDetailText(FEATURE_FACTS),
  roadmap: [inlineText(ROADMAP_LEAD), termDetailText(ROADMAP_ITEMS)].join(" "),
  model: [
    inlineText(MODEL_BODY_PARAGRAPH),
    MODEL_KUDOS_HEADING,
    inlineText(MODEL_KUDOS_PARAGRAPH),
  ].join(" "),
  discoverability: DISCOVERABILITY_PARAGRAPHS.map(inlineText).join(" "),
};

// Content metrics for a documentation pane, keyed by the pane id (`tile.id`).
// Returns `null` for panes with no measurable text so a footer degrades
// gracefully.
export function paneContentMetrics(paneId: string): PaneContentMetrics | null {
  const text: string | undefined = PANE_TEXT[paneId];
  if (text == null) {
    return null;
  }
  const normalized: string = text.replace(/\s+/g, " ").trim();
  if (normalized === "") {
    return null;
  }
  const words: number = normalized
    .split(" ")
    .filter((token: string): boolean => token.length > 0).length;
  const chars: number = normalized.length;
  const readMinutes: number = Math.max(1, Math.round(words / READING_WPM));
  return { chars, words, readMinutes };
}
