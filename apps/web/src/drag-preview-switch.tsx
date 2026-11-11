import * as React from "react";
import type { TilingDragPreview } from "@n-uf/hypr-tiling";

/** The two drop previews, in the order the switch shows them, with what each does. */
export const DRAG_PREVIEW_OPTIONS: ReadonlyArray<{
  id: TilingDragPreview;
  label: string;
  hint: string;
}> = [
  {
    id: "snap",
    label: "Snap to slot",
    hint: "A dragged pane snaps into the slot under the pointer; the others make room.",
  },
  {
    id: "indicator",
    label: "Indicator",
    hint: "A dragged pane stays under the pointer; an outline marks where it will land.",
  },
];

/**
 * The top bar's drop-preview switch, the same segmented pills as the skin
 * switch beside it: "drop" then one pill per preview, the active one pressed.
 * The bar's per-skin tokens style it, so it matches every skin.
 */
export function DragPreviewSwitch({
  preview,
  onChange,
  className,
  labelClassName,
  activeClassName,
  inactiveClassName,
}: {
  preview: TilingDragPreview;
  onChange: (next: TilingDragPreview) => void;
  className: string;
  labelClassName: string;
  activeClassName: string;
  inactiveClassName: string;
}): React.ReactElement {
  return (
    <div role="group" aria-label="Drop preview" className={className} data-drag-preview={preview}>
      <span aria-hidden className={labelClassName}>
        drop
      </span>
      {DRAG_PREVIEW_OPTIONS.map((option): React.ReactElement => {
        const active: boolean = option.id === preview;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            title={option.hint}
            onClick={(): void => onChange(option.id)}
            className={active ? activeClassName : inactiveClassName}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
