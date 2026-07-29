// Shared identity for the three mobile home organization concepts. Kept
// separate from the components so the mode switcher, storage, and the mobile
// dispatcher (`MobileHome`) all type against the SAME closed union.

export type MobileHomeMode = "master" | "swipe" | "grid";

export interface MobileHomeModeOption {
  readonly id: MobileHomeMode;
  readonly label: string;
  readonly description: string;
}

export const MOBILE_HOME_MODE_OPTIONS: ReadonlyArray<MobileHomeModeOption> = [
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

// Master + Rail is the default per the concept brief.
export const DEFAULT_MOBILE_HOME_MODE: MobileHomeMode = "master";
