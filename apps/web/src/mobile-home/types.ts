// The phone home's two modes. Kept separate from the components so the mode
// switcher, storage and the page all type against the SAME closed union.

export type MobileHomeMode = "tiles" | "read";

export interface MobileHomeModeOption {
  readonly id: MobileHomeMode;
  readonly label: string;
  readonly description: string;
}

export const MOBILE_HOME_MODE_OPTIONS: ReadonlyArray<MobileHomeModeOption> = [
  {
    id: "tiles",
    label: "Tiles",
    description: "Tiles — the tiling demo, folded to fit: swipe to open a spine, then the next workspace",
  },
  {
    id: "read",
    label: "Read",
    description: "Read — every section stacked on one page, scroll or tap a section chip",
  },
];

// Tiles is the default: a phone gets the same workspace set as a desktop,
// folded where a split can't fit (`config.fold` in `page.tsx`). The folded
// panes stay mounted, so the page still carries every pane's text. Read stays
// one tap away for reading the docs as a page.
export const DEFAULT_MOBILE_HOME_MODE: MobileHomeMode = "tiles";
