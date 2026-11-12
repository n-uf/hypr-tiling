import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "@jest/globals";
import { CanvasPaneContent } from "./content-canvas";
import { EditorialPaneContent } from "./content-editorial";
import { DOC_PANES, SEO_FAQ_ITEMS, faqAnswerWordCount } from "./docs";
import { renderHead } from "./home-head";

// The home's FAQPage JSON-LD must match visible content: one array feeds both
// the visible "Questions" section (h2, then an h3 question and one p answer per
// item) and the structured data.

const SKINS: ReadonlyArray<{ readonly name: string; readonly pane: () => React.ReactNode }> = [
  {
    name: "mosaic",
    pane: (): React.ReactNode => DOC_PANES.find((pane) => pane.id === "discoverability")?.content,
  },
  {
    name: "editorial",
    pane: (): React.ReactNode => React.createElement(EditorialPaneContent, { paneId: "discoverability" }),
  },
  {
    name: "canvas",
    pane: (): React.ReactNode => React.createElement(CanvasPaneContent, { paneId: "discoverability" }),
  },
];

const decode = (text: string): string =>
  text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

describe("the home FAQ items", (): void => {
  it("are five, with answers of 40-60 words", (): void => {
    expect(SEO_FAQ_ITEMS).toHaveLength(5);
    for (const item of SEO_FAQ_ITEMS) {
      const words: number = faqAnswerWordCount(item);
      expect(words).toBeGreaterThanOrEqual(40);
      expect(words).toBeLessThanOrEqual(60);
    }
  });

  it("have distinct questions", (): void => {
    expect(new Set(SEO_FAQ_ITEMS.map((item) => item.question)).size).toBe(SEO_FAQ_ITEMS.length);
  });
});

describe("the visible Questions section", (): void => {
  for (const skin of SKINS) {
    it(`${skin.name}: an h2, then each question as an h3 with its answer as the next p`, (): void => {
      const markup: string = renderToStaticMarkup(skin.pane() as React.ReactElement);
      expect(markup).toMatch(/<h2[^>]*>Questions<\/h2>/);
      const afterQuestions: string = markup.slice(markup.search(/<h2[^>]*>Questions<\/h2>/));
      const pairs = [...afterQuestions.matchAll(/<h3[^>]*>([^<]*)<\/h3>\s*<p[^>]*>([^<]*)<\/p>/g)].map(
        (match) => ({ question: decode(match[1]), answer: decode(match[2]) }),
      );
      expect(pairs).toEqual(SEO_FAQ_ITEMS.map((item) => ({ question: item.question, answer: item.answer })));
    });
  }
});

describe("the home FAQPage JSON-LD", (): void => {
  it("carries exactly the visible questions and answers", (): void => {
    const blocks = [...renderHead().matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (match) => JSON.parse(match[1]) as { "@graph"?: ReadonlyArray<Record<string, unknown>> },
    );
    const faq = blocks
      .flatMap((block) => block["@graph"] ?? [])
      .find((node) => node["@type"] === "FAQPage") as
      | { mainEntity: ReadonlyArray<{ name: string; acceptedAnswer: { text: string } }> }
      | undefined;
    expect(faq).toBeDefined();
    expect(faq?.mainEntity.map((entity) => ({ question: entity.name, answer: entity.acceptedAnswer.text }))).toEqual(
      SEO_FAQ_ITEMS.map((item) => ({ question: item.question, answer: item.answer })),
    );
  });
});
