/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
  // Built-artifact tests assert against `dist/` and belong to `pnpm test:dist`
  // (jest.dist.config.js), which runs after `pnpm build`.
  testPathIgnorePatterns: [
    "/node_modules/",
    "/__tests__/engine-entry-react-free\\.test\\.ts$",
    "/__tests__/dist-cjs-require\\.test\\.ts$",
  ],
  // @n-uf/motion ships ESM only; jest runs CommonJS, so its dist is transformed
  // like our own sources (everything else in node_modules stays untouched).
  transformIgnorePatterns: ["/node_modules/(?!(\\.pnpm/@n-uf\\+motion@[^/]+/node_modules/)?@n-uf/motion/)"],
  transform: {
    "/node_modules/(\\.pnpm/@n-uf\\+motion@[^/]+/node_modules/)?@n-uf/motion/.+\\.js$": [
      "ts-jest",
      {
        tsconfig: { allowJs: true, module: "commonjs", esModuleInterop: true },
        diagnostics: false,
      },
    ],
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "cjs", "json"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
};
