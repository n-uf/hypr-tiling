"use client";

/**
 * Workspace-switch transition stage (N2): freeze the outgoing viewport as a
 * DOM clone and slide / fade it against the live incoming tree.
 *
 * Designed to be wired into `TilingWorkspaceSetRendererComponent` after N1
 * lands — this module does not import the renderer. Call `begin` **before**
 * updating `activeId` (the outgoing tree unmounts on the switch; the clone
 * is the only remaining paint of it).
 */

import * as React from "react";

import {
  captureViewClone,
  WORKSPACE_TRANSITION_LAYER_ATTR,
} from "./dom-view-capture";
import { resolveWorkspaceTransition, useTilingTheme } from "./theme";
import {
  DEFAULT_WORKSPACE_TRANSITION_DURATION_MS,
  resolveTransitionMode,
  sampleTransitionEase,
  transitionTransform,
  unitProgressFromSigned,
  type TilingWorkspaceTransitionDirection,
  type TilingWorkspaceTransitionLayerStyle,
  type TilingWorkspaceTransitionMode,
  type TilingWorkspaceTransitionTransform,
} from "../engine/workspace-transition";

/** Phase of {@link useWorkspaceTransition}. */
export type WorkspaceTransitionPhase = "idle" | "scrubbing" | "settling";

/** Why the stage released the clone. */
export type WorkspaceTransitionSettleKind = "commit" | "cancel";

/**
 * Options of {@link useWorkspaceTransition}.
 *
 * `viewportRef` is the set-mode viewport root (`position: relative;
 * overflow: hidden`). `begin` clones that node.
 */
export interface UseWorkspaceTransitionOptions {
  /** Viewport whose outgoing tree is cloned on `begin`. */
  readonly viewportRef: React.RefObject<HTMLElement | null>;
  /**
   * Requested paint mode. Resolved against reduced-motion and capture
   * degradation. Default `"none"`.
   */
  readonly mode?: TilingWorkspaceTransitionMode;
  /** Timed commit / cancel duration. Default theme token or 200. */
  readonly durationMs?: number;
  /** CSS easing token (stored for hosts; the rAF path uses ease-out cubic). */
  readonly easing?: string;
  /** Fired after the clone is removed. */
  readonly onSettled?: (kind: WorkspaceTransitionSettleKind) => void;
  /**
   * Override `prefers-reduced-motion`. When omitted the hook reads
   * `matchMedia("(prefers-reduced-motion: reduce)")`.
   */
  readonly reducedMotion?: boolean;
}

/** Imperative handle returned by {@link useWorkspaceTransition}. */
export interface UseWorkspaceTransitionResult {
  /**
   * Capture the current viewport (outgoing) and arm the stage. Call
   * **before** the live tree switches to the incoming workspace. A second
   * `begin` mid-flight replaces the clone with a fresh capture.
   */
  readonly begin: (input: {
    direction: TilingWorkspaceTransitionDirection;
    mode?: TilingWorkspaceTransitionMode;
  }) => void;
  /**
   * Scrub with N1 swipe progress (`−1..1`). No timer while progress is
   * being fed. No-op until `begin`.
   */
  readonly scrub: (progress: number) => void;
  /**
   * Run the timed curve to the end (`commit`, unit progress → 1) or back
   * to the start (`cancel`, → 0), then fire `onSettled` and drop the clone.
   */
  readonly finish: (kind: WorkspaceTransitionSettleKind) => void;
  /** Current phase. */
  readonly phase: WorkspaceTransitionPhase;
  /** Resolved mode of the in-flight transition (`"none"` when idle). */
  readonly activeMode: TilingWorkspaceTransitionMode;
  /** Direction of the in-flight transition (`null` when idle). */
  readonly direction: TilingWorkspaceTransitionDirection | null;
  /** Unit progress in `[0, 1]`. */
  readonly unitProgress: number;
  /** Frozen clone (`null` when idle / `"none"` / after settle). */
  readonly outgoingNode: HTMLElement | null;
  /** Style for the clone overlay (transform + opacity). */
  readonly outgoingStyle: React.CSSProperties;
  /** Style for the live incoming wrapper (transform + opacity). */
  readonly incomingStyle: React.CSSProperties;
}

/**
 * Props of {@link WorkspaceTransitionStage}. The stage wraps the live
 * incoming tree and paints the clone as an absolutely positioned overlay.
 * Imperative control is the ref ({@link UseWorkspaceTransitionResult});
 * `progress` is the N1 swipe feed (non-null → `scrub`).
 */
export interface WorkspaceTransitionStageProps {
  /** Viewport cloned on `begin`. Typically an ancestor of this stage. */
  readonly viewportRef: React.RefObject<HTMLElement | null>;
  /** Live incoming tree. */
  readonly children?: React.ReactNode;
  /** Requested paint mode. Default `"none"`. */
  readonly mode?: TilingWorkspaceTransitionMode;
  /** Timed duration. Default theme / 200 ms. */
  readonly durationMs?: number;
  /** CSS easing token. Default theme / drag-hop easing. */
  readonly easing?: string;
  /**
   * Signed swipe progress (`−1..1`). While non-null the stage is scrubbed
   * (no timer). `finish` is still explicit.
   */
  readonly progress?: number | null;
  /** Fired after the clone is removed. */
  readonly onSettled?: (kind: WorkspaceTransitionSettleKind) => void;
  /** Override `prefers-reduced-motion` (tests / hosts that already track it). */
  readonly reducedMotion?: boolean;
  /** Optional class on the stage root. */
  readonly className?: string;
}

function layerToStyle(
  layer: TilingWorkspaceTransitionLayerStyle,
): React.CSSProperties {
  return {
    transform: layer.transform,
    opacity: layer.opacity,
  };
}

function stylesFor(
  unitProgress: number,
  direction: TilingWorkspaceTransitionDirection | null,
  mode: TilingWorkspaceTransitionMode,
): { outgoing: React.CSSProperties; incoming: React.CSSProperties } {
  if (direction == null || mode === "none") {
    const idle: TilingWorkspaceTransitionTransform = transitionTransform(
      0,
      "next",
      "none",
    );
    return {
      outgoing: layerToStyle(idle.outgoing),
      incoming: layerToStyle(idle.incoming),
    };
  }
  const sampled: TilingWorkspaceTransitionTransform = transitionTransform(
    unitProgress,
    direction,
    mode,
  );
  return {
    outgoing: layerToStyle(sampled.outgoing),
    incoming: layerToStyle(sampled.incoming),
  };
}

/**
 * Tracks `(prefers-reduced-motion: reduce)`. SSR-safe: starts `false` and
 * reconciles on mount. Local copy — the renderer exports the same hook
 * but this module must not import `tiling-renderer.tsx`.
 */
function usePrefersReducedMotion(override?: boolean): boolean {
  const [matches, setMatches] = React.useState<boolean>(override ?? false);
  React.useEffect((): (() => void) | void => {
    if (override !== undefined) {
      setMatches(override);
      return;
    }
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const query: MediaQueryList = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    setMatches(query.matches);
    const handleChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };
    query.addEventListener("change", handleChange);
    return (): void => {
      query.removeEventListener("change", handleChange);
    };
  }, [override]);
  return override ?? matches;
}

function disposeClone(node: HTMLElement | null): void {
  if (node == null) {
    return;
  }
  if (node.parentNode != null) {
    node.parentNode.removeChild(node);
  }
}

/**
 * Imperative workspace-switch transition. `begin` freezes the outgoing
 * viewport; `scrub` follows N1 swipe progress; `finish` runs the timed
 * commit / cancel curve and drops the clone.
 */
export function useWorkspaceTransition(
  options: UseWorkspaceTransitionOptions,
): UseWorkspaceTransitionResult {
  const theme = useTilingTheme();
  const themeTokens = resolveWorkspaceTransition(theme);
  const requestedMode: TilingWorkspaceTransitionMode = options.mode ?? "none";
  const durationMs: number =
    options.durationMs ?? themeTokens.durationMs ?? DEFAULT_WORKSPACE_TRANSITION_DURATION_MS;
  const reducedMotion: boolean = usePrefersReducedMotion(options.reducedMotion);
  const onSettledRef = React.useRef(options.onSettled);
  onSettledRef.current = options.onSettled;
  const viewportRef = options.viewportRef;

  const [phase, setPhase] = React.useState<WorkspaceTransitionPhase>("idle");
  const [activeMode, setActiveMode] =
    React.useState<TilingWorkspaceTransitionMode>("none");
  const [direction, setDirection] =
    React.useState<TilingWorkspaceTransitionDirection | null>(null);
  const [unitProgress, setUnitProgress] = React.useState<number>(0);
  const [outgoingNode, setOutgoingNode] = React.useState<HTMLElement | null>(
    null,
  );

  const phaseRef = React.useRef<WorkspaceTransitionPhase>(phase);
  phaseRef.current = phase;
  const activeModeRef = React.useRef<TilingWorkspaceTransitionMode>(activeMode);
  activeModeRef.current = activeMode;
  const directionRef = React.useRef<TilingWorkspaceTransitionDirection | null>(
    direction,
  );
  directionRef.current = direction;
  const unitProgressRef = React.useRef<number>(unitProgress);
  unitProgressRef.current = unitProgress;
  const outgoingNodeRef = React.useRef<HTMLElement | null>(outgoingNode);
  outgoingNodeRef.current = outgoingNode;
  const requestedModeRef = React.useRef<TilingWorkspaceTransitionMode>(
    requestedMode,
  );
  requestedModeRef.current = requestedMode;
  const reducedMotionRef = React.useRef<boolean>(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const durationMsRef = React.useRef<number>(durationMs);
  durationMsRef.current = durationMs;
  const rafRef = React.useRef<number | null>(null);

  const cancelRaf = React.useCallback((): void => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const releaseClone = React.useCallback((): void => {
    disposeClone(outgoingNodeRef.current);
    outgoingNodeRef.current = null;
    setOutgoingNode(null);
  }, []);

  const settle = React.useCallback(
    (kind: WorkspaceTransitionSettleKind): void => {
      cancelRaf();
      releaseClone();
      phaseRef.current = "idle";
      activeModeRef.current = "none";
      directionRef.current = null;
      unitProgressRef.current = 0;
      setPhase("idle");
      setActiveMode("none");
      setDirection(null);
      setUnitProgress(0);
      onSettledRef.current?.(kind);
    },
    [cancelRaf, releaseClone],
  );

  const begin = React.useCallback(
    (input: {
      direction: TilingWorkspaceTransitionDirection;
      mode?: TilingWorkspaceTransitionMode;
    }): void => {
      cancelRaf();
      releaseClone();
      const requested: TilingWorkspaceTransitionMode =
        input.mode ?? requestedModeRef.current;
      const viewport: HTMLElement | null = viewportRef.current;
      const withoutCapture: TilingWorkspaceTransitionMode = resolveTransitionMode(
        requested,
        { reducedMotion: reducedMotionRef.current, degraded: false },
      );
      if (withoutCapture === "none" || viewport == null) {
        phaseRef.current = "idle";
        activeModeRef.current = "none";
        directionRef.current = input.direction;
        unitProgressRef.current = 0;
        setPhase("idle");
        setActiveMode("none");
        setDirection(input.direction);
        setUnitProgress(0);
        return;
      }
      const captured = captureViewClone(viewport);
      const resolved: TilingWorkspaceTransitionMode = resolveTransitionMode(
        requested,
        {
          reducedMotion: reducedMotionRef.current,
          degraded: captured.degraded,
        },
      );
      if (resolved === "none") {
        disposeClone(captured.node);
        phaseRef.current = "idle";
        activeModeRef.current = "none";
        directionRef.current = input.direction;
        unitProgressRef.current = 0;
        setPhase("idle");
        setActiveMode("none");
        setDirection(input.direction);
        setUnitProgress(0);
        return;
      }
      outgoingNodeRef.current = captured.node;
      phaseRef.current = "scrubbing";
      activeModeRef.current = resolved;
      directionRef.current = input.direction;
      unitProgressRef.current = 0;
      setOutgoingNode(captured.node);
      setPhase("scrubbing");
      setActiveMode(resolved);
      setDirection(input.direction);
      setUnitProgress(0);
    },
    [cancelRaf, releaseClone, viewportRef],
  );

  const scrub = React.useCallback((progress: number): void => {
    const currentDirection: TilingWorkspaceTransitionDirection | null =
      directionRef.current;
    if (currentDirection == null || activeModeRef.current === "none") {
      return;
    }
    if (outgoingNodeRef.current == null) {
      return;
    }
    cancelRaf();
    const unit: number = unitProgressFromSigned(progress, currentDirection);
    unitProgressRef.current = unit;
    phaseRef.current = "scrubbing";
    setUnitProgress(unit);
    setPhase("scrubbing");
  }, [cancelRaf]);

  const finish = React.useCallback(
    (kind: WorkspaceTransitionSettleKind): void => {
      const currentDirection: TilingWorkspaceTransitionDirection | null =
        directionRef.current;
      const currentMode: TilingWorkspaceTransitionMode = activeModeRef.current;
      if (currentDirection == null) {
        return;
      }
      if (currentMode === "none" || outgoingNodeRef.current == null) {
        settle(kind);
        return;
      }
      const target: number = kind === "commit" ? 1 : 0;
      const from: number = unitProgressRef.current;
      const duration: number = durationMsRef.current;
      cancelRaf();
      if (duration <= 0 || from === target) {
        unitProgressRef.current = target;
        setUnitProgress(target);
        settle(kind);
        return;
      }
      phaseRef.current = "settling";
      setPhase("settling");
      const startedAt: number = performance.now();
      const tick = (now: number): void => {
        const t: number = Math.min(1, (now - startedAt) / duration);
        const eased: number = sampleTransitionEase(t);
        const next: number = from + (target - from) * eased;
        unitProgressRef.current = next;
        setUnitProgress(next);
        if (t >= 1) {
          rafRef.current = null;
          settle(kind);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [cancelRaf, settle],
  );

  React.useEffect((): (() => void) => {
    return (): void => {
      cancelRaf();
      disposeClone(outgoingNodeRef.current);
      outgoingNodeRef.current = null;
    };
  }, [cancelRaf]);

  const painted = stylesFor(unitProgress, direction, activeMode);

  return {
    begin,
    scrub,
    finish,
    phase,
    activeMode,
    direction,
    unitProgress,
    outgoingNode,
    outgoingStyle: painted.outgoing,
    incomingStyle: painted.incoming,
  };
}

const STAGE_ROOT_STYLE: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

const LAYER_BASE_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  zIndex: 1,
};

const INCOMING_BASE_STYLE: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  zIndex: 0,
};

/**
 * Visual workspace-switch stage: an absolutely positioned overlay (the
 * frozen outgoing clone) over the live incoming tree. Drive it through the
 * imperative ref (`begin` / `scrub` / `finish`) or feed N1 `progress`.
 */
export const WorkspaceTransitionStage = React.forwardRef<
  UseWorkspaceTransitionResult,
  WorkspaceTransitionStageProps
>(function WorkspaceTransitionStage(
  props: WorkspaceTransitionStageProps,
  ref: React.ForwardedRef<UseWorkspaceTransitionResult>,
): React.ReactElement {
  const transition = useWorkspaceTransition({
    viewportRef: props.viewportRef,
    mode: props.mode,
    durationMs: props.durationMs,
    easing: props.easing,
    onSettled: props.onSettled,
    reducedMotion: props.reducedMotion,
  });

  React.useImperativeHandle(ref, (): UseWorkspaceTransitionResult => transition, [
    transition,
  ]);

  const progress: number | null | undefined = props.progress;
  const scrub: UseWorkspaceTransitionResult["scrub"] = transition.scrub;
  React.useEffect((): void => {
    if (progress == null) {
      return;
    }
    scrub(progress);
  }, [progress, scrub]);

  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const outgoingNode: HTMLElement | null = transition.outgoingNode;
  React.useLayoutEffect((): (() => void) => {
    const host: HTMLDivElement | null = overlayRef.current;
    if (host == null) {
      return (): void => {};
    }
    host.replaceChildren();
    if (outgoingNode != null) {
      host.appendChild(outgoingNode);
    }
    return (): void => {
      host.replaceChildren();
    };
  }, [outgoingNode]);

  const showOverlay: boolean = outgoingNode != null;
  const motionStyle: React.CSSProperties | undefined =
    transition.phase === "idle"
      ? undefined
      : { willChange: "transform, opacity" };

  return (
    <div
      className={props.className}
      data-hpt-workspace-transition=""
      style={STAGE_ROOT_STYLE}
    >
      <div
        data-hpt-workspace-transition-incoming=""
        style={{
          ...INCOMING_BASE_STYLE,
          ...transition.incomingStyle,
          ...motionStyle,
        }}
      >
        {props.children}
      </div>
      {showOverlay ? (
        <div
          ref={overlayRef}
          aria-hidden="true"
          {...{ [WORKSPACE_TRANSITION_LAYER_ATTR]: "" }}
          style={{
            ...LAYER_BASE_STYLE,
            ...transition.outgoingStyle,
            ...motionStyle,
          }}
        />
      ) : (
        <div ref={overlayRef} hidden data-hpt-workspace-transition-slot="" />
      )}
    </div>
  );
});
