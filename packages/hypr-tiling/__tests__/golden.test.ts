/**
 * Replays the golden cases (`golden/cases.ts`) against the recorded answers in
 * `golden/fixtures/`. Numbers must match to 1e-9 px; everything else exactly.
 * `HPT_GOLDEN_WRITE=1` rewrites the fixtures instead (see `golden/cases.ts`).
 */
import { describe, expect, it } from "@jest/globals";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GOLDEN_SECTIONS } from "./golden/cases";

const DIR = join(__dirname, "golden", "fixtures");
const WRITE = process.env.HPT_GOLDEN_WRITE === "1";
/** With `HPT_GOLDEN_WRITE=1`, `HPT_GOLDEN_ONLY=a,b` rewrites only those sections. */
const ONLY: ReadonlySet<string> | null = process.env.HPT_GOLDEN_ONLY ? new Set(process.env.HPT_GOLDEN_ONLY.split(",")) : null;
const TOLERANCE = 1e-9;

/** Normalise through JSON, as the fixture is stored (NaN and ±Infinity become null, undefined fields drop). */
const asStored = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** The paths where `actual` differs from `expected`, at most `limit` of them. */
function differences(expected: unknown, actual: unknown, path: string, out: string[], limit: number): void {
  if (out.length >= limit) return;
  if (typeof expected === "number" && typeof actual === "number") {
    if (Math.abs(expected - actual) > TOLERANCE) out.push(`${path}: ${expected} → ${actual}`);
    return;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) out.push(`${path}: length ${expected.length} → ${actual.length}`);
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) differences(expected[i], actual[i], `${path}[${i}]`, out, limit);
    return;
  }
  if (expected && actual && typeof expected === "object" && typeof actual === "object" && !Array.isArray(expected) && !Array.isArray(actual)) {
    const e = expected as Record<string, unknown>;
    const a = actual as Record<string, unknown>;
    for (const key of new Set([...Object.keys(e), ...Object.keys(a)])) {
      if (!(key in a)) out.push(`${path}.${key}: missing`);
      else if (!(key in e)) out.push(`${path}.${key}: new`);
      else differences(e[key], a[key], `${path}.${key}`, out, limit);
    }
    return;
  }
  if (expected !== actual) out.push(`${path}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
}

describe("golden answers recorded from 26.11.6", () => {
  for (const [name, compute] of Object.entries(GOLDEN_SECTIONS)) {
    it(`${name} unchanged`, () => {
      const file = join(DIR, `${name}.json`);
      const actual = asStored(compute());
      if (WRITE && (ONLY == null || ONLY.has(name))) {
        if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
        writeFileSync(file, `${JSON.stringify(actual)}\n`);
        return;
      }
      const expected: unknown = JSON.parse(readFileSync(file, "utf8"));
      const found: string[] = [];
      differences(expected, actual, name, found, 20);
      expect(found).toEqual([]);
    });
  }
});
