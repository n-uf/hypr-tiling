import * as React from "react";
import {
  MOBILE_HOME_QUERY,
  PrerenderedHomeLayoutContext,
  type HomeLayout,
} from "./mobile-home/use-viewport";

// The built `/` carries BOTH home layouts, so a phone's first paint is already
// the mobile layout it ends up on (the stored mobile mode is client-only, so
// that copy is the default mode):
//
//   1. `entry-server.tsx` renders the desktop copy, then the mobile copy;
//      `joinPrerenderedHomeCopies` marks each `<main>` with
//      `data-home-first-paint="desktop|mobile"`. The HTML keeps exactly one
//      `<h1>` (crawlers and our SEO checks read it): the mobile copy's
//      headline ships as a level-1 ARIA heading placeholder.
//   2. `homeFirstPaintCss()` (inlined into the head by `prerender.mjs`) hides
//      the copy that doesn't fit the viewport, so the right one paints even
//      before any script runs.
//   3. A small inline script right after the copies runs
//      `keepPrerenderedHomeCopy` before the first paint: it removes the other
//      copy, unmarks the kept one, turns its headline into the `<h1>`, and
//      records the layout on the container. Doing that before the paint keeps
//      the headline from showing up later as a new largest paint.
//   4. `main.tsx` calls `keepPrerenderedHomeLayout` (same function; it only
//      reads the recorded layout when the inline script already ran) and
//      hydrates under `PrerenderedHomeLayoutContext`, so the viewport hooks
//      render the same layout as the HTML.
//
// Desktop keeps the copy it always had, first in the HTML.

const COPY_ATTRIBUTE: string = "data-home-first-paint";
const KEPT_ATTRIBUTE: string = "data-home-layout";
const TITLE_ATTRIBUTE: string = "data-page-title";

// React hoists the library's `<style href precedence>` chrome styles to the
// front of each render; they belong to the document, not to either copy.
const HOISTED_TAG: RegExp = /<style\b[^>]*>[^<]*<\/style>|<link\b[^>]*>/g;

function splitHomeCopy(
  html: string,
  layout: HomeLayout,
): { readonly hoisted: ReadonlyArray<string>; readonly main: string } {
  const at: number = html.indexOf("<main ");
  const lead: string = at < 0 ? html : html.slice(0, at);
  if (at < 0 || lead.replace(HOISTED_TAG, "") !== "" || !html.endsWith("</main>")) {
    throw new Error(
      `prerender: the ${layout} home copy must be one <main> after React's hoisted styles`,
    );
  }
  return {
    hoisted: lead.match(HOISTED_TAG) ?? [],
    main: `<main ${COPY_ATTRIBUTE}="${layout}" ${html.slice(at + "<main ".length)}`,
  };
}

function demoteTitle(main: string): string {
  if ((main.match(/<h1\b/g) ?? []).length !== 1 || (main.match(/<\/h1>/g) ?? []).length !== 1) {
    throw new Error("prerender: the mobile home copy must carry exactly one <h1>");
  }
  return main
    .replace(/<h1\b/, `<div role="heading" aria-level="1" ${TITLE_ATTRIBUTE}=""`)
    .replace("</h1>", "</div>");
}

/**
 * Client, before the first paint (inline script) and again before hydrating
 * (`main.tsx`): keep the prerendered home copy that fits the viewport, remove
 * the other, unmark the kept one and turn its headline placeholder into the
 * `<h1>`. Returns the kept layout, or null when the markup has no copies (e.g.
 * `/docs`). Self-contained on purpose: its source is inlined into the HTML.
 */
function keepPrerenderedHomeCopy(
  container: Element,
  copyAttribute: string,
  keptAttribute: string,
  titleAttribute: string,
  mobileQuery: string,
): HomeLayout | null {
  const recorded: string | null = container.getAttribute(keptAttribute);
  if (recorded === "desktop" || recorded === "mobile") {
    return recorded;
  }
  const copies: Array<Element> = Array.from(container.children).filter(
    (element: Element): boolean => element.hasAttribute(copyAttribute),
  );
  if (copies.length === 0) {
    return null;
  }
  const wanted: string = window.matchMedia(mobileQuery).matches ? "mobile" : "desktop";
  const kept: Element =
    copies.find((element: Element): boolean => element.getAttribute(copyAttribute) === wanted) ??
    copies[0];
  for (const element of copies) {
    if (element !== kept) {
      element.remove();
    }
  }
  const layout: HomeLayout = kept.getAttribute(copyAttribute) === "mobile" ? "mobile" : "desktop";
  kept.removeAttribute(copyAttribute);
  const placeholder: Element | null = kept.querySelector(`[${titleAttribute}]`);
  if (placeholder != null) {
    const heading: HTMLHeadingElement = document.createElement("h1");
    for (const attribute of Array.from(placeholder.attributes)) {
      if (attribute.name !== "role" && attribute.name !== "aria-level" && attribute.name !== titleAttribute) {
        heading.setAttribute(attribute.name, attribute.value);
      }
    }
    while (placeholder.firstChild != null) {
      heading.appendChild(placeholder.firstChild);
    }
    placeholder.replaceWith(heading);
  }
  container.setAttribute(keptAttribute, layout);
  return layout;
}

/**
 * Server: the `#root` HTML from the rendered desktop and mobile home copies:
 * the hoisted styles once, each copy's `<main>` marked with its layout (the
 * mobile copy's `<h1>` as a placeholder), then the inline script that keeps
 * the right copy before the first paint (it removes itself first, so
 * hydration never sees it).
 */
export function joinPrerenderedHomeCopies(desktopHtml: string, mobileHtml: string): string {
  const desktop = splitHomeCopy(desktopHtml, "desktop");
  const mobile = splitHomeCopy(mobileHtml, "mobile");
  const hoisted: ReadonlyArray<string> = [
    ...new Set<string>([...desktop.hoisted, ...mobile.hoisted]),
  ];
  const args: string = [COPY_ATTRIBUTE, KEPT_ATTRIBUTE, TITLE_ATTRIBUTE, MOBILE_HOME_QUERY]
    .map((value: string): string => JSON.stringify(value))
    .join(",");
  const script: string =
    `<script>(function(s){var r=s.parentNode;s.remove();` +
    `(${keepPrerenderedHomeCopy.toString()})(r,${args})})(document.currentScript)</script>`;
  return hoisted.join("") + desktop.main + demoteTitle(mobile.main) + script;
}

/** Server: CSS that shows only the copy that fits the viewport (no-op once a copy is kept). */
export function homeFirstPaintCss(): string {
  return [
    `@media ${MOBILE_HOME_QUERY}{[${COPY_ATTRIBUTE}="desktop"]{display:none!important}}`,
    `@media not all and ${MOBILE_HOME_QUERY}{[${COPY_ATTRIBUTE}="mobile"]{display:none!important}}`,
  ].join("");
}

/** Client, before hydrating: the kept prerendered home layout (keeping it now if the inline script didn't). */
export function keepPrerenderedHomeLayout(container: HTMLElement): HomeLayout | null {
  return keepPrerenderedHomeCopy(
    container,
    COPY_ATTRIBUTE,
    KEPT_ATTRIBUTE,
    TITLE_ATTRIBUTE,
    MOBILE_HOME_QUERY,
  );
}

const subscribeNever = (): (() => void) => (): void => {};

/**
 * Whether the home's "Questions" section renders in this copy. The built `/`
 * carries both home copies, and the FAQPage JSON-LD must match the visible
 * text exactly once, so the static HTML shows the section in the desktop copy
 * only: the prerendered mobile copy leaves it out while it renders on the
 * server and hydrates, then shows it on the next render (it sits at the very
 * end of the page, below everything, so nothing moves). Everywhere else (the
 * desktop copy, the dev server, client navigation) it is always shown.
 */
export function useShowHomeFaq(): boolean {
  const layout: HomeLayout | null = React.useContext(PrerenderedHomeLayoutContext);
  const hydrating: boolean = useIsHydrating();
  return !(layout === "mobile" && hydrating);
}

/** True while rendering on the server or hydrating; false on every later (or fresh client) render. */
export function useIsHydrating(): boolean {
  return React.useSyncExternalStore(
    subscribeNever,
    (): boolean => false,
    (): boolean => true,
  );
}
