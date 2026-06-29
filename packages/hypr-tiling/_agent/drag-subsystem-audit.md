# Drag interaction + presentation subsystem — audit

Scope: the live-drag rearrange pipeline of `@hypr-tiling` — the drag FSM
(`drag-machine.ts`), geometry seams (`survivor-reflow.ts`, `ghost-transit.ts`,
`leaf-geometry.ts`, `drop-intent-resolver.ts`), the presentation resolver
(`drag-presentation.ts`), and the renderer orchestration that consumes them
(`dynamic-tiling-renderer.tsx`).

The audit was performed by reading the FSM / geometry modules in full and the
~7200-line renderer in targeted ranges around the drag / presentation / FLIP
code paths (never the whole file at once).

---

## 0. CONTENT-AGNOSTIC DRAG CORRECTION (canonical model)

> This section SUPERSEDES every content-conditioned drag rule that earlier
> revisions of this doc taught (the "empty-mode" special-casing). It is the only
> rule. Sections below have been brought into line with it; where an older
> passage still describes content-branching drag, this section wins.

The top-bar `CONTENT` checkbox (`isPaneContentVisible`) is a **simple,
drag-INDEPENDENT toggle of whether a pane renders content INSIDE its body**:

- `CONTENT` ON  → pane body renders its content.
- `CONTENT` OFF → pane body renders **empty** (no content, no placeholder text),
  but the pane **frame + header/title chrome stay shown**. Only the BODY is
  emptied.

This ONE rule is applied **uniformly to every representation of a pane**:
in-tree panes at rest, the drag **source** slot, the **hop-in / ghost-seat**
slot, AND the portaled drag **ghost**. It lives in exactly one pure function,
`resolvePaneBodyRenderMode(isGhostSeatReservation, isPaneContentVisible)`:

```
resolvePaneBodyRenderMode(isGhostSeatReservation, isPaneContentVisible)
   reservation  if isGhostSeatReservation         // drag mechanic, content-agnostic
   content      if isPaneContentVisible            // the uniform CONTENT rule
   empty        otherwise                          // frame+header kept, body empty
```

**Drag presentation is content-agnostic.** `resolveDragPresentation` has **no
`isPaneContentVisible` input** — its output (the ghost-seat reservation flag, the
pickup-origin / ghost-seat role flags, the drop chrome zone) is identical whether
content is shown or hidden. The ghost, the source slot, and the ghost-seat
(hop-in) slot behave **identically regardless of `CONTENT` state**; the only
delta is whether the pane body happens to paint content — the same delta a
resting pane already has, produced solely by `resolvePaneBodyRenderMode`.

The **ghost body** honors `isPaneContentVisible` exactly like an in-tree pane
body: `renderDragPaneShell` paints the captured snapshot content iff content is
visible, else an empty-bodied ghost frame. There is NO drag-specific content
branch anywhere.

**Reservation mechanic kept (orthogonal to content).** The single portaled ghost
+ the content-less ghost-seat reservation it hops into is a **drag mechanic** —
the "exactly one painted instance of the dragged pane" invariant. It is
preserved unchanged; the reservation is content-less by drag mechanic (so the
ghost is the only instance), and whatever content that single instance shows is
governed solely by the uniform `CONTENT` rule.

### Content-OFF body decision (flagged for the operator)

When `CONTENT` is OFF the pane body renders **empty** — no content and no
"CONTENT HIDDEN" / "Pane N" placeholder text — preserving the pane frame +
header/title chrome. The header (title) is left as-is; only the BODY is emptied.
If a labeled placeholder is wanted instead, that is a one-line change in
`DefaultDynamicTile`'s body branch (and the matching ghost branch).

### What was ROLLED BACK from the older content-conditioned model

- "pickup-origin never shows content in empty mode" — removed.
- "ghost is the sole content carrier in empty mode" — removed (ghost now follows
  the uniform rule; in empty mode the ghost is an empty-bodied frame).
- empty-mode hop-in content reveal — removed.
- `isPreviewDragSourceReveal` (preview-mode empty content reveal) — removed;
  preview-mode panes honor `CONTENT` uniformly like any pane.
- the **I2 invariant** ("pickup-origin never paints content in empty live mode")
  and all tests asserting content-checkbox-conditioned drag/ghost/source/hop-in
  behavior — removed/replaced.
- `resolveDragPresentation` no longer takes `isPaneContentVisible`.
- the dead `suppressSourceContentInEmptyMode` hit-log telemetry field — removed.

---

## 0.1 `slotHopInEnabled` toggle + the `cc23956` seat-measurement regression

The dragged pane has TWO drag-presentation behaviors, selected by the typed
library capability `TilingInteractionCapabilities.slotHopInEnabled` (resolved in
`interaction-capabilities.ts`, **default `true`**). The capability is surfaced as
the **"slot hop-in"** checkbox in the control panel
(`tiling-observability-panel.tsx`, gated to `dragMode: "live"` + `rearrange`).

- **`slotHopInEnabled === true` (default, ORIGINAL single-instance hop-in):** the
  single content-honoring ghost (`DragPaneOverlay`) HOPS INTO and FILLS the
  resolved slot — the seat-rect `useLayoutEffect` measures the ghost-seat leaf's
  reservation rect (`seatFootprint`), so the ghost seats as the single instance
  and no separate empty reservation lingers beside a free-following ghost.
- **`slotHopInEnabled === false` (AFFECTED-TODAY duality):** the seat measurement
  is deliberately skipped (`setSeatFootprint(null)`), so the ghost free-follows
  the cursor and the in-tree content-less `DragSourceSlotReservation` slot stays
  shown — the reservation-plus-ghost duality.

The **render model is identical in both modes** and identical to the correct
≈2026-06-26 state (`fb27ebe`): the ghost-seat slot is always painted as a
content-less reservation (`isGhostSeatReservation` → `render-reservation`) and the
single portaled ghost is the only content carrier. The ONLY divergence is whether
the seat is MEASURED (hop) or not (free-follow). The uniform, content-agnostic
body rule (`resolvePaneBodyRenderMode`, `410b6e2`) is unchanged in both modes.

### The `cc23956` regression that `slotHopInEnabled === true` also FIXES

Commit `cc23956 (drag: wire presentation policy, scoped seat measure, edge chrome
guard)` scoped the seat-rect selector to
`[data-leaf-id="${ghostSeatLeafId}"] [data-drag-source-reservation]`
(now centralized as `dragSourceReservationSelector` in `drag-presentation.ts`).
This descendant selector can **never match**: a reserved slot renders
`DragSourceSlotReservation` (carries `data-drag-source-reservation`, **no
`data-leaf-id`**) INSTEAD of `DefaultDynamicTile` (the sole emitter of
`data-leaf-id={leafId}`, on its own article — not an ancestor of the reservation).
So `reservationElement == null` → `setSeatFootprint(null)` → the ghost never
hopped and the empty reservation lingered beside the free-following ghost — the
operator's symptom, present on `main` for EVERY drag regardless of any toggle.

**Fix (option (a), per-leaf scoping preserved):** the reserved-leaf wrapper `<div>`
now emits `data-leaf-id={node.id}` (only on the reserved leaf, so non-reserved
leaves keep their single article-level `data-leaf-id` — no duplicate-id
collection in `survivor-reflow`'s `querySelectorAll("[data-leaf-id]")`). The
scoped `dragSourceReservationSelector` now resolves, the ghost hops into the seat,
single-instance, no lingering reservation. Guarded by
`__tests__/seat-reservation-selector.test.ts` (the scoped selector matches the
reserved slot iff the wrapper carries `data-leaf-id`).

---

## 1. Subfolders / module structure

```
packages/hypr-tiling/
├── drag-machine.ts            FSM (idle/armed/dragging/settling), candidate-tree
│                              derivation, ghost-seat resolution, commit/seat
│                              selectors, touch disambiguation, frame coalescer.
│                              PURE — no DOM, no React. Heavily unit-tested.
├── drag-presentation.ts       resolveDragPresentation() — the presentation SSOT;
│                              resolvePaneBodyRenderMode() — a legacy adapter.
├── survivor-reflow.ts         PURE FLIP geometry for the displaced (survivor)
│                              panes: invert transform, animate gate, First
│                              retarget, fast-flick settle-commit snap gate.
├── ghost-transit.ts           PURE ghost morph geometry + easing: pickup box,
│                              FLIP invert, hop First retarget, magnetic ease,
│                              swap-bounce ease, coherent-transit dip.
├── drag-easing.ts             animation-speed → duration knob math.
├── drag-cursor.ts             custom-cursor arrow/validity presentation.
├── drop-intent-resolver.ts    pointer → DynamicDropIntentState (zone/action/edge)
│                              + hysteresis. The resolver the FSM stores verbatim.
├── leaf-geometry.ts           footprint collection (client rects per leaf).
├── projected-layout.ts        PLACEMENT_BY_DROP_ZONE + preview-mode projection.
├── state.ts                   pure tree reducers (swap/insert/remove/group).
├── dynamic-tiling-renderer.tsx  the orchestrator (DOM + React glue).
└── __tests__/                 drag-machine, drag-presentation, survivor-reflow,
                               fast-flick, ghost-content-snapshot, live-render-
                               invariant, live-drag-cleanup, ... (pure-layer first).
```

The renderer's drag-relevant regions (line anchors at `cc23956`):

| Region | Lines | Responsibility |
|---|---|---|
| `DragSourceSlotReservation` | 905–934 | content-less seat the ghost hops into |
| `DragPaneOverlay` (the ghost) | 1000–1260 | single painted instance + hop FLIP |
| `CancelFlyBack` overlay | 1500–1560 | revert glide on cancel |
| FSM selectors / refs | 3445–3460, 3409–3442 | read the single FSM state |
| candidate / display layout | 3732–3812 | `deriveCandidateTree`, settling hold |
| seat-rect measure effect | 3865–3924 | measure reservation → `seatFootprint` |
| survivor-reflow FLIP effect | 3934–4165 | survivors glide on candidate change |
| stable hit footprints | 4174–4193 | frozen geometry for target resolution |
| input layer (coalescer/release) | 5567–6059 | pointer→FSM, fast-flick release |
| settle teardown effect | 6068–6126 | commit XOR cancel, then `SETTLE_DONE` |
| per-leaf render branch | 6287–6589 | `resolveDragPresentation` per leaf |

---

## 2. Components diagram

### 2.1 Data flow (live drag, one pointer-move frame)

```
pointermove (window, captured)
   │
   ▼
processPointerSample(client)                 [renderer input layer]
   │  resolvePointerTarget → DynamicDropState  (against STABLE hit footprints)
   │  shouldReresolveSeatedTarget   (move samples only — slot-commitment policy)
   │  committableSeatRef ← deriveCommittableSeat(nextTarget)  (SSOT, every sample)
   │  RELEASE sample: SKIP re-resolution, dispatch committableSeatRef verbatim
   ▼
dispatchDrag(POINTER_MOVE / TARGET_RESOLVED) [coalesced ≤1 / animation frame]
   │
   ▼
dragMachineReducer  ──►  DragMachineState { phase:"dragging", resolvedTarget }
   │
   ├─► deriveCandidateTree(layout, source, target) ─► displayLayout (React render)
   │        │                                              │
   │        │                                              ▼
   │        │                                   survivor-reflow FLIP effect
   │        │                                   (survivors glide First→Last)
   │        ▼
   ├─► resolveDragGhostSeatLeafId(source, target) ─► ghostSeatLeafId
   │        │
   │        ▼
   │   seat-rect measure effect: querySelector([data-drag-source-reservation])
   │        getBoundingClientRect ─► seatFootprint
   │        │
   │        ▼
   ├─► dragVisualState { activeFootprint, seatFootprint, snapshot }
   │        │
   │        ▼
   │   DragPaneOverlay (the single ghost) — free-follow OR hop into seatFootprint
   │
   └─► resolveDragPresentation(per leaf) ─► isGhostSeatReservation (drag mechanic)
            │
            ▼
       resolvePaneBodyRenderMode(isGhostSeatReservation, isPaneContentVisible)
            render-reservation | render-content | render-empty   (uniform rule)
```

### 2.2 Presentation derivation (single leaf) — content-agnostic

```
resolveDragPresentation(input)            [drag-presentation.ts]  ← NO content input
   ├─ isDragPresentationActive(phase, settlingOutcome)   ← timing extension
   ├─ isPickupOriginLeaf       = leafId === pickupOriginLeafId
   ├─ isGhostSeatLeaf          = leafId === ghostSeatLeafId
   ├─ isGhostSeatReservation   = live && active && isGhostSeatLeaf   ← drag mechanic
   └─ dropChromeZone           = resolveDropChromeZone(input)

resolvePaneBodyRenderMode(isGhostSeatReservation, isPaneContentVisible)  ← the ONE
   reservation  if isGhostSeatReservation                content rule, applied at
   content      if isPaneContentVisible                  every surface (in-tree
   empty        otherwise                                pane, source slot, hop-in
                                                          slot, AND the ghost)
```

The renderer composes the two: the per-leaf branch calls
`resolvePaneBodyRenderMode(leafPresentation.isGhostSeatReservation,
isPaneContentVisible)`; the ghost shell calls
`resolvePaneBodyRenderMode(false, isPaneContentVisible)` (the ghost is never a
seat). Same rule, every surface.

---

## 3. Drag FSM map (`drag-machine.ts`)

### 3.1 States

| State | Carried data | Meaning |
|---|---|---|
| `idle` | — | no drag in flight |
| `armed` | pointerId, pointerType, touchDrag, sourceLeafId, anchorFootprint, pointerAnchorOffset, originClient | pointer down, pickup threshold not yet crossed |
| `dragging` | armed data − originClient + ghostFootprint, resolvedTarget | threshold crossed, pointer captured, ghost follows |
| `settling` | outcome, sourceLeafId, resolvedTarget, fromFootprint, toFootprint | terminal event fired; commit XOR cancel pending |

### 3.2 Events

`POINTER_DOWN`, `POINTER_MOVE`, `LONG_PRESS`, `TARGET_RESOLVED`, `POINTER_UP`,
`POINTER_CANCEL`, `ESCAPE`, `BLUR`, `VISIBILITY_HIDDEN`, `SETTLE_DONE`.

### 3.3 Transition table

| From \ Event | POINTER_DOWN | POINTER_MOVE | LONG_PRESS | TARGET_RESOLVED | POINTER_UP | CANCEL/ESC/BLUR/HIDDEN | SETTLE_DONE |
|---|---|---|---|---|---|---|---|
| idle | →armed | — | — | — | — | — | — |
| armed | →armed (re-arm) | →dragging (threshold) / →idle (scroll-escape) / hold | →dragging (touch) | — | →idle | →idle | — |
| dragging | — | →dragging (ghost move) | — | →dragging (target) | →settling(commit\|cancel) | →settling(cancel) | — |
| settling | →armed (preempt) | — | — | — | — | — | →idle |

### 3.4 Selectors

`activeDragSourceLeafId`, `activeResolvedTarget` (dragging only);
`presentationDragSourceLeafId`, `presentationResolvedTarget` (dragging **+
settling-commit**); `deriveCandidateTree`, `resolveDragGhostSeatLeafId`,
`isCommittableTarget`, `resolveCommitEdgeZone`, `shouldReserveDragSourceSlot`,
`shouldReresolveSeatedTarget`, `deriveCommittableSeat`,
`previousZoneSeed`.

### 3.5 Verdict on the FSM: minimal + complete, KEEP AS-IS

- **State set is minimal.** Four phases, each with ≥1 enumerated edge back to
  `idle`; no "stuck/parked" state is reachable (every interruption is an
  enumerated cancel edge → `settling(cancel)` → `idle`).
- **No impossible/duplicate states.** The discriminated union forbids
  ill-formed combinations at compile time (e.g. a `resolvedTarget` cannot exist
  in `armed`).
- **No duplicate resolution path.** `DragResolvedTarget = DynamicDropIntentState`
  — the FSM stores the resolver output verbatim, and commit + candidate derive
  from the SAME object the preview reads.
- The two presentation selectors (`presentation*`) that extend through
  `settling-commit` are the FSM's one concession to a presentation timing
  problem (see §7) — defensible, but they are the seam where the presentation
  concern leaked into the core selectors.

The candidate-tree core (`deriveCandidateTree`, `resolveDragGhostSeatLeafId`)
is correct and is the linchpin of the single-instance invariant: the preview
tree is byte-identical to the commit because both run the same pure reducers.

---

## 4. Geometry seams

| Seam | Owner | Mechanism | Health |
|---|---|---|---|
| Hit footprints | `resolveStableDragHitFootprints` (renderer) + `leaf-geometry.ts` | live mode resolves against the **gap-closed** tree, frozen per source (no `dropState` dep) → reflow cannot move a hit zone | Solid. Encoded in `live-render-invariant.test.ts` (geometry byte-identical regardless of resolved target). |
| Candidate tree | `deriveCandidateTree` | always from ORIGINAL `layout` → no drift accumulation; same reducers as commit | Solid. |
| Seat measurement | seat-rect layout effect (renderer 3865–3924) | `querySelector([data-drag-source-reservation])` → `getBoundingClientRect` → `seatFootprint`; off-viewport/degenerate clears it | Works, but DOM-query-by-selector coupling (see §6.4). |
| Ghost hop FLIP | `DragPaneOverlay` + `ghost-transit.ts` | fixed-position node, FLIP invert→identity, First retarget for interrupt | Solid, well-factored (pure math in `ghost-transit.ts`). |
| Survivor reflow FLIP | survivor-reflow effect + `survivor-reflow.ts` | per-leaf FLIP on candidate change; interruptible First; off-viewport clamp; coherent dip | Solid, well-factored. |
| Ghost portal | `OverlayPortal` → `document.body` | fixed coords immune to ancestor containing-block (transform/filter/contain) | Solid — eliminates ghost↔seat drift by construction. |

All five geometry seams are principled and individually well-tested. The drift
risk that historically plagued the ghost (ancestor `backdrop-filter` creating a
containing block) is closed structurally by the body portal.

---

## 5. The presentation matrix (content-agnostic)

The matrix has TWO independent axes that were previously (wrongly) entangled:

1. **Drag-mechanic axis** — `resolveDragPresentation`, decided WITHOUT content.
   Gives `isGhostSeatReservation` (+ role flags + chrome zone) per surface.
2. **Content axis** — `resolvePaneBodyRenderMode`, the uniform `CONTENT` rule.
   Maps `(isGhostSeatReservation, isPaneContentVisible)` → body render mode.

Inputs: `live` = `liveDragModeEnabled`. Phase is `dragging` unless noted.
Surfaces: **origin** = pickup-origin leaf; **seat** = ghost-seat leaf
(swap→target, edge-insert→source); **other** = uninvolved leaf.

### 5.1 Drag-mechanic axis (live mode, `live = true`) — content NOT an input

| Scenario | origin `isGhostSeatReservation` | seat `isGhostSeatReservation` | other | Ghost | In tree? |
|---|---|---|---|---|---|
| swap | false (gap-closed; carries displaced target content) | **true** | false | yes | origin gap-closed; seat=target reserved |
| edge-insert | **true** (origin IS the seat) | **true** (= origin) | false | yes | seat=origin (source rides in) |
| no target / gap | (gap-closed: origin absent) | — | false | yes (free-follow) | origin removed from tree |
| group-merge | false | **true** | false | yes | seat=target (member) |
| settling-commit | held via `settlingCommitCandidate` | **true** (active extends) | false | **none** | committed tree held one frame |
| settling-cancel | false (layout restored) | — | false | fly-back overlay | original layout |

For swap, the **origin** leaf in the candidate tree carries the *displaced*
target content and is NOT a reservation — only the **seat** (target) is. For
edge-insert/group-merge the **origin** IS the seat. `resolveDragGhostSeatLeafId`
disambiguates which leaf is the seat. **None of this references content.**

Preview mode (`live = false`): no ghost, so `isGhostSeatReservation` is `false`
for every surface — there are no reservations at all.

### 5.2 Content axis — the uniform `resolvePaneBodyRenderMode` rule

Applied identically to EVERY surface (in-tree pane, source slot, hop-in slot,
ghost), at both `live` modes:

| `isGhostSeatReservation` | `isPaneContentVisible` | body render mode |
|---|---|---|
| true | (either) | `render-reservation` (content-less seat) |
| false | true | `render-content` |
| false | false | `render-empty` (frame+header kept, body empty) |

The ghost passes `isGhostSeatReservation = false` (it is the single instance,
never a seat), so the ghost paints content iff `isPaneContentVisible` — exactly
like a resting pane. Content presence is the ONLY delta between `CONTENT` on and
off, and it is the same delta a resting pane has.

### 5.3 Remaining type-hygiene note

**Closed-union over-width.** `DynamicDropAction` includes
`split-container-insert`, which the drag resolver never produces and which
`deriveCandidateTree` / `resolveDragGhostSeatLeafId` / `isCommittableTarget`
silently treat as gap-close. Unreachable at the drag layer — a closed-union
hygiene gap, not a live bug.

---

## 6. Invariants

| # | Invariant | Enforced by | Tested |
|---|---|---|---|
| I1 | Live mode: exactly ONE painted instance of the dragged pane (the ghost); its in-tree ghost-seat slot is a content-less reservation | `isGhostSeatReservation` → `render-reservation` overrides any `renderTile`; ghost is the only painted instance. Content-agnostic. | yes (`drag-presentation.test.ts`: exactly one reservation across surfaces, for `CONTENT` on AND off; `live-render-invariant.test.ts`) |
| I1c | The CONTENT rule is uniform across all surfaces (in-tree, source slot, hop-in slot, ghost) and is the ONLY content delta | single pure `resolvePaneBodyRenderMode`; renderer + ghost shell both call it | yes (`drag-presentation.test.ts` (a)/(b)/(c)) |
| I3 | Ghost seated rect == target seat rect (no drift) | seat-rect effect measures the reservation rect; body portal removes ancestor-frame drift | NOT directly tested (DOM measurement) |
| I4 | Seated release on a committable target commits there (incl. pointer-over-gap, AND incl. a deliberate multi-frame dwell-then-release) | `committableSeatRef` SSOT (renderer) written each sample via `deriveCommittableSeat`; release path commits it verbatim, never re-resolves | yes (`drag-machine.test.ts` — "committable-seat SSOT + atomic seated-release commit" describe) |
| I5 | Fast flick with no painted dragging frame → instant commit, no origin→target glide | `shouldSnapSurvivorReflowOnSettleCommit` + same-task release resolve in input layer | yes (`fast-flick-survivor-reflow.test.ts`) |
| I6 | Candidate tree == committed tree (no release-time jump) | both run `deriveCandidateTree` with identical args | yes (`live-render-invariant.test.ts`) |
| I7 | When the ghost DOES paint a body (CONTENT on), it paints the live pane's rich `content` slot (not rows-only) | `buildDragPaneSnapshot` always captures `tile.content`; `renderDragPaneShell` paints it iff `isPaneContentVisible` (the uniform rule) | yes (`ghost-content-snapshot.test.ts`) |

Note: the snapshot ALWAYS captures the content slot regardless of the `CONTENT`
toggle (sourcing is content-agnostic); whether the ghost renders that content is
the uniform `CONTENT` rule applied to the ghost shell. When `CONTENT` is off the
ghost is an empty-bodied frame, matching every in-tree pane.

Gap: I3 (ghost seated rect == target seat rect) has NO direct test (it is a DOM
`getBoundingClientRect` measurement). I1 / I1c are now pinned at the resolver +
uniform-rule layer (`drag-presentation.test.ts`).

---

## 7. Timing / one-frame-desync analysis

1. **rAF coalescer** (`createFrameCoalescer`): collapses a burst of
   `pointermove` to ≤1 target-resolution + candidate recompute per frame.
   `cancel()` drops both the pending frame and the buffered payload, so a frame
   can never fire after settle. Correct.

2. **Fast-flick same-task release** (input layer 5980–6001): a release that
   batches `armed → settling(commit)` in one task (before the coalescer flushes)
   would otherwise be dropped by `coalescer.cancel()`, leaving the FSM `armed`
   and settling as a click. The renderer cancels the buffered frame and
   processes the release coords inline (`POINTER_MOVE → TARGET_RESOLVED →
   POINTER_UP`). This is the `0ba901e` fix and it is necessary + correct.

3. **Settling-commit reservation hold** (`isDragPresentationActive` extends
   through `settling+commit`; `settlingCommitCandidate` holds the committed tree
   one frame). On commit the FSM leaves `dragging` (so `dragSourceLeafId` →
   null) BEFORE `onLayoutChange` lands. Without the hold, `displayLayout` would
   revert to the original layout for one frame → survivors snap back then
   forward. The hold makes the committed tree == the last dragging frame. This
   is the `1c68c5f`/`cc23956` mechanism — **necessary**, but implemented by
   threading a presentation concern (`settling+commit`) through THREE places:
   the FSM selectors (`presentation*`), the resolver
   (`isDragPresentationActive`), and the renderer (`settlingCommitCandidate`,
   seat effect's `isPresentationDragging`). One concept, three call sites = the
   over-patch smell.

4. **Ghost disappearance on commit frame.** During `settling+commit`,
   `dragVisualState` is null (ghost gone) while the seat reservation is still
   painted content-less for one frame, covered by the fact that the committed
   layout lands same-frame and the reservation slot becomes a real pane (whose
   body then follows the uniform `CONTENT` rule). This works in practice but is
   the fragile seam: it depends on React applying `onLayoutChange` synchronously
   enough that no empty-reservation frame is visible. No test guards it.

5. **Seat measure is a layout effect** keyed on the resolve triple +
   `displayLayout` + viewport (NOT per cursor move). Runs after candidate DOM
   mutation, before paint. Correct ordering; the `getBoundingClientRect` read is
   post-reflow.

No *unfixed* one-frame desync was found. The three timing fixes
(`0ba901e`, `7ed9307`, `1c68c5f`/`cc23956`) are each individually correct; the
cost is that the "presentation is active through settling-commit" concept is
duplicated across the FSM, the resolver, and the renderer instead of being named
once.

---

## 8. Per-patch classification

| Commit | What it did | Class | Rationale |
|---|---|---|---|
| `8840952` coalescer release-resolve | resolve target on release before flush | **KEEP** | structural correctness for fast release |
| `0ba901e` fast-flick survivor snap | `shouldSnapSurvivorReflowOnSettleCommit` + same-task inline resolve | **KEEP** | encodes I5; well-tested pure gate |
| `72560e0` empty-mode hop-in reveal | `showInTreeHopIn`/`hopInLeafId` in-tree content reveal | **REMOVE** | reverted in product; left dead fields in the resolver struct + tests |
| `7ed9307` seated-target preserve on gap release | `shouldPreserveSeatedTargetOnRelease` | **SUPERSEDED** | encoded I4 only for the gap-release sub-case by re-resolving release coords and comparing freshTarget-vs-seatedTarget; it could not catch the **dwell-then-release** case (see §8.1) because by release time the move-sample policy had already clobbered `current.resolvedTarget`. Replaced by the `committableSeatRef` SSOT + `deriveCommittableSeat`. |
| `1c68c5f` presentation resolver | `resolveDragPresentation` + settling-commit selectors | **FOLD** | the SSOT idea is right; trim to consumed fields + absorb the chrome-zone decision |
| `cc23956` wire policy + scoped seat + edge chrome guard | wired resolver into render branch; scoped seat measure; edge chrome | **FOLD + FIX** | keep the wiring; the scoped seat selector `[data-leaf-id] [data-drag-source-reservation]` never matched (reserved slot emits no `data-leaf-id`) → ghost never hopped; fixed by emitting `data-leaf-id` on the reserved wrapper (see §0.1) |

### Patches that fought each other (now resolved)

- `72560e0` (hop-in reveal) and the broader "empty-mode" content special-casing
  fought the single-instance + content-toggle semantics: they conditioned
  drag/ghost/source/hop-in presentation on `isPaneContentVisible`. This entire
  class of branching was **rolled back** in the content-agnostic correction
  (§0). Drag presentation no longer reads content; the body-content decision is
  the uniform `resolvePaneBodyRenderMode` rule applied at every surface.
- `cc23956`'s edge-chrome guard was folded into `dropChromeZone` inside the
  resolver (the SSOT), so the chrome-zone decision no longer lives at the call
  site.

---

## 8.1 Dwell-then-release snap-back — diagnosis + committable-seat SSOT redesign

### Symptom

A deliberate (non-flick) drag seats the dragged pane in a valid target slot; the
ghost hops in and DWELLS there for ~0.6 s (multiple painted frames) with the
seat indicator centered, yet `pointerup` REVERTS the layout instead of
committing the swap. Distinct from the fast-flick visual glide (`0ba901e`, I5)
and the coalescer dropped-frame race (`8840952`).

### Root cause — architectural, not a localized bug

The commit/cancel outcome was derived from **release-time re-resolution of the
raw `pointerup` coordinates**, not from a single authoritative record of the
slot the user was shown hopped into. Two compounding seams in
`dynamic-tiling-renderer.tsx`'s `processPointerSample` dragging branch:

1. The release path ran the SAME `resolvePointerTarget(client.x, client.y, …)`
   used by move samples, then dispatched the result. Over a layout gap or off
   the **gap-closed** hit footprint (hit-testing runs on the source-removed
   reflowed tree, which differs from the displayed candidate layout), the raw
   release point can resolve `null` or a different, non-committable target.
2. The `shouldPreserveSeatedTargetOnRelease` guard (`7ed9307`) tried to rescue
   this by comparing the freshly-resolved release target against
   `current.resolvedTarget` (the "seated" target). But `current.resolvedTarget`
   is the FSM state read back through `dragStateRef`, and during a long dwell
   the move-sample slot-commitment policy (`shouldReresolveSeatedTarget` →
   `delta-responsive`) can already have re-resolved the seat to a different /
   null target on a sub-pixel cursor drift BEFORE release. The guard's notion of
   "seated" was therefore not guaranteed to be the committable slot last painted.

Invariant violated: **I4 — a release while seated on a committable target must
commit there.** There was no single source of truth for "the committable seat";
the commit decision raced release-time re-resolution against a
possibly-already-clobbered FSM target.

### Redesign — `committableSeatRef` single source of truth + atomic release commit

- `drag-machine.ts`: `shouldPreserveSeatedTargetOnRelease` (the re-resolve-and-
  compare guard) is removed; replaced by the pure `deriveCommittableSeat(target,
  sourceLeafId)` → returns the target verbatim iff `isCommittableTarget`, else
  `null`. One rule, no release/move-sample branching.
- `dynamic-tiling-renderer.tsx`: a renderer-scoped `committableSeatRef`
  (`React.useRef<DynamicDropState | null>`) is written **synchronously on every
  processed sample** (armed-promotion pickup, touch long-press promotion, and
  each dragging move sample) to `deriveCommittableSeat(nextTarget, …)`. Being a
  ref written in the sample task, it carries no passive-effect lag (unlike
  `dragStateRef`). Cleared at settle.
- The RELEASE sample short-circuits: it dispatches `POINTER_MOVE` (to land the
  ghost at the release point) then `TARGET_RESOLVED` with `committableSeatRef`
  **verbatim**, and returns early — it never re-resolves the release
  coordinates. `POINTER_UP` then commits the seat (or cancels iff it is `null`,
  i.e. the user genuinely dwelled over a non-committable position).

This makes the commit atomic with respect to what was last painted: the slot the
ghost visibly occupied IS the slot committed. FLIP direction is unaffected — it
already derives from committed candidate data (I6), not transient transform
state.

### Invariant → test mapping (new)

`drag-machine.test.ts` describe "committable-seat SSOT + atomic seated-release
commit (dwell-then-release snap-back regression)":
- `deriveCommittableSeat` captures committable swap / edge-insert / group-merge
  verbatim; returns `null` for null / non-committable / edge-without-zone /
  self-target.
- dwell-then-release: the captured seat commits even though release-time
  re-resolution would have resolved `null` over a gap (I4).
- release over a genuinely non-committable position (no captured seat) settles
  as cancel (I4 negative case — the SSOT does not over-commit).

---

## 9. Verdict — content-agnostic drag (correction landed)

The FSM, candidate-tree core, and all five geometry seams are principled,
minimal, and well-tested, and were left **untouched** by this correction. The
work was confined to the drag **presentation** layer.

### What the correction did

1. **`resolveDragPresentation` is now content-agnostic.** Removed
   `isPaneContentVisible` from `DragPresentationInput`. Its output is
   `{ isGhostSeatReservation, isPickupOriginLeaf, isGhostSeatLeaf, dropChromeZone }`
   — pure drag mechanics, identical whether content is shown or hidden.
2. **One uniform body-content rule.** `resolvePaneBodyRenderMode(
   isGhostSeatReservation, isPaneContentVisible)` is the single function that
   maps to `render-reservation` / `render-content` / `render-empty`. The
   renderer's per-leaf branch and the ghost shell BOTH call it — same rule, every
   surface (in-tree pane, source slot, hop-in slot, ghost).
3. **Ghost honors `CONTENT`.** `renderDragPaneShell` takes `isPaneContentVisible`
   and paints the captured snapshot content iff visible, else an empty-bodied
   ghost frame — no drag-specific branch.
4. **Content-OFF body is empty** (no content, no placeholder/"content hidden"
   text), frame + header chrome preserved. Renamed the body mode
   `render-placeholder` → `render-empty` to match.
5. **Removed dead/contradictory state.** `isPreviewDragSourceReveal`,
   the `suppressSourceContentInEmptyMode` hit-log telemetry field, and the I2
   invariant + its tests are gone. The reservation + single-portaled-ghost
   mechanism and the "exactly one painted instance" invariant are KEPT (a drag
   mechanic, orthogonal to content).
6. **Tests** assert: (a) drag presentation identical for `CONTENT` on vs off;
   (b) ghost honors `CONTENT`; (c) the no-double-paint single-reservation
   invariant; the seated quick-release / fast-flick / candidate==commit suites
   (`drag-machine.test.ts`, `fast-flick-survivor-reflow.test.ts`,
   `live-render-invariant.test.ts`) are content-independent and unchanged.

### Remaining type-hygiene follow-up (not blocking)

`split-container-insert` stays in `DynamicDropAction` though the drag resolver
never produces it — an explicit exhaustive `never` guard would document the
unreachable union member at compile time. Tracked, not done here.

---

## 10. Drag / transition self-healing recovery layer

The FSM (§3) structurally eliminates a "stuck on a logical event" drag: every
interruption is an enumerated cancel edge to `idle`. It does **not** by itself
defend against two *physical* failure modes that live entirely in the renderer's
animation plumbing, below the FSM:

1. **A starved animation frame.** The ghost morph (§4) and the survivor reflow
   (§4) both arm their play-to-identity transition write inside a bare
   `requestAnimationFrame`. When the tab is backgrounded (rAF suspended) or the
   main thread is under heavy CPU throttling, that callback can be deferred
   indefinitely. The element is left frozen at its inverted FLIP *First* (a
   visible offset/scale), and — for the survivors — the timer-only clip-mask
   close at `survivorReflowDurationMs + 60` fires meanwhile and re-clips them
   while still transformed.
2. **A drag that never receives its terminal event.** A dropped `pointercancel`
   (OS gesture steal, devtools, a wedged compositor) can leave the FSM parked in
   `armed`/`dragging` with pointer capture held and transient inline styles on
   the leaves, with no event arriving to drive the existing cancel edge.

The recovery layer is a **pure module** (`drag-recovery.ts`, DOM-less, injected
clock + scheduler) plus thin renderer wiring. It adds **no new FSM phase or
event** — the watchdog force-reconciles by feeding the *existing* `POINTER_CANCEL`
edge, so the entire core (§3) is untouched.

### 10.1 Primitives (`drag-recovery.ts`)

| Primitive | Mechanism | Failure mode it closes |
|---|---|---|
| `scheduleFrameOrTimeout(scheduler, frameDeadlineMs, cb)` (M1) | races `requestAnimationFrame` against `setTimeout(frameDeadlineMs)`, first-wins, runs `cb` exactly once, returns a `RacedFrameHandle` whose `cancel()` drops both arms | starved frame freezes a FLIP at its inverted First |
| `onTransitionSettled({ target, durationMs, transitionSlackMs, scheduler, onSettled })` (M2) | resolves on `transitionend` OR a `durationMs + transitionSlackMs` timeout, whichever first, exactly once | a `transitionend` that never fires (interrupted/again-throttled) strands a cleanup |
| `createDragWatchdog({ maxIdleMs, now, scheduler, onExpire })` (M3) | monotonic idle timer; `progress()` records `now()` and re-arms; on fire it re-checks `now() - lastProgress` against `maxIdleMs` and either expires or re-arms for the remainder (robust to timer coalescing) | a drag parked past the idle budget with no terminal event |
| `stripTransientDragStyles({ ghost, leaves, animations, racedHandles })` (M4) | idempotent clear of `transform` / `transition` / `transform-origin` / `will-change` / `contain` to identity + `cancel()` of every tracked WAAPI animation and raced handle | residual inline transforms / live animations after any exit path |

All four operate on **minimal typed style-target interfaces**
(`TransientDragStyleTarget` mirrors the existing `SurvivorReflowLeafStyleTarget`
shape — only the `style` fields touched), so the module never imports the DOM
lib and is unit-tested with a fake scheduler + injected clock. M5 (visibility
reconcile) is not a primitive — it is the renderer routing a `visibilitychange`
into the existing cancel edge + M4.

### 10.2 Typed capability + non-ad-hoc defaults

`TilingDragRecoveryCapability` (consumer-facing, all-optional) resolves to
`ResolvedTilingDragRecoveryCapability` in `interaction-capabilities.ts` via the
same nested-resolve pattern as `slotCommitment` / `touchDrag` (`??`, never `||`;
numeric fields clamped `Math.max(0, …)`). Defaults live as named constants in
`drag-recovery.ts`, **derived from the renderer's own motion budget rather than
hand-picked**:

| Field | Default | Derivation (why non-ad-hoc) |
|---|---|---|
| `enable` | `true` | recovery is a backstop, on by default; flips off the watchdog (M3) + explicit teardown (M4) + visibility reconcile (M5). M1 stays on regardless — it cannot alter the happy path |
| `maxDraggingIdleMs` | `30 * BASELINE_DRAG_HOP_DURATION_MS` = `5100` | the budget is expressed in *hop durations*, not a magic millisecond count: a drag idle for 30× the baseline hop animation is unambiguously hung, and the budget tracks the motion constant if it changes. `BASELINE_HOP_DURATION_MS` is mirrored locally in `drag-recovery.ts` to avoid a renderer→capabilities import cycle |
| `frameDeadlineMs` | `32` | ≈ two 60 Hz frames; the rAF arm wins under normal load, the timeout fires only when the frame is genuinely starved |
| `transitionSlackMs` | `60` | matches the renderer's existing survivor clip-mask tail (`+ 60`), so the M2 fallback and the legacy mask-close agree |

### 10.3 Renderer wiring (anchored by symbol)

All four edits were re-anchored on **symbols** (not line numbers) since
`dynamic-tiling-renderer.tsx` is a contested file:

1. **Ghost morph FLIP** (`DragPaneOverlay` morph `useLayoutEffect`): the bare
   `rafRef.current = window.requestAnimationFrame(…)` arm → `scheduleFrameOrTimeout(
   WINDOW_FRAME_OR_TIMEOUT_SCHEDULER, frameDeadlineMs, …)`; `rafRef` retyped to
   `RacedFrameHandle | null`; `cancelInFlight` calls `rafRef.current.cancel()`.
2. **Survivor reflow FLIP** (survivor-reflow effect): the
   `survivorFlipRafRef.current = window.requestAnimationFrame(…)` arm → the same
   M1 race; `survivorFlipRafRef` retyped to `RacedFrameHandle | null`; cleanup
   calls `.cancel()`.
3. **Idle watchdog** (`useEffect` keyed on `dragState`): armed only while the
   phase is `armed`/`dragging` and `dragRecovery.enable`; `progress()` on mount,
   and because the effect lists `dragState` in its deps every FSM transition
   (each coalesced move, target resolve) re-runs it → re-arms (idle reset). On
   expiry it `dispatchDrag({ type: "POINTER_CANCEL" })` (existing edge) +
   `stripSurvivorTransientStyles()`.
4. **M4 teardown routed into every exit path** via the `stripSurvivorTransientStyles`
   callback (clears all `[data-leaf-id]` leaves + cancels tracked dips + the
   raced handle): the settle teardown effect (after `capturedPointerIdRef.current
   = null`), the watchdog expiry, and `handleVisibilityChange` (hidden). The WAAPI
   coherent-dip `onfinish` pins (ghost dip + survivor dip) are routed through
   `stripTransientDragStyles` so a dip that finishes *after* a mid-flight cancel
   (its `fill:none` reverts to the inverted base) still lands clean.

### 10.4 Invariants → tests

| # | Invariant | Enforced by | Tested |
|---|---|---|---|
| INV-R1 | No `[data-leaf-id]` leaf or ghost retains a non-identity inline `transform`/`transition` once the FSM is `idle` | M4 routed into settle teardown + dip `onfinish`; idempotent | `drag-recovery.test.ts` (M4 clears all fields, idempotent on repeat) |
| INV-R2 | An `armed`/`dragging` drag idle (monotonic) past `maxDraggingIdleMs` force-reconciles to `idle` with capture released | M3 watchdog → existing `POINTER_CANCEL` edge | `drag-recovery.test.ts` (expiry after `maxIdleMs`, re-arm on `progress()`, never trips when progress recent); `drag-machine.test.ts` (watchdog-driven `POINTER_CANCEL` drives `dragging → settling(cancel) → idle`) |
| INV-R3 | Each FLIP play-to-identity write runs **exactly once and always** | M1 first-wins race + idempotent single run | `drag-recovery.test.ts` (M1 fires once whether the rAF or the timeout wins; `cancel()` drops both) |
| INV-R4 | A hidden→shown tab leaves the FSM `idle` with styles stripped | M5: `visibilitychange` hidden → `VISIBILITY_HIDDEN` (existing cancel edge) + M4 | covered by the FSM `VISIBILITY_HIDDEN` cancel edge (`drag-machine.test.ts`) + M4 idempotence (`drag-recovery.test.ts`) |

### 10.5 Verdict

The recovery layer is **additive and core-preserving**: the FSM, candidate /
geometry core, and the content-agnostic presentation rule (§0) are untouched.
The watchdog reuses the existing `POINTER_CANCEL` edge rather than introducing a
parked-recovery state, M1 is a pure backstop that cannot perturb the happy path,
and M4 is idempotent so it is safe on every (possibly overlapping) exit path. The
defaults are derived from the renderer's motion budget (hop-duration multiples,
frame counts) rather than magic numbers, so they track the animation constants.
