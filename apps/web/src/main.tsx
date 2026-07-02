import * as React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./app";

const container: HTMLElement | null = document.getElementById("root");

if (container == null) {
  throw new Error("Root container was not found.");
}

// The document arrives prerendered with route-specific markup (see
// prerender.mjs): the HOMEPAGE markup at `/`, and the docs markup at `/docs`.
// On `/` and `/docs` we hydrate that markup so it becomes interactive without
// discarding the SEO content. `/docs` is code-split (React.lazy in app.tsx), so
// we preload the docs chunk BEFORE hydrating — otherwise the lazy component
// would suspend on the first render and mismatch the prerendered markup. On the
// client-only `/showcase` route the prerendered homepage markup does not match,
// so we render fresh (createRoot) instead of hydrating.
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
  void import("./docs-page").then(mount);
} else {
  mount();
}
