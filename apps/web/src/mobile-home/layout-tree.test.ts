import { describe, expect, it } from "@jest/globals";
import { tileOrderByLeafId } from "@n-uf/hypr-tiling/engine";
import {
  buildMobileDwindleLayout,
  buildMobileMasterLayout,
  MOBILE_HOME_TILE_IDS,
} from "./layout-tree";

// The mobile concepts get only MOBILE_HOME_TILE_IDS. A tree that seats other
// tiles (or misses some) makes the renderer rebuild it over every tile.
describe("mobile home trees", (): void => {
  it("Master + Rail and Fullscreen + Swipe seat the same panes", (): void => {
    const sorted = (ids: ReadonlyArray<string>): ReadonlyArray<string> => [...ids].sort();
    expect(sorted(tileOrderByLeafId(buildMobileDwindleLayout()))).toEqual(
      sorted([...MOBILE_HOME_TILE_IDS]),
    );
    expect(sorted(tileOrderByLeafId(buildMobileMasterLayout()))).toEqual(
      sorted([...MOBILE_HOME_TILE_IDS]),
    );
    expect(MOBILE_HOME_TILE_IDS.size).toBe(6);
  });
});
