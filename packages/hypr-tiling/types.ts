import type * as React from "react";

export type DynamicSplitAxis = "horizontal" | "vertical";

/**
 * Arrangement of a split subtree's slots:
 *
 * - `"dwindle"` — the default recursive binary-split layout: each split
 *   distributes its two children along its `axis` by `ratio` (the original and
 *   only Phase-1/2 algorithm).
 * - `"master"` — a master-area + stack layout (the Hyprland `master` analog).
 *   The split's descendant slots (leaves / groups, flattened in reading order)
 *   are laid out as `masterCount` master tiles in a master area plus the
 *   remaining tiles in a stack; the split's `ratio` is reused as the master-area
 *   fraction and `masterOrientation` places the master area. The binary
 *   structure beneath a master split is flattened (ignored for geometry); it
 *   still defines slot membership + order + identity, and the reducers still
 *   operate on it.
 */
export type DynamicLayoutMode = "dwindle" | "master";

/**
 * Where the master area sits in `layoutMode: "master"`. `left`/`right` divide
 * the container along WIDTH (master area a column, members stacked vertically);
 * `top`/`bottom` divide along HEIGHT (master area a row, members stacked
 * horizontally). The complement holds the stack.
 */
export type DynamicMasterOrientation = "left" | "right" | "top" | "bottom";

/** The two layout dimensions a pane can be sized along, independent of split axis. */
export type TilingDimension = "width" | "height";

/**
 * Per-dimension sizing mode for a node placed inside a split.
 *
 * - `"flexible"` — the node shares space by ratio along the split axis and
 *   stretches/reflows along the cross axis (the default for every dimension).
 * - `"static"` — the node is sized to its INTRINSIC/CONTENT extent along that
 *   dimension; it is excluded from ratio distribution and resize dividers when
 *   the static dimension runs ALONG the parent split axis, and simply
 *   content-sizes (no stretch) when the static dimension is the CROSS axis.
 */
export type TilingPaneSizingMode = "static" | "flexible";

/**
 * Per-dimension sizing declaration for a node. Each dimension is independent:
 * a pane can be static in `height`, in `width`, or in both. An undefined
 * dimension defaults to `"flexible"`.
 *
 * The object shape is chosen over an axis list (e.g. `staticAxes: ("width" |
 * "height")[]`) because it is explicit per-dimension, self-documenting at the
 * call site (`sizing: { height: "static" }`), and lets a dimension be stated
 * `"flexible"` explicitly rather than only inferred from absence.
 */
export interface TilingPaneSizing {
  width?: TilingPaneSizingMode;
  height?: TilingPaneSizingMode;
  /**
   * Pinned WIDTH in CSS px, captured from the pane's measured bounding box at the
   * moment the user freezes the pane via the title-bar STATIC W / BOTH control.
   * Only meaningful when `width === "static"`. When present, the static-width
   * pane renders at exactly this pixel extent (a measured bbox FREEZE) instead of
   * being content-sized. Undefined → the static dimension is content-sized (the
   * legacy intrinsic behavior).
   */
  widthPx?: number;
  /**
   * Pinned HEIGHT in CSS px, captured from the pane's measured bounding box at the
   * moment the user freezes the pane via the title-bar STATIC H / BOTH control.
   * Only meaningful when `height === "static"`. See `widthPx`.
   */
  heightPx?: number;
}

/**
 * The four title-bar sizing actions a pane offers for ITSELF (no target-pane
 * indirection — the pane the control lives in is the target):
 *
 * - `"flexible"` — clear any pinned dimension and return the pane to ratio
 *   distribution (FLEX).
 * - `"static-height"` — freeze the pane's height to its measured bbox px.
 * - `"static-width"` — freeze the pane's width to its measured bbox px.
 * - `"static-both"` — freeze both dimensions to the measured bbox.
 */
export type TilingTitleBarSizingMode = "flexible" | "static-height" | "static-width" | "static-both";

/**
 * Resize capability across the two divider orientations.
 *
 * RESIZE AXIS CONVENTION (read carefully — the divider orientation and the
 * resize axis are deliberately the opposite words):
 *
 * - A **vertical divider** sits between **side-by-side** panes. Dragging it
 *   changes their **widths** → this is a **horizontal** resize (x-axis). In the
 *   layout tree this is a split whose `axis` is `"horizontal"` (a `flex-row`
 *   container with a `cursor-col-resize` handle).
 * - A **horizontal divider** sits between **stacked** panes. Dragging it changes
 *   their **heights** → this is a **vertical** resize (y-axis). In the layout
 *   tree this is a split whose `axis` is `"vertical"` (a `flex-col` container
 *   with a `cursor-row-resize` handle).
 *
 * The resize-capability token therefore matches the split `axis` token directly:
 * `"horizontal"` gates width dividers, `"vertical"` gates height dividers.
 *
 * - `"both"` — every divider is resizable (this is the "entire" option). Default.
 * - `"horizontal"` — only width dividers (side-by-side panes) are resizable.
 * - `"vertical"` — only height dividers (stacked panes) are resizable.
 * - `"none"` — no divider is resizable.
 */
export type TilingResizeCapability = "both" | "horizontal" | "vertical" | "none";

/**
 * Drag-to-rearrange feedback mode — how a pending move is shown WHILE dragging,
 * before it is committed on drop.
 *
 * - `"preview"` — non-committing preview (default). The pending result is shown
 *   via the translucent PROJECTED landing overlays (S' / T' / successor) painted
 *   over the unchanged layout; the layout tree is NOT mutated until drop.
 * - `"live"` — Hyprland-faithful detach drag. On pickup the dragged source leaf
 *   is detached and the remaining tree reflows ONCE to close the gap
 *   (`removeLeafTile`); that frozen provisional tree is held for the whole drag
 *   (it does NOT re-reflow as the cursor moves). The detached source follows the
 *   cursor as a ghost, and the drop is resolved + committed exactly ONCE on
 *   release against the original layout via the SAME resolver + reducers preview
 *   uses (`swapLeafTiles` / `insertLeafAdjacent`), so the live commit equals the
 *   preview commit for the same intent. The prop tree is never mutated pre-commit,
 *   so cancel / Escape / dragleave-abort / off-viewport revert is lossless.
 *
 * NOTE on vocabulary: "projected" names the RENDERING TECHNIQUE for the preview
 * overlays (projected geometry, S' / T' / successor). "preview" vs "live" is the
 * interaction MODE. The mode is never called "projected".
 */
export type TilingDragMode = "preview" | "live";

/**
 * Live-drag slot re-resolution / commitment policy after the single ghost hops
 * INTO and FILLS a resolved slot (see
 * `_agent/single-instance-hop-in-drag-design.md` §8):
 *
 * - `"zone-exit-hold"` — anchored / sticky: the seated slot is pinned through
 *   small cursor movements and re-resolves only when the cursor crosses OUT of
 *   the seated target's hit footprint (high hysteresis).
 * - `"delta-responsive"` — DEFAULT: the seated slot re-resolves eagerly once the
 *   cursor travels beyond `reresolveDeltaPx` from the seat anchor (or exits the
 *   footprint), so the user can re-aim without fully exiting the pane.
 *
 * Only meaningful in `dragMode: "live"`.
 */
export type TilingSlotCommitmentMode = "zone-exit-hold" | "delta-responsive";

/**
 * Live-drag slot-commitment configuration. `mode` selects the re-resolution
 * policy; `reresolveDeltaPx` is the `delta-responsive` movement threshold (CSS
 * px) — a coarse "should I re-aim" gate distinct from the fine 6px geometric
 * zone hysteresis, so the two never double-count.
 */
export interface TilingSlotCommitmentCapability {
  /** Re-resolution policy after the ghost seats in a slot. Default `"delta-responsive"`. */
  mode?: TilingSlotCommitmentMode;
  /** `delta-responsive` re-aim threshold in CSS px. Default `24`. */
  reresolveDeltaPx?: number;
}

/** Fully-resolved slot-commitment configuration (no optional fields). */
export interface ResolvedTilingSlotCommitmentCapability {
  mode: TilingSlotCommitmentMode;
  reresolveDeltaPx: number;
}

/**
 * Touch-drag hardening configuration. The drag FSM runs on Pointer Events, so it
 * already covers touch uniformly with mouse/pen — this capability tunes the
 * touch-only choreography that must differ from mouse:
 *
 * - `enable` — when `false`, a touch press on the drag handle never starts a
 *   drag (touch is reserved for tap/scroll); mouse/pen drag is unaffected.
 *   Default `true`.
 * - `longPressMs` — how long a finger must be held before the press becomes a
 *   drag pickup (the tap/scroll-vs-drag disambiguator). A pre-long-press
 *   scroll-axis flick releases to the page; mouse/pen skip this delay entirely.
 *   Default `220`.
 */
export interface TilingTouchDragCapability {
  /** Allow touch pointers to start a drag. Default `true`. */
  enable?: boolean;
  /** Long-press delay (ms) before a held touch becomes a drag. Default `220`. */
  longPressMs?: number;
}

/** Fully-resolved touch-drag configuration (no optional fields). */
export interface ResolvedTilingTouchDragCapability {
  enable: boolean;
  longPressMs: number;
}

/**
 * A single keyboard chord: a PHYSICAL `KeyboardEvent.code` value plus the
 * modifier state required to match it. Absent modifiers resolve to `false` (the
 * modifier must NOT be held) — a chord fully specifies its modifier requirements.
 *
 * The chord matches on `event.code` (the physical key, e.g. `"Enter"`,
 * `"Escape"`, `"BracketLeft"`, `"BracketRight"`), NOT `event.key` (the produced
 * character). This is mandatory on macOS, where holding Option(Alt) rewrites
 * `event.key` into dead-key glyphs (Option+`]` → `"‘"`, Option+digits → special
 * glyphs), so a `event.key`-based comparison never matches. `event.code` is
 * stable across keyboard layouts and modifier state.
 */
export interface TilingKeyChord {
  /** Matches `KeyboardEvent.code` (e.g. `"Enter"`, `"Escape"`, `"BracketLeft"`, `"BracketRight"`, `"Digit1"`). */
  code: string;
  /** Require the Alt key. Default `false`. */
  alt?: boolean;
  /** Require the Ctrl key. Default `false`. */
  ctrl?: boolean;
  /** Require the Meta (Cmd / Win) key. Default `false`. */
  meta?: boolean;
  /** Require the Shift key. Default `false`. */
  shift?: boolean;
}

/**
 * Modifier requirements for the jump-to-pane digit family (`Alt+1`..`Alt+9`).
 * The `1`..`9` digit is implied (matched against the physical `Digit1`..`Digit9`
 * codes); only the modifier state is configurable.
 */
export interface TilingKeyChordModifiers {
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

/**
 * Public, reactive keymap. Every field is optional; an `undefined` field
 * resolves to its documented default via `resolveKeymap`. Action-level merge:
 * supplying one binding leaves the others at their defaults.
 */
export interface TilingKeymap {
  /** Toggle maximize on the focused pane. Default `Alt+Enter` (code `Enter`). */
  toggleMaximize?: TilingKeyChord;
  /** Restore from maximize. Default `Escape`. */
  restore?: TilingKeyChord;
  /** Cycle to the previous pane. Default `Alt+[`. */
  previousPane?: TilingKeyChord;
  /** Cycle to the next pane. Default `Alt+]`. */
  nextPane?: TilingKeyChord;
  /** Modifier set for the `Alt+1`..`Alt+9` jump family. Default `Alt`. */
  jumpToPane?: TilingKeyChordModifiers;
  /** Move focus to the geometric neighbor on the LEFT. Default bare `ArrowLeft`. */
  focusLeft?: TilingKeyChord;
  /** Move focus to the geometric neighbor on the RIGHT. Default bare `ArrowRight`. */
  focusRight?: TilingKeyChord;
  /** Move focus to the geometric neighbor ABOVE. Default bare `ArrowUp`. */
  focusUp?: TilingKeyChord;
  /** Move focus to the geometric neighbor BELOW. Default bare `ArrowDown`. */
  focusDown?: TilingKeyChord;
  /**
   * Enter keyboard MOVE MODE on the focused pane (the keyboard analog of a drag
   * pickup). Default `Alt+M` (code `KeyM`). While in move mode the focus arrows
   * pick a destination, `Enter` commits the relocation (`insertLeafAdjacent`),
   * and `Escape` cancels. Only meaningful when `rearrange` is enabled.
   */
  enterMoveMode?: TilingKeyChord;
  /**
   * Toggle focus between the current pane and the most-recently-focused other
   * pane (the MRU "focus current-or-last" toggle; Hyprland `focuscurrentorlast`
   * analog). Default `Alt+\`` (code `Backquote`). Only meaningful when `focus`
   * is enabled.
   */
  focusCurrentOrLast?: TilingKeyChord;
  /**
   * Toggle the focused subtree's layout mode dwindle ⇄ master (the Hyprland
   * layout-toggle analog). Default `Alt+L` (code `KeyL`). Only meaningful when
   * `masterLayout` is enabled.
   */
  cycleLayoutMode?: TilingKeyChord;
  /**
   * Cycle the master-area orientation left → top → right → bottom → left.
   * Default `Alt+Shift+O` (code `KeyO` + Shift). Bare `Alt+O` is avoided
   * because Chrome/Edge on Windows/Linux reserve it for the browser menu.
   * Switches to master layout mode automatically when invoked from dwindle.
   */
  cycleMasterOrientation?: TilingKeyChord;
  /** Add one tile to the master area (`+1` master count). Default `Alt+=` (code `Equal`). */
  incrementMasterCount?: TilingKeyChord;
  /** Remove one tile from the master area (`-1` master count). Default `Alt+-` (code `Minus`). */
  decrementMasterCount?: TilingKeyChord;
  /** Grow the master-area fraction (`+0.05` ratio). Default `Alt+.` (code `Period`). */
  incrementMasterRatio?: TilingKeyChord;
  /** Shrink the master-area fraction (`-0.05` ratio). Default `Alt+,` (code `Comma`). */
  decrementMasterRatio?: TilingKeyChord;
  /**
   * Toggle grouping for the focused pane: group it with its reading-order
   * neighbor, or ungroup it if already grouped (the Hyprland `togglegroup`
   * analog). Default `Alt+G` (code `KeyG`). Only meaningful when `grouping`
   * is enabled.
   */
  toggleGroup?: TilingKeyChord;
  /** Activate the next member tab of the focused group. Default `Alt+K` (code `KeyK`). */
  groupTabNext?: TilingKeyChord;
  /** Activate the previous member tab of the focused group. Default `Alt+J` (code `KeyJ`). */
  groupTabPrevious?: TilingKeyChord;
}

/** Fully-resolved key chord (every modifier explicit). Matches `KeyboardEvent.code`. */
export interface ResolvedTilingKeyChord {
  code: string;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

/** Fully-resolved jump-to-pane modifier set. */
export interface ResolvedTilingKeyChordModifiers {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

/** Fully-resolved keymap (no optional fields). */
export interface ResolvedTilingKeymap {
  toggleMaximize: ResolvedTilingKeyChord;
  restore: ResolvedTilingKeyChord;
  previousPane: ResolvedTilingKeyChord;
  nextPane: ResolvedTilingKeyChord;
  jumpToPane: ResolvedTilingKeyChordModifiers;
  focusLeft: ResolvedTilingKeyChord;
  focusRight: ResolvedTilingKeyChord;
  focusUp: ResolvedTilingKeyChord;
  focusDown: ResolvedTilingKeyChord;
  enterMoveMode: ResolvedTilingKeyChord;
  focusCurrentOrLast: ResolvedTilingKeyChord;
  cycleLayoutMode: ResolvedTilingKeyChord;
  cycleMasterOrientation: ResolvedTilingKeyChord;
  incrementMasterCount: ResolvedTilingKeyChord;
  decrementMasterCount: ResolvedTilingKeyChord;
  incrementMasterRatio: ResolvedTilingKeyChord;
  decrementMasterRatio: ResolvedTilingKeyChord;
  toggleGroup: ResolvedTilingKeyChord;
  groupTabNext: ResolvedTilingKeyChord;
  groupTabPrevious: ResolvedTilingKeyChord;
}

/**
 * A keyboard-event shape sufficient for pure keymap matching. Matching keys off
 * the physical `code`; `key` is retained only for form-field / diagnostic use
 * and is NOT consulted by `matchKeyChord` / `matchJumpToPaneNumber`.
 */
export interface TilingKeyboardEventLike {
  code: string;
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * The subset of modifier flags needed to decide whether a held-modifier switch
 * flow (the macOS Cmd+Tab-style pane switcher) should commit on key release.
 */
export interface TilingKeyboardModifierState {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Discriminated logical keyboard actions resolved from a key event. */
export type TilingKeyboardAction =
  | { kind: "toggle-maximize" }
  | { kind: "restore" }
  | { kind: "previous-pane" }
  | { kind: "next-pane" }
  | { kind: "jump-to-pane"; paneNumber: number }
  | { kind: "focus-direction"; direction: DynamicFocusDirection }
  | { kind: "focus-current-or-last" }
  | { kind: "enter-move-mode" }
  | { kind: "cycle-layout-mode" }
  | { kind: "cycle-master-orientation" }
  | { kind: "adjust-master-count"; delta: number }
  | { kind: "adjust-master-ratio"; delta: number }
  | { kind: "toggle-group" }
  | { kind: "group-tab-cycle"; direction: TilingPaneCycleDirection };

/** Pane cycle direction for the reading-order ring (next / previous, wraparound). */
export type TilingPaneCycleDirection = "next" | "previous";

/**
 * The public, typed, dispatch-style command set — the SDK's imperative entry
 * point (the Hyprland `dispatch` analog). Every internal renderer action is
 * enumerated here so an embedding app can invoke tiler behavior programmatically
 * (via the `TilingCommandHandle`) and so a keyboard binding can target any of
 * them (`TilingKeyBinding`).
 *
 * Context-dependent commands carry an OPTIONAL `leafId`; when omitted the
 * renderer resolves it against the CURRENT focused leaf at dispatch time (the
 * "act on the focused pane" ergonomic). Commands that need explicit operands
 * (swap / insert / split ops) require them.
 */
export type TilingCommand =
  | { kind: "focus-pane"; leafId: string }
  | { kind: "focus-direction"; direction: DynamicFocusDirection }
  | { kind: "focus-cycle"; direction: TilingPaneCycleDirection }
  | { kind: "focus-jump"; paneNumber: number }
  | { kind: "focus-current-or-last" }
  | { kind: "toggle-maximize"; leafId?: string }
  | { kind: "maximize"; leafId?: string }
  | { kind: "restore" }
  | { kind: "enter-move-mode"; leafId?: string }
  | { kind: "move-aim"; direction: DynamicFocusDirection }
  | { kind: "commit-move-mode" }
  | { kind: "cancel-move-mode" }
  | { kind: "swap-panes"; sourceLeafId: string; targetLeafId: string }
  | { kind: "insert-adjacent"; sourceLeafId: string; targetLeafId: string; placement: DynamicMovePlacement }
  | { kind: "acquire-space"; leafId?: string; direction: DynamicFocusDirection }
  | { kind: "set-sizing"; leafId?: string; mode: TilingTitleBarSizingMode }
  | { kind: "set-split-ratio"; splitId: string; ratio: number }
  | { kind: "toggle-split-axis"; splitId: string }
  // layout-mode (master/stack). `splitId` omitted → the ROOT split (the
  // "act on the workspace" ergonomic). A no-op when the resolved node is a leaf.
  | { kind: "set-layout-mode"; splitId?: string; mode: DynamicLayoutMode }
  | { kind: "cycle-layout-mode"; splitId?: string }
  | { kind: "set-master-count"; splitId?: string; count: number }
  | { kind: "adjust-master-count"; splitId?: string; delta: number }
  | { kind: "set-master-orientation"; splitId?: string; orientation: DynamicMasterOrientation }
  | { kind: "cycle-master-orientation"; splitId?: string }
  | { kind: "adjust-master-ratio"; splitId?: string; delta: number }
  // grouping / tabbed-stacking (HT-GROUP-TABBED-STACKING).
  | { kind: "group-leaves"; leafIds: ReadonlyArray<string> }
  // toggle: if the focused leaf is in a group → ungroup it; else group the
  // focused leaf with its reading-order neighbor. `leafId` omitted → focused.
  | { kind: "toggle-group"; leafId?: string }
  | { kind: "ungroup"; groupId?: string }
  | { kind: "add-to-group"; groupId: string; sourceLeafId: string }
  | { kind: "remove-from-group"; groupId: string; memberId: string }
  | { kind: "group-tab-cycle"; groupId?: string; direction: TilingPaneCycleDirection }
  | { kind: "group-tab-jump"; groupId?: string; memberNumber: number };

/**
 * The imperative handle exposed via `ref` on `DynamicTilingRenderer`. A consumer
 * holds the ref and drives the tiler programmatically — `dispatch` routes a
 * command through the SAME internal router the keyboard layer uses, so a
 * disabled-capability command is a safe no-op (it never mutates the layout).
 */
export interface TilingCommandHandle {
  dispatch: (command: TilingCommand) => void;
}

/**
 * A single keyboard binding: an arbitrary chord mapped to an arbitrary command.
 * The public chord→command registration surface (the Hyprland `bind` analog),
 * distinct from the fixed `TilingKeymap` chord overrides (which only re-chord
 * the built-in action set). The chord matches on `KeyboardEvent.code` exactly
 * like `TilingKeyChord`.
 */
export interface TilingKeyBinding {
  chord: TilingKeyChord;
  command: TilingCommand;
}

/**
 * Consumer keyboard-binding registry. `bindings` augment (and, on a chord
 * collision, override) the default keymap bindings; setting `replaceDefaults`
 * suppresses the built-in keymap path entirely so ONLY these bindings are live.
 */
export interface TilingKeyBindings {
  bindings?: ReadonlyArray<TilingKeyBinding>;
  /** When `true`, the default keymap bindings are NOT consulted. Default `false` (augment). */
  replaceDefaults?: boolean;
}

/**
 * Maximize (expand-to-viewport) capability. The maximize render-mode is
 * non-destructive — it hides sibling panes and renders the focused pane filling
 * the tiling viewport without mutating the layout tree.
 */
export interface TilingMaximizeCapability {
  /** Enable the per-pane maximize/restore control + shortcuts. Default `true`. */
  enable?: boolean;
  /**
   * Per-capability keybinding overrides for `toggleMaximize` / `restore`. These
   * take precedence over the top-level `keymap`, which takes precedence over the
   * documented defaults.
   */
  keymap?: Pick<TilingKeymap, "toggleMaximize" | "restore">;
}

/**
 * Tab-like pane-switching capability. Renders a tab strip across the top of the
 * tiling region and binds the cycle / jump shortcuts. When maximized, switching
 * panes also switches which pane is maximized.
 */
export interface TilingPaneSwitchingCapability {
  /** Enable pane switching (tab strip + cycle/jump shortcuts). Default `true`. */
  enable?: boolean;
  /** Render the tab strip. Default `true`. The shortcuts work regardless. */
  showTabStrip?: boolean;
  /**
   * Render the macOS Cmd+Tab-style visual switcher overlay while cycling panes
   * with a held modifier (`Alt+]` / `Alt+[`). Default `true`. When `true`, a
   * cycle press opens a centered overlay listing the panes and advances the
   * highlight; the selection commits (focus / activate, and switch the maximized
   * pane when maximized) on modifier release, and `Escape` cancels. When
   * `false`, cycle presses activate the next/previous pane immediately (no
   * overlay). The shortcuts work regardless of this flag.
   */
  showSwitcherOverlay?: boolean;
  /**
   * Per-capability keybinding overrides for `previousPane` / `nextPane` /
   * `jumpToPane`. These take precedence over the top-level `keymap`.
   */
  keymap?: Pick<TilingKeymap, "previousPane" | "nextPane" | "jumpToPane">;
}

/**
 * Per-pane TITLE-BAR control capability. These controls render directly in each
 * pane's own header (next to maximize), so they target THAT pane (no central
 * target-pane selector). Two independent control groups:
 *
 * - `sizing` — the FLEX / STATIC H / STATIC W / BOTH segmented control. STATIC
 *   actions measure the pane's current rendered bbox and pin the chosen
 *   dimension(s) to that pixel value; FLEX clears the pin.
 * - `acquireSpace` — the four directional (→ ← ↑ ↓) "grow to claim space"
 *   buttons, driven by the `growLeafToward` reducer.
 */
export interface TilingPaneTitleBarControlsCapability {
  /** Render the per-pane FLEX / STATIC H / STATIC W / BOTH sizing control. Default `true`. */
  sizing?: boolean;
  /** Render the per-pane directional (→ ← ↑ ↓) acquire-space controls. Default `true`. */
  acquireSpace?: boolean;
}

/** Resolved per-pane title-bar control capability (no optional fields). */
export interface ResolvedTilingPaneTitleBarControlsCapability {
  sizing: boolean;
  acquireSpace: boolean;
}

/** Resolved maximize capability (no optional fields). */
export interface ResolvedTilingMaximizeCapability {
  enable: boolean;
}

/** Resolved pane-switching capability (no optional fields). */
export interface ResolvedTilingPaneSwitchingCapability {
  enable: boolean;
  showTabStrip: boolean;
  showSwitcherOverlay: boolean;
}

/**
 * In-flight state of the macOS Cmd+Tab-style pane switcher. Present only while
 * the operator is mid-cycle (a held-modifier switch flow is open). `null` =
 * not switching.
 *
 * - `selectedLeafId` — the pane the highlight currently rests on; commit
 *   activates it.
 * - `holdModifiers` — the modifier set captured from the chord that opened the
 *   switcher; the switch commits when any of these modifiers is released (so a
 *   custom non-Alt cycle binding still commits on release of its own modifier).
 */
export interface TilingPaneSwitcherState {
  selectedLeafId: string;
  holdModifiers: ResolvedTilingKeyChordModifiers;
}

/**
 * In-flight state of keyboard MOVE MODE — the keyboard analog of a drag pickup,
 * present only while the operator is relocating a pane by keyboard. `null` =
 * not in move mode.
 *
 * - `sourceLeafId` — the pane being moved (the keyboard "drag source").
 * - `targetLeafId` — the destination neighbor chosen by the last focus-arrow
 *   press (`findLeafByDirection` from the source), or `null` before any arrow.
 * - `placement` — which edge of the target the source lands on when committed
 *   (`insertLeafAdjacent`), derived from the arrow direction, or `null` before
 *   any arrow. Commit is a no-op when either is `null`.
 */
export interface TilingMoveModeState {
  sourceLeafId: string;
  targetLeafId: string | null;
  placement: DynamicMovePlacement | null;
}

/**
 * Adjustable drag-drop HIT-ZONE GEOMETRY. These knobs shape the five-region
 * partition every pane uses to map a cursor position to a drop intent: one
 * central SWAP rectangle plus four directional INSERT trapezoids (top / right /
 * bottom / left) formed by the diagonals from each pane corner to the nearest
 * center-rectangle corner (see `drop-intent-resolver.ts`). The partition tiles
 * the full pane with no gaps; the same geometry drives both resolution and the
 * visual overlay, so the drawn zone is exactly the resolved zone.
 *
 * The model is SYMMETRIC: a single `centerRatio` sizes the center rectangle on
 * BOTH axes, which means the directional edge band depth is fully derived from
 * it as `(1 - centerRatio) / 2` per axis (there is no independent edge-band
 * knob, and no separate horizontal/vertical asymmetry — the diagonal-trapezoid
 * construction uses one ratio). CORNERS are not a distinct zone: a corner
 * resolves to whichever edge trapezoid contains it, with a deterministic
 * tie-break order (top → right → bottom → left) on an exact diagonal.
 *
 * Every field is optional; an `undefined` field resolves to the documented
 * default (which equals today's `DYNAMIC_DROP_INTENT_CONFIG`), so omitting this
 * object leaves drop-zone behavior exactly as it was.
 */
export interface TilingDropHitZoneGeometryCapability {
  /**
   * Fraction of each pane axis spanned by the central SWAP rectangle. The
   * directional INSERT edge band depth is the complement, `(1 - centerRatio) /
   * 2`. Clamped to `[0.05, 0.95]` by the resolver. Default `0.34`. Acts as the
   * SYMMETRIC convenience: it sets BOTH axes unless a per-axis override
   * (`centerRatioX` / `centerRatioY`) is supplied for that axis.
   */
  centerRatio?: number;
  /**
   * Per-axis HORIZONTAL (width) swap-zone fraction override. When set, it sizes
   * the center rectangle's X extent independently of `centerRatio`, letting a
   * non-square pane carry an axis-specific swap-zone proportion. Falls back to
   * `centerRatio` then the default `0.34`. Clamped to `[0.05, 0.95]`.
   */
  centerRatioX?: number;
  /**
   * Per-axis VERTICAL (height) swap-zone fraction override. When set, it sizes
   * the center rectangle's Y extent independently of `centerRatio`. Falls back
   * to `centerRatio` then the default `0.34`. Clamped to `[0.05, 0.95]`.
   */
  centerRatioY?: number;
  /**
   * Floor (CSS px) for the center rectangle's extent on each axis so tiny panes
   * keep a usable swap target even when `width * centerRatio` would collapse it.
   * Default `24`.
   */
  centerMinPx?: number;
  /**
   * Boundary stickiness (pane-local CSS px): once the cursor is in a zone it
   * must cross the boundary by this much before the classification switches,
   * suppressing sub-pixel flicker at the trapezoid edges. `0` disables
   * hysteresis. Default `6`.
   */
  hysteresisPx?: number;
}

/**
 * Fully-resolved drop hit-zone geometry (no optional fields). `centerRatio` is
 * retained as the symmetric/representative value (equals `centerRatioX` when no
 * per-axis override diverges them) for telemetry + the single-knob showcase
 * display; `centerRatioX` / `centerRatioY` are the per-axis values the resolver
 * actually consumes.
 */
export interface ResolvedTilingDropHitZoneGeometryCapability {
  centerRatio: number;
  centerRatioX: number;
  centerRatioY: number;
  centerMinPx: number;
  hysteresisPx: number;
}

/**
 * Public, reactive interaction-capability flags for the tiling renderer. All
 * fields are optional; an `undefined` field (or an `undefined` config object)
 * resolves to the all-enabled default via `resolveInteractionCapabilities`.
 */
export interface TilingInteractionCapabilities {
  /** Divider resize capability. Default `"both"` (every divider resizable). */
  resize?: TilingResizeCapability;
  /**
   * Whether split-divider resize handles are visibly rendered. `false` hides
   * handle chrome (separator paint / hover affordance) while preserving the
   * divider hit-target and resize capability gating from `resize`.
   * Default `false`.
   */
  resizeHandlesVisible?: boolean;
  /**
   * Drag-to-rearrange (move / swap / edge-insert) capability. When `false`,
   * panes are not draggable and no drop overlays / hit-zones activate.
   * Default `true`.
   */
  rearrange?: boolean;
  /**
   * Drag-to-rearrange feedback mode: `"preview"` (non-committing projected
   * overlays) vs `"live"` (Hyprland detach: source detached on pickup, frozen
   * tree, cursor-following ghost, commit on release). Default `"live"` (the
   * resolved default in `TILING_INTERACTION_CAPABILITY_DEFAULTS`).
   * Only meaningful when `rearrange` is enabled; live mode is also unreachable
   * for static-pane layouts (drag-rearrange is auto-gated off there).
   */
  dragMode?: TilingDragMode;
  /**
   * Live-drag slot re-resolution / commitment policy (the single ghost hops INTO
   * and FILLS the resolved slot). Only meaningful in `dragMode: "live"`. Default
   * all-resolved (`mode: "delta-responsive"`, `reresolveDeltaPx: 24`).
   */
  slotCommitment?: TilingSlotCommitmentCapability;
  /**
   * Touch-drag hardening (touch enable + long-press disambiguation). Only
   * meaningful when `rearrange` is enabled. Default all-resolved
   * (`enable: true`, `longPressMs: 220`).
   */
  touchDrag?: TilingTouchDragCapability;
  /**
   * Custom-rendered drag cursor (interaction tier "c"). When `true` (default),
   * an active live drag hides the OS cursor (`cursor: none` on the tiling root)
   * and renders a transform-pinned cursor element that follows the pointer and
   * reflects the drag FSM + drop validity (neutral grab / directional arrow /
   * swap / blocked). When `false`, the native OS cursor is used during drag.
   * Only meaningful in `dragMode: "live"`.
   */
  customCursor?: boolean;
  /**
   * Ghost pickup scale as a percent of the source pane's full bbox. On drag
   * start the live-mode ghost animates from the source pane's full bbox to this
   * fraction of it; values <100% read as lifted/shrunk. The free-following ghost
   * rests at this scale and morphs toward the resolved slot's bbox on hop-in.
   * Range `[10, 150]`; clamped where consumed. Default `90`. Only meaningful in
   * `dragMode: "live"`; skipped under `prefers-reduced-motion`.
   */
  ghostPickupScalePercent?: number;
  /**
   * Coherent non-intersecting transit. When `true` (default), the moving source
   * ghost and the displaced target never visually OVERLAP mid-transition: on a
   * SWAP both moving boxes scale down toward ~70% mid-transit (best-effort) then
   * scale back into place, coordinated with the survivor reflow so even if their
   * paths cross the shrunk boxes do not collide. Trivial / no-op for edge-insert
   * (the boxes never trade places). Only meaningful in `dragMode: "live"`;
   * skipped under `prefers-reduced-motion`.
   */
  coherentTransit?: boolean;
  /** Pane focus selection. When `false`, focus selection is suppressed. Default `true`. */
  focus?: boolean;
  /** Maximize-to-viewport capability. Default all-enabled. */
  maximize?: TilingMaximizeCapability;
  /** Tab-like pane-switching capability. Default all-enabled. */
  paneSwitching?: TilingPaneSwitchingCapability;
  /**
   * Per-pane title-bar controls (in-header sizing + acquire-space). Default
   * all-enabled. Reactive: toggling a flag at runtime shows/hides the controls
   * without remount.
   */
  paneTitleBarControls?: TilingPaneTitleBarControlsCapability;
  /**
   * Adjustable drag-drop hit-zone geometry (center swap fraction, center floor,
   * boundary hysteresis). Undefined → today's `DYNAMIC_DROP_INTENT_CONFIG`
   * defaults. Reactive: changing it at runtime re-shapes the drop zones (and
   * their visual overlay) immediately.
   */
  dropHitZoneGeometry?: TilingDropHitZoneGeometryCapability;
  /**
   * Top-level keymap. Capability-level `keymap` overrides take precedence over
   * this; this takes precedence over the documented defaults.
   */
  keymap?: TilingKeymap;
  /**
   * Public chord→command binding registry. Consumer bindings augment (and on a
   * chord collision override) the default keymap bindings; set
   * `replaceDefaults` to drop the built-in keymap path entirely. Undefined → the
   * default keymap bindings only.
   */
  keyBindings?: TilingKeyBindings;
  /**
   * Master/stack layout engine (HT-LAYOUT-MASTER-STACK). When `true` (default),
   * the layout-mode + master commands (`cycle-layout-mode`,
   * `adjust-master-count`, `cycle-master-orientation`, `adjust-master-ratio`, …)
   * and their default keybindings are live, and a subtree set to
   * `layoutMode: "master"` renders as a master area + stack. When `false`, those
   * commands are no-ops (a `master`-mode tree still renders via the resolver, but
   * the operator cannot change the mode/params). Default `true`.
   */
  masterLayout?: boolean;
  /**
   * Group / tabbed-stacking (HT-GROUP-TABBED-STACKING). When `true` (default),
   * the grouping commands (`toggle-group`, `ungroup`, `add-to-group`,
   * `group-tab-cycle`, `group-tab-jump`, `group-leaves`) and their default
   * keybindings are live, and drag-onto-the-center-of-a-group merges into the
   * group. When `false`, those commands are no-ops and drag-into-group is
   * disabled (an existing group still renders its tab strip). Default `true`.
   */
  grouping?: boolean;
}

/**
 * Fully-resolved interaction capabilities (no optional fields). The resolved
 * shape is a structural superset of `TilingInteractionCapabilities`, so a
 * resolved object can be re-fed to `resolveInteractionCapabilities` (idempotent)
 * and passed straight back into the `interaction` prop.
 */
export interface ResolvedTilingInteractionCapabilities {
  resize: TilingResizeCapability;
  resizeHandlesVisible: boolean;
  rearrange: boolean;
  dragMode: TilingDragMode;
  slotCommitment: ResolvedTilingSlotCommitmentCapability;
  touchDrag: ResolvedTilingTouchDragCapability;
  customCursor: boolean;
  ghostPickupScalePercent: number;
  coherentTransit: boolean;
  focus: boolean;
  maximize: ResolvedTilingMaximizeCapability;
  paneSwitching: ResolvedTilingPaneSwitchingCapability;
  paneTitleBarControls: ResolvedTilingPaneTitleBarControlsCapability;
  dropHitZoneGeometry: ResolvedTilingDropHitZoneGeometryCapability;
  keymap: ResolvedTilingKeymap;
  /**
   * Resolved consumer key bindings (the raw registry passed through; an empty
   * binding list + `replaceDefaults: false` when omitted). The renderer matches
   * these before the default keymap path.
   */
  keyBindings: ResolvedTilingKeyBindings;
  masterLayout: boolean;
  grouping: boolean;
}

/** Fully-resolved key-binding registry (no optional fields). */
export interface ResolvedTilingKeyBindings {
  bindings: ReadonlyArray<TilingKeyBinding>;
  replaceDefaults: boolean;
}

/**
 * Per-pane identity accent. A closed, typed palette so a consumer can drive a
 * picker from the enumerable `DYNAMIC_TILE_ACCENTS` list (exported from the
 * renderer) with exhaustive type-checking — adding a member here forces every
 * accent theme map to cover it.
 */
export type DynamicTileAccent =
  | "cyan"
  | "sky"
  | "violet"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "pink";

/**
 * Closed set of built-in visual theme ids for the renderer. A theme bundles the
 * class-string tokens for every surface (pane shell, header, focus frame,
 * ghost, dividers, root, tab strip) plus the accent-composition resolvers. The
 * token interfaces + registry live in `./theme`; this union is the central
 * contract a consumer types its `themeId` state against.
 */
export type TilingThemeId = "neon-terminal" | "clean-flat";

/**
 * A pickable accent paired with a human label and a solid Tailwind background
 * class for rendering a swatch dot — the generic metadata a palette control
 * (e.g. the showcase top-bar picker) iterates to offer accent selection.
 */
export interface DynamicTileAccentSwatch {
  accent: DynamicTileAccent;
  label: string;
  swatchClassName: string;
}

/**
 * Generic tile payload. Only `id` + `title` are required so a product consumer
 * (e.g. a dashboard) can supply a minimal `{ id, title, content }` tile and a
 * custom `renderTile`. The `accent` / `rows` fields drive `DefaultDynamicTile`
 * and the drag-pane snapshot chrome; when omitted they fall back (accent →
 * `"cyan"`, rows → `[]`), so a tile without them renders correctly under the
 * default tile surface. `content` is the slot a custom `renderTile` reads.
 */
export interface DynamicTile {
  id: string;
  title: string;
  description?: string;
  accent?: DynamicTileAccent;
  rows?: ReadonlyArray<string>;
  content?: React.ReactNode;
}

export interface DynamicLeafNode {
  kind: "leaf";
  id: string;
  tileId: string;
  /** Per-dimension static/flexible sizing. Undefined dimensions are flexible. */
  sizing?: TilingPaneSizing;
}

export interface DynamicSplitNode {
  kind: "split";
  id: string;
  axis: DynamicSplitAxis;
  ratio: number;
  first: DynamicLayoutNode;
  second: DynamicLayoutNode;
  gapPx?: number;
  minPaneSizePx?: number;
  /** Per-dimension static/flexible sizing. Undefined dimensions are flexible. */
  sizing?: TilingPaneSizing;
  /**
   * Arrangement of this subtree's slots. Undefined → `"dwindle"` (the binary
   * split layout — every hand-authored tree + the test baseline is unchanged).
   * `"master"` lays the subtree's descendant slots out as master area + stack.
   */
  layoutMode?: DynamicLayoutMode;
  /**
   * `layoutMode: "master"` only — number of slots in the master area. Undefined
   * → `1`. Clamped to `[1, slotCount]` by the resolver / reducers.
   */
  masterCount?: number;
  /**
   * `layoutMode: "master"` only — where the master area sits. Undefined →
   * `"left"`. In master mode the split's `ratio` is reused as the master-area
   * fraction along this orientation's primary axis.
   */
  masterOrientation?: DynamicMasterOrientation;
}

/**
 * A group/member slot (HT-GROUP-TABBED-STACKING): N leaves share ONE layout slot
 * as a stacked group with a tab strip — only `activeMemberId` renders / is
 * hit-tested, the tabs switch the active member. A group is a SLOT (like a leaf),
 * so a slot in either dwindle or master layout can hold a group. Members are
 * leaves only (no nested split/group — a group of one is degenerate and collapses
 * back to a bare leaf).
 */
export interface DynamicGroupNode {
  kind: "group";
  id: string;
  /** ≥1 member; array order is the tab order. */
  members: ReadonlyArray<DynamicLeafNode>;
  /** Always one of `members[].id` — the single rendered/hit-tested member. */
  activeMemberId: string;
  /** A group can be static like a leaf (per-dimension static/flexible sizing). */
  sizing?: TilingPaneSizing;
}

export type DynamicLayoutNode = DynamicLeafNode | DynamicSplitNode | DynamicGroupNode;

export interface DynamicLayoutConfig {
  gapPx: number;
  minPaneSizePx: number;
  handleSizePx: number;
}

export interface DynamicRenderTileArgs {
  leafId: string;
  tile: DynamicTile;
  /** 1-based pane ordinal in current tab order (for generic pane labels). */
  paneOrdinal: number;
  /** Current pane viewport width in pixels (for responsive header/control density). */
  paneWidthPx: number;
  /**
   * Global pane-content visibility toggle from the tab strip checkbox.
   * `false` hides pane body content by default.
   */
  isPaneContentVisible: boolean;
  /**
   * Canonical pane-body visibility decision resolved by the renderer policy.
   * Keeps custom tile renderers aligned with the default drag/hidden semantics.
   */
  paneBodyRenderMode: DynamicPaneBodyRenderMode;
  isDragSource: boolean;
  isDropTarget: boolean;
  isDropEligible: boolean;
  isHoveringDropCandidate: boolean;
  isInvalidDrop: boolean;
  isFocused: boolean;
  isRearrangeEnabled: boolean;
  /**
   * Whether this pane is the SOURCE of an in-flight keyboard move (the keyboard
   * analog of a drag source). Drives the "MOVING" affordance.
   */
  isMoveSource: boolean;
  /**
   * When this pane is the pending move-mode DESTINATION, the edge of this pane
   * the moved source will land on (`insertLeafAdjacent` placement). `null` when
   * this pane is not the current move-mode target.
   */
  moveTargetPlacement: DynamicMovePlacement | null;
  /** Whether this pane is currently maximized (fills the tiling viewport). */
  isMaximized: boolean;
  /** Whether the maximize capability is enabled (controls header button visibility). */
  isMaximizeEnabled: boolean;
  /** Toggle maximize/restore for this pane. */
  onToggleMaximize: () => void;
  /** Whether the per-pane title-bar sizing control (FLEX / STATIC H / STATIC W / BOTH) is enabled. */
  isTitleBarSizingEnabled: boolean;
  /** Whether the per-pane title-bar directional acquire-space controls (→ ← ↑ ↓) are enabled. */
  isTitleBarAcquireSpaceEnabled: boolean;
  /** This pane's current WIDTH sizing mode (static/flexible) — drives the active control state. */
  widthSizingMode: TilingPaneSizingMode;
  /** This pane's current HEIGHT sizing mode (static/flexible) — drives the active control state. */
  heightSizingMode: TilingPaneSizingMode;
  /**
   * Set THIS pane's sizing mode. STATIC modes measure the pane's current bbox
   * (getBoundingClientRect on its `[data-leaf-id]` element) and pin the chosen
   * dimension(s) to that pixel value; FLEX clears the pin and returns the pane
   * to ratio distribution. Emits via `onLayoutChange` (controlled).
   */
  onSetSizingMode: (mode: TilingTitleBarSizingMode) => void;
  /**
   * Grow THIS pane to claim the maximum available space in `direction` by
   * pushing matching-axis ancestor dividers toward the limit (siblings clamped
   * to their minimum). Emits via `onLayoutChange` (controlled).
   */
  onAcquireSpace: (direction: DynamicFocusDirection) => void;
  dropZone: DynamicLeafDropZone | null;
  dropIntentDebugPath: string | null;
  dropIntentDebugAction: DynamicDropAction | null;
  preview: DynamicLeafDropPreview | null;
  showDropPreviewOverlays: boolean;
  showDropBorderHints: boolean;
  showDropIntentTranslucentBg: boolean;
  showDropIntentDebug: boolean;
  /**
   * Center swap-zone fraction of the adjustable drop hit-zone geometry. Drives
   * the per-pane drop-intent hint overlay's clip-paths so the drawn hint tracks
   * the operator-tuned `centerRatio` (keeping it consistent with the resolver
   * and the `PaneHitZoneOverlay`). Default `0.34`.
   */
  dropHitZoneCenterRatio: number;
  /**
   * Per-axis HORIZONTAL swap-zone fraction for the per-pane drop-intent hint
   * overlay clip-paths (the X boundaries). Equals `dropHitZoneCenterRatio` when
   * no per-axis override diverges them. Default `0.34`.
   */
  dropHitZoneCenterRatioX: number;
  /** Per-axis VERTICAL swap-zone fraction for the per-pane drop hint overlay (the Y boundaries). Default `0.34`. */
  dropHitZoneCenterRatioY: number;
  paneHitZonesAlpha: number;
  paneHitZoneDebug: DynamicPaneHitZoneOverlayDebugState | null;
  observabilityColors: DynamicObservabilityColorConfig;
  observabilityColorEnables: DynamicObservabilityColorEnableConfig;
  onFocus: () => void;
  /**
   * Pointer-Events drag pickup on the pane's drag handle (the title-bar grip).
   * Wire this to the handle's `onPointerDown`; the renderer arms the drag FSM,
   * crosses the pickup threshold, and takes pointer capture on a stable element
   * so reflow moving panes under the cursor can never lose or hijack the drag.
   * Replaces the former HTML5 `draggable` + `onDragStart`/`onDragEnd` plumbing.
   */
  onHandlePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  /** Pre-drag hover telemetry (drop-intent hit-log); inert while a drag is in flight. */
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: React.PointerEvent<HTMLElement>) => void;
}

export type DynamicLeafDropZone = "center" | "left" | "right" | "top" | "bottom";
export type DynamicPaneBodyRenderMode =
  | "render-content"
  | "render-placeholder"
  | "render-reservation";
export type DynamicMovePlacement = "left" | "right" | "top" | "bottom";
export type DynamicFocusDirection = "left" | "right" | "up" | "down";
export type DynamicLeafPreviewRole = "drag-source-landing-shadow" | "drop-target-result-shadow";
export type DynamicLeafPreviewMode = "swap" | "edge-insert";
export type DynamicDropAction =
  | "swap"
  | "edge-insert"
  | "split-container-insert"
  | "group-merge"
  | "none";

export interface DynamicDropIntentTuningState {
  centerRatio: number;
  edgeThresholdRatio: number;
  hysteresisPx: number;
  devicePixelRatio: number;
}

export interface DynamicDropIntentDebugState {
  leafId: string;
  zone: DynamicLeafDropZone;
  action: DynamicDropAction;
  dominantEdge: Exclude<DynamicLeafDropZone, "center">;
  finalEdge: Exclude<DynamicLeafDropZone, "center"> | null;
  fallbackReason: string | null;
  blockedReason: string | null;
  axisPath: ReadonlyArray<DynamicSplitAxis>;
  edgeThresholdRatio: number;
  centerRectWidthPx: number | null;
  centerRectHeightPx: number | null;
  centerDistancePx: number | null;
  nearestEdgeDistancePx: number | null;
  paneLocalX: number | null;
  paneLocalY: number | null;
  targetSplitId: string | null;
  targetSplitPlacement: "first" | "second" | null;
  selectedSplitZone: Exclude<DynamicLeafDropZone, "center"> | null;
  selectedSplitDistancePx: number | null;
  rejectedSplitReasons: ReadonlyArray<string>;
  tuning: DynamicDropIntentTuningState;
}

export interface DynamicLiveHitEdgeDebugState {
  zone: Exclude<DynamicLeafDropZone, "center">;
  isValid: boolean;
  rejectionReason: string | null;
}

export interface DynamicViewportCursorState {
  x: number;
  y: number;
}

export interface DynamicLiveHitLogState {
  hoveredLeafId: string;
  sourceLeafId: string | null;
  dragSourceLeafId: string | null;
  cursorViewport: DynamicViewportCursorState;
  sourcePaneFootprint: DynamicPaneFootprint | null;
  dragSourcePaneFootprint: DynamicPaneFootprint | null;
  isDragging: boolean;
  resolverZone: DynamicLeafDropZone | "none";
  centerRatio: number;
  edgeThresholdRatio: number;
  centerRectWidthPx: number;
  centerRectHeightPx: number;
  centerIsValid: boolean;
  centerBlockedReason: string | null;
  edgeDiagnostics: ReadonlyArray<DynamicLiveHitEdgeDebugState>;
  intent: DynamicDropIntentDebugState | null;
  /** Leaf whose in-tree slot the ghost seats into (swap target or edge-insert source). */
  ghostSeatLeafId?: string | null;
  /** Resolved drop action for the active hover target (observability). */
  presentationDropAction?: DynamicDropAction | null;
  /** Whether pickup-origin content is suppressed in empty live drag. */
  suppressSourceContentInEmptyMode?: boolean;
}

export interface DynamicPaneHitZoneCandidateDebugState {
  zone: Exclude<DynamicLeafDropZone, "center">;
  isValid: boolean;
  rejectionReason: string | null;
}

export interface DynamicPaneHitZoneOverlayDebugState {
  leafId: string;
  dragSourceLeafId: string | null;
  centerRatio: number;
  /** Per-axis HORIZONTAL swap-zone fraction (drives the X clip-path boundaries). */
  centerRatioX: number;
  /** Per-axis VERTICAL swap-zone fraction (drives the Y clip-path boundaries). */
  centerRatioY: number;
  centerRectWidthPx: number;
  centerRectHeightPx: number;
  centerIsValid: boolean;
  centerBlockedReason: string | null;
  edgeCandidates: ReadonlyArray<DynamicPaneHitZoneCandidateDebugState>;
}

export interface DynamicLeafDropPreview {
  role: DynamicLeafPreviewRole;
  mode: DynamicLeafPreviewMode;
  zone: DynamicLeafDropZone;
  partnerLeafId: string;
}

export interface DynamicInsertionOptions {
  preserveParentSplitAxis: boolean;
  splitRatio: number;
}

export interface DynamicDragPaneSnapshot {
  tileId: string;
  title: string;
  description: string | null;
  /**
   * The rich content slot captured at pickup — the SAME `React.ReactNode` the
   * live pane renders (`DynamicTile.content`). The ghost paints this so the
   * dragged pane's real body (table / chart / form) rides along, falling back to
   * `rows` only when a tile supplies no `content` (the legacy text-row body).
   */
  content: React.ReactNode;
  rows: ReadonlyArray<string>;
  accent: DynamicTileAccent;
}

export interface DynamicPaneFootprint {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Projected-overlay subject taxonomy.
 *
 * - `source` — the dragged pane; projected landing `S'` is where the source
 *   content lands. On a SWAP this is the cell UNDER THE CURSOR (the target
 *   leaf's cell), because `swapLeafTiles` exchanges tile content between two
 *   fixed leaves; on an edge-insert it is the relocated source cell.
 * - `target` — the pane under the cursor / drop site; projected landing `T'` is
 *   where the target content lands. Only displaced on a SWAP (it lands in the
 *   source's old cell); a pure insert/move produces no `target` overlay.
 * - `successor` — the source's former sibling subtree, promoted into the
 *   source's VACATED cell on an insert/move as it absorbs the released space.
 */
export type DynamicProjectedLandingSubject = "source" | "target" | "successor";

export interface DynamicProjectedLandingOverlay {
  subject: DynamicProjectedLandingSubject;
  leafId: string;
  footprint: DynamicPaneFootprint;
}

export interface DynamicDragVisualState {
  sourceLeafId: string;
  sourceFootprint: DynamicPaneFootprint;
  /** Cursor-following base rect (client coords) — where the ghost sits when not seated. */
  activeFootprint: DynamicPaneFootprint;
  /**
   * The resolved slot's measured rect (client coords) the single ghost hops INTO
   * and FILLS, or `null` when free-following the cursor (no target / off-screen
   * slot). Drives the hop-in / hop-out FLIP in `DragPaneOverlay`.
   */
  seatFootprint: DynamicPaneFootprint | null;
  pointerAnchorOffsetX: number;
  pointerAnchorOffsetY: number;
  snapshot: DynamicDragPaneSnapshot;
}

export interface DynamicDragCancelVisualState {
  sourceLeafId: string;
  fromFootprint: DynamicPaneFootprint;
  toFootprint: DynamicPaneFootprint;
  snapshot: DynamicDragPaneSnapshot;
}

export interface DynamicObservabilityColorConfig {
  dragSourceBorderColorHex: string;
  dragTargetBorderColorHex: string;
  projectedSourceBorderColorHex: string;
  projectedTargetBorderColorHex: string;
  projectedSuccessorBorderColorHex: string;
  projectedSourceFillColorHex: string;
  projectedTargetFillColorHex: string;
  projectedSuccessorFillColorHex: string;
  hitZoneLeftColorHex: string;
  hitZoneRightColorHex: string;
  hitZoneTopColorHex: string;
  hitZoneBottomColorHex: string;
  hitZoneCenterColorHex: string;
  hitZoneBlockedColorHex: string;
}

/** Per-subject overlay/border visibility toggles for the showcase observability panel. */
export interface DynamicObservabilityColorEnableConfig {
  dragSourceBorderEnabled: boolean;
  dragTargetBorderEnabled: boolean;
  projectedSourceBorderEnabled: boolean;
  projectedTargetBorderEnabled: boolean;
  projectedSourceFillEnabled: boolean;
  projectedTargetFillEnabled: boolean;
  projectedSuccessorBorderEnabled: boolean;
  projectedSuccessorFillEnabled: boolean;
}

export interface DynamicTilingRendererProps {
  layout: DynamicLayoutNode;
  /**
   * Tile registry, accepted as either an ordered array (resolved by `id`) or a
   * `Map` keyed by tile id. A dashboard can pass a plain `ReadonlyArray` of
   * `{ id, title, content }` tiles; the interactive lab passes a `Map`.
   */
  tiles: ReadonlyArray<DynamicTile> | ReadonlyMap<string, DynamicTile>;
  config: DynamicLayoutConfig;
  onLayoutChange: (layout: DynamicLayoutNode) => void;
  className?: string;
  /**
   * Active visual theme id. Selects which built-in `TilingTheme` paints every
   * renderer surface (pane shells, header, focus frame, ghost, dividers, root,
   * tab strip) and how per-pane accents compose with it. Undefined resolves to
   * the library default (`"neon-terminal"`). Reacts to prop changes without
   * remount — a live switch re-themes the whole tree.
   */
  themeId?: TilingThemeId;
  /**
   * Notified when the in-renderer theme switcher (top-bar control) requests a
   * different theme. Present this control only when wired; the consumer owns
   * the `themeId` state (controlled). Omit to hide the switcher — the theme
   * stays whatever `themeId` resolves to. Generic mechanism; the demo theme
   * composition lives with the consumer.
   */
  onThemeChange?: (themeId: TilingThemeId) => void;
  /**
   * Reactive interaction-capability flags. Undefined resolves to all-enabled.
   * Changing this prop at runtime updates renderer behavior immediately.
   */
  interaction?: TilingInteractionCapabilities;
  renderTile?: (args: DynamicRenderTileArgs) => React.ReactNode;
  focusedLeafId?: string | null;
  onFocusedLeafChange?: (leafId: string) => void;
  /**
   * When provided, the top-bar tab strip surfaces an accent palette picker
   * (the enumerable `DYNAMIC_TILE_ACCENTS` swatches) that recolors the
   * currently-focused pane's tile. The renderer resolves the focused tile id;
   * the consumer owns the tile registry and applies the new accent (e.g. by
   * updating its tiles state). Omit to hide the picker — accent remains a
   * static per-tile property. Generic mechanism; the demo palette composition
   * lives with the consumer.
   */
  onTileAccentChange?: (tileId: string, accent: DynamicTileAccent) => void;
  /**
   * Controlled maximized-pane id. `undefined` → uncontrolled (renderer-managed
   * internal state). `null` → controlled, nothing maximized. A leaf id →
   * controlled, that pane maximized. Reacts to prop changes without remount.
   */
  maximizedLeafId?: string | null;
  /** Notified whenever the maximized pane changes (`null` on restore). */
  onMaximizedLeafChange?: (leafId: string | null) => void;
  onProjectedOverlayCountChange?: (count: number) => void;
  showDropPreviewOverlays?: boolean;
  observabilityColors?: DynamicObservabilityColorConfig;
  observabilityColorEnables?: DynamicObservabilityColorEnableConfig;
  projectedOverlayBackgroundAlpha?: number;
  /**
   * Master gate for all drag-motion choreography. When `false`, the ghost hop,
   * survivor reflow, pickup-entrance, and swap dip collapse to instant placement
   * (durations → ~0). Default `true`. The per-knob values (speeds, bounce) are
   * preserved and re-apply when re-enabled.
   */
  dragAnimationEnabled?: boolean;
  /**
   * CSS `<easing-function>` for the dragged GHOST's hop transit (hop-in /
   * hop-out / pickup entrance) and the swap/edge-insert ghost motion. Undefined
   * → the default snappy decel `cubic-bezier(0.2, 0.8, 0.2, 1)`. An invalid /
   * empty string falls back to that default (never reaches the compositor as a
   * broken `transition`). The seated-ghost magnetic `linear()` curve and the
   * swap-bounce curve are NOT replaced by this knob (sampled non-bezier curves).
   */
  dragHopEasing?: string;
  /**
   * CSS `<easing-function>` for the affected ("survivor") panes' FLIP reflow
   * settle. Undefined → defaults to the same curve as `dragHopEasing` so the
   * ghost and survivors read as one coordinated motion. Invalid / empty falls
   * back to the default.
   */
  dragReflowEasing?: string;
  /**
   * Speed of the dragged GHOST's transit animation (hop-in / hop-out / pickup
   * entrance) as a percent of the 170ms baseline (`100` = baseline). Lower is
   * slower; higher is faster. Clamped to `[10, 400]`. Default `100`.
   */
  ghostTransitSpeedPercent?: number;
  /**
   * Speed of the affected ("survivor") panes' REFLOW transform animation as a
   * percent of the 170ms baseline (`100` = baseline). Lower is slower; higher is
   * faster. Clamped to `[10, 400]`. Default `100`. When this equals
   * `ghostTransitSpeedPercent` the two parties are at PARITY, which the coherent
   * non-intersecting transit dip requires (see `coherentTransit`).
   */
  survivorReflowSpeedPercent?: number;
  /**
   * Swap-landing bounce magnitude as a percent of full overshoot (`0` = no
   * overshoot, today's monotonic settle; `100` = pronounced bounce). Applies an
   * easeOutBack overshoot to the ghost seated hop-in and the survivor reflow
   * settle. Per-element (no cross-element coupling), so it is NOT gated by speed
   * parity. Inert while the coherent-transit dip owns the landing. Clamped to
   * `[0, 100]`. Default `0`. Skipped under `prefers-reduced-motion`.
   */
  swapBounceMagnitudePercent?: number;
  showDropBorderHints?: boolean;
  showDropIntentTranslucentBg?: boolean;
  showDropIntentDebug?: boolean;
  showPaneHitZones?: boolean;
  paneHitZonesAlpha?: number;
  paneHitZoneSourceLeafId?: string | null;
  onDropIntentChange?: (intent: DynamicDropIntentDebugState | null) => void;
  onLiveHitLogChange?: (state: DynamicLiveHitLogState | null) => void;
}

export interface DynamicSplitResizeState {
  splitId: string;
  axis: DynamicSplitAxis;
  containerSizePx: number;
  startPointerPx: number;
  startRatio: number;
  gapPx: number;
  minPaneSizePx: number;
}
