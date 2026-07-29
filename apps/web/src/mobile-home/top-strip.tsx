import * as React from "react";
import type { HomeSkin } from "../page";
import { MobileModeSwitcher } from "./mode-switcher";
import { MOBILE_HOME_SKIN_TOKENS, type MobileHomeSkinTokens } from "./skin-tokens";
import type { MobileHomeMode } from "./types";

// The mobile home's ENTIRE top chrome: one thin (~44px) status-bar row —
// wordmark · mode segments · skin menu — replacing the desktop's stacked
// wordmark/tab-rail/skin card. Everything the desktop bar did on a phone
// (pane tabs, skin pills) is either owned by each concept's own in-content
// navigation or folded into the overflow menu here, so the row stays a single
// hairline strip and the content below owns the viewport.

interface MobileSkinOption {
  readonly id: HomeSkin;
  readonly label: string;
}

const MOBILE_SKIN_OPTIONS: ReadonlyArray<MobileSkinOption> = [
  { id: "mosaic", label: "Mosaic" },
  { id: "editorial", label: "Editorial" },
  { id: "canvas", label: "Canvas" },
];

// The skin switch, tucked into a single overflow control ("Mosaic ▾") so it
// costs one button's width instead of a full second row of pills. Opens a small
// floating panel of the three skins; closes on select, outside pointer, or Esc.
function MobileSkinMenu({
  skin,
  onSkinChange,
}: {
  skin: HomeSkin;
  onSkinChange: (next: HomeSkin) => void;
}): React.ReactElement {
  const tokens: MobileHomeSkinTokens = MOBILE_HOME_SKIN_TOKENS[skin];
  const [open, setOpen] = React.useState<boolean>(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect((): void | (() => void) => {
    if (!open) {
      return;
    }
    const onDocPointerDown = (event: PointerEvent): void => {
      if (rootRef.current != null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return (): void => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeLabel: string =
    MOBILE_SKIN_OPTIONS.find((option): boolean => option.id === skin)?.label ?? skin;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`skin: ${activeLabel}`}
        onClick={(): void => setOpen((prev: boolean): boolean => !prev)}
        className={tokens.menuButton}
      >
        <span>{activeLabel}</span>
        <span aria-hidden className="opacity-60">
          {"\u25be"}
        </span>
      </button>
      {open ? (
        <div role="menu" aria-label="Site skin" className={tokens.menuPanel}>
          {MOBILE_SKIN_OPTIONS.map((option): React.ReactElement => {
            const active: boolean = option.id === skin;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={(): void => {
                  onSkinChange(option.id);
                  setOpen(false);
                }}
                className={active ? tokens.menuItemActive : tokens.menuItem}
              >
                <span>{option.label}</span>
                {active ? <span aria-hidden>{"\u2713"}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function MobileTopStrip({
  skin,
  onSkinChange,
  mode,
  onModeChange,
}: {
  skin: HomeSkin;
  onSkinChange: (next: HomeSkin) => void;
  mode: MobileHomeMode;
  onModeChange: (mode: MobileHomeMode) => void;
}): React.ReactElement {
  const tokens: MobileHomeSkinTokens = MOBILE_HOME_SKIN_TOKENS[skin];
  return (
    <div className={tokens.topStrip}>
      <div aria-label="hypr tiling" className={tokens.wordmark}>
        hypr
      </div>
      <MobileModeSwitcher mode={mode} onModeChange={onModeChange} skin={skin} />
      <MobileSkinMenu skin={skin} onSkinChange={onSkinChange} />
    </div>
  );
}
