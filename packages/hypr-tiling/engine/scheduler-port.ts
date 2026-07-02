/**
 * `SchedulerPort` — the unified frame + timer + clock capability the tiling core
 * needs from its host. It is the **superset-merge** of the three scheduler shapes
 * the codebase grew independently:
 *
 *   - `FrameScheduler` (`drag-machine.ts:FrameScheduler`, `{request,cancel}`) —
 *     the rAF coalescer's frame source.
 *   - `FrameOrTimeoutScheduler` (`drag-recovery.ts:FrameOrTimeoutScheduler`,
 *     `{requestFrame,cancelFrame,setTimer,clearTimer}`) — M1's rAF-with-timeout
 *     race.
 *   - `TimerScheduler` (`drag-recovery.ts:TimerScheduler`,
 *     `{setTimer,clearTimer}`) — M2/M3's timer-only watchdog + transition-settle.
 *   - `monotonicNow` — the idle-watchdog clock.
 *
 * The narrow per-primitive interfaces remain the parameter types of the core
 * functions (so their unit tests keep driving controllable fakes), and a
 * `SchedulerPort` is **structurally assignable** to `FrameOrTimeoutScheduler`
 * (it has `requestFrame`/`cancelFrame`/`setTimer`/`clearTimer`) and to
 * `TimerScheduler` (it has `setTimer`/`clearTimer`). The only name mismatch is
 * `FrameScheduler`'s `request`/`cancel`, which a host bridges to
 * `requestFrame`/`cancelFrame` at the coalescer call-site.
 *
 * The default host adapter is `react/window-scheduler-port.ts`
 * (`createWindowSchedulerPort`), which repackages the existing `window`-backed
 * constants identity-preservingly.
 */
export interface SchedulerPort {
  /** Schedule `callback` on the next animation frame; returns a cancel handle. */
  requestFrame(callback: () => void): number;
  /** Cancel a frame previously scheduled via {@link SchedulerPort.requestFrame}. */
  cancelFrame(handle: number): void;
  /** Schedule `callback` after `ms`; returns a cancel handle. */
  setTimer(callback: () => void, ms: number): number;
  /** Cancel a timer previously scheduled via {@link SchedulerPort.setTimer}. */
  clearTimer(handle: number): void;
  /** Monotonic clock reading in milliseconds (for the idle watchdog). */
  now(): number;
}
