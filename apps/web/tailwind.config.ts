import type { Config } from "tailwindcss";

// Build-time Tailwind for the homepage and /docs. This replaces the Tailwind
// Play CDN script and its inline `tailwind.config` that index.html used to
// load (render-blocking, ~400 KB of compiler on every visit). The CDN served
// Tailwind 3.4.17, so the version stays pinned to keep the generated CSS the
// same.
export default {
  content: {
    relative: true,
    files: [
      "./index.html",
      // App code, including the generated API reference and the example sources.
      "./src/**/*.{ts,tsx}",
      // The renderer and its themes emit Tailwind classes (see the package README).
      "../../packages/hypr-tiling/*.ts",
      "../../packages/hypr-tiling/{react,engine}/**/*.{ts,tsx}",
    ],
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
} satisfies Config;
