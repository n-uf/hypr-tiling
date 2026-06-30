import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@n-uf/hypr-tiling/devtools": resolve(__dirname, "../../packages/hypr-tiling/devtools.ts"),
      "@n-uf/hypr-tiling": resolve(__dirname, "../../packages/hypr-tiling/index.ts"),
      "hypr-tiling-showcase": resolve(__dirname, "../../packages/showcase/src/index.ts"),
    },
  },
});
