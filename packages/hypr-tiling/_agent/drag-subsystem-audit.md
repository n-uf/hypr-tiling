# Drag interaction + presentation subsystem — audit

Scope: the live-drag rearrange pipeline of `@hypr-tiling` — the drag FSM
(`drag-machine.ts`), geometry seams (`survivor-reflow.ts`, `ghost-transit.ts`,
`leaf-geometry.ts`, `drop-intent-resolver.ts`), the presentation resolver
(`drag-presentation.ts`), and the renderer orchestration that consumes them
(`dynamic-tiling-renderer.tsx`). HEAD audited: `cc23956`.

The audit was performed by reading the FSM / geometry modules in full and the
7225-line renderer in targeted ranges around the drag / presentation / FLIP code
paths (never the whole file at once).

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
   │  shouldReresolveSeatedTarget / shouldPreserveSeatedTargetOnRelease
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
   └─► resolveDragPresentation(per leaf) ─► paneBodyRenderMode per slot
            render-content | render-placeholder | render-reservation
```

### 2.2 Presentation derivation (single leaf)

```
resolveDragPresentation(input)            [drag-presentation.ts]
   ├─ isDragPresentationActive(phase, settlingOutcome)   ← timing extension
   ├─ isPickupOriginLeaf  = leafId === pickupOriginLeafId
   ├─ isGhostSeatLeaf     = leafId === ghostSeatLeafId
   ├─ shouldRenderReservation = live && active && isGhostSeatLeaf
   ├─ isPreviewDragSourceReveal = active && !live && isPickupOriginLeaf
   └─ paneBodyRenderMode:
        reservation  if shouldRenderReservation
        content      if isPaneContentVisible || isPreviewDragSourceReveal
        placeholder  otherwise
```

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
`shouldReresolveSeatedTarget`, `shouldPreserveSeatedTargetOnRelease`,
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

## 5. The full presentation matrix

Cells give `paneBodyRenderMode` for the named surface. Inputs:
`content` = `isPaneContentVisible`; `live` = `liveDragModeEnabled`. Phase is
`dragging` unless noted. Surfaces: **origin** = pickup-origin leaf; **seat** =
ghost-seat leaf (swap→target, edge-insert→source); **other** = uninvolved leaf.

### 5.1 Live mode (`live = true`)

| Scenario | content | origin | seat | other | Ghost | In tree? |
|---|---|---|---|---|---|---|
| swap | visible | reservation* | reservation | content | yes | origin gap-closed; seat=target reserved |
| swap | empty | placeholder | reservation | placeholder | yes | as above |
| edge-insert | visible | reservation | reservation* | content | yes | seat=origin (source rides in) |
| edge-insert | empty | reservation | reservation* | placeholder | yes | seat=origin |
| no target / gap | visible | (gap-closed: origin absent) | — | content | yes (free-follow) | origin removed from tree |
| no target / gap | empty | (gap-closed: origin absent) | — | placeholder | yes (free-follow) | origin removed |
| group-merge | visible | reservation* | reservation | content | yes | seat=target (member) |
| settling-commit | either | held via `settlingCommitCandidate` | reservation (active extends) | per content | **none** (showGhost false) | committed tree held one frame |
| settling-cancel | either | content/placeholder (layout restored) | — | per content | fly-back overlay | original layout |

\* For swap, the **origin** leaf in the candidate tree carries the *displaced*
target content and renders normally — it is the **seat** (target) leaf that is
reserved. For edge-insert/group-merge the **origin** IS the seat. The "origin =
reservation" cells above describe the *gap-closed* origin slot only when origin
== seat; otherwise origin renders the displaced content. This conditional is the
single most error-prone part of the matrix and is exactly what
`resolveDragGhostSeatLeafId` exists to disambiguate.

### 5.2 Preview mode (`live = false`)

| Scenario | content | origin | seat | other |
|---|---|---|---|---|
| any | visible | content (dim affordance) | content | content |
| any | empty | **content** (preview reveal) | content | placeholder |

The empty-mode **preview reveal** (`isPreviewDragSourceReveal`) deliberately
shows the origin's content while dragging in preview mode — this is the inverse
of live mode and is correct (preview has no ghost to carry the content).

### 5.3 Contradictions + redundant gates found

1. **DEAD output fields (redundant gates).** `resolveDragPresentation` returns
   11 fields; only 4 are consumed by any production surface
   (`paneBodyRenderMode`, `isGhostSeatLeaf`, `isPickupOriginLeaf`,
   `preferEdgeInsertChrome`). The other 7 — `showGhost`, `showInTreeHopIn`,
   `hopInLeafId`, `suppressSourceContentInEmptyMode`, `isActionZoneMismatch`,
   and the two are referenced ONLY by `drag-presentation.test.ts`. Confirmed by
   grep across the whole package. They are vestigial accretion from
   `72560e0`/`1c68c5f`/`cc23956`.
   - `showGhost` duplicates the ghost-visibility decision the renderer already
     makes via `dragVisualState != null` (`phase === "dragging"`). Two sources
     for one fact.
   - `showInTreeHopIn` + `hopInLeafId` are the remnants of the reverted
     `72560e0` "in-tree hop-in reveal" — never wired to a consumer.
   - `suppressSourceContentInEmptyMode` is shadowed by the actual mechanism:
     empty-mode origin suppression happens through
     `paneBodyRenderMode === "render-placeholder"` (driven by
     `isPaneContentVisible === false`), NOT by this flag. The flag is asserted
     in tests but changes nothing at render time.
   - `isActionZoneMismatch` is computed and folded into `preferEdgeInsertChrome`
     internally; exposing it separately is redundant.

2. **Redundant second entry point.** `resolvePaneBodyRenderMode` re-wraps
   `resolveDragPresentation` with synthetic leaf ids (`"slot"`/`"other"`). It is
   imported by the renderer (line 51) and re-exported (line 712) but **never
   called** by the render branch — that calls `resolveDragPresentation`
   directly. It is alive only for `drag-presentation.test.ts` + the public API.
   Two ways to compute the same render mode = the redundant gate the
   architecture rule warns against.

3. **Tangled consumer ternary.** The `effectiveDropZone` derivation
   (renderer 6333–6349) is a 4-deep nested ternary mixing
   `preferEdgeInsertChrome`, `dropState.zone`, and `dropState.dominantEdge`.
   The resolver claims to be the presentation SSOT but the chrome-zone decision
   lives at the call site, not in the resolver. The SSOT boundary is leaky.

4. **Closed-union over-width.** `DynamicDropAction` includes
   `split-container-insert`, which the drag resolver never produces and which
   `deriveCandidateTree` / `resolveDragGhostSeatLeafId` / `isCommittableTarget`
   silently treat as gap-close. Unreachable at the drag layer — a closed-union
   hygiene gap, not a live bug.

No *behavioral* contradiction was found in the consumed cells — the matrix is
correct where it is read. The defect is **over-derivation**: the SSOT emits a
wide struct, half of which is dead, while the one decision that should live in
it (chrome zone) is computed at the call site.

---

## 6. Invariants

| # | Invariant | Enforced by | Tested |
|---|---|---|---|
| I1 | Live mode: exactly ONE visible dragged-content instance (the ghost) | `shouldReserveDragSourceSlot` + `render-reservation` overrides any `renderTile`; ghost is the only content painter | partial (pure layer: `drag-presentation.test.ts`, `live-render-invariant.test.ts`) |
| I2 | Empty mode: pickup-origin leaf NEVER shows dragged content | origin slot resolves to `render-placeholder` (gap-closed) or `render-reservation` (when origin==seat); never `render-content` while `live && !content` | partial |
| I3 | Ghost seated rect == target seat rect (no drift) | seat-rect effect measures the reservation rect; body portal removes ancestor-frame drift | NOT directly tested (DOM measurement) |
| I4 | Seated quick-release on a committable target commits there (incl. pointer-over-gap) | `shouldPreserveSeatedTargetOnRelease` | yes (`drag-machine.test.ts`) |
| I5 | Fast flick with no painted dragging frame → instant commit, no origin→target glide | `shouldSnapSurvivorReflowOnSettleCommit` + same-task release resolve in input layer | yes (`fast-flick-survivor-reflow.test.ts`) |
| I6 | Candidate tree == committed tree (no release-time jump) | both run `deriveCandidateTree` with identical args | yes (`live-render-invariant.test.ts`) |
| I7 | Ghost content == live pane content (rich `content` slot, not rows-only) | `buildDragPaneSnapshot` captures `tile.content` | yes (`ghost-content-snapshot.test.ts`) |

Gaps: I1/I2/I3 have NO test that exercises the resolver as a **single source
consumed by every surface** — i.e. a test asserting that for a fixed
`(content, action, phase)` the per-surface render modes are mutually consistent
(exactly one content painter; origin never content in empty live). The current
`drag-presentation.test.ts` checks fields in isolation, including the dead ones.

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
   `showGhost`/`dragVisualState` are false/null (ghost gone) while the seat
   reservation is still painted content-less for one frame, covered by the fact
   that the committed layout lands same-frame and the reservation slot becomes
   real content. This works in practice but is the fragile seam: it depends on
   React applying `onLayoutChange` synchronously enough that no empty-reservation
   frame is visible. No test guards it.

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
| `7ed9307` seated-target preserve on gap release | `shouldPreserveSeatedTargetOnRelease` | **KEEP** | encodes I4; clean pure selector |
| `1c68c5f` presentation resolver | `resolveDragPresentation` + settling-commit selectors | **FOLD** | the SSOT idea is right; trim to consumed fields + absorb the chrome-zone decision |
| `cc23956` wire policy + scoped seat + edge chrome guard | wired resolver into render branch; scoped seat measure; edge chrome | **FOLD** | keep the wiring; move the edge-chrome ternary into the resolver |

### Patches that fight each other

- `72560e0` (hop-in reveal) vs the single-instance invariant: the reveal would
  paint in-tree content while the ghost also paints it → two instances. It was
  reverted in behavior but its **output fields survived** in
  `DragPresentationMode` and are still asserted by tests, so the test suite now
  pins dead behavior. This is the clearest "patches fighting" residue.
- `cc23956`'s edge-chrome guard (`preferEdgeInsertChrome`) computes
  `isActionZoneMismatch` inside the resolver AND re-derives the same zone logic
  in the renderer ternary — the guard is half in the SSOT, half at the call
  site.

---

## 9. Verdict — TARGETED REFACTOR (not ground-up redesign)

The FSM, candidate-tree core, and all five geometry seams are principled,
minimal, and well-tested. A ground-up redesign would be destructive
over-build: there is no structural defect in the core to justify it. The prior
subagent's read ("FSM/candidate core solid, presentation over-patched") is
confirmed independently here.

The defect is localized to **`drag-presentation.ts` + its two call sites**: the
SSOT struct is over-derived (7 of 11 fields dead), has a redundant second entry
point, and leaks its one genuinely-needed decision (chrome zone) to the
renderer's tangled ternary.

### Concrete delta (the refactor)

1. **Collapse `DragPresentationMode` to consumed fields only**:
   `paneBodyRenderMode`, `isPickupOriginLeaf`, `isGhostSeatLeaf`, and a new
   typed `dropChromeZone: DynamicLeafDropZone | null` that absorbs the
   `effectiveDropZone` ternary (renderer 6333–6349). Remove `showGhost`,
   `showInTreeHopIn`, `hopInLeafId`, `suppressSourceContentInEmptyMode`,
   `isActionZoneMismatch`, `preferEdgeInsertChrome` from the output (fold the
   last into `dropChromeZone`).
2. **Remove `resolvePaneBodyRenderMode`** (the legacy adapter) — make
   `resolveDragPresentation` the single entry point. Migrate its test cases onto
   `resolveDragPresentation`.
3. **Name the settling-commit presentation phase once.** Introduce a typed
   `DragPresentationPhase` selector (`"inactive" | "active"` derived from
   `isDragPresentationActive`) consumed by the resolver, the seat effect, and
   the settling-commit hold — so the concept lives in one place instead of three
   ad-hoc `phase === "settling" && outcome === "commit"` checks.
4. **Encode the invariants as resolver-level tests** (§6 gaps): for each
   `(content, action, phase)` assert the per-surface render-mode tuple satisfies
   I1 (exactly one content painter) and I2 (origin never content in empty live).
5. **Type hygiene**: keep `split-container-insert` out of the drag path or add
   an explicit exhaustive `never` guard so the unreachable union member is
   documented at compile time.

Net: ~remove 7 dead fields + 1 dead function, +1 typed field, +1 phase
selector, +1 invariant test file. No change to the FSM, candidate tree, or
geometry seams. Behavior at every consumed cell of the §5 matrix is preserved.

### Scope guard

This audit found the work is **confined to the drag presentation layer**. No
need to extend into the FSM, geometry, or unrelated renderer areas. The product
rules (single-instance ghost, empty-mode origin suppression, seated quick
release, fast-flick instant commit, no seat drift) are already satisfied by the
core; the refactor makes them *legible and test-pinned* rather than changing
them.
