import { defineConfig, type Options } from "tsup";

const shared: Pick<Options, "format" | "dts" | "outExtension"> = {
  format: ["esm", "cjs"],
  dts: true,
  outExtension: ({ format }) => ({
    js: format === "esm" ? ".mjs" : ".cjs",
  }),
};

/**
 * Two independent build configurations so the `./engine` entry never shares a
 * chunk with the React entries.
 *
 * With a single `entry: [index, devtools, engine]` config, tsup/esbuild code
 * splitting hoists every module reachable from 2+ entries into shared
 * `chunk-*.mjs` files; the engine entry then imports the same chunk that holds
 * the React renderer (`createContext`, hooks, theme). Evaluating that chunk in
 * a react-server layer (Next.js route handlers, RSC) fails with
 * `createContext is not a function` because the `react-server` build of React
 * has no `createContext`.
 *
 * `engine.ts` is therefore built alone with `splitting: false` — a standalone
 * `dist/engine.{mjs,cjs}` whose only externals are `clsx` / `tailwind-merge`.
 * `index` / `devtools` keep sharing the renderer chunk between themselves.
 *
 * Both configs run concurrently, so neither uses `clean: true` (one config's
 * clean would race the other's emitted files); `pnpm build` clears `dist/`
 * before invoking tsup instead.
 */
export default defineConfig([
  {
    ...shared,
    entry: ["index.ts", "devtools.ts"],
    clean: false,
    external: ["react", "react-dom"],
  },
  {
    ...shared,
    entry: ["engine.ts"],
    clean: false,
    splitting: false,
    external: ["react", "react-dom"],
  },
]);
