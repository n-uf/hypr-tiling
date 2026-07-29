import * as React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App, preloadRoute } from "./app";

const container: HTMLElement | null = document.getElementById("root");

if (container == null) {
  throw new Error("Root container was not found.");
}

// The BUILT document arrives prerendered with route-specific markup (see
// prerender.mjs): the HOMEPAGE markup at `/`, and the docs markup at `/docs`.
// On `/` and `/docs` we hydrate that markup so it becomes interactive without
// discarding the SEO content. `/docs` is code-split (see `preloadableRoute` in
// app.tsx), so we AWAIT the docs chunk BEFORE hydrating — the resolved route then
// renders synchronously on the first render, matching the prerendered markup
// (an unresolved lazy would render the Suspense fallback and mismatch, forcing
// React to regenerate the whole tree). On the client-only `/showcase` route the
// prerendered homepage markup does not match, so we render fresh (createRoot).
//
// Under `vite dev`, though, there IS no prerendered markup: `prerender.mjs`
// only replaces the `<!--app-html-->` marker with real HTML as a BUILD step
// (see that script), so the dev server serves `index.html` completely
// unmodified — `#root` holds nothing but that HTML comment. Calling
// `hydrateRoot` against that empty shell is a guaranteed "Hydration failed"
// error (React finds no `<main>` to reconcile against at all), unrelated to
// any app state — it's a dev-vs-build environment difference, not a real
// server/client render mismatch. Detect which case we're in by checking for
// an actual prerendered ELEMENT (a comment node doesn't count) and fall back
// to a plain client render when there's nothing real to hydrate.
const hasPrerenderedMarkup: boolean = container.firstElementChild != null;
const path: string = window.location.pathname.replace(/\/+$/, "") || "/";

function renderFresh(): void {
  createRoot(container as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

function mount(): void {
  if (!hasPrerenderedMarkup) {
    renderFresh();
    return;
  }
  hydrateRoot(
    container as HTMLElement,
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

if (path === "/showcase") {
  renderFresh();
} else if (path === "/docs") {
  void preloadRoute("/docs").then(mount);
} else {
  mount();
}
