# Workspace set — `@n-uf/hypr-tiling` native-workspaces design

Durable reference for the workspace-set design. **Library half shipped** as
`26.9.3` (`TilingWorkspaceSet`, set ops, renderer set mode, tab drop,
`useTilingWorkspaceTabs`); navigation shipped as `26.9.4`–`26.9.6` (tile-keyed
ops, commands/keymap, set controller, pool renderer, swipe, transition,
spring-load, tab-drop follow). See `_agent/workspace-navigation-plan.md` for
the navigation ledger. Later sections describe the intended model; §8.5
records what landed and where it diverged; §8.6 records post-26.9.3 follow-ups.

The first consumer cut-over target is DashAI in
`starpay-app/packages/dashai` (S4/S5 after publish). Until that cut-over it
still re-implements some workspace chrome app-side
(`core/schema/workspaces.ts`: `DashboardWorkspace`, `activeWorkspaceOf`,
`workspaceIdsShowingItem`, `moveItem`; `react/renderer/workspace-switcher.tsx`
tab strip; a per-workspace `layouts` map and a `key={activeWorkspaceId}`
remount in `react/renderer/dashboard-renderer.tsx`).

Sits alongside the package design records in `packages/hypr-tiling/_agent/`
(`public-api-boundary-design.md` for the `.` / `./engine` entry contract,
`core-extraction-design.md` for the host-port vocabulary,
`drag-subsystem-audit.md` for the drag FSM invariants INV-R1..R4).

Terminology (fixed across code, docs, and reports):

- **workspace** — one layout tree (`TilingLayoutNode | null`) with a stable id.
- **workspace set** — the ordered collection of workspaces plus the active id
  and the pin table. Type `TilingWorkspaceSet` (the `Tiling*` prefix follows
  every other public type; this document says "the set" for short).
- **pinned leaf** — a leaf present in more than one tree by declaration
  (Hyprland `pin`, i3/sway `sticky`). Everything else is an **unpinned leaf**
  and lives in exactly one tree.
- **external drop target** — a DOM element outside the renderer's viewport
  (typically a workspace tab) registered as a legal drop destination for a
  leaf drag.
- **drag-end hook** — the minimal renderer callback a sibling worker is adding
  concurrently so a host can act on a drag that ends outside any in-tree seat.
  It is the lowest layer of §5; this design builds on it and does not replace
  it.

Baseline: `main` at `417b030` (`docs: record pane-collapse in changelog
Unreleased`) — published `26.9.1` plus the unreleased pane-collapse merge
(`61c2bd1`). Line cites below are against that commit.

---

## 1. Problem and window-manager precedent

DashAI needs what every tiling window manager ships: several arrangements of
one pool of windows, one visible at a time, windows moved between them by drag
or command, a few windows visible everywhere. Implementing that above the
renderer costs DashAI three things the engine already solves for one tree:

1. **Cross-tree invariants** — "an item shows at most once per workspace and in
   at least one" is re-derived in `workspacesIssues` and re-repaired in
   `migrateDashboardWorkspaces` (`orphan-items`, `workspace-tiles-pruned`),
   duplicating `assertLayoutIntegrity` / `repairLayout`.
2. **Cross-tree moves** — `moveItem` is `removeWidget` over every tree then
   `insertWidget`, a re-implementation of `extractLeafNode` + `insertLeafAdjacent`
   without the static-fill normalisation, collapse-pin reassertion, or group
   collapse the engine reducers perform.
3. **The drag boundary** — the drag FSM cancels (fly-back) when a drop lands
   outside the tree, so "drag a tile onto a workspace tab" is impossible without
   a hook; the sibling worker's drag-end hook is that first step, but a host
   using it alone must hit-test the tab strip itself and mutate its own document
   while the ghost has already started its cancel glide.

Precedent the vocabulary and defaults follow:

| WM | Concept | Behaviour adopted here |
|---|---|---|
| Hyprland | `workspace N`, `movetoworkspace` / `movetoworkspacesilent`, `pin` | switch; move-and-follow vs move-silent (`follow` flag on the command); a pinned window is on every workspace |
| i3 / sway | `move container to workspace`, `sticky`, workspace destroyed when empty | move by name; sticky = pinned; empty workspaces are legal (we keep them — a dashboard workspace is named and user-created, not ephemeral) |
| tmux | windows in a session, `move-window`, `swap-window` | ordered tabs, reorder as a first-class op |

What the engine deliberately does **not** take from WMs: per-workspace
monitors, workspace rules, floating windows, and automatic garbage collection
of empty workspaces. A workspace here is a host-named layout; the host decides
when one is created or removed.

---

## 2. Engine types

All types live in a new framework-free module `engine/workspace-set.ts` and are
re-exported on `.` (they are consumer-facing — the host drives them from its
own chrome) and on `./engine` (server-safe alias; the same dual export
`createPersistedTilingLayout` already has, `index.ts:102` / `engine.ts:66`).

```ts
/** Host-minted, unique within the set. Any non-empty string. */
export type TilingWorkspaceId = string;

/** Which trees a pinned leaf is seated in. `"all"` is dynamic: a workspace added later receives the leaf. */
export type TilingLeafPin =
  | { readonly workspaces: "all" }
  | { readonly workspaces: ReadonlyArray<TilingWorkspaceId> };

export interface TilingWorkspaceSet {
  /** One tree per workspace; `null` = an empty workspace (see §2.2). */
  readonly workspaces: Readonly<Record<TilingWorkspaceId, TilingLayoutNode | null>>;
  /** Tab order. A permutation of `Object.keys(workspaces)`. */
  readonly order: ReadonlyArray<TilingWorkspaceId>;
  /** The rendered workspace. Always a member of `order`. */
  readonly activeId: TilingWorkspaceId;
  /** Leaf id → pin. A leaf absent here is unpinned. */
  readonly pinned: Readonly<Record<string, TilingLeafPin>>;
}
```

### 2.1 Invariants (`assertWorkspaceSetIntegrity`)

The set-level integrity report extends the per-tree `LayoutTileIntegrityReport`
(`engine/layout-normalize.ts`) rather than replacing it. Every tree is still
checked with `assertLayoutIntegrity`; the set adds:

- **I1 — order/keys agree.** `order` is a permutation of the keys of
  `workspaces`; `activeId ∈ order`; `order.length ≥ 1`.
- **I2 — unpinned leaf lives in exactly one tree.** For every leaf `id` not in
  `pinned`, exactly one tree contains a leaf with that `id`. Its `tileId`
  likewise appears in exactly one tree.
- **I3 — pinned leaf lives in exactly its pinned trees, once each.** For
  `pinned[id] = { workspaces: "all" }`, every tree contains the leaf once; for
  an explicit list, exactly those trees contain it, once each, and the list has
  ≥ 2 distinct members (a one-workspace pin is an unpinned leaf and is
  normalised away). The leaf carries the **same `id` and `tileId` in every tree
  it is seated in**; its node payload (`sizing`, `collapsed`, `minBBoxPx`) is
  **per tree** — placement and collapse state are workspace-local, exactly as a
  pinned Hyprland window keeps its own geometry per workspace.
- **I4 — leaf ids are set-unique.** Because of I2 + I3 a leaf id resolves to
  one logical pane across the set, so `moveLeafToWorkspace(set, leafId, …)`
  needs no source-workspace argument.
- **I5 — expected tiles (optional).** When the host passes `expectedTileIds`
  (the set-wide analogue of the per-tree option), every expected tile is seated
  somewhere and no tree seats an unknown tile. A tile seated nowhere is an
  **orphan**; the repair policy (§2.3) seats it.

Node ids of splits and groups stay **per tree** (today's contract: "unique
within the layout tree", `types.ts:1240`). Two trees may both carry a split
`root`; only leaf ids are set-unique.

### 2.2 Empty-tree policy — DECISION: `null` is a legal, renderable tree

`TilingLayoutNode` has no empty form and `removeLeafTile` refuses to remove a
root leaf (`state.ts:1253`) because a tree cannot be emptied. A set changes
that: moving the last leaf out of a workspace is a normal WM action. The set
therefore stores `TilingLayoutNode | null` per workspace, and:

- `moveLeafToWorkspace` / `removeWorkspace` may leave `null` behind.
- The renderer in set mode renders an empty viewport for a `null` active tree
  and paints the host-supplied `emptyWorkspace` node (zero chrome; DashAI keeps
  its `No widgets in workspace <name>.` status line).
- Single-tree mode (`layout` prop) is unchanged: `layout` stays
  `TilingLayoutNode`, non-null.

Rejected: forbidding empty workspaces (forces the host to auto-remove a
workspace the user just emptied, or refuse the drag that would empty it — both
worse than an empty tab) and a sentinel empty node kind (a fourth node kind
would leak into every walker and reducer).

### 2.3 Orphan and duplicate repair (`repairWorkspaceSet`)

Set-level repair composes per-tree `repairLayout` with three set rules, in
this order:

1. **Duplicates of an unpinned leaf** (violates I2): keep the occurrence in the
   earliest workspace in `order`, remove the others (gap-close via
   `removeLeafTile`).
2. **Pinned leaf missing from a pinned tree** (violates I3): seat it with the
   default pin placement (§3.5).
3. **Orphan expected tile** (violates I5): seat it in the **active** workspace
   with `{ kind: "root", side: "second" }` — DashAI's existing `orphan-items`
   rule, promoted to the engine default. Hosts can pass `orphanWorkspaceId`.

Per-tree `repairLayout` runs after the set rules, each tree with
`expectedTileIds` = the tiles the set says belong to that tree. A tree that
still fails hard integrity is replaced by the host `fallback` for that
workspace id, or `null` when the fallback set has no such workspace.

---

## 3. Pure set operations (`engine/workspace-set.ts`)

Every op is pure, returns a NEW set (or the same reference when it is a no-op),
and never throws on a bad id — the same total-function contract as the tree
reducers (`insertLeafAdjacent`: "Unchanged when … the source cannot be
extracted", `state.ts:1200`). Signatures:

```ts
export function createWorkspaceSet(input: {
  workspaces: ReadonlyArray<{ id: TilingWorkspaceId; layout: TilingLayoutNode | null }>;
  activeId?: TilingWorkspaceId;                   // default: first in `workspaces`
  pinned?: Readonly<Record<string, TilingLeafPin>>;
}): TilingWorkspaceSet;

/** Single-tree sugar: `{ workspaces: { [id]: layout }, order: [id], activeId: id, pinned: {} }`. */
export function workspaceSetOfLayout(layout: TilingLayoutNode, id?: TilingWorkspaceId): TilingWorkspaceSet;

export function addWorkspace(set, id, options?: {
  layout?: TilingLayoutNode | null;               // default `null`
  at?: number;                                    // index in `order`; default: append
  activate?: boolean;                             // default `false`
  pinPlacement?: TilingWorkspacePlacement;        // where `"all"`-pinned leaves are seated; default §3.5
}): TilingWorkspaceSet;

export type TilingRemoveWorkspaceOrphans =
  | { readonly kind: "move-to"; readonly workspaceId?: TilingWorkspaceId; readonly placement?: TilingWorkspacePlacement }
  | { readonly kind: "drop" }
  | { readonly kind: "refuse" };

export function removeWorkspace(set, id, options?: {
  orphans?: TilingRemoveWorkspaceOrphans;         // default `{ kind: "move-to" }` → the order-neighbour
  nextActiveId?: TilingWorkspaceId;               // when `id === activeId`; default: previous in order, else next
}): TilingWorkspaceSet;

export function switchWorkspace(set, id): TilingWorkspaceSet;
export function cycleWorkspace(set, direction: TilingPaneCycleDirection): TilingWorkspaceSet;

export function reorderWorkspaces(set, order: ReadonlyArray<TilingWorkspaceId>): TilingWorkspaceSet;
export function moveWorkspace(set, id, toIndex: number): TilingWorkspaceSet;

export type TilingWorkspacePlacement =
  | { readonly kind: "root"; readonly side: "first" | "second" }                                  // moveLeafToRoot
  | { readonly kind: "adjacent"; readonly targetLeafId: string; readonly placement: TilingMovePlacement } // insertLeafAdjacent
  | { readonly kind: "split-container"; readonly splitId: string; readonly side: "first" | "second" }   // moveLeafToSplitContainer
  | { readonly kind: "group"; readonly groupId: string };                                        // addLeafToGroup

export function moveLeafToWorkspace(set, leafId, to: TilingWorkspaceId, placement?: TilingWorkspacePlacement): TilingWorkspaceSet;

export function pinLeaf(set, leafId, pin?: TilingLeafPin, placement?: TilingWorkspacePlacement): TilingWorkspaceSet;
export function unpinLeaf(set, leafId, keepIn?: TilingWorkspaceId): TilingWorkspaceSet;

/** `set_layout`-style authoritative replace of one tree (see §3.4). */
export function setWorkspaceLayout(set, id, layout: TilingLayoutNode | null): TilingWorkspaceSet;

/** Read facade, the set-level analogue of `queryTilingLayout`. */
export interface TilingWorkspaceSetQuery {
  readonly active: TilingLayoutNode | null;
  readonly workspaceOfLeaf: (leafId: string) => ReadonlyArray<TilingWorkspaceId>;   // 1 entry unless pinned
  readonly workspacesOfTile: (tileId: string) => ReadonlyArray<TilingWorkspaceId>;
  readonly leafIds: (workspaceId: TilingWorkspaceId) => ReadonlyArray<string>;
  readonly isPinned: (leafId: string) => boolean;
  readonly neighbour: (workspaceId: TilingWorkspaceId, direction: TilingPaneCycleDirection) => TilingWorkspaceId | null;
}
export function queryWorkspaceSet(set: TilingWorkspaceSet): TilingWorkspaceSetQuery;

export function assertWorkspaceSetIntegrity(set, options?: { expectedTileIds?: ReadonlyArray<string> }): WorkspaceSetIntegrityReport;
export function repairWorkspaceSet(set, options: RepairWorkspaceSetOptions): TilingWorkspaceSet;
export function normalizeWorkspaceSet(set, options: NormalizeLayoutOptions): TilingWorkspaceSet;  // per-tree `normalizeLayout`
```

### 3.1 Edge cases per op

| Op | Case | Result |
|---|---|---|
| `addWorkspace` | `id` exists | unchanged |
| `addWorkspace` | `"all"`-pinned leaves exist | each is seated in the new tree with `pinPlacement` (default §3.5); an explicit-list pin is untouched |
| `addWorkspace` | `layout` given and contains an unpinned leaf already seated elsewhere | the leaf is **moved** (removed from its old tree) — replace-wins, same rule as §3.4 |
| `removeWorkspace` | last workspace, or `id` unknown | unchanged |
| `removeWorkspace` | `orphans: move-to` (default) | unpinned leaves of the removed tree are appended to the target (default: previous in `order`, else next) one by one with `placement` (default `{ root, second }`); pinned leaves are simply dropped from this tree (they exist elsewhere); a pin whose explicit list now has < 2 members is normalised to unpinned |
| `removeWorkspace` | `orphans: drop` | leaves vanish from the set; the host reconciles its own registry (DashAI deletes items shown nowhere) |
| `removeWorkspace` | `orphans: refuse` and the tree is non-empty | unchanged |
| `removeWorkspace` | `id === activeId` | `activeId` ← `nextActiveId` ?? previous in `order` ?? next |
| `switchWorkspace` | unknown id, or already active | unchanged |
| `reorderWorkspaces` | `order` is not a permutation of the current ids | unchanged |
| `moveLeafToWorkspace` | leaf unknown, or `to` unknown | unchanged |
| `moveLeafToWorkspace` | `to` is the leaf's own workspace | delegates to the in-tree reducer for `placement` (`insertLeafAdjacent` / `moveLeafToRoot` / `moveLeafToSplitContainer` / `addLeafToGroup`) — the op is total, so a tab drop on the active tab is a harmless re-seat |
| `moveLeafToWorkspace` | leaf is pinned | re-seats the leaf **within `to` only** (its other seats are untouched); if `to` is not in its pin list, `to` is added to the list |
| `moveLeafToWorkspace` | source tree is the bare leaf (root) | source becomes `null` (§2.2) |
| `moveLeafToWorkspace` | source leaf is a group member | `removeMemberFromGroup` semantics: a group of one collapses to its bare leaf |
| `moveLeafToWorkspace` | destination `placement` target (leaf / split / group id) is not in `to` | falls back to `{ root, second }`; a `null` destination tree becomes the bare leaf |
| `moveLeafToWorkspace` | leaf is `collapsed` | node payload travels; `reassertCollapsedExtentPins` runs on the destination so the pin lands on the new parent split's axis (the same rule a drag re-parent uses, `CHANGELOG.md` Unreleased) |
| `pinLeaf` | leaf absent from the set | unchanged |
| `pinLeaf` | `pin` omitted | `{ workspaces: "all" }` |
| `pinLeaf` | explicit list omits the leaf's home workspace | the home is added — a pin never removes a seat |
| `pinLeaf` | explicit list has < 2 members after normalisation | unchanged (a one-workspace pin is not a pin) |
| `unpinLeaf` | `keepIn` omitted | keeps the seat in the active workspace when it has one, else the first in `order` that has one; every other seat is removed |
| `setWorkspaceLayout` | see §3.4 | |

Every op that inserts or removes ends with `normalizeStaticAxisFill` on the
touched trees (the tree reducers already do this; the set op adds nothing).

### 3.2 Composition with `moveLeafToRoot` / `insertLeafAdjacent` / `moveLeafToSplitContainer` / `addLeafToGroup`

`moveLeafToWorkspace` is `extract` + `insert` across two trees. The tree
reducers each do extract + insert within ONE tree, so the set op cannot call
them directly for the cross-tree case; it reuses their halves:

```text
moveLeafToWorkspace(set, leafId, to, placement)
  ├── source = queryWorkspaceSet(set).workspaceOfLeaf(leafId)[0]   (unpinned) | to (pinned, re-seat)
  ├── extractLeafNode(set.workspaces[source], leafId)             (state.ts, today module-private → exported on ./engine)
  │     └── nextNode | null  → source tree (null when the leaf was the root)
  └── insertLeafInto(set.workspaces[to], extractedLeaf, placement)
        ├── root            → the body of moveLeafToRoot minus its own extract
        ├── adjacent        → insertLeafAroundTarget + resolveInsertionAxis (the body of insertLeafAdjacent)
        ├── split-container → insertLeafIntoSplitContainer
        └── group           → addLeafToGroup's member append
```

The refactor this implies inside `state.ts`: the three `moveLeafTo*` /
`insertLeafAdjacent` reducers become thin `extract → insertLeafInto`
compositions over one exported `insertLeafInto(tree | null, leaf, placement)`.
Behaviour of the single-tree reducers is unchanged (characterisation tests:
the existing `state.test.ts` cases must pass byte-identical trees; the split id
minting `split-${source}-${target}-${placement}` and `root-move-${source}` is
preserved).

### 3.3 Composition with the drag commit path

The renderer's in-tree drop commit (`swap` / `edge-insert` /
`split-container-insert` / `group-merge`) is untouched. In set mode the
renderer applies it to `set.workspaces[activeId]` and emits
`onWorkspacesChange(setWorkspaceLayout(set, activeId, nextTree))`. An external
drop (§5) is `moveLeafToWorkspace(set, sourceLeafId, target.workspaceId,
target.placement)`.

### 3.4 Composition with a `set_layout`-style replace — `setWorkspaceLayout`

DashAI's chat tool `set_layout` and its `moveItem` reducer replace a whole tree
and expect the item to "leave every other workspace". The engine op is
**authoritative for the replaced tree** and restores the invariants around it:

1. An unpinned leaf that appears in the new tree AND in another tree is removed
   from the other tree (replace wins; the leaf moved).
2. An unpinned leaf that was in the old tree and is absent from the new one is
   gone from the set — the host reconciles its registry (DashAI:
   `hideItem`-then-`removeItem` when shown nowhere). `expectedTileIds` at the
   next `repairWorkspaceSet` would otherwise re-seat it as an orphan in the
   active workspace, which is the documented orphan rule, not a bug.
3. A pinned leaf missing from the new tree is re-seated with the default pin
   placement (a pin is a set-level fact the tree cannot revoke; use `unpinLeaf`
   for that).
4. Node ids in the new tree are the caller's responsibility (per-tree
   uniqueness, `isStructurallyValidLayout`); `setWorkspaceLayout` runs
   `assertLayoutIntegrity` on the new tree and returns the set unchanged when
   `requiresRebuild`.

### 3.5 Default pin placement — DECISION: root-level, second side, default ratio

When the engine has to seat a pinned leaf in a tree without a host placement
(`addWorkspace` with `"all"` pins, `pinLeaf`, `repairWorkspaceSet` rule 2) it
uses `{ kind: "root", side: "second" }` — a new root split on the existing
root's axis (`moveLeafToRoot`, `state.ts:1287`: `horizontal` when the root is a
leaf) at the default insertion ratio. Rationale: it is the one placement that
exists in every tree, never disturbs an existing split's ratio, and matches
DashAI's `insertWidget(…, { region: "end" })` reading order (new tile last).
Hosts that want "pinned rail on the left" pass `{ kind: "root", side: "first" }`.

### 3.6 Composition with pane collapse and sizing

- `collapsed` / `collapsedDimension` / `collapsedRestore` / `minBBoxPx` /
  `sizing` are node fields, so they are **per tree** for a pinned leaf: a pane
  collapsed on workspace A is expanded on B unless the user collapses it there.
  The set does not synchronise them (Hyprland pinned windows likewise keep
  per-workspace geometry).
- `onPaneCollapsedChange` keeps firing for edits in the active tree; the event
  gains `workspaceId` so a host retitling a pinned pane knows which seat
  collapsed.
- `TilingLayoutConfig.collapseBodyMode: "keep-mounted"` (the Unreleased default)
  applies within the active tree only; whether **inactive workspaces'** panes
  stay mounted is a separate renderer knob (§5.1 `inactiveWorkspaces`).

---

## 4. Commands and capability gate

`TilingCommand` (`types.ts:510`) gains five kinds, all gated by a new
`TilingCommandGates.workspacesEnabled` fed from a new capability
`interaction.workspaces: boolean | { enable?: boolean; followMovedLeaf?: boolean }`
(default `enable: true` like every other capability; inert in single-tree
mode):

```ts
| { kind: "switch-workspace"; workspaceId: string }
| { kind: "cycle-workspace"; direction: TilingPaneCycleDirection }
| { kind: "move-leaf-to-workspace"; leafId?: string; workspaceId: string; placement?: TilingWorkspacePlacement; follow?: boolean }
| { kind: "pin-leaf"; leafId?: string; pin?: TilingLeafPin }
| { kind: "unpin-leaf"; leafId?: string }
```

`leafId` omitted → the focused leaf (the existing "act on the focused pane"
ergonomic). `follow` (default from `followMovedLeaf`, itself default `false`)
is Hyprland `movetoworkspace` vs `movetoworkspacesilent`: with `follow` the
set's `activeId` moves with the leaf. Dispatching any of these in single-tree
mode is a no-op (`isCommandEnabled` false — the gate is `false` when no
`workspaces` prop is present). **No default key chords** are added in the
first release (§9 Q6).

---

## 5. Renderer integration

### 5.1 `TilingRenderer` props — set mode beside single-tree mode

`TilingRendererProps` becomes a discriminated intersection so the existing
single-tree contract is untouched and the set contract is one controlled value:

```ts
interface TilingRendererSingleLayoutProps {
  layout: TilingLayoutNode;
  onLayoutChange: (layout: TilingLayoutNode) => void;
}
interface TilingRendererWorkspaceSetProps {
  workspaces: TilingWorkspaceSet;                              // includes `activeId`
  onWorkspacesChange: (next: TilingWorkspaceSet) => void;
  /** Semantic event beside the set change, like `onPaneCollapsedChange` beside `onLayoutChange`. */
  onMoveLeaf?: (event: TilingMoveLeafEvent) => void;
  onActiveWorkspaceChange?: (workspaceId: TilingWorkspaceId) => void;
  /** Painted inside the viewport when the active tree is `null`. Zero chrome. */
  emptyWorkspace?: React.ReactNode;
  /** Whether inactive workspaces' panes stay in the stable-identity pool. Default `"unmount"`. */
  inactiveWorkspaces?: "unmount" | "keep-mounted";
}
export type TilingRendererProps = TilingRendererCommonProps & (TilingRendererSingleLayoutProps | TilingRendererWorkspaceSetProps);

export interface TilingMoveLeafEvent {
  leafId: string;
  tileId: string;
  from: TilingWorkspaceId;
  to: TilingWorkspaceId;
  placement: TilingWorkspacePlacement;
  via: "drag" | "command";
}
```

DECISION — `activeId` lives inside the set, not as a sibling prop. The
reducers treat the active id as part of the value (`removeWorkspace` rewrites
it; `follow` moves it), so a separate `activeWorkspaceId` prop would create two
sources of truth the host must keep aligned on every change. The
`focusedLeafId` / `maximizedLeafId` precedent (separate controlled props) does
not apply: those are renderer-transient and never rewritten by a layout
reducer.

DECISION — internally there is ONE code path. The renderer always runs on a
set; `layout` / `onLayoutChange` are projected to
`workspaceSetOfLayout(layout, "main")` / `onWorkspacesChange(set) →
onLayoutChange(set.workspaces.main)`. No parallel renderer variant.

Per-workspace renderer state: focus (`focusedLeafId` uncontrolled),
`maximizedLeafId` (uncontrolled), multi-selection, and focus history are kept
**per workspace** inside the renderer (Hyprland remembers the last focused
window per workspace); a controlled host owns whatever it controls. Stable
pane identity (`paneIdentity: "stable"`) keeps the pool keyed by tile id
across a workspace switch, so a pinned pane's React instance survives the
switch; with `inactiveWorkspaces: "unmount"` (default) an unpinned pane of an
inactive workspace is not in the pool, which preserves DashAI's "only the
active workspace's `useWidgetData` runs".

`TilingRenderTileProps` gains `workspaceId: TilingWorkspaceId` (the seat's
workspace) and `isPinned: boolean`, so a custom pane can paint a pin glyph or
a per-workspace title.

### 5.2 Drag model — the external workspace target

Today `DragResolvedTarget = TilingDropIntentState` (`drag-machine.ts:61`) and
`isCommittableTarget` commits only `swap`, `group-merge`, or an `edge-insert`
with a resolved edge (`:232`); anything else on `POINTER_UP` settles as
`cancel` → fly-back. The set adds one target variant:

```ts
export interface TilingExternalDropTarget {
  kind: "external";
  targetId: string;                 // registry id (§5.3)
  workspaceId: TilingWorkspaceId;
  placement: TilingWorkspacePlacement;
  canDrop: boolean;                 // false when the leaf is already seated in `workspaceId` (pinned) or the target is disabled
}
export type DragResolvedTarget = TilingDropIntentState | TilingExternalDropTarget;
```

- `TARGET_RESOLVED` may now carry an external target. The renderer resolves it
  when the pointer is **outside the viewport rect** (it already measures that
  rect — `resolvePointerTarget`, `MeasurementPort.measureViewportRect`) by
  asking the drag scope (§5.3) `resolveExternalTarget(client)`; inside the
  viewport the in-tree resolver runs as today. External targets therefore never
  compete with pane hit-zones.
- `isCommittableTarget` returns `target.canDrop` for the external variant.
- `settling` with `outcome: "commit"` and an external target: the source leaf
  is removed from the active tree (the pickup already gap-closed it — the
  Hyprland-style live drag detaches on pickup), the ghost transits to the
  target element's rect (`MeasurementPort.measureExternalTargetRect(targetId)`)
  and fades, then `onWorkspacesChange(moveLeafToWorkspace(…))` +
  `onMoveLeaf({ via: "drag" })` fire on `SETTLE_DONE`. `prefers-reduced-motion`
  → instant. INV-R1..R4 hold unchanged: the strip / watchdog / visibility
  paths treat an external commit exactly like an in-tree commit.
- Hovering a tab does **not** switch workspaces mid-drag (no spring-loading) in
  the first release — the tree under the ghost would change while the FSM
  holds `anchorFootprint`s of the old tree (§9 Q7).
- The drop cursor badge reads the external target's validity through the
  existing `resolveDragCursorPresentation` (valid / invalid tones).

### 5.3 `TilingDragScope` and `useWorkspaceDropTarget(id)` (headless)

Workspace tabs are host chrome rendered **outside** the renderer's DOM, so the
renderer cannot hit-test them through its own selectors. A React context
provider shared by the renderer and the host chrome carries the registry:

```tsx
<TilingDragScope>                 {/* optional; the renderer creates a private scope when absent */}
  <HostTabStrip />                {/* uses useWorkspaceDropTarget per tab */}
  <TilingRenderer workspaces={set} onWorkspacesChange={…} />
</TilingDragScope>

export interface TilingWorkspaceDropTarget {
  ref: (element: HTMLElement | null) => void;   // registers / unregisters the element
  isDragActive: boolean;                         // a leaf drag is in flight in this scope
  isOver: boolean;                               // this target is the resolved external target
  canDrop: boolean;
  /** Spread onto the element: data-drop-target="workspace", data-drop-over, data-drop-disabled, aria-dropeffect. */
  attributes: Readonly<Record<string, string | undefined>>;
}
export function useWorkspaceDropTarget(
  workspaceId: TilingWorkspaceId,
  options?: { placement?: TilingWorkspacePlacement; disabled?: boolean },
): TilingWorkspaceDropTarget;
```

The scope owns: the target registry (`Map<targetId, { element, workspaceId,
placement, disabled }>`), `resolveExternalTarget(client)` (rect containment
over registered elements, measured through the react-layer `MeasurementPort`
implementation — DOM reads stay in `react/` per the layering guardrail), and
the per-scope drag-active / over state the hook subscribes to. Zero chrome:
the hook returns state and attributes; the host styles `[data-drop-over]`.

### 5.4 Optional headless `TilingWorkspaceTabs`

A thin, unstyled tab strip that encodes the roles, keyboard order and drop
wiring a host otherwise gets wrong — the same rationale as the custom-pane
primitives (`TilingPaneRoot`, `TilingDragHandle`; `index.ts:21`). Everything
visible is host-authored through render props.

```tsx
export interface TilingWorkspaceTabView {
  id: TilingWorkspaceId;
  index: number;
  isActive: boolean;
  leafCount: number;
  drop: TilingWorkspaceDropTarget;     // pre-wired useWorkspaceDropTarget(id)
}
export interface TilingWorkspaceTabsProps {
  workspaces: TilingWorkspaceSet;
  onSwitch: (workspaceId: TilingWorkspaceId) => void;
  onReorder?: (order: ReadonlyArray<TilingWorkspaceId>) => void;   // enables the reorder chords below
  activation?: "automatic" | "manual";                               // WAI-ARIA tabs: default "automatic" (arrow = switch)
  renderTab: (tab: TilingWorkspaceTabView) => React.ReactNode;       // the tab's CONTENT (label, close control, …)
  tabClassName?: (tab: TilingWorkspaceTabView) => string | undefined;
  className?: string;
  "aria-label"?: string;
  tabPanelId?: string;                                               // aria-controls target (the renderer root)
  after?: React.ReactNode;                                           // trailing host slot (e.g. "+")
}
```

Contract: container `role="tablist"`; each tab a `<button type="button"
role="tab" aria-selected data-workspace-id data-active tabIndex={active ? 0 :
-1}>` with the drop attributes spread; roving focus with `ArrowLeft` /
`ArrowRight` / `Home` / `End` (switch on move under `"automatic"`, `Enter` /
`Space` under `"manual"`); `Alt+Shift+ArrowLeft/Right` reorders only when
`onReorder` is wired; no other chords (the host may own `Alt+<n>` / `⌘<n>`).
Rename, delete, hold-to-confirm and the `+` control are host chrome inside
`renderTab` / `after` — the primitive never paints them. DashAI's
`WorkspaceSwitcher` keeps its `RenameField`, hold-to-remove `×` and `+` and
drops its own `nextIndex` / `tablist` / roving-tabindex code.

### 5.5 How this subsumes the concurrent drag-end hook

The sibling worker's hook, as scoped: a renderer callback fired on `POINTER_UP`
when the pointer is not over an in-tree committable target, carrying the
source leaf and tile ids and the client point, and letting the host claim the
drop. The layers stack as:

```text
L3  TilingRenderer `workspaces` prop      → applies moveLeafToWorkspace itself, emits onMoveLeaf
L2  TilingWorkspaceTabs (headless)       → renderTab + roles + keyboard, one drop target per tab
L1  TilingDragScope + useWorkspaceDropTarget → registry, hit-test, external DragResolvedTarget, ghost-to-tab settle
L0  drag-end / external-drop hook        → the FSM edge "drag ended outside the tree" + host claim
```

L1 is built ON L0: the scope's `resolveExternalTarget` runs on the same
pointer-move / pointer-up edge the hook exposes, and a claimed external target
is what turns the hook's "outside the tree" outcome into a `commit` instead of
a `cancel`. The hook stays public — a host with a non-workspace external target
(a "remove" tray, a second renderer) keeps using it directly. Three
requirements this design places on the hook so that L1 can sit on it without a
second edge:

1. **Claim before settle.** The callback must let the host mark the drop as
   handled synchronously (a returned verdict or an `accept()` on the event) so
   the FSM settles `commit` — source leaf stays removed, no fly-back — rather
   than firing after a `cancel` has begun. The 26.9.x standalone
   (`onExternalDrop` + `claimed` settle, below) meets this on the current
   line.
   DashAI L0 (2026-09-21, `worker/dashai-drag-to-workspace`, against 26.9.1): **not met as an FSM claim** — 26.9.1 has no hook, so `POINTER_UP` still settles `cancel` and `DragCancelOverlay` still runs the 220 ms fly-back (`fromFootprint` → origin); the host records a claim on `pointerup` and hides `.dashai-tile[data-surface="drag-cancel"][data-drop-claimed]`. Residual only the hook closes: the FSM's seat fallback (`foldCommittableSeatFallback`, `SUSTAINED_NULL_SEAT_THRESHOLD = 2`) keeps the last in-tree seat through one null sample, so a release that reaches an external target on the next processed sample settles `commit` on that stale seat while the host also runs its drop. Closed by the `claimed` settle once DashAI adopts `onExternalDrop`.
2. **Identity + point.** The event carries `sourceLeafId`, `tileId`, and the
   client point (`{ x, y }`); the scope needs nothing else to hit-test.
   DashAI L0 (2026-09-21, `worker/dashai-drag-to-workspace`): **met app-side, not via the hook** — `TileDragSource` in the ghost publishes the item; window `pointerup` supplies `{ x, y }`. `sourceLeafId` / `tileId` are not delivered (no hook event).
3. **Pointer-move sibling.** Either the hook fires on pointer move too (so
   `isOver` can light a tab while dragging), or L1 subscribes to the FSM's
   `TARGET_RESOLVED` edge for that — the pointer-up-only hook alone gives a
   correct but hover-blind drop.
   DashAI L0 (2026-09-21, `worker/dashai-drag-to-workspace`): **met app-side** — `useTileDropTarget` subscribes to window `pointermove` and lights `over`.

DashAI ships drag-to-tab on L0 now (§8 PR S1); the cut-over (§8 PR S3) moves it
to L3 and deletes the host-side hit-test.

#### Ghost mode (26.9.x standalone, forward-compatible subset)

The 26.9.x line ships the L0 claim-before-settle + compact-ghost subset
without the WorkspaceSet types, `TilingDragScope`, or external
`DragResolvedTarget`. Hosts (DashAI today) keep hit-testing their own
chrome and drive the engine through three additive `TilingRenderer` props
plus one optional theme slot. This is the forward-compatible subset of
the WorkspaceSet drag scope — L1/L3 will consume the same claim edge and
the same chip presentation; they add registry hit-test and
`moveLeafToWorkspace`, they do not replace this API.

- **Ghost mode** — `dragGhostMode?: "footprint" | "compact" | "auto"`
  (default `"footprint"` = today's tile-sized ghost, origin-offset from
  the pickup grab). `"compact"` always paints a small chip anchored at
  the pointer + 12,12 px. `"auto"` is `compact` while
  `externalDragHover` is non-null and `footprint` otherwise. Footprint ↔
  compact transitions over ~140 ms scale/opacity; `prefers-reduced-motion`
  is instant. Same `overlayPortalContainer` as the footprint ghost;
  `pointer-events: none`.
- **Chip via theme slot** — `TilingTheme.ghostChip?: (ctx: {
  leafId, title?, point, targetId? }) => ReactNode`. Host paints the chip
  contents; the renderer wraps them in the cursor-anchored shell
  (`data-drag-ghost-chip`, max-width clamped). Default is a minimal
  neutral chip (tile title, else leaf id).
- **Claim-before-settle callback** — `onExternalDrop?: (leafId, targetId,
  point) => void` fires on release while `externalDragHover` is non-null,
  **before** the FSM settles. The reducer marks the drag `claimed`
  (`DragSettleOutcome` gains `"claimed"`); `DragCancelOverlay` is skipped.
  Absent callback → existing cancel + 220 ms fly-back, even if hover is
  set. This is §5.5 requirement 1 on this line.

```ts
externalDragHover?: { targetId: string; point: { x: number; y: number } } | null
onExternalDrop?: (leafId: string, targetId: string, point: { x: number; y: number }) => void
```

---

## 6. Persistence — `persisted-layout` on a set, versioned migration

`createPersistedTilingLayout` (`engine/persisted-layout.ts`) stores a bare
`TilingLayoutNode` JSON under one key, guards shape with
`isPlausibleLayoutNode`, and heals through `assertLayoutIntegrity` /
`repairLayout`. It gains a versioned envelope and a set-shaped sibling over one
shared store module:

```ts
/** Stored value. v1 = a bare `TilingLayoutNode` (no `v`); v2 = this envelope. */
export interface PersistedTilingWorkspaceSetEnvelope {
  v: 2;
  kind: "workspace-set";
  workspaces: Record<TilingWorkspaceId, TilingLayoutNode | null>;
  order: TilingWorkspaceId[];
  activeId: TilingWorkspaceId;
  pinned: Record<string, TilingLeafPin>;
}

export function createPersistedTilingWorkspaceSet(options: {
  storageKey: string;
  expectedTileIds: ReadonlyArray<string>;            // set-wide (I5)
  fallback: TilingWorkspaceSet;
  config: TilingLayoutConfig;
  storage?: TilingLayoutStorage;
  resolveContainerSize?: () => TilingLayoutContainerSize;
  migration?: { singleTreeWorkspaceId?: TilingWorkspaceId };   // id a v1 tree becomes; default "main"
}): { load(): TilingWorkspaceSet; commit(set: TilingWorkspaceSet): TilingWorkspaceSet; reset(): TilingWorkspaceSet };
```

Read rules (`load`), in order: (1) `null` → `fallback`; (2) parses as a v2
envelope with plausible trees → `repairWorkspaceSet`; (3) parses as a
plausible bare tree (v1) → `{ workspaces: { [singleTreeWorkspaceId]: tree },
order, activeId, pinned: {} }` then repair — the migration; (4) anything else
→ `reset()`. `commit` validates (`assertWorkspaceSetIntegrity` +
`isPlausible*`), repairs, writes the v2 envelope, returns the healed set.

`createPersistedTilingLayout` **keeps its signature and return types** and
becomes a projection over the same store: `load()` returns the active tree of
the stored set (a v1 tree migrates the same way), `commit(tree)` writes the
tree into the stored set's active workspace and persists the v2 envelope,
`reset()` writes a one-workspace envelope of `fallbackLayout`. Single-tree
hosts change nothing in code; their storage key upgrades to v2 on the next
`commit`.

What hosts have to do:

- **Single-tree hosts:** nothing. Note the storage-shape change (§7): a
  `26.9.x` build reading a v2 envelope fails `isPlausibleLayoutNode` and
  `reset()`s to the fallback — a rollback across the release loses the saved
  arrangement once. Pin the version in lockstep with any rollback plan.
- **Set hosts:** switch to `createPersistedTilingWorkspaceSet`, supply a
  `fallback` set and set-wide `expectedTileIds`, pass
  `migration.singleTreeWorkspaceId` if their legacy tree should not become
  `main`.
- **DashAI:** unaffected — it persists in its own Firestore document
  (`DashboardDocument.workspaces[]`, `{ v: 2, tree }` envelopes per workspace,
  `15-board-tiling.md` §Persistence) and never used the localStorage adapter.
  Its mapping to the engine set is §8.

---

## 7. Versioning — verdict and breaking points

The package versions by calendar, `YY.M.R` (`_agent/versioning-policy.md`,
README "Versioning policy"; `CHANGELOG.md:5`: "calendar-aligned versioning …
cannot signal a SemVer 'major' bump. Read the per-release notes below for
breaking changes"). `27.x` therefore does not mean "major" — it means January
2027 or later, and `npm run release` (`calendar-version-bump.mjs`) aligns
`YY.M` to the publish date regardless of content. The "27.0 vs 26.x minor"
question dissolves into two real questions:

1. **Which calendar release carries it?** The next feature release after the
   pane-collapse `Unreleased` — `26.10.0` if it publishes in October 2026
   (`26.9.x` if it lands in September; it landed in September and shipped as
   `26.9.3`, initially mis-published as `26.10.0`). No version-shape choice is available or
   needed.
2. **Does the release carry `BREAKING` bullets?** Yes — the changelog
   convention is one bold `**BREAKING (…)**` bullet per break at the top of the
   release note (`26.9.0` theme shape, `Unreleased` two default-only breaks).
   The set release is a **feature release with type-level and storage-shape
   breaks**, no runtime-behaviour break for single-tree hosts.

VERDICT: ship as the next calendar feature release with the `BREAKING` bullets
below; do not hold it for a year-boundary version, which would signal nothing.

Breaking points to flag (in the order they bite a host):

- **BREAKING (type): `TilingRendererProps` is a discriminated intersection.**
  Hosts that `Pick` / `Omit` / spread `layout` + `onLayoutChange` through a
  wrapper typed `TilingRendererProps` need the single-layout member
  (`TilingRendererSingleLayoutProps`). Runtime unchanged.
- **BREAKING (type): `TilingCommandGates` gains `workspacesEnabled`.** A host
  building the gates literal (the documented `isCommandEnabled` example,
  `commands.ts:125`) fails typecheck until it adds the field. Runtime
  unchanged.
- **BREAKING (type): `TilingCommand` gains five kinds.** Exhaustive `switch`
  statements with a `never` guard fail typecheck. Runtime unchanged.
- **BREAKING (storage shape): `createPersistedTilingLayout` writes the v2
  envelope.** Same key, new JSON shape; reads both. A downgrade to `26.9.x`
  resets the key once (§6).
- **BREAKING (engine, `@beta`): `DragResolvedTarget` is a union.** Engine
  consumers reading `target.leafId` must narrow on `kind`. `./engine` carries
  no stability guarantee, listed for completeness.
- Additive, not breaking: `TilingRenderTileProps.workspaceId` / `isPinned`,
  `TilingPaneCollapsedChangeEvent.workspaceId`, the new capability
  `interaction.workspaces`, `TilingDragScope`, `useWorkspaceDropTarget`,
  `TilingWorkspaceTabs`, `createPersistedTilingWorkspaceSet`, every set op and
  type, the `MeasurementPort.measureExternalTargetRect` port method (engine).
- Not breaking by design: the drag-end hook (L0) stays public; the default
  drag behaviour with no registered external target is byte-identical
  (`POINTER_UP` outside the tree still cancels).

Gate before publish, as for every release: full suite + typecheck
(pkg/web) + build + prerender + `api:check` on all three reports
(`etc/hypr-tiling.api.md` will grow by the §2–§5 closure; `ae-forgotten-export`
converges it) + `check:guardrails` (engine still framework-free; the scope
provider and tabs live in `react/`).

---

## 8. DashAI cut-over plan (`starpay-app/packages/dashai`)

Recorded in `starpay-app/_agent/ai-dashboard-harness/11-decisions-and-assumptions.md`
§12.1 (2026-09-21 entry) and tracked as debt row
`DASHAI-WORKSPACES-ENGINE-NATIVE` in `starpay-app/_agent/programme-debt.md`.

### 8.1 Keep (document-level, host-owned)

- **Names and limits:** `DashboardWorkspace.name`, `WORKSPACES_MAX = 12`,
  `WORKSPACE_NAME_MAX_CHARS = 40`, `MAIN_WORKSPACE_ID` / `MAIN_WORKSPACE_NAME`,
  `mintWorkspaceId` (`ws:<ULID>`), `nextWorkspaceName`. The engine has no
  names and no cap.
- **Document persistence:** `DashboardDocument.workspaces: [{ id, name,
  layout }]` + `activeWorkspaceId`, the per-workspace `{ v: 2, tree }`
  envelope, the read-side migration chain (`layout-to-workspaces`,
  `workspace-tiles-pruned`, `orphan-items`, `active-workspace`), the
  Firestore store. One additive stored field: `stickyItemIds: string[]`
  (items pinned `"all"`; see 8.3).
- **The `tabs` node and the bridge:** the document keeps naming items
  (`tabs { itemIds, activeItemId }`), never lib leaf ids
  (`11-decisions-and-assumptions.md` §12.1 "Board tab groups and named
  workspaces"). `toHyprLayout` / `fromHyprLayout` **move from `@dashai/react`
  to `@dashai/core/schema/hypr-layout.ts`** (they are pure) so the set mapping
  below is isomorphic.
- **Placement policy:** `WidgetPlacement` (`after` / `region` / `replace` /
  `workspace` / `tabGroup`), `insertWidget`'s reading-order rules, and
  `placementWorkspaceOf` — the model speaks in items and regions, the engine
  in leaves and `TilingWorkspacePlacement`; the mapping is one function.
- **Harness tool** `arrange_board` and the digest lines; it gains
  `pin_item` / `unpin_item` ops (prompt `2.2.0 → 2.3.0`).

### 8.2 Delete (engine now owns it)

- In `core/schema/workspaces.ts`: `workspaceIdsShowingItem`,
  `workspaceOfTabGroup`, `showItem`, `hideItem`, `removeItem`'s cross-tree
  walk, `moveItem`, `createWorkspace`, `switchWorkspace`, `deleteWorkspace`'s
  orphan logic, `workspacesIssues` (I1–I5 replace it), the
  `migrateDashboardWorkspaces` orphan / duplicate arms (repair rules 1–3
  replace them; the name / shape arms stay). What remains — names, ids,
  limits, stored shapes, `WorkspacesShape` — folds into `dashboard.ts`, and a
  new `core/schema/workspace-set.ts` holds the two mappings:

  ```ts
  toWorkspaceSet(document): TilingWorkspaceSet          // tabs→group per tree; pins from presence + stickyItemIds
  applyWorkspaceSet(document, set): DashboardDocument   // group→tabs per tree; items shown nowhere leave `items`
  ```

  The file `workspaces.ts` itself is deleted (exit condition of the debt row).
- In `react/renderer/dashboard-renderer.tsx`: the per-workspace `layouts`
  map, `lastPersistedRef` per workspace, the `key={activeWorkspaceId}` remount,
  the `switchTo` / `create` / `destroy` reducers' tree logic; the board hands
  `<TilingRenderer workspaces={toWorkspaceSet(doc)} onWorkspacesChange={…}
  onMoveLeaf={…} emptyWorkspace={…}>` one set and debounces `applyWorkspaceSet`
  as it debounces `persistLayout` today. Read-only boards keep a local set for
  view-only switching (the same debounce-and-adopt rules, one value instead of
  a map).
- In `react/renderer/workspace-switcher.tsx`: `nextIndex`, the roving
  `tabIndex`, `role="tablist"` / `role="tab"` wiring and `data-workspace-id`
  focus lookup → `TilingWorkspaceTabs` with `renderTab` painting the label,
  `RenameField`, hold-to-remove `×`; `after` painting `+`. `.dashai-workspaces`
  CSS keys off the primitive's `data-*` attributes.
- The interim L0 drag-to-tab hit-test (PR S1 below).

### 8.3 "An item shown in several workspaces" → pinning

Today an item may be shown in any non-empty subset of workspaces
(`workspacesIssues`: "at least one … at most once per workspace"). The engine
pin (`TilingLeafPin`, §2) is `"all"` or an explicit list, so the mapping is
**lossless**:

| Document state (item `X`) | Engine set | Stored |
|---|---|---|
| shown in exactly one workspace | unpinned leaf `leaf:X` | presence only |
| shown in ≥ 2 but not all workspaces | `pinned["leaf:X"] = { workspaces: [ids] }` | presence only (list derived on read) |
| shown in every workspace, `X ∈ stickyItemIds` | `pinned["leaf:X"] = { workspaces: "all" }` | `stickyItemIds` |
| shown in every workspace, `X ∉ stickyItemIds` | explicit list of all ids (a new workspace does **not** receive it) | presence only |

`toWorkspaceSet` derives list pins from presence; only the `"all"` intent needs
the new `stickyItemIds` field (it is unobservable from presence). Legacy
documents have `stickyItemIds = []`, so nothing changes for them on read.
`placement.workspace` on an item already shown elsewhere maps to `pinLeaf(set,
leafId, { workspaces: [...current, target] })` (today's `showItem`);
`arrange_board pin_item` maps to `pinLeaf(set, leafId)` (`"all"`) +
`stickyItemIds`; `hideItem` maps to `unpinLeaf` when it leaves ≥ 1 seat, else
to the item leaving `items`.

Migration of stored dashboards: **read-side only, no bulk rewrite**
(`readStoredDashboardDocument` already migrates on read and the next save
writes the current form — the `layout-to-workspaces` precedent). No stored
shape changes except the additive `stickyItemIds`.

### 8.4 Order of PRs and test expectations

hypr-tiling first, then starpay; every library PR gates on the §7 green gate.

| # | Repo | Scope | Tests that must pass / land |
|---|---|---|---|
| H0 | hypr-tiling (sibling worker) | drag-end / external-drop hook (L0) meeting §5.5 requirements 1–3 | its own; `drag-machine.test.ts` unchanged for the no-target path |
| H1 | hypr-tiling | `engine/workspace-set.ts` types + ops + integrity + repair; `state.ts` `extractLeafNode` / `insertLeafInto` export and the `moveLeafTo*` recomposition | NEW `__tests__/workspace-set.test.ts` (every §3.1 row; I1–I5 property checks); `state.test.ts` byte-identical trees for the recomposed reducers |
| H2 | hypr-tiling | drag: external `DragResolvedTarget`, `isCommittableTarget`, settle-to-target; `react/tiling-drag-scope.tsx` + `useWorkspaceDropTarget`; `MeasurementPort.measureExternalTargetRect`; renderer `workspaces` prop, per-workspace focus memory, `inactiveWorkspaces`; commands + gate | `drag-machine.test.ts` external commit / cancel matrix; NEW `workspace-drop-target.test.tsx` (register, resolve, `isOver`, `canDrop` for pinned-already-there, no scope → no external targets); `controller-headless.test.ts` set mode; `stable-pane-identity.test.ts` pool across switch; `commands.test.ts` gate rows; `live-render-invariant` / `drag-recovery*` INV-R1..R4 unchanged; CDP throttle checkpoint (`packages/hypr-tiling/_agent/drag-recovery-cdp-throttle.md`) for the external settle |
| H3 | hypr-tiling | `react/tiling-workspace-tabs.tsx` headless primitive | NEW `workspace-tabs.test.tsx` (roles, roving focus, automatic/manual activation, reorder chords only with `onReorder`, drop attributes) — the a11y pattern of `keyboard-a11y.test.ts` |
| H4 | hypr-tiling | persisted envelope v2 + `createPersistedTilingWorkspaceSet` + projection; README / docs-site / API reports / `CHANGELOG.md` release note with the §7 bullets; publish `26.9.3` (shipped as 26.9.3, initially mis-published as 26.10.0) | `persisted-layout.test.ts` v1→v2 migration, projection round-trip, downgrade note; `api:check` all three reports; `check:guardrails` |
| S1 | starpay-app (now, on H0) | drag a tile onto a workspace tab in `DashboardBoard` via the L0 hook + `moveItem`; `WorkspaceSwitcher` tab lights on hover | `dashboard-renderer.test.tsx` drop-on-tab case; `workspace-layout.test.ts` unchanged |
| S2 | starpay-app | bump to `26.9.3`; move `hypr-layout.ts` to core; add `core/schema/workspace-set.ts` (`toWorkspaceSet` / `applyWorkspaceSet`); rewrite `workspaces.ts` reducers as thin engine calls (same exported names, so callers compile) | `core/__tests__/tiling.test.ts` + a NEW `workspace-set.test.ts` round-trip (document ↔ set identity for every fixture incl. multi-presence → list pins, `stickyItemIds` → `"all"`); existing `workspace-layout.test.ts` passes against the engine-backed reducers |
| S3 | starpay-app | renderer on the `workspaces` prop, `WorkspaceSwitcher` on `TilingWorkspaceTabs`, delete `layouts` map + remount key, S1's L0 path → L3; delete `workspaces.ts` (names → `dashboard.ts`); `arrange_board pin_item` / `unpin_item`; prompt `2.3.0`; `stickyItemIds` | `dashboard-renderer.test.tsx` snapshot regenerated (one renderer instance across switches; stable pool); `workspace-switcher.test.tsx` a11y parity with today; harness `arrange_board` golden case; `document-digest` unchanged for single-workspace documents |

S2 is the safety net: it puts DashAI on the engine's set ops behind unchanged
export names, so S3 is a pure deletion plus renderer swap with the reducer
behaviour already proven identical.

### 8.5 Library half status — H1–H4 DONE on `feat/workspace-set` (2026-09-22, shipped as `26.9.3` — initially mis-published as `26.10.0`, unpublished from npm — that number is burned; October starts at `26.10.1`)

The library half landed as four commits on `feat/workspace-set` in the
sequence the dispatch asked for (engine set → renderer prop → tab drop target
→ headless tabs + release prep), which regroups the H1–H4 rows above: what
the table calls H2's "renderer `workspaces` prop / per-workspace focus
memory" is the landed H2; the table's H2 external-drag scope and H3 tabs are
the landed H3 + H4; the table's H4 persisted envelope v2 did **not** land
(see divergence 8 — DashAI persists the document, not the engine set).

| Landed commit (`feat/workspace-set`) | Delivers | Tests |
|---|---|---|
| H1 `workspace set: engine types, pure ops, integrity walker and repair` | `engine/workspace-set.ts`; `TilingWorkspacePlacement`; `extractLeafNode` / `insertLeafInto` exported from `state.ts` | `__tests__/workspace-set.test.ts` (34: every §3.1 row, property checks over random sets → ops → `issues()` empty, `insertLeafInto` mirrors each mover) |
| H2 `renderer workspaces prop, per-workspace focus/maximize scope, drag cancel on switch` | `TilingRendererWorkspaceSetProps`, `TilingRendererCommonProps`, `TilingRendererModeProps`; set-mode wrapper; `renderEmptyWorkspace` | `__tests__/workspace-set-renderer.test.ts` (7: DOM-node identity across a switch, empty shell, edit → next set, maximize scope + restore, controlled pass-through, drag cancelled on switch, single-layout unchanged) |
| H3 `native workspace-tab drop target, tab hit-test, declinable external claim` | `TilingWorkspaceTabDragHover` / `TilingExternalDropHover` union; set-mode settle by `moveLeafToWorkspace`; `engine/workspace-tabs.ts` `resolveWorkspaceTabHover`; `onExternalDrop` 4th arg + `false` = decline; `ghostChip` `workspaceId` | `__tests__/workspace-tab-drop.test.ts` (9) |
| H4 `headless TilingWorkspaceTabs, drag-hover resolver, 26.10.0 release prep` (commit title; the release shipped as `26.9.3`) | `useTilingWorkspaceTabs` / `TilingWorkspaceTabs`; `resolveExternalDragHover` / `onExternalDragHoverChange` renderer props; `resolveWorkspaceTabKey`; theme tokens; README / CHANGELOG / API reports / version | `__tests__/workspace-tabs.test.ts` (8, incl. drag over tab → drop into an empty workspace end-to-end) |

#### Divergences from the design above, and why

1. **Set shape is `{ workspaces: [{ id, name, layout }], activeId }`, not
   §2's `Record<id, layout>` + `order` + `pinned` table.** The dispatch
   fixed this shape and it maps 1:1 onto DashAI's `WorkspaceLayout` /
   `workspaces.ts` reducers (`addWorkspace`, `renameWorkspace`,
   `removeWorkspace`, `switchWorkspace`, `moveItemToWorkspace`, `showItem`,
   `hideItem` → `createWorkspace`, `renameWorkspace`, `deleteWorkspace`,
   `switchWorkspace`, `moveLeafToWorkspace`, `showInWorkspace`,
   `hideFromWorkspace`). §2's `pinned: "all" | list` becomes plain presence:
   a leaf shown in several workspaces is one `leaf:{id,tileId}` node per
   tree. §8.3's "multi-presence → list pins" is therefore identity, and
   `"all"` (`stickyItemIds`) is host sugar (S3 loops `showInWorkspace` on
   create). No `TilingLeafPin` type shipped.
2. **Leaf-centric ops key on `leafId`, not `itemId`.** Every tree reducer is
   leaf-keyed and DashAI mints `leaf:<itemId>` deterministically, so the
   S2 mapping stays one-to-one (`toLeafId(itemId)`). The set invariant that
   makes this sound is **one leaf id ↔ one tile id across the whole set**
   (`leaf-tile-binding-mismatch`), on top of §2.1 I1–I5. `deleteWorkspace`
   returns `removedTileIds` (tile ids, the host's item ids).
3. **§3.5 placement is a public `TilingWorkspacePlacement`**
   (`root` / `adjacent` / `split-container` / `group`) rather than only the
   default root-second; `TILING_DEFAULT_WORKSPACE_PLACEMENT` is root-second
   as designed. The existing movers were NOT recomposed on `insertLeafInto`
   (§3.2): `insertLeafAdjacent` silently drops a missing target where
   `insertLeafInto` falls back to root-second, so recomposition would have
   changed a reducer's observable edge case; the shared halves are exported
   and reused by the set ops only.
4. **Renderer prop split is additive, not the §5.1 `Common & (Single |
   Set)` rewrite.** `TilingRendererProps` keeps its exact 26.9.2 shape
   (now `extends TilingRendererCommonProps`); the set alternative is
   `TilingRendererWorkspaceSetProps`; the component accepts
   `TilingRendererModeProps` (their union). No consumer type breaks.
   `inactiveWorkspaces` (§5.1) did not ship — the stable pane pool already
   keeps a shared leaf's instance across a switch, which is the property
   the dispatch asked to prove; keep-mounted for *non*-shared panes is a
   later knob.
5. **No `DragResolvedTarget` external variant, no `TilingDragScope`, no
   `useWorkspaceDropTarget` (§5.2 / §5.3).** The dispatch pinned the
   26.9.2 claim-before-settle path instead: the hover union
   (`kind: "workspace-tab"`) + `resolveExternalDragHover` (engine calls
   the hit-test per frame and at release) + `onExternalDragHoverChange`
   (feeds `isDropTarget` back) give the same "host writes no hit-test"
   outcome with one FSM edge (`claimed`) and no new drag phase. §5.5
   requirements 1–3 hold; §5.5's "settle-to-target fly-to-tab" animation
   is not painted (claimed settle is instant, as in 26.9.2).
6. **Focus / maximize memory lives in the set-mode wrapper (§5.3 /
   Q9).** Uncontrolled only; the inner renderer is driven controlled from
   that memory, sanitised against the active tree. A drag in flight is
   **cancelled** (not scoped) when its source leaf leaves the controlled
   tree — the general "host swapped the tree under a drag" rule, which a
   workspace switch is one instance of.
7. **Tabs keyboard model is manual activation by default (Enter / Space
   activate; `activation: "automatic"` opt-in); F2 = rename, Delete =
   close, both only when the affordance callback is wired; no reorder
   chords / `onReorder`** (§5.4). `reorderWorkspaces` is not an engine op
   in this release — DashAI has no reorder reducer to map.
8. **No persisted envelope v2 / `createPersistedTilingWorkspaceSet` (§6,
   table H4).** DashAI persists its own document and projects to the set
   (S2 `toWorkspaceSet` / `applyWorkspaceSet`); the engine-side envelope
   has no consumer yet. Reopen when a second host needs engine-owned
   persistence.
9. **`onExternalDrop` grew a 4th `hover` argument and may return `false`
   to decline.** Needed so the set-mode wrapper can route a non-tab hover
   to the host and a tab hover to `moveLeafToWorkspace` without a
   render-time guess; additive for 3-argument `void` hosts.
10. **The API reports regenerated in H4 also absorb the pane-collapse
    surface that shipped in `main` after the 26.9.2 report was cut**
    (`isCollapsed` / `onToggleCollapse` / `collapseEnabled`…); the
    CHANGELOG folds that "Unreleased" block into `26.9.3` (initially
    mis-published as `26.10.0`).

### 8.6 Navigation follow-ups shipped after 26.9.3

Recorded so this design is not read as the current API:

- **`inactiveWorkspaces`** shipped in 26.9.4 (`"unmount"` | `"keep-mounted"`).
  Divergence 4 and Q8 are closed.
- **Tile-keyed set ops + `revealTile`**, workspace commands /
  `WORKSPACE_KEY_BINDINGS`, `useTilingWorkspaceSetController`, swipe +
  transition + spring-load (`REARM`) shipped in 26.9.4. Q7 (spring-load
  deferred) is closed.
- **Swipe modifier + sequence-start gating + whole-window horizontal lock**
  shipped in 26.9.5.
- **Drag-source pool parking + `followMovedLeaf` tab-drop in one
  `onWorkspacesChange` + `via: "tab-drop"`** shipped in 26.9.6. Hosts must
  not switch from `onMoveLeaf`.
- **Pin table / `TilingLeafPin` / persisted envelope v2** still not shipped
  (divergences 1 and 8 stand).

---

## 9. Open questions — each with a recommendation

1. **Pin model: `"all"`-only vs `"all" | explicit list`.** WM precedent is
   all-only (sticky). Recommendation: **list + `"all"`** — it makes the DashAI
   migration lossless (8.3) and costs one invariant (I3) plus a normalisation
   (a one-member list is not a pin); an all-only engine would force either
   data loss (demote multi-presence items to one workspace) or surprise
   (promote them to every workspace).
2. **Where the pure set ops are exported.** `.` is the stability contract;
   `./engine` is `@beta`. `@dashai/core` is isomorphic (harness reducers run in
   a worker and in the Node route), and `.` carries `"use client"` + React
   imports. Recommendation: export on **both**, following the
   `createPersistedTilingLayout` precedent, and state in the changelog that
   the workspace-set symbols are covered by the `.` contract whichever entry
   imports them. Revisit a dedicated framework-free public entry only if an
   RSC bundle turns the `.` exports into client references for a server
   caller.
3. **Default orphan policy on `removeWorkspace`.** `move-to` neighbour (no
   data loss, WM-like) vs `drop` (DashAI's current rule). Recommendation:
   **`move-to`** as the engine default; DashAI passes `{ kind: "drop" }`
   explicitly and keeps its "items shown nowhere leave `items`" rule.
4. **Drag-end hook contract (L0).** Must it support a synchronous claim?
   Recommendation: **yes** (§5.5 req. 1) — without it every external drop
   shows a fly-back that is then undone, and L1 would need a second FSM edge.
   Raise with the sibling worker before the hook is public.
5. **Cross-workspace swap placement (`{ kind: "swap", targetLeafId }`).**
   Recommendation: **not in the first release** — it is two moves with no drag
   affordance (the target is invisible while dragging), and `arrange_board`
   does not need it.
6. **Default key chords for workspace commands.** Hyprland binds
   `SUPER+<n>` / `SUPER+SHIFT+<n>`. Recommendation: **no defaults**; the
   commands are dispatchable and bindable (`TilingKeyBindings`), and DashAI
   already replaces the default keymap (`NO_KEY_BINDINGS`) because the
   terminal owns `Alt+<n>`. Revisit with the homepage.
7. **Spring-loaded switch while hovering a tab mid-drag.** Recommendation:
   **defer** — it changes the tree under a live drag (anchor footprints, seat
   reservation, FLIP survivors all belong to the old tree); a follow-up can
   add a dwell timer that ends the current drag as an external commit and
   re-arms in the new workspace.
8. **Inactive workspaces' panes: unmount or keep mounted.** Recommendation:
   **`"unmount"` default**, `"keep-mounted"` opt-in mirroring
   `collapseBodyMode` — DashAI's data-plane rule ("only the active workspace's
   `useWidgetData` runs") is the default; an IDE host with cheap panes opts in.
9. **Per-workspace focus / maximize memory inside the renderer.**
   Recommendation: **yes, uncontrolled only** — the set type stays a pure
   layout value (no transient UI state), the renderer remembers per workspace
   like Hyprland; controlled hosts own it as today.
10. **Workspace cap in the engine.** Recommendation: **no** — a host concern
    (DashAI `WORKSPACES_MAX = 12`); the engine adds nothing it cannot justify
    for every host.
11. **`stickyItemIds` vs storing the full pin table on the document.**
    Recommendation: **`stickyItemIds` only** — list pins are derivable from
    presence, so storing them would create a second source of truth the read
    side must reconcile; only the `"all"` intent is unobservable.

---

## 10. Target module layout (after H1–H4)

```text
packages/hypr-tiling/
├── engine/
│   ├── workspace-set.ts          # NEW: TilingWorkspaceSet, TilingLeafPin, ops, query, integrity, repair (framework-free)
│   ├── state.ts                  # extractLeafNode / insertLeafInto exported; moveLeafTo* recomposed
│   ├── drag-machine.ts           # DragResolvedTarget = TilingDropIntentState | TilingExternalDropTarget
│   ├── measurement-port.ts       # + measureExternalTargetRect(targetId)
│   ├── commands.ts               # + workspacesEnabled gate, five command kinds
│   └── persisted-layout.ts       # v2 envelope; createPersistedTilingWorkspaceSet; tree adapter as projection
├── react/
│   ├── tiling-renderer.tsx       # `workspaces` prop; single-tree projected to a set of one
│   ├── tiling-drag-scope.tsx     # NEW: TilingDragScope + useWorkspaceDropTarget (registry, DOM hit-test)
│   └── tiling-workspace-tabs.tsx # NEW: headless TilingWorkspaceTabs
├── index.ts                      # + set types/ops, TilingDragScope, useWorkspaceDropTarget, TilingWorkspaceTabs, createPersistedTilingWorkspaceSet
├── engine.ts                     # + set types/ops (server-safe alias), extractLeafNode, insertLeafInto
└── __tests__/
    ├── workspace-set.test.ts, workspace-drop-target.test.tsx, workspace-tabs.test.tsx   # NEW
    └── drag-machine.test.ts, persisted-layout.test.ts, commands.test.ts, state.test.ts  # extended
```

Data flow in set mode:

```text
[host chrome: TilingWorkspaceTabs / own strip]      [TilingRenderer viewport]
        │ onSwitch / onReorder                              │ pointer / keyboard
        ▼                                                   ▼
switchWorkspace / reorderWorkspaces              in-tree drop → setWorkspaceLayout(set, activeId, tree)
        │                                        external drop → moveLeafToWorkspace(set, leafId, ws, placement)
        └──────────────► onWorkspacesChange(next) ◄──────────┘   (+ onMoveLeaf / onActiveWorkspaceChange)
                                   │
                         host state (persist / diff / restore)
                                   │
                          <TilingRenderer workspaces={next}>
```
