# Drag-recovery CDP CPU-throttle repro — manual INV-R1..INV-R4 validation

Manual, headless-Chrome repro for the drag/transition self-healing recovery layer
(`packages/hypr-tiling/drag-recovery.ts`, mitigations M1–M5). It drives a real
drag against the running dev server under **CPU throttling + frame starvation +
mid-drag tab-hide + a long task injected between the move and the release**, then
asserts the four recovery invariants hold after each perturbation:

- **INV-R1** — after the drag settles, NO `[data-leaf-id]` element retains a
  non-identity inline `transform` (M1 timeout-fallback + M4 strip).
- **INV-R2** — the single ghost overlay never freezes at its inverted FLIP
  `First` (M1 races the play-to-identity write against a timeout).
- **INV-R3** — a `pointerup`/`pointercancel` that is dropped or arrives
  arbitrarily late still returns the drag FSM to `idle` (M3 idle watchdog driving
  the existing `POINTER_CANCEL` edge).
- **INV-R4** — a tab hidden mid-drag (`visibilitychange`) reconciles to a clean
  `idle` with all transient drag styles stripped (M5 + M4), and re-showing the
  tab does not resurrect a stuck transform.

This is the LIVE counterpart to the deterministic coverage: the pure primitives
are unit-tested in the `node` env (`__tests__/drag-recovery.test.ts`) and the
primitive→real-DOM contract under rAF starvation is integration-tested in jsdom
(`__tests__/drag-recovery-dom.test.ts`). The recipe below is for confirming the
WIRED renderer behavior end-to-end against a real compositor under throttle, which
neither automated layer can reproduce.

> Do NOT run `pnpm dev` / `pnpm build` to follow this — a dev server is already
> running. This recipe attaches to it; it never starts/stops the app build.

---

## 0. Endpoints (confirm before starting)

- **Dev server (hypr-tiling-web Vite homepage):** `http://localhost:5173/`.
  Confirm with the running terminal's `➜  Local:` line; override `APP_URL` below
  if the port differs.
- **Chrome remote-debugging endpoint:** `http://127.0.0.1:9333`. A fresh headless
  Chrome is launched on this port in step 1; override `CDP_PORT` if 9333 is taken.

The showcase that renders the live-drag tiling surface is reachable from the
homepage; if the draggable panes (`EVENTS` / `DEBUG CONSOLE` / `ALERTS` /
`OVERVIEW` / `SPEND`) are on a sub-route, navigate there in step 3 by setting
`APP_URL` to that route.

---

## 1. Launch a headless Chrome with the CDP endpoint open

```sh
CDP_PORT=9333
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir=/tmp/hypr-cdp/profile \
  --window-size=1680,1050 \
  --hide-scrollbars --no-first-run --no-default-browser-check --disable-extensions \
  about:blank > /tmp/hypr-cdp/chrome.log 2>&1 &
```

Verify the endpoint is live and discover the WebSocket debugger URL:

```sh
curl -s "http://127.0.0.1:$CDP_PORT/json/version" | python3 -m json.tool
```

If `curl` cannot reach the port, read `/tmp/hypr-cdp/chrome.log` — on macOS the
first launch under a sandboxed shell sometimes fails to bind; relaunch with a
fresh `--user-data-dir`.

---

## 2. Driver scaffold (Node, no external deps — raw CDP over WebSocket)

Pick a CDP transport, then follow the call sequence below (it is the same
contract regardless of transport):

- **Node ≥ 22:** the global `globalThis.WebSocket` can connect directly to the
  target's `webSocketDebuggerUrl` — no install needed. Save the driver as
  `/tmp/hypr-cdp/recovery-probe.mjs` and run with `node`.
- **Older Node:** attach with `npx chrome-remote-interface` (no repo dependency
  added; it is invoked ad hoc), or
- **Zero-tooling:** paste the page-evaluated helpers (`snapshotRecoveryState`,
  the `getBoundingClientRect` coordinate reads, and the long-task loop) into the
  target's own DevTools console and dispatch the `Input.*` / `Emulation.*` /
  `Page.*` calls from the `chrome://inspect` protocol monitor.

CDP call sequence to establish the session:

1. `GET http://127.0.0.1:$CDP_PORT/json` → pick the `page` target whose `url`
   matches `APP_URL`; connect to its `webSocketDebuggerUrl`.
2. Enable domains: `Page.enable`, `Runtime.enable`, `DOM.enable`,
   `Emulation.enable` (implicit), `Input` (no enable needed).
3. `Page.navigate { url: APP_URL }` then await `Page.loadEventFired`; give the
   tiling surface a beat to mount (`Runtime.evaluate` poll for a
   `[data-leaf-id]` count > 0).

Assertion helper — read the live recovery state from the page via
`Runtime.evaluate` (returns a JSON-serializable snapshot):

```js
// Evaluated in the page. Returns the residual-transform + FSM-idle proof.
function snapshotRecoveryState() {
  const leaves = Array.from(document.querySelectorAll("[data-leaf-id]"));
  const nonIdentity = leaves
    .map((el) => ({
      leafId: el.getAttribute("data-leaf-id"),
      transform: getComputedStyle(el).transform,
      inlineTransform: el.style.transform,
    }))
    // computed "none" or the identity matrix both count as clean
    .filter(
      (s) =>
        s.inlineTransform !== "" &&
        s.inlineTransform !== "none" &&
        s.transform !== "none" &&
        s.transform !== "matrix(1, 0, 0, 1, 0, 0)",
    );
  // The renderer exposes no global FSM handle; infer idle from the absence of
  // the dragging-only DOM markers (ghost overlay + select-none gate). Adjust the
  // selectors if the markup changes.
  const ghostOverlayCount = document.querySelectorAll(
    "[data-drag-ghost], [data-drag-source-reservation]",
  ).length;
  return { residualTransforms: nonIdentity, ghostOverlayCount };
}
```

INV proof = `residualTransforms.length === 0` (INV-R1/R2/R4) **and**
`ghostOverlayCount === 0` (INV-R3, no live drag in flight) after each scenario
settles.

---

## 3. Apply CPU throttling

Throttle the renderer thread so every rAF + transition is slowed enough that the
M1 frame-deadline timeout and the M3 idle watchdog are exercised on a real
compositor. `rate` is a slowdown multiplier (4–20× spans "sluggish laptop" to
"pathologically starved").

```
Emulation.setCPUThrottlingRate { rate: 6 }
```

Re-run each scenario at `rate: 6` and `rate: 20`. Reset with `rate: 1` between
runs if you want an unthrottled control.

---

## 4. Scenario A — seated drag + dropped/late `pointerup` (INV-R1/R2/R3)

Drives the seated-then-release path under throttle, then DELAYS the release so the
M3 watchdog window is approached, and finally drops the release entirely to force
the watchdog to recover.

1. Resolve drag coordinates in the page: read `getBoundingClientRect()` of the
   `OVERVIEW` pane header (the grab handle) and of the top-left slot center
   (the seat target).
2. Press on the header:
   `Input.dispatchMouseEvent { type: "mousePressed", x: hdrX, y: hdrY, button: "left", buttons: 1, clickCount: 1 }`.
3. Move past the pickup threshold and into the top-left seat, in several steps so
   the candidate tree seats `OVERVIEW` (watch the seat indicator center):
   `Input.dispatchMouseEvent { type: "mouseMoved", x, y, buttons: 1 }` × N.
4. **Inject a long task between the last move and the release** (starves frames +
   delays the release dispatch), evaluated in the page:
   `Runtime.evaluate { expression: "const t=performance.now(); while(performance.now()-t < 1200){};", awaitPromise: false }`.
5. Release: `Input.dispatchMouseEvent { type: "mouseReleased", x: seatX, y: seatY, button: "left", buttons: 0 }`.
6. Await ~`max(survivorReflowDurationMs + transitionSlackMs, 1)` ms, then
   `Runtime.evaluate(snapshotRecoveryState)`.
   - **Expected:** the swap COMMITTED (OVERVIEW top-left), `residualTransforms`
     empty (INV-R1: M1 timeout resolved any starved survivor/ghost FLIP to
     identity; INV-R2: ghost not frozen), `ghostOverlayCount === 0`.
7. **Dropped-release variant (INV-R3):** repeat 1–4 but SKIP step 5 entirely (no
   `mouseReleased`). Wait past the idle-watchdog deadline
   (`DRAG_RECOVERY_DEFAULT_MAX_DRAGGING_IDLE_MS ≈ 5100ms`, scaled by throttle is
   wall-clock-stable because the watchdog uses a MONOTONIC idle measure), then
   snapshot.
   - **Expected:** FSM self-healed to idle — `ghostOverlayCount === 0`,
     `residualTransforms` empty. The watchdog fired the existing `POINTER_CANCEL`
     edge; the dragged pane is restored to its origin with no stuck transform.

---

## 5. Scenario B — tab hidden mid-drag, then re-shown (INV-R4)

Exercises the M5 `visibilitychange` reconcile + M4 strip: a tab backgrounded
mid-drag suspends `requestAnimationFrame`, which would otherwise freeze a survivor
or ghost at its inverted `First`.

1. Press + move into a seat as in Scenario A steps 2–3 (do not release yet).
2. Background the tab:
   `Page.setWebLifecycleState { state: "hidden" }`.
   (This fires `visibilitychange` → `document.visibilityState === "hidden"` in the
   page, the M5 trigger.)
3. Optionally inject a long task while hidden (compounds rAF suspension).
4. Foreground the tab:
   `Page.setWebLifecycleState { state: "active" }`.
5. `Runtime.evaluate(snapshotRecoveryState)`.
   - **Expected:** the hide reconciled the drag to a clean `idle` (the M5 edge
     dispatches `VISIBILITY_HIDDEN` → cancel and `stripSurvivorTransientStyles`):
     `residualTransforms` empty, `ghostOverlayCount === 0`. Re-showing the tab
     does NOT resurrect a transform (INV-R4 idempotent strip).

---

## 6. Scenario C — pure rAF starvation on the survivor reflow (INV-R1/R2)

Isolates M1: throttle hard (`rate: 20`), perform a fast seated swap that commits,
and confirm the survivors do not remain frozen at their inverted `First` even when
the compositor frame that would write play-to-identity is starved past the
`frameDeadlineMs` backstop.

1. `Emulation.setCPUThrottlingRate { rate: 20 }`.
2. Press → quick move into an adjacent seat → release (Scenario A steps 2–5,
   minimal moves, no long task).
3. Immediately snapshot, then snapshot again after
   `survivorReflowDurationMs + transitionSlackMs`.
   - **Expected:** both snapshots converge to `residualTransforms` empty. If the
     FIRST snapshot shows a survivor still transformed but the SECOND is clean,
     that is the M1 timeout backstop doing its job (the starved frame never
     arrived; the timer wrote identity). A residual transform that PERSISTS in the
     second snapshot is an INV-R1 regression.

---

## 7. Teardown

```sh
# Reset throttling on the live session, then close the headless Chrome.
# Emulation.setCPUThrottlingRate { rate: 1 }
pkill -f "remote-debugging-port=$CDP_PORT" 2>/dev/null || true
rm -rf /tmp/hypr-cdp/profile
```

---

## Mapping — perturbation → mitigation → invariant

| Scenario | Perturbation | Mitigation exercised | Invariant proven |
|---|---|---|---|
| A (release) | CPU throttle + long task before release | M1 frame-deadline + M4 strip | INV-R1 / INV-R2 |
| A (dropped) | `pointerup` never dispatched | M3 idle watchdog → `POINTER_CANCEL` | INV-R3 |
| B | `Page.setWebLifecycleState hidden→active` mid-drag | M5 visibility reconcile + M4 strip | INV-R4 |
| C | hard throttle, starved play-to-identity frame | M1 rAF-with-timeout race | INV-R1 / INV-R2 |

If any scenario leaves a non-identity inline `transform` on a `[data-leaf-id]`
element after settle, or leaves `ghostOverlayCount > 0` (a live ghost with no
in-flight drag), the corresponding mitigation has regressed — capture the
`snapshotRecoveryState` output and the throttle `rate` for the report.
