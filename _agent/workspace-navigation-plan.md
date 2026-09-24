# Workspace navigation — implementation plan (hypr-tiling engine-native switching, swipe, spring-load; DashAI cut-over)

Companion to `_agent/workspace-set-concept.md` (the 26.9.3 workspace-set
design and its §8.5 landed-status ledger). That document made workspaces a
*value* the engine owns. This plan makes workspace *navigation* an engine
subsystem — switching, trackpad/touch swipe, slide transition, spring-loaded
tab drop — and closes the genericity gaps that still make the one set host
(DashAI, `starpay-app/packages/dashai`) walk layout trees itself.

Baseline: `origin/main` at `2508f02` (published `26.9.3`). Every work item
below branches from that commit in its own worktree
(`/opt/projects/n-uf/hypr-tiling--<worker>` on `worker/<worker>`), lands as
one commit series, and is fast-forwarded onto `main` by the coordinator.

Subagent routing follows the operator's `model-routing` skill: Tier 1 =
`composer-2.5-fast`, Tier 2 = `cursor-grok-4.6-high-fast`, Tier 3 =
`claude-fable-5-1-thinking-high` (Tier 3 launches only after operator
approval through the structured question prompt).

---

## 1. Ownership rule that makes the design generic

**A host never touches a `TilingLayoutNode`.** It hands the renderer a
`TilingWorkspaceSet` plus the whole tile pool, receives the next set through
`onWorkspacesChange`, and maps ids. If a host must write `switch (node.kind)`,
the engine is missing an op. Every gesture below therefore ends as a
`TilingCommand`; nothing new writes the set.

Where DashAI still violates the rule on 26.9.3 (each maps to a work item):

- `core/schema/workspace-set.ts` `showItem` / `moveItem` re-implement the seat
  because `TilingWorkspacePlacement` cannot say "reading-order end" → **H5**.
- `leafIdOfItemIn` / `unseatEverywhere` walk trees because set ops are
  leaf-keyed and hosts think in tile ids → **H5**.
- `react/renderer/dashboard-renderer.tsx` keeps `localTrees` / `pendingRef` /
  `lastPersistedRef` and a debounce timer, and pre-slices `tiles` to the active
  tree because coverage healing is per tree → **H6**, **H7**.
- `react/renderer/board-locator.tsx` walks groups to reveal a tile across
  workspaces → **H5** `revealTile` + **H8** `reveal-tile` command.

---

## 2. Work items

### H5 — engine set ops: `region` placement, tile-keyed movers, `revealTile` (Tier 2)

Files: `packages/hypr-tiling/engine/workspace-set.ts`,
`engine/state.ts` (`insertLeafInto`), `index.ts`, `engine.ts`,
`__tests__/workspace-set.test.ts`, `etc/*.api.md` via `pnpm api:update`,
`CHANGELOG.md` Unreleased.

- `TilingWorkspacePlacement` gains `{ kind: "region"; region: "start" | "end" }`:
  reading-order first / last leaf of the destination tree, seated `left` /
  `right` of it on the parent split's axis (`insertLeafAdjacent` semantics); a
  `null` destination becomes the bare leaf. `insertLeafInto` handles it.
- Tile-keyed mirrors of the leaf-keyed ops, resolving the leaf through
  `queryWorkspaceSet(set).workspacesOfTile` (set invariant: one leaf id ↔ one
  tile id): `moveTileToWorkspace(set, tileId, to, placement?)`,
  `showTileInWorkspace(set, tileId, to, placement?)`,
  `hideTileFromWorkspace(set, tileId, from): { set; orphaned: boolean }`,
  `removeTile(set, tileId)`. A tile seated nowhere is seated by
  `moveTileToWorkspace` only when the caller passes `leaf: { id }` (mint) —
  otherwise unchanged (the engine does not invent leaf ids).
- `revealTile(set, tileId, prefer?: TilingWorkspaceId)` →
  `{ set; workspaceId; leafId; changed: "none" | "tab" | "workspace" | "both" } | null`:
  picks the preferred workspace when it shows the tile, else the first in tab
  order; switches `activeId`; makes the tile the active member of its group.
- Pure, total, same-reference on no-op — the contract of every existing op.
  Property tests: random sets → op → `workspaceSetIssues` empty; every new op
  row in the §3.1 style of the concept doc.

### H8 — commands, capability gate, keymap fragment (Tier 2)

Files: `engine/types.ts` (`TilingCommand`, `TilingInteractionCapabilities`),
`engine/commands.ts` (`TilingCommandGates`), `engine/interaction-capabilities.ts`,
`engine/pane-switching.ts` (keymap), `react/tiling-renderer.tsx` set-mode
wrapper (`TilingWorkspaceSetRenderer`, ~line 9484) dispatch, `__tests__/commands.test.ts`,
`__tests__/workspace-set-renderer.test.ts`, API reports, CHANGELOG.

- `TilingCommand` += `switch-workspace { workspaceId }`,
  `cycle-workspace { direction }`,
  `move-leaf-to-workspace { leafId?; workspaceId; placement?; follow? }`
  (`leafId` omitted → focused leaf; `follow` = Hyprland `movetoworkspace` vs
  `movetoworkspacesilent`), `reveal-tile { tileId }` (dispatches H5
  `revealTile`; if H5 has not merged yet, implement the reveal locally in the
  wrapper with `switchWorkspace` + group activation and swap to `revealTile`
  at merge).
- `TilingCommandGates.workspacesEnabled`; `interaction.workspaces?: boolean |
  { enable?: boolean; followMovedLeaf?: boolean }` (default enabled; the gate
  is `false` in single-layout mode, so dispatch is a no-op there).
- Exported `WORKSPACE_KEY_BINDINGS` fragment (not in `TILING_KEYMAP_DEFAULTS`
  — no default chords; hosts merge it in).
- `onWorkspaceSwitch?: (event: { from; to; via: "tab" | "key" | "command" | "swipe" | "spring-load" | "reveal" }) => void`
  on `TilingRendererWorkspaceSetProps`, fired beside `onWorkspacesChange`.

### N1 — swipe navigation FSM, input ports, `useWorkspaceSwipe` (Tier 3)

Files: NEW `engine/workspace-navigation.ts`, `engine/input-driver.ts`
(wheel / touch subscription), NEW `react/dom-scroll-chain-port.ts`, NEW
`react/use-workspace-swipe.ts`, wrapper wiring in `react/tiling-renderer.tsx`,
NEW `__tests__/workspace-navigation.test.ts`, `__tests__/workspace-swipe.test.tsx`.

- Pure FSM: `idle → armed → tracking → settling → lockout → idle`. Events
  `WHEEL { dx, dy, ctrlKey, ts }`, `TOUCH_START / MOVE / END { x, y, ts }`,
  `DRAG_ACTIVE { active }`, `IDLE_TICK`, `CANCEL`. Output `{ progress: -1..1,
  target: prev | next | null, command?: TilingCommand }`. Config
  `{ thresholdPx: 24, commitFraction: 0.35, commitVelocityPxMs: 0.6,
  wheelIdleMs: 120, lockoutMs: 350, wrap: false }`.
- Arming rules (the substance): no drag in flight; `|dx| > 2·|dy|`;
  `ctrlKey` false (pinch-zoom); the scroll chain from the event target to the
  viewport has no element that can still scroll on X in that direction
  (`ScrollChainPort.canScrollFurther(el, "x", dir)`, DOM implementation in
  `react/`); wheel sessions close on `wheelIdleMs`; `lockout` swallows
  trackpad momentum after a commit.
- Viewport CSS when enabled: `overscroll-behavior-x: contain`;
  `touch-action: pan-y` when touch swipe is on.
- `interaction.workspaces.switch?: { wheelSwipe?: boolean | SwipeConfig;
  touchSwipe?: boolean }`. `useWorkspaceSwipe()` exposes `{ progress, target,
  phase }` so a host tab strip can move its indicator in step.

### N2 — transition stage: slide / fade with frozen outgoing clone (Tier 2)

Files: NEW `react/workspace-transition.tsx`, wrapper wiring, theme tokens in
`react/theme.tsx`, `__tests__/workspace-transition.test.tsx`.

- On switch, clone the outgoing viewport DOM (`cloneNode(true)`,
  `pointer-events: none`, `aria-hidden`) into an absolutely positioned layer;
  animate clone and live tree with `transform: translateX()` driven by swipe
  `progress` or a 200 ms curve; unmount the clone on settle. The pane pool and
  `inactiveWorkspaces` are untouched, so no extra host data hooks run.
- `<canvas>` does not clone its bitmap: copy each canvas via `drawImage` into
  the clone, falling back to `"fade"` when a canvas is tainted or oversized.
- `prefers-reduced-motion` → `"none"`. `interaction.workspaces.switch.transition?:
  "none" | "slide" | "fade"` (default `"none"`).

### H6 — pool-aware set-mode renderer, orphan policy, `inactiveWorkspaces` (Tier 3)

Files: `react/tiling-renderer.tsx` (set-mode wrapper + coverage healing
path), `engine/types.ts` (`TilingRendererWorkspaceSetProps`,
`TilingRenderTileProps`), `__tests__/workspace-set-renderer.test.ts`,
`__tests__/stable-pane-identity.test.ts`.

- In set mode `tiles` is the **whole pool**; coverage is set-wide (a tile
  seated in any workspace is covered).
- `orphanTiles?: "seat-in-active" | "ignore" | "report"` (default `"report"`
  → new `onIntegrityIssues?(issues)`); DashAI passes `"seat-in-active"`.
- `inactiveWorkspaces?: "unmount" | "keep-mounted"` (default `"unmount"`).
- `TilingRenderTileProps.workspaceId` and `seatCount`.
- Prove: no remount of a shared leaf across a switch (existing), no healing of
  a tile seated only in an inactive workspace (new), integrity issues reported
  not silently fixed under `"report"`.

### H7 — `useTilingWorkspaceSetController` (Tier 2)

Files: NEW `react/use-tiling-workspace-set-controller.ts`, `index.ts`,
`__tests__/workspace-set-controller.test.tsx`, README section.

```ts
const ctl = useTilingWorkspaceSetController({
  value: set, onCommit: (next, reason) => …,        // reason: "tree" | "lifecycle" | "move" | "reveal"
  treeDebounceMs: 400, readOnly,
  mintWorkspaceId, nextWorkspaceName,                // host policy; the engine never names
});
ctl.set / ctl.onWorkspacesChange / ctl.create() / ctl.rename(id, name) / ctl.remove(id) → removedTileIds
ctl.switch(id) / ctl.moveTile(tileId, to, placement?) / ctl.reveal(tileId) / ctl.flush()
```

Tree edits coalesce for `treeDebounceMs`; lifecycle ops commit at once;
`readOnly` keeps switches local and commits nothing; pending trees flush on
unmount. This replaces the `localTrees` / `pendingRef` / `lastPersistedRef`
block in DashAI's `dashboard-renderer.tsx`.

### N3 — spring-loaded tab drop: dwell → commit-and-rearm (Tier 3)

Files: NEW `engine/workspace-spring-load.ts`, `engine/drag-machine.ts`
(`REARM` event), wrapper wiring, `__tests__/drag-machine.test.ts`,
`__tests__/workspace-tab-drop.test.ts`, drag-recovery suite unchanged
(INV-R1..R4, `_agent/drag-recovery-cdp-throttle.md` checkpoint).

- Dwell timer over `TilingWorkspaceTabDragHover`; at `dwellMs` the drag
  settles as the existing `claimed` external commit (`moveLeafToWorkspace`),
  the set switches, and `REARM { leafId }` starts a fresh drag on the leaf's
  new seat under the still-held pointer. The tree never changes under a live
  drag (the reason concept-doc §9 Q7 deferred spring-loading).
- `interaction.workspaces.springLoad?: { dwellMs: number } | false` (default
  `false`).

### R1 / R2 — releases (Tier 1)

`pnpm --filter @n-uf/hypr-tiling test && typecheck && build && api:check &&
check:guardrails`; CHANGELOG release note with one bold **BREAKING** bullet per
break (only the `TilingCommand` union widening — exhaustive `switch` with a
`never` guard fails typecheck); README + docs-site pages; `pnpm release`
(calendar `YY.M.R`). R1 after H5 + H8 + H7 + N1 (+ H6 if merged); R2 after N2
+ N3 + H6.

### S4 / S5 — DashAI cut-over (Tier 2, `starpay-app`, after R1 / R2 publish)

- S4: bump `@n-uf/hypr-tiling`; `dashboard-renderer.tsx` onto
  `useTilingWorkspaceSetController` + pool `tiles`; delete `showItem` /
  `hideItem` / `moveItem` / `unseatEverywhere` / `leafIdOfItemIn` /
  `tabDropPlacement`; `core/schema/workspace-set.ts` shrinks to
  `toWorkspaceSet` / `applyWorkspaceSet`, one `WidgetPlacement →
  TilingWorkspacePlacement` mapper, and item reconciliation on
  `removedTileIds` / `orphaned`. Rewrite `dashboard-renderer.test.tsx`,
  `drag-to-workspace.test.tsx`, `board-locator.test.tsx`,
  `core/__tests__/workspace-set.test.ts`.
- S5: enable `interaction.workspaces` (wheel swipe, `"slide"`, spring-load),
  tab indicator follows `useWorkspaceSwipe().progress`, terminal `Alt+<n>` →
  `switch-workspace` command, `useBoardLocatorReveal` → `reveal-tile`.
- Regression: read-only impersonation boards, report mode
  (`useExportExpectation`), harness `arrange_board` goldens.
- Debt ledger: open `DASHAI-WORKSPACE-NAVIGATION` in
  `starpay-app/_agent/programme-debt.md` at S4 start.

---

## 3. Dependencies, waves, concurrency

```
H5 ──┬──► H7 ──────────────► R1 ──► S4
H8 ──┘         N1 ──────────►│
                H6 ──► N2 ──► R2 ──► S5
                       N3 ──►│
```

Two workers at a time (the operator's Jest memory rule: at most two parallel
Jest loops on the machine; hypr-tiling's suite is Jest 30). Items touching
`react/tiling-renderer.tsx` (H8 wrapper dispatch, N1, H6, N2, N3) are
serialised against each other; engine-only items pair with them.

- **Wave 1 (Tier 2, no approval):** H5 `worker/h5-engine-ops` ∥ H8
  `worker/h8-commands`. Both append to the `index.ts` / `engine.ts` export
  lists — expected one-line conflict, coordinator resolves at FF time.
- **Wave 2 (Tier 3 approval required for N1):** N1 ∥ H7.
- **Wave 3 (Tier 3 approval required for H6):** H6 ∥ N2.
- **Wave 4 (Tier 3 approval required for N3):** N3 ∥ R1 release prep.
- **Wave 5:** S4 → S5 in `starpay-app` via `bin/spawn-worker`.

## 4. Effort (engineer-days, one senior engineer, agents on mechanical parts)

H5 2–3 · H8 2 · N1 4–5 · N2 2–3 · H6 3–4 · H7 2 · N3 3–4 · R1+R2 3 →
hypr-tiling **21–26**. S4 3–4 · S5 1 · regression 1 → DashAI **5–6**. Total
**26–32 days**; ~3–4 calendar weeks with two tracks.

## 5. Worker contract

- Branch `worker/<name>` from `origin/main` (`2508f02`) in
  `/opt/projects/n-uf/hypr-tiling--<name>`; `pnpm install` once in the
  worktree.
- Stage explicit paths only; never `git add -A`.
- Gate before declaring done: `pnpm --filter @n-uf/hypr-tiling test`,
  `typecheck`, `build`, `api:update` then `api:check`, `check:guardrails`.
- Engine files (`engine/**`) stay React-free (guardrail 1).
- CHANGELOG `## Unreleased` bullet per public symbol; JSDoc on every export
  (api-extractor `ae-missing-release-tag` / docs generator read them).
- Final report to the coordinator: commit hashes with subjects, files
  touched, new public symbols, test counts, anything left for the next wave.

## Status — 2026-09-24

Library navigation shipped on `main` as calendar releases. H5–H8, H6, H7,
N1–N3, and R1 landed in **26.9.4**; 26.9.5 / 26.9.6 are follow-ups on the
same surface. S4 / S5 (DashAI cut-over in `starpay-app`) remain consumer
work after publish.

| Release | What landed |
| --- | --- |
| **26.9.4** | H5 tile-keyed ops + `revealTile`; H8 commands / `WORKSPACE_KEY_BINDINGS` / `onWorkspaceSwitch`; H7 `useTilingWorkspaceSetController`; H6 pool renderer / `orphanTiles` / `inactiveWorkspaces`; N1 swipe; N2 slide/fade transition; N3 spring-load + drag `REARM` |
| **26.9.5** | `TilingWorkspaceSwipeConfig.modifier`; `WheelInputSample` modifier flags (breaking for custom ports); sequence-start gating; whole-window horizontal lock |
| **26.9.6** | Drag-source parked in the stable pool through dragging/settling; tab drop honours `followMovedLeaf` in one `onWorkspacesChange`; `TilingWorkspaceSwitchVia` gains `"tab-drop"` |

Historical integration ledger (2026-09-23, `integration/workspace-nav` @
`4c59025`, before the 26.9.4 publish):

| Item | Landed on `integration/workspace-nav` | Worker / tip commit |
| --- | --- | --- |
| **H5** engine set ops | merge `7da46e8` | `5f2fdce` api reports + changelog for H5 |
| **H8** commands + keymap | merge `26307ff` | `dc0e836` api reports + changelog for H8 |
| **H7** set controller | merge `b74b6da` | `b5f796c` api reports + readme + changelog for H7 |
| **H6** pool renderer | merge `7671156` | `4fbb938` api reports + readme + changelog for H6 |
| **N1** swipe FSM | merge `017fec3` | `7a36ab3` api reports + readme + changelog for N1 |
| **N2** switch transition | first-parent `67343b0`, `71f9a9e`, … | `67343b0` on `worker/n2-transition` |
| **N3** spring-load engine | `275fedf`, `3e6ef9f`, `70c4cbc` | `275fedf` api reports + changelog for N3 engine half |
| **N3** spring-load wiring | `fd9488c`, `1a46134`, `0fccefd`, `4c59025` | `4c59025` docs + api reports (N3 wiring) |
| **R1** release `26.9.4` | published on `main` | changelog + readme + docs site + `package.json` bump |
