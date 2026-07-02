/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import {
  type DragMachineState,
  type DragResolvedTarget,
} from "../engine/drag-machine";
import type { DragInputDriverSlotCommitment } from "../engine/input-driver";
import type { ElementRef } from "../engine/element-ref";
import type { SchedulerPort } from "../engine/scheduler-port";
import type { MeasurementPort } from "../engine/measurement-port";
import type { PointerCapturePort } from "../engine/pointer-capture-port";
import type { StyleApplierPort } from "../engine/style-applier-port";
import {
  type TilingController,
  type TilingControllerHost,
  createTilingController,
} from "../engine/controller";
import { createWindowSchedulerPort } from "../react/window-scheduler-port";
import { createDomPointerCapturePort } from "../react/dom-pointer-capture-port";
import { createDomStyleApplierPort } from "../react/dom-style-applier-port";
import { createDomMeasurementPort } from "../react/dom-measurement-port";
import type {
  TilingDropAction,
  TilingLeafDropZone,
} from "../engine/types";

// IMPORT-GRAPH GATE (Stage 8 — vanilla-core proof): this file imports ONLY
// `engine/` modules + the `react/`-located DOM host adapters. Critically, NONE of
// those adapters import the `react` runtime — after the `RefObject → ElementRef`
// decoupling they depend only on `engine/element-ref` — so there is NO `react` /
// `react-dom` anywhere in this module's transitive import graph. The four host
// ports are constructed against PLAIN DOM (jsdom) elements via bare
// `{ current: element }` holders (not `useRef`), and a full pickup → seat →
// commit swap is driven through `createTilingController`. This is the minimal
// no-React adapter proving the roadmap's framework-agnostic boundary.

function makeTarget(
  targetLeafId: string,
  zone: TilingLeafDropZone,
  action: TilingDropAction,
): DragResolvedTarget {
  return {
    leafId: targetLeafId,
    zone,
    action,
    dominantEdge: "right",
    finalEdge: zone === "center" ? null : "right",
    fallbackReason: null,
    blockedReason: null,
    axisPath: ["horizontal"],
    edgeThresholdRatio: 0.25,
    centerRectWidthPx: 100,
    centerRectHeightPx: 100,
    centerDistancePx: 0,
    nearestEdgeDistancePx: 0,
    paneLocalX: 10,
    paneLocalY: 10,
    targetSplitId: null,
    targetSplitPlacement: null,
    selectedSplitZone: zone === "center" ? null : "right",
    selectedSplitDistancePx: null,
    rejectedSplitReasons: [],
    tuning: {
      centerRatio: 0.5,
      edgeThresholdRatio: 0.25,
      hysteresisPx: 6,
      devicePixelRatio: 1,
    },
  };
}

/** A bare, framework-free element holder — the vanilla analogue of `useRef`. */
function elementRef<T>(current: T): ElementRef<T> {
  return { current };
}

interface VanillaHarness {
  readonly root: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly scheduler: SchedulerPort;
  readonly measurement: MeasurementPort;
  readonly styleApplier: StyleApplierPort;
  readonly pointerCapture: PointerCapturePort;
}

/** Builds the four ports over a plain jsdom DOM tree — zero React. */
function createVanillaHarness(): VanillaHarness {
  const root: HTMLDivElement = document.createElement("div");
  const viewport: HTMLDivElement = document.createElement("div");
  const leaf: HTMLDivElement = document.createElement("div");
  leaf.dataset.leafId = "C";
  viewport.appendChild(leaf);
  root.appendChild(viewport);
  document.body.appendChild(root);

  return {
    root,
    viewport,
    scheduler: createWindowSchedulerPort(),
    measurement: createDomMeasurementPort({
      rootRef: elementRef<HTMLDivElement | null>(root),
      viewportRef: elementRef<HTMLDivElement | null>(viewport),
      groupTabStripRefs: elementRef<Map<string, HTMLDivElement>>(
        new Map<string, HTMLDivElement>(),
      ),
    }),
    styleApplier: createDomStyleApplierPort(
      elementRef<HTMLDivElement | null>(viewport),
    ),
    pointerCapture: createDomPointerCapturePort(
      elementRef<HTMLDivElement | null>(root),
    ),
  };
}

describe("vanilla DOM adapter — the four ports run headlessly with no React", (): void => {
  it("constructs + exercises all four ports against plain jsdom DOM", (): void => {
    const h: VanillaHarness = createVanillaHarness();

    // SchedulerPort: real clock + timers (no React).
    expect(typeof h.scheduler.now()).toBe("number");
    const timer: number = h.scheduler.setTimer((): void => undefined, 0);
    h.scheduler.clearTimer(timer);

    // MeasurementPort: real getBoundingClientRect / querySelector reads.
    expect(h.measurement.measureViewportRect()).not.toBeNull();
    expect(h.measurement.measureLeafRect("C")).not.toBeNull();
    expect(h.measurement.readComputedTransform("C")).not.toBeNull();
    expect(h.measurement.measureLeafRect("does-not-exist")).toBeNull();

    // StyleApplierPort: real element.style writes + clamp measurement + strip.
    const handles = h.styleApplier.collectLeafHandles();
    expect(handles.map((handle) => handle.leafId)).toEqual(["C"]);
    h.styleApplier.applyTransform(handles[0]!, {
      transform: "translate3d(4px, 0, 0)",
      transition: "none",
    });
    expect(h.viewport.querySelector<HTMLElement>('[data-leaf-id="C"]')!.style
      .transform).toBe("translate3d(4px, 0, 0)");
    expect(h.styleApplier.measureClampViewport()).not.toBeNull();
    h.styleApplier.stripLeaf(handles[0]!);

    // PointerCapturePort: capture is best-effort (jsdom may lack the API); the
    // call must not throw and `has` must reflect the outcome.
    expect((): void => {
      h.pointerCapture.capture(1);
      h.pointerCapture.release(1);
    }).not.toThrow();
    expect(typeof h.pointerCapture.has(1)).toBe("boolean");
  });

  it("drives a full pickup → seat → commit swap through the controller with the vanilla ports", (): void => {
    const h: VanillaHarness = createVanillaHarness();
    const seat: DragResolvedTarget = makeTarget("C", "center", "swap");

    // The vanilla host: pointer capture through the real DOM port, a scripted
    // seat resolver (jsdom has no layout, so geometry-based resolution would
    // never seat — the seat is injected exactly as the renderer's host would
    // return it), and a fixed slot-commitment policy.
    const captured: number[] = [];
    const host: TilingControllerHost = {
      resolveTarget: (): DragResolvedTarget | null => seat,
      capturePointer: (pointerId: number): void => {
        h.pointerCapture.capture(pointerId);
        captured.push(pointerId);
      },
      getSlotCommitment: (): DragInputDriverSlotCommitment => ({
        mode: "delta-responsive",
        reresolveDeltaPx: 24,
      }),
    };
    const controller: TilingController = createTilingController({ host });

    controller.dispatch({
      type: "POINTER_DOWN",
      pointerId: 1,
      pointerType: "mouse",
      sourceLeafId: "A",
      anchorFootprint: { left: 100, top: 100, width: 200, height: 150 },
      pointerAnchorOffset: { x: 0, y: 0 },
      originClient: { x: 0, y: 0 },
    });
    controller.input.processPointerSample({ x: 10, y: 0 });
    expect(controller.getState().drag.phase).toBe("dragging");
    expect(controller.input.committableSeat?.leafId).toBe("C");
    expect(captured).toEqual([1]);

    controller.input.latchRelease();
    controller.input.processPointerSample({ x: 12, y: 0 }, true);
    controller.dispatch({ type: "POINTER_UP", pointerId: 1 });

    const settled: DragMachineState = controller.getState().drag;
    expect(settled.phase).toBe("settling");
    if (settled.phase === "settling") {
      expect(settled.outcome).toBe("commit");
      expect(settled.resolvedTarget?.leafId).toBe("C");
    }

    controller.dispatch({ type: "SETTLE_DONE" });
    expect(controller.getState().drag.phase).toBe("idle");
    controller.dispose();
  });
});
