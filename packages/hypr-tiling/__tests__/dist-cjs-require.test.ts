/**
 * Built-artifact guard for the CommonJS entries (runs via `pnpm test:dist`
 * after `pnpm build`). `@n-uf/motion` ships ESM only, so the CJS build bundles
 * it: `require("@n-uf/hypr-tiling")` must work where `require()` cannot load
 * ESM (Node < 20.19 and 22.0–22.11, CJS jest). The probe runs in a child Node
 * with `--no-experimental-require-module` and server-renders a layout.
 */
import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const packageDir: string = resolve(__dirname, "..");
const distDir: string = resolve(packageDir, "dist");

describe("dist CJS entries load without require(esm)", () => {
  it("dist/index.cjs and dist/devtools.cjs never require @n-uf/motion (it is bundled)", () => {
    for (const file of ["index.cjs", "devtools.cjs"]) {
      const text: string = readFileSync(resolve(distDir, file), "utf8");
      expect(text).not.toMatch(/require\(\s*["']@n-uf\/motion/);
    }
  });

  it("dist/index.mjs keeps @n-uf/motion an external import", () => {
    const files: string[] = ["index.mjs", ...readdirSync(distDir).filter((f: string): boolean => /^chunk-.*\.mjs$/.test(f))];
    const text: string = files.map((file: string): string => readFileSync(resolve(distDir, file), "utf8")).join("\n");
    expect(text).toMatch(/from\s*["']@n-uf\/motion/);
  });

  it("require()s and server-renders through dist/index.cjs with require(esm) disabled", () => {
    const stdout: string = execFileSync(
      process.execPath,
      ["--no-warnings", "--no-experimental-require-module", resolve(__dirname, "fixtures", "require-index-cjs.cjs")],
      { cwd: packageDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const report = JSON.parse(stdout.trim().split("\n").pop() ?? "{}") as {
      ok: boolean;
      error: string | null;
      leaves: number;
      frames: number;
    };
    expect(report.error).toBeNull();
    expect(report).toMatchObject({ ok: true, leaves: 2, frames: 2 });
  });
});
