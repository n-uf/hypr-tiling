import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { HomePage } from "./page";

const container: HTMLElement | null = document.getElementById("root");

if (container == null) {
  throw new Error("Root container was not found.");
}

// The document arrives prerendered (see prerender.mjs); hydrate the static
// markup so the tiling becomes interactive without discarding the SEO content.
hydrateRoot(
  container,
  <React.StrictMode>
    <HomePage />
  </React.StrictMode>,
);
