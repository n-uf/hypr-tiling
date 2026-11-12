// Shared identity for the three mobile home organization concepts. Kept
// separate from the components so the mode switcher, storage, and the mobile
// dispatcher (`MobileHome`) all type against the SAME closed union.

export type MobileHomeMode = "read" | "master" | "swipe" | "grid";

export interface MobileHomeModeOption {
  readonly id: MobileHomeMode;
  readonly label: string;
  readonly description: string;
}

export const MOBILE_HOME_MODE_OPTIONS: ReadonlyArray<MobileHomeModeOption> = [
  {
    id: "read",
    label: "Read",
    description: "Read — every section stacked on one page, scroll or tap a section chip",
  },
  {
    id: "master",
    label: "Master",
    description: "Master + rail — one focused tile, tap a chip to promote it",
  },
  {
    id: "swipe",
    label: "Swipe",
    description: "Fullscreen + swipe — one maximized pane, swipe or tap a dot to cycle",
  },
  {
    id: "grid",
    label: "Grid",
    description: "Pocket grid — a split-tree schematic, tap a tile to open it",
  },
];

// Read is the default: it is the only mode that mounts every pane's text in the
// page (the other three show one pane at a time), which is what a phone reader
// and a mobile-first crawler both need. Master + Rail, Swipe and Grid stay one
// tap away in the mode switcher.
export const DEFAULT_MOBILE_HOME_MODE: MobileHomeMode = "read";
