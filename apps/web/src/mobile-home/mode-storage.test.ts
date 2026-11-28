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
  it("is tiles when nothing is stored", (): void => {
    installStorage({});
    expect(readStoredMobileHomeMode()).toBe("tiles");
  });

  it("falls back to tiles for a value that is not a mode", (): void => {
    for (const value of ["", "nonsense", "Tiles", "read ", "undefined"]) {
      installStorage({ [STORAGE_KEY]: value });
      expect(readStoredMobileHomeMode()).toBe("tiles");
    }
  });

  it("falls back to tiles for a mode the phone home no longer has", (): void => {
    for (const value of ["master", "swipe", "grid"]) {
      installStorage({ [STORAGE_KEY]: value });
      expect(readStoredMobileHomeMode()).toBe("tiles");
    }
  });

  it("returns a stored tiles or read as stored", (): void => {
    for (const mode of ["tiles", "read"] as const) {
      installStorage({ [STORAGE_KEY]: mode });
      expect(readStoredMobileHomeMode()).toBe(mode);
    }
  });

  it("falls back to tiles when storage throws", (): void => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (): string => {
          throw new Error("blocked");
        },
      },
    };
    expect(readStoredMobileHomeMode()).toBe("tiles");
  });

  it("writes the chosen mode under its key", (): void => {
    const store = installStorage({});
    writeStoredMobileHomeMode("read");
    expect(store.get(STORAGE_KEY)).toBe("read");
    expect(readStoredMobileHomeMode()).toBe("read");
  });
});
