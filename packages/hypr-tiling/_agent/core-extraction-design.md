# M3 core-extraction — staged design (`core/` + `react/` split behind host ports)

Reference design for splitting `@n-uf/hypr-tiling` into a framework-free **core**
(pure tiling/drag logic) and a thin **React host** (`react/`) that supplies the
core's runtime capabilities through a small set of **host ports**. This doc is the
durable reference for the whole 8-stage sequence; **stages 1–3 are executed in this
change set, stages 4–7 are deferred and individually gated** (see the §"Per-stage
go/no-go gate list").

It sits alongside the drag-subsystem references in this folder:
`_agent/drag-subsystem-audit.md` (the full FSM / FLIP / recovery audit) and
`_agent/drag-recovery-cdp-throttle.md` (the manual INV-R1..INV-R4 throttle repro).
Read those first for the runtime-invariant vocabulary used below (snap-back,
mid-FLIP-hang, ghost-content, INV-R1..R4).

All line cites are against `main` at `9965795` (`release: 26.7.0`), pre-Stage-1
paths (every module still at `packages/hypr-tiling/<file>`).

---

## 1. Core vs React vs glue split (with line cites)

The package today is a flat directory at `packages/hypr-tiling/`. Three concern
classes are tangled in it:

### 1a. Core — framework-free logic (no `react`, no DOM `getBoundingClientRect`/`getComputedStyle`/`window`)

These modules import only each other + `react`-free utilities. They are pure
reducers, geometry math, FSM transition functions, and injectable-scheduler
primitives. They move to `core/` in Stage 1.

| Module | Role | Notable framework-free exports |
|---|---|---|
| `state.ts` | layout split-tree reducers | `insertLeafAdjacent`, `removeLeafTile`, `swapLeafTiles`, `updateSplitRatio`, `groupLeaves`, … |
| `drag-machine.ts` | drag FSM transition fns + `FrameScheduler` (`drag-machine.ts:777`) + `createFrameCoalescer` (`:799`) | `FrameScheduler`, `FrameCoalescer`, `isCommittableTarget`, settle outcomes |
| `drag-recovery.ts` | M1–M5 self-heal primitives; `FrameOrTimeoutScheduler` (`drag-recovery.ts:91`), `TimerScheduler` (`:170`), `scheduleFrameOrTimeout`, `onTransitionSettled`, `isComputedTransformIdentity` (`:252`) | the recovery scheduler interfaces are the Stage-2 merge inputs |
| `survivor-reflow.ts` | survivor FLIP reflow math | `DragSettleOutcome` consumer |
| `ghost-transit.ts` | ghost transit geometry / pickup-scale | `clampGhostPickupScalePercent` |
| `leaf-geometry.ts` | leaf-rect footprint math | `collectLeafFootprints`, `footprintsByLeafId`, `collectNormalizedLeafRects` |
| `drop-validity.ts` | drop-legality predicate | — |
| `drop-intent-resolver.ts` | edge-zone → drop-intent resolution | `TILING_DROP_INTENT_CONFIG`, `TilingEdgeZone` |
| `pane-sizing.ts` | static/flex sizing math | `splitAxisDimension`, `resolveBinarySplitDistribution` |
| `pane-switching.ts` | keymap / pane-cycle reducers | `resolveKeymap`, `matchKeyChord` |
| `keybindings.ts` | key-binding match | `matchKeyBinding` |
| `commands.ts` | command gating | `isCommandEnabled` |
| `focus-history.ts` | focus-history ring | `pushFocusHistory`, `pruneFocusHistory` |
| `multi-selection.ts` | multi-select reducers | `toggleLeafMultiSelection` |
| `drag-presentation.ts` | drag presentation derivation | consumes `DragMachineState` |
| `projected-layout.ts` | projected-landing overlay math | `PLACEMENT_BY_DROP_ZONE` |
| `interaction-capabilities.ts` | capability resolution | `resolveInteractionCapabilities` |
| `drag-easing.ts` | easing resolution | `resolveDragEasing` |
| `drag-cursor.ts` | cursor presentation | `resolveDragCursorPresentation` |
| `types.ts` | the public type surface | all `Tiling*` types |

### 1b. React — components + hooks (`.tsx`, JSX, `React.*`, refs)

| Module | Role |
|---|---|
| `dynamic-tiling-renderer.tsx` | `TilingRenderer` + every drag/FLIP/measure hook (~7.9k lines) |
| `theme.tsx` | `TilingThemeProvider`, theme registry/hooks |
| `tiling-observability-panel.tsx` | devtools observability panel |
| `cn.ts` | `clsx`/`tailwind-merge` className join (React-adjacent UI util) |

### 1c. Glue — the seam the ports formalize (today inlined inside `dynamic-tiling-renderer.tsx`)

This is logic that is framework-free in spirit but is currently expressed against
live React refs / `window` / the DOM, so it cannot move to core until a port
abstracts the capability. These inline sites are the targets of Stages 2–7:

- **Scheduler glue (Stage 2)** — `WINDOW_FRAME_OR_TIMEOUT_SCHEDULER`
  (`dynamic-tiling-renderer.tsx:360`), `WINDOW_TIMER_SCHEDULER` (`:368`),
  `monotonicNow` (`:374`); the inline `createFrameCoalescer` `{request,cancel}`
  literal (`:6432`); scheduler hand-offs at `:1306`, `:4418`, `:4450`, `:4465`,
  `:6785`.
- **Measurement glue (Stage 3)** — DOM rect/transform reads inside
  `resolvePointerTarget` (`:6066`, viewport rect `:6077`, tab-strip rect `:6095`),
  the seat-measurement layout effect (`:2583`), `setLeafSizingFromBbox` (`:3805`,
  rect read `:3819`), `acquireLeafSpace` (`:3854`, viewport rect `:3857`),
  reservation-rect read (`:4209`/`:4214`), `resolveLiveHitLogState` (`:6822`,
  pane rect `:6837`, viewport rect `:6847`).
- **Style-applier glue (Stage 6)** — direct `node.style.transition` /
  `node.style.transform` writes and the transient-style strip (`:1299`–`:1311`,
  the `[data-leaf-id]` strip effect `:3726`–`:3737`, the WAAPI dip / force-settle
  `:4338`–`:4458`).
- **Pointer-capture glue (Stage 5/7)** — `setPointerCapture` / capture routing on
  `rootRef` (capture commentary `:7903`), the FSM seat/commit/watchdog wiring
  (`:4418`–`:4465`, `:6785`).

---

## 2. The `createTilingController` factory + four host-port interfaces

The end-state (after Stage 7) is a framework-agnostic controller created by the
core and driven by the React host through four injected ports. The controller owns
the drag FSM, the seat/commit/watchdog lifecycle, the FLIP scheduling, and the
recovery state machine; the host owns the DOM. Stages 2–7 incrementally lift each
responsibility behind one of these ports.

```
core/createTilingController(ports: TilingControllerPorts): TilingController
                                   │
        ┌──────────────────┬───────┴────────┬───────────────────┐
        ▼                  ▼                ▼                   ▼
  SchedulerPort      MeasurementPort   StyleApplierPort   PointerCapturePort
  (Stage 2)          (Stage 3)         (Stage 6)          (Stage 5/7)
```

### 2a. `SchedulerPort` (Stage 2 — frame + timer + clock)

Superset-merge of today's three scheduler shapes (`FrameScheduler`
`{request,cancel}` at `drag-machine.ts:777`; `FrameOrTimeoutScheduler`
`{requestFrame,cancelFrame,setTimer,clearTimer}` at `drag-recovery.ts:91`;
`TimerScheduler` `{setTimer,clearTimer}` at `drag-recovery.ts:170`) plus
`monotonicNow`.

```ts
interface SchedulerPort {
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  setTimer(callback: () => void, ms: number): number;
  clearTimer(handle: number): void;
  now(): number;
}
```

Default host adapter `createWindowSchedulerPort()` repackages the existing
`WINDOW_FRAME_OR_TIMEOUT_SCHEDULER` / `WINDOW_TIMER_SCHEDULER` / `monotonicNow`
constants — **behavior- and identity-preserving**, no timing change.

### 2b. `MeasurementPort` (Stage 3 — DOM rect/transform reads)

```ts
interface MeasurementPort {
  measureViewportRect(): DOMRect | null;
  measureLeafRect(leafId: string): DOMRect | null;
  measureReservationRect(leafId: string): DOMRect | null;
  measureGroupTabStripRect(groupId: string): DOMRect | null;
  readComputedTransform(leafId: string): string | null;
}
```

Implemented in `react/` over `rootRef` / `viewportRef` and the
`[data-leaf-id]` / reservation / tab-strip selectors. It is the read-only half of
the DOM seam; the write half is `StyleApplierPort`.

### 2c. `StyleApplierPort` (Stage 6 — transient transform/transition writes + strip)

```ts
interface StyleApplierPort {
  applyTransform(leafId: string, transform: string): void;
  applyTransition(leafId: string, transition: string): void;
  stripTransient(leafId: string): void;        // → identity, clears inline transform/transition
  stripAllTransient(): void;                    // the [data-leaf-id] strip sweep
}
```

This port is the highest-risk lift (it owns the FLIP play-to-identity writes and
the recovery strip) and is gated hardest — see §"Per-stage go/no-go gate list",
Stage 6.

### 2d. `PointerCapturePort` (Stage 5/7 — capture routing)

```ts
interface PointerCapturePort {
  capture(pointerId: number): void;
  release(pointerId: number): void;
  hasCapture(pointerId: number): boolean;
}
```

Routes `setPointerCapture` / `releasePointerCapture` against `rootRef`, matching
today's capture-routing comment at `dynamic-tiling-renderer.tsx:7903`.

---

## 3. Target `core/` + `react/` module layout

```
packages/hypr-tiling/
├── index.ts                     # PUBLIC ENTRY — stays at this path (byte-identical exports)
├── devtools.ts                  # /devtools SUBPATH — stays at this path
├── tsup.config.ts               # entry: ["index.ts", "devtools.ts"] — unchanged
├── core/                        # framework-free (Stage 1 carve)
│   ├── types.ts
│   ├── state.ts
│   ├── drag-machine.ts
│   ├── drag-recovery.ts
│   ├── survivor-reflow.ts
│   ├── ghost-transit.ts
│   ├── leaf-geometry.ts
│   ├── drop-validity.ts
│   ├── drop-intent-resolver.ts
│   ├── pane-sizing.ts
│   ├── pane-switching.ts
│   ├── keybindings.ts
│   ├── commands.ts
│   ├── focus-history.ts
│   ├── multi-selection.ts
│   ├── drag-presentation.ts
│   ├── projected-layout.ts
│   ├── interaction-capabilities.ts
│   ├── drag-easing.ts
│   ├── drag-cursor.ts
│   ├── scheduler-port.ts        # NEW (Stage 2): SchedulerPort interface
│   ├── measurement-port.ts      # NEW (Stage 3): MeasurementPort interface
│   ├── style-applier-port.ts    # NEW (Stage 6): StyleApplierPort interface
│   ├── pointer-capture-port.ts  # NEW (Stage 5/7): PointerCapturePort interface
│   └── tiling-controller.ts     # NEW (Stage 4): createTilingController FSM driver
└── react/                       # React host (Stage 1 carve)
    ├── dynamic-tiling-renderer.tsx
    ├── theme.tsx
    ├── tiling-observability-panel.tsx
    ├── cn.ts
    └── window-scheduler-port.ts # NEW (Stage 2): createWindowSchedulerPort host adapter
```

`index.ts` / `devtools.ts` stay at the package root and only have their internal
relative import paths rewritten (`./state` → `./core/state`,
`./dynamic-tiling-renderer` → `./react/dynamic-tiling-renderer`, etc.). The
**published export names are byte-identical** — Stage 1 is path-only.

Dependency direction is strictly **`react/` → `core/`** (and `index.ts` /
`devtools.ts` → both). Core never imports from `react/`. `createWindowSchedulerPort`
lives in `react/` (not core) so the core→react inversion never occurs even though
the window adapter is itself framework-free — see the Stage-2 judgment-call note.

---

## 4. The 8-stage sequence

| Stage | Scope | Risk | What could regress | Verification gate |
|---|---|---|---|---|
| **1** | Directory carve: `git mv` core modules → `core/`, React modules → `react/`; rewrite all import paths; keep `index.ts` + `devtools.ts` at root; update `tsup.config.ts` + web Vite alias if it pointed at a moved internal path | **Low** | broken import paths; an accidental import cycle; a changed `dist/` export shape; web/showcase alias pointing at a moved file | `pnpm typecheck` (pkg+showcase+web) + full suite (775) green; `dist/` export-shape diff clean; `apps/web` typecheck/build/prerender clean |
| **2** | `SchedulerPort` superset-merge + `createWindowSchedulerPort()`; wire renderer + drag-recovery scheduler call-sites through the port | **Low–Med** | a timing change (rAF/timeout identity drift) reopening the M1/M2/M3 starvation guarantees; `drag-recovery*.test.ts` fakes no longer matching | full suite green (esp. `drag-recovery.test.ts` / `drag-recovery-dom.test.ts` / `drag-machine.test.ts`); assert wired port behaves identically to the constants |
| **3** | `MeasurementPort` interface + `react/` impl; replace inline DOM reads in `resolvePointerTarget`, seat-measurement effect, `setLeafSizingFromBbox`, `acquireLeafSpace`, `resolveLiveHitLogState` | **Med** | a measured rect off by selector/ref resolution; the off-screen/degenerate seat-clamp no longer nulling the seat (re-seat / phantom-seat) | full suite + **NEW measurement characterization tests** (drive `resolvePointerTarget` against injected synthetic rects; assert off-screen/degenerate clamp nulls the seat) green; typecheck/build/prerender clean |
| **4** | FSM-driver lift: move the drag FSM + seat lifecycle orchestration into `core/createTilingController`, driven by ports | **High** | snap-back race (Fix A `shouldSuppressCompetingCancel`), watchdog/seat ordering, double-commit | char-test for the FSM driver + manual INV-R1..R4 throttle checkpoint + 24h soak |
| **5** | Seat / commit / watchdog lift behind `PointerCapturePort` + controller | **High** | dropped/late `pointerup` not returning to `idle` (INV-R3); seated drop snapped back; capture routing | seat/commit char-test + manual checkpoint + soak |
| **6** | FLIP-scheduling lift behind `StyleApplierPort`: play-to-identity writes + transient strip move into the controller | **High** | mid-FLIP-hang (M2b stuck-transition), ghost freeze at inverted First (INV-R2), residual non-identity transform (INV-R1) | FLIP char-test + manual throttle checkpoint (CDP repro) + soak |
| **7** | Renderer inversion: `dynamic-tiling-renderer.tsx` becomes a thin host that wires the four ports into `createTilingController` and renders | **High** | ghost-content snapshot regressions; any of the above re-surfacing; SSR/prerender break | full suite + all char-tests + manual checkpoint + prerender + soak |

---

## 5. Behavior-preservation strategy

### 5a. Characterization-test-first

Each behavior-changing stage (3–7) lands its **characterization test BEFORE the
lift**, pinning the current observable behavior against injected/synthetic inputs,
so the lift is proven a no-op at the behavior boundary. Stage 3 introduces the
first such test (driving `resolvePointerTarget` against synthetic rects); Stages
4–7 each add their own (FSM-driver, seat/commit, FLIP-scheduling, host-inversion).

### 5b. High-risk regression list (the three failure families to guard)

These are the historically expensive failure modes (full vocabulary in
`_agent/drag-subsystem-audit.md`); every High-risk stage must demonstrate none
reopened:

- **Snap-back** — a seated, committable drop gets cancelled and the pane animates
  back to origin. Guarded by Fix A `shouldSuppressCompetingCancel` (the watchdog's
  strip path is deliberately removed while a committable seat is latched). Risk
  surfaces in Stages 4–5.
- **Mid-FLIP-hang** — the compositor transition from the inverted First to identity
  stalls under throttle/WAAPI coherent-dip; inline transform reads settled while
  computed transform is still non-identity (the M2b stuck-transition guard,
  `drag-recovery.ts:262`+). Risk surfaces in Stage 6.
- **Ghost-content** — the single ghost overlay shows stale/empty content or freezes
  at its inverted FLIP First (INV-R2). Covered by `ghost-content-snapshot.test.ts`.
  Risk surfaces in Stages 6–7.

### 5c. INV-R runtime guards (must hold after every stage)

Per `_agent/drag-recovery-cdp-throttle.md`:

- **INV-R1** — after settle, NO `[data-leaf-id]` retains a non-identity inline
  `transform`.
- **INV-R2** — the ghost overlay never freezes at its inverted FLIP First.
- **INV-R3** — a dropped/late `pointerup`/`pointercancel` still returns the FSM to
  `idle`.
- **INV-R4** — a tab hidden mid-drag reconciles to clean `idle` with all transient
  styles stripped.

Stages 1–3 do not touch the FSM/FLIP/recovery write paths, so INV-R1..R4 are held
trivially (proven by the unchanged `drag-recovery*.test.ts` + `live-*` suites).
Stages 4–7 must each re-validate INV-R1..R4 via the CDP throttle repro.

---

## 6. Per-stage go/no-go gate list

**In this change set (executed now):**

- **Stage 1 — GO when:** pkg+showcase+web typecheck clean; full suite 775 green;
  built `dist/` export shape byte-identical to pre-Stage-1; no new import cycle;
  `apps/web` build + prerender clean. _Risk: Low._
- **Stage 2 — GO when:** full suite green (esp. `drag-recovery.test.ts`,
  `drag-recovery-dom.test.ts`, `drag-machine.test.ts`); the wired
  `createWindowSchedulerPort()` proven identical to the raw constants (no timing
  drift). _Risk: Low–Med._
- **Stage 3 — GO when:** full suite + the new `resolvePointerTarget`
  characterization tests green (including the off-screen/degenerate seat-clamp →
  null seat case); typecheck/build/prerender clean. _Risk: Med._

**Deferred — individually gated (NOT in this change set; each needs explicit
operator approval):**

Every Stage 4–7 lift is **High** risk and gated on the conjunction of: (i) its
characterization test landing green BEFORE the lift, (ii) a manual INV-R1..R4 CDP
throttle checkpoint (`_agent/drag-recovery-cdp-throttle.md`), and (iii) a soak
window on the running dev server before merge. They are held one-at-a-time so a
regression bisects to a single lift:

- **Stage 4 (FSM-driver lift)** — GO only after a `createTilingController` FSM
  characterization test pins seat/commit/watchdog ordering AND the manual snap-back
  checkpoint passes.
- **Stage 5 (seat/commit/watchdog lift)** — GO only after the seat/commit char-test
  + INV-R3 (dropped/late `pointerup` → `idle`) manual checkpoint pass.
- **Stage 6 (FLIP-scheduling lift)** — GO only after the FLIP char-test + the CDP
  throttle repro confirm INV-R1 (no residual transform) + INV-R2 (no ghost freeze)
  + no mid-FLIP-hang.
- **Stage 7 (renderer inversion)** — GO only after full suite + every char-test +
  ghost-content snapshot + prerender + a final INV-R1..R4 soak.

---

## 7. Usage / integration (end-state, post-Stage-7)

```ts
// react/dynamic-tiling-renderer.tsx (thin host, after Stage 7)
const controller = createTilingController({
  scheduler: createWindowSchedulerPort(),
  measurement: createReactMeasurementPort(rootRef, viewportRef),
  styleApplier: createReactStyleApplierPort(rootRef),
  pointerCapture: createReactPointerCapturePort(rootRef),
});
```

Until Stage 4, `createTilingController` does not exist; Stages 2–3 only introduce
`SchedulerPort` + `MeasurementPort` and wire the existing renderer hooks through
them, leaving the FSM/seat/FLIP orchestration inline. The public package surface
(`index.ts` / `devtools.ts` export names) is unchanged across **all** stages — the
entire sequence folds into the unpublished `26.7.0`, no version bump, no publish.
