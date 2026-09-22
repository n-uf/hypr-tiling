/**
 * `scripts/calendar-version-bump.mjs` — the `YY.M.R` computation behind
 * `pnpm release:next-version` / `pnpm release`. `M` must be the calendar month
 * of the release date, and burned (unpublished, npm-reserved) numbers must be
 * skipped — `26.10.0` was mis-published for a September release, unpublished,
 * and can never be reused (`_agent/versioning-policy.md`).
 */
import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const script: string = resolve(__dirname, "..", "scripts", "calendar-version-bump.mjs");

function nextVersion(today: string, current: string): string {
  return execFileSync(process.execPath, [script, "--dry-run"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CALENDAR_VERSION_TODAY: today,
      CALENDAR_VERSION_CURRENT: current,
    },
  }).trim();
}

describe("calendar-version-bump — YY.M.R from the release date", () => {
  it("continues R within the same calendar month", () => {
    expect(nextVersion("2026-09-30", "26.9.3")).toBe("26.9.4");
  });

  it("uses the calendar month, never last-release-month + 1", () => {
    expect(nextVersion("2026-09-22", "26.7.2")).toBe("26.9.0");
  });

  it("skips the burned 26.10.0 — the first October 2026 release is 26.10.1", () => {
    expect(nextVersion("2026-10-05", "26.9.3")).toBe("26.10.1");
  });

  it("continues past the burned value once October is under way", () => {
    expect(nextVersion("2026-10-20", "26.10.1")).toBe("26.10.2");
  });

  it("resets R to 0 in a month with no burned number", () => {
    expect(nextVersion("2026-11-02", "26.10.1")).toBe("26.11.0");
  });
});
