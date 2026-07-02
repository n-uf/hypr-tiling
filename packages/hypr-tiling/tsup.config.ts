import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts", "devtools.ts", "engine.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  external: ["react", "react-dom"],
  outExtension: ({ format }) => ({
    js: format === "esm" ? ".mjs" : ".cjs",
  }),
});
