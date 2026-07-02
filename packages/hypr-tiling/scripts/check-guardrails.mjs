// Architectural guardrails for the public-API boundary. Dependency-free (the
// repo ships no ESLint toolchain; bespoke .mjs checks are the house style — see
// generate-api-docs.mjs). Enforces three invariants that the entry-point model
// depends on and that a plain type/build gate cannot catch:
//
//   1. LAYERING (engine ↛ react): `engine/**` is the framework-free layer. It
//      must never import React / react-dom or reach up into `react/`. The
//      renderer depends on the engine, never the reverse.
//   2. NO DEEP CONSUMER IMPORTS: apps/packages that consume `@n-uf/hypr-tiling`
//      must go through a published entry — `@n-uf/hypr-tiling`,
//      `.../devtools`, or `.../engine` — never a deep path
//      (`.../engine/state`, `.../react/...`, `.../dist/...`). Deep imports
//      bypass the curated surface and the `use client` banner.
//   3. `use client` PRESERVED: the built ESM facade `dist/index.mjs` must still
//      begin with a `use client` directive. Next.js App Router consumers
//      (e.g. starpay-app) resolve the `import` condition to this file; losing
//      the banner silently breaks Server-Component boundaries at the consumer.
//
// Exit non-zero (with a per-violation report) on any breach. Run via
// `pnpm --filter @n-uf/hypr-tiling check:guardrails` (CI runs it after build so
// the dist assertion has an artifact to inspect).

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, "..");
const repoRoot = resolve(packageDir, "..", "..");

/** @type {string[]} */
const violations = [];

const SOURCE_EXT = new Set([".ts", ".tsx", ".mts", ".cts"]);

/** Recursively collect source files under `dir` (skips node_modules/dist/temp). */
function collectSources(dir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(dir)) {
    return out;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "temp") {
      continue;
    }
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSources(full));
    } else if (SOURCE_EXT.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      out.push(full);
    }
  }
  return out;
}

// Match the module specifier of static/dynamic imports and re-exports, plus
// whether the statement is a WHOLE-statement type-only form (`import type … from`
// / `export type … from`). Type-only imports are erased at build and create no
// runtime edge, so the layering rule ignores them.
const IMPORT_SPECIFIER =
  /(?:import|export)\s+(type\s+)?[^"'`]*?from\s*["'`]([^"'`]+)["'`]|import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

/**
 * All import/re-export/dynamic-import specifiers in a source file.
 * @returns {ReadonlyArray<{ spec: string; typeOnly: boolean }>}
 */
function importSpecifiers(fileText) {
  /** @type {{ spec: string; typeOnly: boolean }[]} */
  const specs = [];
  let match;
  IMPORT_SPECIFIER.lastIndex = 0;
  while ((match = IMPORT_SPECIFIER.exec(fileText)) != null) {
    const spec = match[2] ?? match[3];
    if (spec != null) {
      specs.push({ spec, typeOnly: match[1] != null });
    }
  }
  return specs;
}

// ── Rule 1: engine ↛ react (framework-free engine layer) ──────────────────────
const engineDir = resolve(packageDir, "engine");
for (const file of collectSources(engineDir)) {
  const text = readFileSync(file, "utf8");
  for (const { spec, typeOnly } of importSpecifiers(text)) {
    // Type-only imports (e.g. `import type * as React` for `React.ReactNode` in
    // a prop DTO) are erased at build — no runtime framework edge. Only a VALUE
    // import couples the engine to React at runtime.
    if (typeOnly) {
      continue;
    }
    const reachesReact =
      spec === "react" ||
      spec === "react-dom" ||
      spec.startsWith("react/") ||
      spec.startsWith("react-dom/") ||
      /(^|\/)\.\.\/react(\/|$)/.test(spec) ||
      /(^|\/)\.\/react(\/|$)/.test(spec);
    if (reachesReact) {
      violations.push(
        `layering: engine/ value-imports React/react-dom or reaches into react/ — ${relative(repoRoot, file)} imports "${spec}". The engine layer must stay framework-free at runtime (type-only imports are allowed).`,
      );
    }
  }
}

// ── Rule 2: consumers must use a published entry, not a deep path ─────────────
const PACKAGE_NAME = "@n-uf/hypr-tiling";
const ALLOWED_SUBPATHS = new Set(["devtools", "engine"]);
const consumerRoots = [
  resolve(repoRoot, "apps", "web", "src"),
  resolve(repoRoot, "packages", "showcase", "src"),
];
for (const root of consumerRoots) {
  for (const file of collectSources(root)) {
    const text = readFileSync(file, "utf8");
    for (const { spec } of importSpecifiers(text)) {
      if (spec !== PACKAGE_NAME && spec.startsWith(`${PACKAGE_NAME}/`)) {
        const subpath = spec.slice(PACKAGE_NAME.length + 1);
        if (!ALLOWED_SUBPATHS.has(subpath)) {
          violations.push(
            `deep-import: ${relative(repoRoot, file)} imports "${spec}". Consumers must use ${PACKAGE_NAME}, ${PACKAGE_NAME}/devtools, or ${PACKAGE_NAME}/engine — never a deep path.`,
          );
        }
      }
    }
  }
}

// ── Rule 3: dist/index.mjs must keep the `use client` directive ───────────────
const distIndex = resolve(packageDir, "dist", "index.mjs");
if (!existsSync(distIndex)) {
  violations.push(
    `use-client: ${relative(repoRoot, distIndex)} not found — run \`pnpm build\` before the guardrails check (CI builds first).`,
  );
} else {
  const firstMeaningful = readFileSync(distIndex, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!/^["']use client["'];?$/.test(firstMeaningful ?? "")) {
    violations.push(
      `use-client: ${relative(repoRoot, distIndex)} does not begin with a "use client" directive (found: ${JSON.stringify(firstMeaningful ?? "")}). Next.js App Router consumers depend on it; keep "use client" at the top of index.ts.`,
    );
  }
}

if (violations.length > 0) {
  console.error(`check-guardrails: ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  ✗ ${v}`);
  }
  process.exit(1);
}

console.log(
  "check-guardrails: OK — engine↛react layering, no deep consumer imports, dist/index.mjs keeps \"use client\".",
);
