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
  transform: {
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
          },
        },
      },
    ],
  },
};
