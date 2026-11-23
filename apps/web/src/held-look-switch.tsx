import * as React from "react";
import type { TilingDragPreview, TilingHeldLook } from "@n-uf/hypr-tiling";
import { useIsHydrating } from "./home-first-paint";

/** The held pane's looks while dragged, in the order the switch shows them, with what each does. */
export const HELD_LOOK_OPTIONS: ReadonlyArray<{
  id: TilingHeldLook;
  label: string;
  hint: string;
}> = [
  {
    id: "auto",
    label: "Auto",
    hint: "While dragged, a pane folds to its title bar (a thumbnail when it has none).",
  },
  {
    id: "title-bar",
    label: "Title bar",
    hint: "While dragged, a pane folds to its title bar at the pointer.",
  },
  {
    id: "thumbnail",
    label: "Thumbnail",
    hint: "While dragged, a pane shrinks to a small copy around the pointer.",
  },
  {
    id: "fade",
    label: "Fade",
    hint: "While dragged, a pane fades, and the landing outline draws above it.",
  },
  {
    id: "none",
    label: "Full size",
    hint: "The original look: the dragged pane keeps its full size everywhere.",
  },
];

// Namespaced so it never collides with another app's key sharing the origin
// (same convention as the drop preview, `drag-preview-storage.ts`).
const STORAGE_KEY: string = "hypr-tiling-web.home-held-look";

/** The home's held look until the visitor picks one: the renderer's default. */
export const DEFAULT_HOME_HELD_LOOK: TilingHeldLook = "auto";

function isHeldLook(value: string): value is TilingHeldLook {
  return HELD_LOOK_OPTIONS.some((option): boolean => option.id === value);
}

/**
 * Whether a look suits a drop preview. Snap to slot draws the landing itself,
 * with no outline for a faded pane to show through, so the fade (a see-through
 * pane over live content) is the indicator's alone.
 */
export function heldLookFits(look: TilingHeldLook, preview: TilingDragPreview): boolean {
  return preview !== "snap" || look !== "fade";
}

/** Read the persisted held look, falling back to the default when unset or invalid. */
export function readStoredHeldLook(): TilingHeldLook {
  if (typeof window === "undefined") {
    return DEFAULT_HOME_HELD_LOOK;
  }
  try {
    const raw: string | null = window.localStorage.getItem(STORAGE_KEY);
    if (raw != null && isHeldLook(raw)) {
      return raw;
    }
  } catch {
    // Storage access can throw (private browsing, disabled storage).
  }
  return DEFAULT_HOME_HELD_LOOK;
}

function writeStoredHeldLook(look: TilingHeldLook): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, look);
  } catch {
    // Ignore storage write failures: the look still works for the session.
  }
}

/**
 * The home's held look and its setter (which persists the choice). The
 * prerendered home starts at the default; the stored choice applies right
 * after hydration. A look that doesn't suit the drop preview
 * ({@link heldLookFits}) falls back to the default, and that is stored: so
 * switching to snap with the fade picked leaves "auto".
 */
export function useHomeHeldLook(preview: TilingDragPreview): readonly [
  TilingHeldLook,
  (next: TilingHeldLook) => void,
] {
  const hydrating: boolean = useIsHydrating();
  const [look, setLook] = React.useState<TilingHeldLook>(
    (): TilingHeldLook => (hydrating ? DEFAULT_HOME_HELD_LOOK : readStoredHeldLook()),
  );
  React.useEffect((): void => {
    setLook(readStoredHeldLook());
  }, []);
  const changeLook = React.useCallback((next: TilingHeldLook): void => {
    setLook(next);
    writeStoredHeldLook(next);
  }, []);
  React.useEffect((): void => {
    if (!heldLookFits(look, preview)) {
      changeLook(DEFAULT_HOME_HELD_LOOK);
    }
  }, [look, preview, changeLook]);
  return [heldLookFits(look, preview) ? look : DEFAULT_HOME_HELD_LOOK, changeLook];
}

/**
 * The top bar's held-look switch, in the drop and skin switches' group style:
 * "held" then a menu of the five looks (five pills would take the room the
 * workspace tabs need).
 */
export function HeldLookSwitch({
  look,
  preview,
  onChange,
  className,
  labelClassName,
  selectClassName,
}: {
  look: TilingHeldLook;
  /** The drop preview: the menu offers only the looks that suit it. */
  preview: TilingDragPreview;
  onChange: (next: TilingHeldLook) => void;
  className: string;
  labelClassName: string;
  selectClassName: string;
}): React.ReactElement {
  const current = HELD_LOOK_OPTIONS.find((option): boolean => option.id === look);
  return (
    <div role="group" aria-label="Dragged pane look" className={className} data-held-look={look}>
      <span aria-hidden className={labelClassName}>
        held
      </span>
      <select
        aria-label="Dragged pane look"
        title={current?.hint}
        value={look}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => {
          if (isHeldLook(event.target.value)) {
            onChange(event.target.value);
          }
        }}
        className={selectClassName}
      >
        {HELD_LOOK_OPTIONS.filter((option): boolean => heldLookFits(option.id, preview)).map(
          (option): React.ReactElement => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ),
        )}
      </select>
    </div>
  );
}
