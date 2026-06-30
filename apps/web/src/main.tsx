import * as React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./app";

const container: HTMLElement | null = document.getElementById("root");

if (container == null) {
  throw new Error("Root container was not found.");
}

// The document arrives prerendered with the HOMEPAGE markup (see prerender.mjs).
// On `/` we hydrate that markup so the tiling becomes interactive without
// discarding the SEO content. On the client-only `/showcase` route the
// prerendered homepage markup does not match, so we render fresh (createRoot)
// instead of hydrating.
const path: string = window.location.pathname.replace(/\/+$/, "") || "/";

if (path === "/showcase") {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  hydrateRoot(
    container,
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
