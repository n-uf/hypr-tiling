import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss({ config: resolve(__dirname, "tailwind.config.ts") }), autoprefixer()],
    },
  },
  resolve: {
    alias: {
      "@n-uf/hypr-tiling/devtools": resolve(__dirname, "../../packages/hypr-tiling/devtools.ts"),
      "@n-uf/hypr-tiling/engine": resolve(__dirname, "../../packages/hypr-tiling/engine.ts"),
      "@n-uf/hypr-tiling": resolve(__dirname, "../../packages/hypr-tiling/index.ts"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the large generated API-reference bundle in its own chunk so it
        // is only fetched with the code-split /docs route, never hoisted into
        // the homepage entry chunk.
        manualChunks(id: string): string | undefined {
          if (id.includes("src/api-reference/generated")) {
            return "api-reference";
          }
          return undefined;
        },
      },
    },
  },
});
