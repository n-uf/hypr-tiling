const path = require("node:path");

const packageDir = path.resolve(__dirname, "../../packages/hypr-tiling");

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  rootDir: __dirname,
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  modulePaths: [path.join(packageDir, "node_modules")],
  moduleNameMapper: {
    // marked ships ESM only; its UMD build loads under Jest's CommonJS runtime.
    "^marked$": path.join(__dirname, "node_modules/marked/lib/marked.umd.js"),
    "^@n-uf/hypr-tiling/engine$": path.join(packageDir, "engine.ts"),
    "^@n-uf/hypr-tiling$": path.join(packageDir, "index.ts"),
  },
  // @n-uf/motion and @n-uf/placement (hypr-tiling dependencies) ship ESM only;
  // transform their dist like the package's own jest config does.
  transformIgnorePatterns: ["/node_modules/(?!(\\.pnpm/@n-uf\\+(motion|placement)@[^/]+/node_modules/)?@n-uf/(motion|placement)/)"],
  transform: {
    "/node_modules/(\\.pnpm/@n-uf\\+(motion|placement)@[^/]+/node_modules/)?@n-uf/(motion|placement)/.+\\.js$": [
      path.join(packageDir, "node_modules/ts-jest"),
      {
        tsconfig: { allowJs: true, module: "commonjs", esModuleInterop: true },
        diagnostics: false,
      },
    ],
    "^.+\\.tsx?$": [
      path.join(packageDir, "node_modules/ts-jest"),
      {
        tsconfig: {
          jsx: "react",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          types: ["node"],
          typeRoots: [path.join(__dirname, "node_modules/@types")],
          moduleResolution: "node",
          baseUrl: packageDir,
          paths: {
            "@jest/globals": ["node_modules/@jest/globals/build/index.d.ts"],
            "@n-uf/hypr-tiling/engine": ["engine.ts"],
            "@n-uf/hypr-tiling": ["index.ts"],
            // `moduleResolution: "node"` reads no `exports` map: point the
            // motion and placement subpaths at their declaration files.
            "@n-uf/motion/*": ["node_modules/@n-uf/motion/dist/*.d.ts"],
            "@n-uf/placement/*": ["node_modules/@n-uf/placement/dist/*.d.ts"],
          },
        },
      },
    ],
  },
};
