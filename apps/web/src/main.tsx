import * as React from "react";
import { createRoot } from "react-dom/client";
import { HomePage } from "./page";

const container: HTMLElement | null = document.getElementById("root");

if (container == null) {
  throw new Error("Root container was not found.");
}

createRoot(container).render(
  <React.StrictMode>
    <HomePage />
  </React.StrictMode>,
);
