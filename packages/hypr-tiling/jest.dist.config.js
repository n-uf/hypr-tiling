// Built-artifact tests — run AFTER `pnpm build` (`pnpm test:dist`). Kept out of
// the default `jest` run (see `testPathIgnorePatterns` in jest.config.js) so
// `pnpm test` never asserts against a stale or missing `dist/`.
const base = require("./jest.config.js");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testMatch: ["**/__tests__/engine-entry-react-free.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
};
