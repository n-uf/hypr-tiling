/**
 * @jest-environment ../../packages/hypr-tiling/node_modules/jest-environment-jsdom
 */
import { afterEach, describe, expect, it } from "@jest/globals";
import { joinPrerenderedHomeCopies, keepPrerenderedHomeLayout } from "./home-first-paint";

// Two home copies shaped like React's output: hoisted chrome styles first,
// then one <main> carrying the page's headline.
const HOISTED: string = '<style data-precedence="default" data-href="chrome">.x{}</style>';
const copy = (layout: string): string =>
  `${HOISTED}<main class="${layout}-main"><h1 class="title">Rearrange <em>at runtime.</em></h1><p>${layout}</p></main>`;

function mountHome(mobile: boolean): HTMLElement {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): { matches: boolean; media: string } => ({ matches: mobile, media: query }),
  });
  const root: HTMLElement = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  // innerHTML leaves scripts inert; re-insert the inline one so it runs the
  // way the parser runs it (document.currentScript = that element).
  root.innerHTML = joinPrerenderedHomeCopies(copy("desktop"), copy("mobile"));
  const inert: HTMLScriptElement | null = root.querySelector("script");
  if (inert == null) {
    throw new Error("no inline script");
  }
  const live: HTMLScriptElement = document.createElement("script");
  live.textContent = inert.textContent;
  inert.replaceWith(live);
  return root;
}

afterEach((): void => {
  document.body.innerHTML = "";
});

describe("joinPrerenderedHomeCopies", (): void => {
  it("keeps the hoisted styles once, marks both copies, and leaves one <h1>", (): void => {
    const html: string = joinPrerenderedHomeCopies(copy("desktop"), copy("mobile"));
    expect(html.split(HOISTED).length - 1).toBe(1);
    expect(html).toContain('<main data-home-first-paint="desktop" class="desktop-main">');
    expect(html).toContain('<main data-home-first-paint="mobile" class="mobile-main">');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('<div role="heading" aria-level="1" data-page-title="" class="title">');
    expect(html.indexOf("<script>")).toBeGreaterThan(html.lastIndexOf("</main>"));
  });

  it("refuses a copy that is not one <main> after hoisted styles", (): void => {
    expect((): string => joinPrerenderedHomeCopies("<div></div>", copy("mobile"))).toThrow(/one <main>/);
    expect((): string => joinPrerenderedHomeCopies(copy("desktop"), `${copy("mobile")}<p></p>`)).toThrow(
      /one <main>/,
    );
  });

  it("refuses a mobile copy without exactly one <h1>", (): void => {
    expect((): string =>
      joinPrerenderedHomeCopies(copy("desktop"), '<main class="m"><h1>a</h1><h1>b</h1></main>'),
    ).toThrow(/exactly one <h1>/);
  });
});

describe("the inline keep script", (): void => {
  it("on a phone keeps the mobile copy and makes its headline the <h1>", (): void => {
    const root: HTMLElement = mountHome(true);
    const mains: ReadonlyArray<Element> = Array.from(root.querySelectorAll("main"));
    expect(mains.map((main: Element): string => main.className)).toEqual(["mobile-main"]);
    expect(mains[0].hasAttribute("data-home-first-paint")).toBe(false);
    const headings: ReadonlyArray<Element> = Array.from(root.querySelectorAll("h1"));
    expect(headings).toHaveLength(1);
    expect(headings[0].outerHTML).toBe('<h1 class="title">Rearrange <em>at runtime.</em></h1>');
    expect(root.querySelector("[data-page-title], [role=heading], script")).toBeNull();
    expect(root.getAttribute("data-home-layout")).toBe("mobile");
    expect(root.querySelector("style")).not.toBeNull();
  });

  it("on a desktop keeps the desktop copy as it was", (): void => {
    const root: HTMLElement = mountHome(false);
    expect(Array.from(root.querySelectorAll("main")).map((main: Element): string => main.className)).toEqual([
      "desktop-main",
    ]);
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(root.querySelector("[data-page-title], script")).toBeNull();
    expect(root.getAttribute("data-home-layout")).toBe("desktop");
  });

  it("main.tsx then reads the kept layout without touching the DOM again", (): void => {
    const root: HTMLElement = mountHome(true);
    const kept: Element | null = root.querySelector("main");
    expect(keepPrerenderedHomeLayout(root)).toBe("mobile");
    expect(root.querySelector("main")).toBe(kept);
  });
});

describe("keepPrerenderedHomeLayout", (): void => {
  it("is null when the markup has no home copies (e.g. /docs)", (): void => {
    const root: HTMLElement = document.createElement("div");
    root.innerHTML = "<main><h1>Docs</h1></main>";
    expect(keepPrerenderedHomeLayout(root)).toBeNull();
    expect(root.querySelectorAll("main")).toHaveLength(1);
  });
});
