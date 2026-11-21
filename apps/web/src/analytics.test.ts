import { describe, expect, it } from "@jest/globals";
import { stripQuery } from "./analytics";

describe("stripQuery", (): void => {
  it("drops the query string of a pageview and keeps the path and hash", (): void => {
    expect(
      stripQuery({ type: "pageview", url: "https://hypr-tiling.n-uf.com/docs?token=abc&id=7#changelog-26-9-6" }),
    ).toEqual({ type: "pageview", url: "https://hypr-tiling.n-uf.com/docs#changelog-26-9-6" });
  });

  it("keeps the event type and leaves a clean URL alone", (): void => {
    expect(stripQuery({ type: "event", url: "https://hypr-tiling.n-uf.com/" })).toEqual({
      type: "event",
      url: "https://hypr-tiling.n-uf.com/",
    });
  });
});
