import * as React from "react";
import type { HomeSkin } from "../page";
import { MOBILE_HOME_SKIN_TOKENS, type MobileHomeSkinTokens } from "./skin-tokens";
import { MOBILE_HOME_MODE_OPTIONS, type MobileHomeMode } from "./types";

/** One option in a `MobileSegmentedControl` — a stable id, a short label, and an optional `title` hint. */
export interface MobileSegmentedOption<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly description?: string;
}

// A compact, TEXT-ONLY segmented control for the mobile top strip's mode row
// (Master / Swipe / Grid) — one thin hairline-bordered group with a solid-fill
// active segment and thin dividers between segments, echoing a window-manager
// status bar's workspace switcher rather than a padded pill. The whole group is
// `flex-1` so it fills the strip's middle between the wordmark and the skin
// menu. Height-efficient (h-8) with horizontal hit padding per segment; no
// icons by design (at this size a glyph reads as noise next to a label).
export function MobileSegmentedControl<Id extends string>({
  options,
  value,
  onChange,
  skin,
  ariaLabel,
}: {
  options: ReadonlyArray<MobileSegmentedOption<Id>>;
  value: Id;
  onChange: (id: Id) => void;
  skin: HomeSkin;
  ariaLabel: string;
}): React.ReactElement {
  const tokens: MobileHomeSkinTokens = MOBILE_HOME_SKIN_TOKENS[skin];
  return (
    <div role="group" aria-label={ariaLabel} className={`flex-1 ${tokens.switcherGroup}`}>
      {options.map((option, index): React.ReactElement => {
        const active: boolean = option.id === value;
        const isLast: boolean = index === options.length - 1;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            title={option.description}
            onClick={(): void => onChange(option.id)}
            className={`min-w-0 flex-1 px-1 ${isLast ? "" : tokens.switcherDivider} ${
              active ? tokens.switcherActive : tokens.switcherInactive
            }`}
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The mobile-only layout mode switcher — a `MobileSegmentedControl` over the three concepts. */
export function MobileModeSwitcher({
  mode,
  onModeChange,
  skin,
}: {
  mode: MobileHomeMode;
  onModeChange: (mode: MobileHomeMode) => void;
  skin: HomeSkin;
}): React.ReactElement {
  return (
    <MobileSegmentedControl
      options={MOBILE_HOME_MODE_OPTIONS}
      value={mode}
      onChange={onModeChange}
      skin={skin}
      ariaLabel="mobile home layout mode"
    />
  );
}
