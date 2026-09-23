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
  ],
  transform: {
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
