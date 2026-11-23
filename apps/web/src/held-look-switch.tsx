import * as React from "react";
import type { TilingHeldOverTarget } from "@n-uf/hypr-tiling";
import { useIsHydrating } from "./home-first-paint";

/** The held pane's looks over a target, in the order the switch shows them, with what each does. */
export const HELD_LOOK_OPTIONS: ReadonlyArray<{
  id: TilingHeldOverTarget;
  label: string;
  hint: string;
}> = [
  {
    id: "auto",
    label: "Auto",
    hint: "Over a drop target the dragged pane folds to its title bar (a thumbnail when it has none).",
  },
  {
    id: "title-bar",
    label: "Title bar",
    hint: "Over a drop target the dragged pane folds to its title bar at the pointer.",
  },
  {
    id: "thumbnail",
    label: "Thumbnail",
    hint: "Over a drop target the dragged pane shrinks to a small copy around the pointer.",
  },
  {
    id: "fade",
    label: "Fade",
    hint: "Over a drop target the dragged pane fades, and the landing outline draws above it.",
  },
  {
    id: "none",
    label: "Off",
    hint: "The dragged pane keeps its full look everywhere.",
  },
];

// Namespaced so it never collides with another app's key sharing the origin
// (same convention as the drop preview, `drag-preview-storage.ts`).
const STORAGE_KEY: string = "hypr-tiling-web.home-held-look";

/** The home's held look until the visitor picks one: the renderer's default. */
export const DEFAULT_HOME_HELD_LOOK: TilingHeldOverTarget = "auto";

function isHeldLook(value: string): value is TilingHeldOverTarget {
  return HELD_LOOK_OPTIONS.some((option): boolean => option.id === value);
}

/** Read the persisted held look, falling back to the default when unset or invalid. */
export function readStoredHeldLook(): TilingHeldOverTarget {
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

function writeStoredHeldLook(look: TilingHeldOverTarget): void {
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
 * after hydration.
 */
export function useHomeHeldLook(): readonly [
  TilingHeldOverTarget,
  (next: TilingHeldOverTarget) => void,
] {
  const hydrating: boolean = useIsHydrating();
  const [look, setLook] = React.useState<TilingHeldOverTarget>(
    (): TilingHeldOverTarget => (hydrating ? DEFAULT_HOME_HELD_LOOK : readStoredHeldLook()),
  );
  React.useEffect((): void => {
    setLook(readStoredHeldLook());
  }, []);
  const changeLook = React.useCallback((next: TilingHeldOverTarget): void => {
    setLook(next);
    writeStoredHeldLook(next);
  }, []);
  return [look, changeLook];
}

/**
 * The top bar's held-look switch, in the drop and skin switches' group style:
 * "held" then a menu of the five looks (five pills would take the room the
 * workspace tabs need).
 */
export function HeldLookSwitch({
  look,
  onChange,
  className,
  labelClassName,
  selectClassName,
}: {
  look: TilingHeldOverTarget;
  onChange: (next: TilingHeldOverTarget) => void;
  className: string;
  labelClassName: string;
  selectClassName: string;
}): React.ReactElement {
  const current = HELD_LOOK_OPTIONS.find((option): boolean => option.id === look);
  return (
    <div role="group" aria-label="Dragged pane over a target" className={className} data-held-look={look}>
      <span aria-hidden className={labelClassName}>
        held
      </span>
      <select
        aria-label="Dragged pane over a target"
        title={current?.hint}
        value={look}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => {
          if (isHeldLook(event.target.value)) {
            onChange(event.target.value);
          }
        }}
        className={selectClassName}
      >
        {HELD_LOOK_OPTIONS.map(
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
