/**
 * Built-artifact guard for the `./engine` entry (runs via `pnpm test:dist`
 * after `pnpm build`).
 *
 * The `./engine` entry is documented as the pure, isomorphic, React-free engine.
 * The 26.10.0 publish (mis-numbered; superseded by 26.9.3) violated that in the
 * BUILD (not the source): tsup code splitting put
 * the React renderer (`createContext`, hooks, theme) into a shared chunk that
 * `dist/engine.mjs` imported, and `engine.ts` itself re-exported three symbols
 * from `react/`. Consumers importing `@n-uf/hypr-tiling/engine` from a Next.js
 * route handler (react-server layer) failed with
 * `TypeError: createContext is not a function`.
 *
 * Two assertions, on the built output:
 *  1. STATIC — `dist/engine.mjs` / `dist/engine.cjs` and every local chunk they
 *     import contain no React marker (`createContext(`, `useState(`,
 *     `from "react"`, `require("react")`, react-dom, jsx-runtime).
 *  2. RUNTIME — a bare Node child process where `react` / `react-dom` are made
 *     unresolvable (module hooks + CJS resolver guard, plus the `react-server`
 *     export condition) can `import("dist/engine.mjs")` and
 *     `require("dist/engine.cjs")` and call into them.
 */
import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageDir: string = resolve(__dirname, "..");
const distDir: string = resolve(packageDir, "dist");
const probeScript: string = resolve(
  __dirname,
  "fixtures",
  "import-engine-without-react.mjs",
);

interface ReactMarker {
  readonly label: string;
  readonly pattern: RegExp;
}

const REACT_MARKERS: ReadonlyArray<ReactMarker> = [
  { label: "createContext(", pattern: /createContext\s*\(/ },
  { label: "useState(", pattern: /\buseState\s*\(/ },
  { label: 'from "react"', pattern: /from\s*["']react["']/ },
  { label: 'from "react-dom"', pattern: /from\s*["']react-dom(\/[^"']*)?["']/ },
  { label: 'from "react/*"', pattern: /from\s*["']react\/[^"']*["']/ },
  { label: 'require("react")', pattern: /require\(\s*["']react["']\s*\)/ },
  {
    label: 'require("react-dom")',
    pattern: /require\(\s*["']react-dom(\/[^"']*)?["']\s*\)/,
  },
  { label: 'require("react/*")', pattern: /require\(\s*["']react\/[^"']*["']\s*\)/ },
];

/** Local (same-directory) module specifiers a built file pulls in. */
const LOCAL_ESM_IMPORT: RegExp = /(?:from|import)\s*["'](\.\/[^"']+)["']/g;
const LOCAL_CJS_REQUIRE: RegExp = /require\(\s*["'](\.\/[^"']+)["']\s*\)/g;

/** Walk a built entry + every local chunk it (transitively) imports. */
function collectBundleFiles(entryPath: string, specifierPattern: RegExp): ReadonlyArray<string> {
  const visited: Set<string> = new Set();
  const queue: Array<string> = [entryPath];
  while (queue.length > 0) {
    const file: string = queue.pop() as string;
    if (visited.has(file)) {
      continue;
    }
    visited.add(file);
    const text: string = readFileSync(file, "utf8");
    const matcher: RegExp = new RegExp(specifierPattern.source, "g");
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text)) !== null) {
      const spec: string = match[1] as string;
      queue.push(resolve(dirname(file), spec));
    }
  }
  return [...visited];
}

interface ProbeSurface {
  readonly exportCount: number;
  readonly accentHueCyanText: string;
  readonly baselineDragHopDurationMs: number;
  readonly instantDragDurationMs: number;
  readonly mainWorkspaceId: string;
  readonly hasBuildDefaultDwindleLayout: boolean;
}

interface ProbeReport {
  readonly ok: boolean;
  readonly error: string | null;
  readonly esm: ProbeSurface | null;
  readonly cjs: ProbeSurface | null;
}

describe("dist/engine entry is React-free", () => {
  it("has a built dist/ to inspect (run `pnpm build` first)", () => {
    expect(existsSync(resolve(distDir, "engine.mjs"))).toBe(true);
    expect(existsSync(resolve(distDir, "engine.cjs"))).toBe(true);
  });

  it("dist/engine.mjs and every chunk it imports contain no React marker", () => {
    const files: ReadonlyArray<string> = collectBundleFiles(
      resolve(distDir, "engine.mjs"),
      LOCAL_ESM_IMPORT,
    );
    expect(files.length).toBeGreaterThan(0);
    const offenders: Array<string> = [];
    for (const file of files) {
      const text: string = readFileSync(file, "utf8");
      for (const marker of REACT_MARKERS) {
        if (marker.pattern.test(text)) {
          offenders.push(`${file.slice(packageDir.length + 1)} contains ${marker.label}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("dist/engine.cjs and every chunk it requires contain no React marker", () => {
    const files: ReadonlyArray<string> = collectBundleFiles(
      resolve(distDir, "engine.cjs"),
      LOCAL_CJS_REQUIRE,
    );
    expect(files.length).toBeGreaterThan(0);
    const offenders: Array<string> = [];
    for (const file of files) {
      const text: string = readFileSync(file, "utf8");
      for (const marker of REACT_MARKERS) {
        if (marker.pattern.test(text)) {
          offenders.push(`${file.slice(packageDir.length + 1)} contains ${marker.label}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("dist/engine.mjs shares no chunk with dist/index.mjs or dist/devtools.mjs", () => {
    const engineFiles: Set<string> = new Set(
      collectBundleFiles(resolve(distDir, "engine.mjs"), LOCAL_ESM_IMPORT),
    );
    engineFiles.delete(resolve(distDir, "engine.mjs"));
    const reactSideFiles: Set<string> = new Set([
      ...collectBundleFiles(resolve(distDir, "index.mjs"), LOCAL_ESM_IMPORT),
      ...collectBundleFiles(resolve(distDir, "devtools.mjs"), LOCAL_ESM_IMPORT),
    ]);
    const shared: Array<string> = [...engineFiles].filter((file: string): boolean =>
      reactSideFiles.has(file),
    );
    expect(shared).toEqual([]);
  });

  it("imports dist/engine.{mjs,cjs} in a bare Node process where react is unresolvable", () => {
    let stdout: string;
    try {
      stdout = execFileSync(
        process.execPath,
        ["--no-warnings", "--conditions=react-server", probeScript],
        { cwd: packageDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (error) {
      const failed: { stdout?: string; stderr?: string } = error as {
        stdout?: string;
        stderr?: string;
      };
      throw new Error(
        `engine probe exited non-zero.\nstdout: ${failed.stdout ?? ""}\nstderr: ${failed.stderr ?? ""}`,
      );
    }
    const report: ProbeReport = JSON.parse(stdout.trim().split("\n").pop() ?? "{}") as ProbeReport;
    expect(report.error).toBeNull();
    expect(report.ok).toBe(true);
    for (const surface of [report.esm, report.cjs]) {
      expect(surface).not.toBeNull();
      const s: ProbeSurface = surface as ProbeSurface;
      expect(s.exportCount).toBeGreaterThan(50);
      expect(s.accentHueCyanText).toBe("text-cyan-200");
      expect(s.baselineDragHopDurationMs).toBe(170);
      expect(s.instantDragDurationMs).toBe(1);
      expect(s.mainWorkspaceId).toBe("main");
      expect(s.hasBuildDefaultDwindleLayout).toBe(true);
    }
  });
});
