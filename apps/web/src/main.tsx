import * as React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App, preloadRoute } from "./app";

const container: HTMLElement | null = document.getElementById("root");

if (container == null) {
  throw new Error("Root container was not found.");
}

// The document arrives prerendered with route-specific markup (see
// prerender.mjs): the HOMEPAGE markup at `/`, and the docs markup at `/docs`.
// On `/` and `/docs` we hydrate that markup so it becomes interactive without
// discarding the SEO content. `/docs` is code-split (see `preloadableRoute` in
// app.tsx), so we AWAIT the docs chunk BEFORE hydrating — the resolved route then
// renders synchronously on the first render, matching the prerendered markup
// (an unresolved lazy would render the Suspense fallback and mismatch, forcing
// React to regenerate the whole tree). On the client-only `/showcase` route the
// prerendered homepage markup does not match, so we render fresh (createRoot).
const path: string = window.location.pathname.replace(/\/+$/, "") || "/";

function mount(): void {
  hydrateRoot(
    container as HTMLElement,
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

if (path === "/showcase") {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else if (path === "/docs") {
  void preloadRoute("/docs").then(mount);
} else {
  mount();
}
