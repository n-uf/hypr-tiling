import * as React from "react";
import type { TilingTile } from "@n-uf/hypr-tiling";
import type { HomeSkin } from "../page";
import { MOBILE_HOME_TILE_IDS } from "./layout-tree";
import { MOBILE_HOME_SKIN_TOKENS, type MobileHomeSkinTokens } from "./skin-tokens";

// Mode 0 — Read (the mobile home default). Every documentation pane is a
// stacked section of one scrolling page, in reading order, and a row of anchor
// chips jumps to each. No `TilingRenderer` here: the other three concepts show
// one pane at a time, which leaves the other panes' text out of the page. This
// one keeps all of it mounted and visible, so a phone reader scrolls it and a
// mobile-first crawler sees the same text the desktop copy has. The page
// scrolls as a document (see `page.tsx`), so the browser's own toolbar
// collapse and scroll restoration keep working.

/** The DOM id of a pane's section (the target of its jump chip). */
export function readSectionId(tileId: string): string {
  return `section-${tileId}`;
}

// Reading order: the order the mobile trees seat the panes in (intro first).
const READING_ORDER: ReadonlyArray<string> = [...MOBILE_HOME_TILE_IDS];

export function ReadStackMobile({
  tiles,
  skin,
}: {
  tiles: ReadonlyArray<TilingTile>;
  skin: HomeSkin;
}): React.ReactElement {
  const tokens: MobileHomeSkinTokens = MOBILE_HOME_SKIN_TOKENS[skin];
  const ordered: ReadonlyArray<TilingTile> = React.useMemo(
    (): ReadonlyArray<TilingTile> =>
      READING_ORDER.flatMap((id: string): TilingTile[] => {
        const tile: TilingTile | undefined = tiles.find(
          (candidate: TilingTile): boolean => candidate.id === id,
        );
        return tile == null ? [] : [tile];
      }),
    [tiles],
  );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <nav
        aria-label="Sections"
        className="-mx-1.5 flex gap-1.5 overflow-x-auto px-1.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ordered.map(
          (tile: TilingTile, index: number): React.ReactElement => (
            <a key={tile.id} href={`#${readSectionId(tile.id)}`} className={tokens.readChip}>
              <span aria-hidden className="tabular-nums opacity-60">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{tile.title}</span>
            </a>
          ),
        )}
      </nav>
      {ordered.map(
        (tile: TilingTile): React.ReactElement => (
          <section
            key={tile.id}
            id={readSectionId(tile.id)}
            aria-label={tile.title}
            className={`min-w-0 ${tokens.readSection}`}
          >
            {tile.content}
          </section>
        ),
      )}
    </div>
  );
}
