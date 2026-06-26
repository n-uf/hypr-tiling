import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "hypr-tiling": resolve(__dirname, "../../packages/hypr-tiling/index.ts"),
      "hypr-tiling-showcase": resolve(__dirname, "../../packages/showcase/src/index.ts"),
    },
  },
});
