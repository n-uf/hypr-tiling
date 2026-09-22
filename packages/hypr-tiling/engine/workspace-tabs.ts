/**
 * Framework-free model behind a workspace tab strip: the drop-target hit-test
 * that produces a {@link TilingWorkspaceTabDragHover} from measured tab rects
 * (so a host never writes its own), and the roving-focus keyboard model the
 * headless `useTilingWorkspaceTabs` hook drives. Pure functions only.
 */
import type {
  TilingClientPoint,
  TilingWorkspacePlacement,
  TilingWorkspaceTabDragHover,
} from "./types";

/** A window-client rectangle (CSS px), the `DOMRect` subset the hit-test reads. */
export interface TilingClientRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** One workspace tab registered as a drop target: its id, workspace and measured rect. */
export interface TilingWorkspaceTabTarget {
  /** The tab's own id — what `TilingExternalDragHover.targetId` / the `ghostChip` slot receive. */
  readonly targetId: string;
  /** The workspace the tab stands for (the `moveLeafToWorkspace` destination). */
  readonly workspaceId: string;
  /** Where the tab sits, in window-client coordinates. */
  readonly rect: TilingClientRect;
  /** Where a dropped leaf lands in that workspace. Undefined → root, second side. */
  readonly placement?: TilingWorkspacePlacement;
}

/** Whether `point` lies inside `rect` (edges inclusive). */
export function clientRectContains(rect: TilingClientRect, point: TilingClientPoint): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

/**
 * The workspace-tab hover for `point`, or `null` when it is over no tab. The
 * FIRST target (in `targets` order) containing the point wins, so overlapping
 * rects resolve deterministically. Pure; returns a fresh hover object.
 */
export function resolveWorkspaceTabHover(
  targets: ReadonlyArray<TilingWorkspaceTabTarget>,
  point: TilingClientPoint,
): TilingWorkspaceTabDragHover | null {
  for (const target of targets) {
    if (clientRectContains(target.rect, point)) {
      return {
        kind: "workspace-tab",
        targetId: target.targetId,
        workspaceId: target.workspaceId,
        point,
        ...(target.placement === undefined ? {} : { placement: target.placement }),
      };
    }
  }
  return null;
}
