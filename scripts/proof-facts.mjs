// Writes apps/web/src/proof-facts.generated.ts from the library package:
// Jest suite/test totals (the same config as `pnpm --filter @n-uf/hypr-tiling test`),
// gzip sizes of dist/index.mjs and dist/engine.mjs as a user downloads them
// (each entry plus every chunk it loads; and the root entry again with the
// whole @n-uf/motion and @n-uf/placement modules it imports), runtime dependencies,
// React peer ranges, license, and version. The docs prebuild runs this so the
// committed snapshot matches the package that the site is built from.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const packageDir = resolve(repoRoot, "packages/hypr-tiling");
const packageJsonPath = resolve(packageDir, "package.json");
const outputPath = resolve(repoRoot, "apps/web/src/proof-facts.generated.ts");
const jestJsonPath = resolve(tmpdir(), "hypr-tiling-proof-jest.json");

/**
 * @param {string} label
 * @param {import("node:child_process").SpawnSyncReturns<string>} result
 */
function assertSpawn(label, result) {
  if (result.error != null) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(`${label} exited ${result.status ?? "null"}\n${detail}`);
  }
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;
if (typeof version !== "string" || version.length === 0) {
  throw new Error("proof-facts: package.json version missing");
}

const indexBundle = resolve(packageDir, "dist/index.mjs");
const engineBundle = resolve(packageDir, "dist/engine.mjs");
if (!existsSync(indexBundle) || !existsSync(engineBundle)) {
  assertSpawn(
    "proof-facts: package build",
    spawnSync("pnpm", ["--filter", "@n-uf/hypr-tiling", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
    }),
  );
}

assertSpawn(
  "proof-facts: jest --json",
  spawnSync(
    "pnpm",
    [
      "exec",
      "jest",
      "--json",
      `--outputFile=${jestJsonPath}`,
      "--maxWorkers=2",
      "--forceExit",
      "--watchman=false",
    ],
    { cwd: packageDir, encoding: "utf8" },
  ),
);

const jestReport = JSON.parse(readFileSync(jestJsonPath, "utf8"));
const testSuites = jestReport.numTotalTestSuites;
const tests = jestReport.numTotalTests;
if (typeof testSuites !== "number" || typeof tests !== "number") {
  throw new Error("proof-facts: jest json missing numTotalTestSuites / numTotalTests");
}

/**
 * The files a user downloads for an entry: the entry and every chunk of the
 * build it imports, statically or dynamically, transitively (relative
 * specifiers only: dependencies such as React are not counted). With
 * `withScope`, bare imports of that npm scope (`@n-uf/…`) are followed too,
 * resolved through their packages' `exports`, whole modules (before any
 * bundler's tree-shaking).
 * @param {string} entry
 * @param {string | null} [withScope]
 * @returns {string[]}
 */
function loadedFiles(entry, withScope = null) {
  const seen = new Set([entry]);
  const queue = [entry];
  const specifier = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
  while (queue.length > 0) {
    const file = queue.shift();
    const requireFrom = createRequire(file);
    for (const match of readFileSync(file, "utf8").matchAll(specifier)) {
      const spec = match[1];
      let next = null;
      if (spec.startsWith("./") || spec.startsWith("../")) {
        next = resolve(dirname(file), spec);
      } else if (withScope != null && spec.startsWith(`${withScope}/`)) {
        next = requireFrom.resolve(spec);
      }
      if (next != null && !seen.has(next) && existsSync(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen];
}

/**
 * Gzip bytes of an entry as downloaded: the entry plus every chunk it loads, each gzipped as served.
 * @param {string} entry
 * @param {string | null} [withScope]
 */
function gzipLoadedBytes(entry, withScope = null) {
  return loadedFiles(entry, withScope).reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0);
}

const gzipIndexBytes = gzipLoadedBytes(indexBundle);
const gzipIndexWithLibrariesBytes = gzipLoadedBytes(indexBundle, "@n-uf");
const gzipEngineBytes = gzipLoadedBytes(engineBundle);

const dependencyRecord = packageJson.dependencies ?? {};
const runtimeDependencies = Object.keys(dependencyRecord).sort();
const peerRecord = packageJson.peerDependencies ?? {};
const reactPeer = peerRecord.react;
const reactDomPeer = peerRecord["react-dom"];
if (typeof reactPeer !== "string" || typeof reactDomPeer !== "string") {
  throw new Error("proof-facts: peerDependencies react / react-dom missing");
}
const license = packageJson.license;
if (typeof license !== "string" || license.length === 0) {
  throw new Error("proof-facts: package.json license missing");
}

const dependencyLines = runtimeDependencies
  .map((name) => `    ${JSON.stringify(name)},`)
  .join("\n");

const source = `// AUTO-GENERATED by scripts/proof-facts.mjs. Do not edit.
// Regenerated by the hypr-tiling-web prebuild from packages/hypr-tiling.

export interface ProofFacts {
  readonly version: string;
  readonly testSuites: number;
  readonly tests: number;
  /** dist/index.mjs plus every chunk it loads, gzip bytes (no dependency code). */
  readonly gzipIndexBytes: number;
  /** The same plus the whole @n-uf/motion and @n-uf/placement modules it imports, gzip bytes (no React, clsx, tailwind-merge). */
  readonly gzipIndexWithLibrariesBytes: number;
  /** dist/engine.mjs plus every chunk it loads, gzip bytes (no dependency code). */
  readonly gzipEngineBytes: number;
  readonly runtimeDependencyCount: number;
  readonly runtimeDependencies: ReadonlyArray<string>;
  readonly reactPeer: string;
  readonly reactDomPeer: string;
  readonly license: string;
}

export const PROOF_FACTS: ProofFacts = {
  version: ${JSON.stringify(version)},
  testSuites: ${testSuites},
  tests: ${tests},
  gzipIndexBytes: ${gzipIndexBytes},
  gzipIndexWithLibrariesBytes: ${gzipIndexWithLibrariesBytes},
  gzipEngineBytes: ${gzipEngineBytes},
  runtimeDependencyCount: ${runtimeDependencies.length},
  runtimeDependencies: [
${dependencyLines}
  ],
  reactPeer: ${JSON.stringify(reactPeer)},
  reactDomPeer: ${JSON.stringify(reactDomPeer)},
  license: ${JSON.stringify(license)},
};
`;

writeFileSync(outputPath, source, "utf8");
console.log(
  `proof-facts: ${testSuites} suites, ${tests} tests, gzip index ${gzipIndexBytes} (with @n-uf libraries ${gzipIndexWithLibrariesBytes}), engine ${gzipEngineBytes}, version ${version}`,
);
