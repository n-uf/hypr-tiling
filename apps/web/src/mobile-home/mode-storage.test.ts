import { afterEach, describe, expect, it } from "@jest/globals";
import { readStoredMobileHomeMode, writeStoredMobileHomeMode } from "./mode-storage";

// The tests run in Node, so `window.localStorage` is a stand-in: a Map behind
// the Storage methods the module uses.
const STORAGE_KEY: string = "hypr-tiling-web.home-mobile-mode";

function installStorage(initial: Readonly<Record<string, string>>): Map<string, string> {
  const store = new Map<string, string>(Object.entries(initial));
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        store.set(key, value);
      },
    },
  };
  return store;
}

afterEach((): void => {
  delete (globalThis as { window?: unknown }).window;
});

describe("the stored mobile home mode", (): void => {
  it("is read when nothing is stored", (): void => {
    installStorage({});
    expect(readStoredMobileHomeMode()).toBe("read");
  });

  it("falls back to read for a value that is not a mode", (): void => {
    for (const value of ["", "nonsense", "Master", "grid ", "undefined"]) {
      installStorage({ [STORAGE_KEY]: value });
      expect(readStoredMobileHomeMode()).toBe("read");
    }
  });

  it("returns a stored master, swipe, grid or read as stored", (): void => {
    for (const mode of ["master", "swipe", "grid", "read"] as const) {
      installStorage({ [STORAGE_KEY]: mode });
      expect(readStoredMobileHomeMode()).toBe(mode);
    }
  });

  it("falls back to read when storage throws", (): void => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (): string => {
          throw new Error("blocked");
        },
      },
    };
    expect(readStoredMobileHomeMode()).toBe("read");
  });

  it("writes the chosen mode under its key", (): void => {
    const store = installStorage({});
    writeStoredMobileHomeMode("swipe");
    expect(store.get(STORAGE_KEY)).toBe("swipe");
    expect(readStoredMobileHomeMode()).toBe("swipe");
  });
});
