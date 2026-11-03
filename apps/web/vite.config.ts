import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { resolve } from "node:path";

// Oldest browsers the built CSS keeps working in, used by both autoprefixer and
// the CSS minifier. Vite 8 defaults the minifier to Safari 16.4, which rewrites
// `@media (min-width: 640px)` to `(width>=640px)`: older iOS Safari ignores
// that, and the Play CDN's CSS used the plain form and -webkit- prefixes.
// Firefox 92 is the first with `system-ui`; older targets make the minifier
// expand it into a longer font stack.
const CSS_BROWSERS: Record<string, number> = { chrome: 87, edge: 88, firefox: 92, safari: 14, ios: 14 };

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: resolve(__dirname, "tailwind.config.ts") }),
        autoprefixer({
          overrideBrowserslist: Object.entries(CSS_BROWSERS).map(
            ([name, version]) => `${name === "ios" ? "ios_saf" : name} >= ${version}`,
          ),
        }),
      ],
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
    cssTarget: Object.entries(CSS_BROWSERS).map(([name, version]) => `${name}${version}`),
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
