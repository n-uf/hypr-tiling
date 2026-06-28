import { describe, expect, it } from "@jest/globals";
import {
  STATIC_DASHBOARD_INTERACTION,
  TILING_INTERACTION_CAPABILITY_DEFAULTS,
  isResizeAxisEnabled,
  resolveInteractionCapabilities,
} from "../interaction-capabilities";
import { TILING_KEYMAP_DEFAULTS } from "../pane-switching";
import type {
  DynamicSplitAxis,
  ResolvedTilingInteractionCapabilities,
  TilingResizeCapability,
} from "../types";

const RESOLVED_DEFAULTS: ResolvedTilingInteractionCapabilities = {
  resize: "both",
  resizeHandlesVisible: false,
  rearrange: true,
  dragMode: "live",
  slotCommitment: { mode: "delta-responsive", reresolveDeltaPx: 24 },
  touchDrag: { enable: true, longPressMs: 220 },
  customCursor: true,
  ghostPickupScalePercent: 90,
  coherentTransit: true,
  focus: true,
  maximize: { enable: true },
  paneSwitching: { enable: true, showTabStrip: true, showSwitcherOverlay: true },
  paneTitleBarControls: { sizing: true, acquireSpace: true },
  dropHitZoneGeometry: {
    centerRatio: 0.34,
    centerRatioX: 0.34,
    centerRatioY: 0.34,
    centerMinPx: 24,
    hysteresisPx: 6,
  },
  keymap: TILING_KEYMAP_DEFAULTS,
  keyBindings: { bindings: [], replaceDefaults: false },
  masterLayout: true,
  grouping: true,
};

describe("resolveInteractionCapabilities (defaulting)", (): void => {
  it("resolves undefined to the all-enabled default", (): void => {
    const resolved: ResolvedTilingInteractionCapabilities = resolveInteractionCapabilities(undefined);
    expect(resolved).toEqual(RESOLVED_DEFAULTS);
    expect(resolved).toEqual(TILING_INTERACTION_CAPABILITY_DEFAULTS);
  });

  it("resolves null to the all-enabled default", (): void => {
    expect(resolveInteractionCapabilities(null)).toEqual(RESOLVED_DEFAULTS);
  });

  it("resolves an empty object to the all-enabled default", (): void => {
    expect(resolveInteractionCapabilities({})).toEqual(RESOLVED_DEFAULTS);
  });

  it("merges a partial resize override over the defaults", (): void => {
    expect(resolveInteractionCapabilities({ resize: "horizontal" })).toEqual({
      ...RESOLVED_DEFAULTS,
      resize: "horizontal",
    });
  });

  it("defaults divider-handle rendering to hidden and preserves explicit visibility toggles", (): void => {
    expect(resolveInteractionCapabilities(undefined).resizeHandlesVisible).toBe(false);
    expect(resolveInteractionCapabilities({}).resizeHandlesVisible).toBe(false);
    expect(resolveInteractionCapabilities({ resizeHandlesVisible: true })).toEqual({
      ...RESOLVED_DEFAULTS,
      resizeHandlesVisible: true,
    });
  });

  it("preserves an explicit false (not overridden by the default)", (): void => {
    expect(resolveInteractionCapabilities({ rearrange: false })).toEqual({
      ...RESOLVED_DEFAULTS,
      rearrange: false,
    });
    expect(resolveInteractionCapabilities({ focus: false })).toEqual({
      ...RESOLVED_DEFAULTS,
      focus: false,
    });
    expect(resolveInteractionCapabilities({ customCursor: false })).toEqual({
      ...RESOLVED_DEFAULTS,
      customCursor: false,
    });
  });

  it("defaults customCursor to true when undefined (custom drag cursor on)", (): void => {
    expect(resolveInteractionCapabilities(undefined).customCursor).toBe(true);
    expect(resolveInteractionCapabilities({}).customCursor).toBe(true);
  });

  it("defaults ghostPickupScalePercent to 90 and coherentTransit to true", (): void => {
    expect(resolveInteractionCapabilities(undefined).ghostPickupScalePercent).toBe(90);
    expect(resolveInteractionCapabilities({}).coherentTransit).toBe(true);
  });

  it("clamps an out-of-range ghostPickupScalePercent into [10, 150]", (): void => {
    expect(resolveInteractionCapabilities({ ghostPickupScalePercent: 5 }).ghostPickupScalePercent).toBe(10);
    expect(resolveInteractionCapabilities({ ghostPickupScalePercent: 400 }).ghostPickupScalePercent).toBe(150);
    expect(resolveInteractionCapabilities({ ghostPickupScalePercent: 120 }).ghostPickupScalePercent).toBe(120);
  });

  it("preserves an explicit coherentTransit false (not overridden by the default)", (): void => {
    expect(resolveInteractionCapabilities({ coherentTransit: false })).toEqual({
      ...RESOLVED_DEFAULTS,
      coherentTransit: false,
    });
  });

  it("is idempotent across the new fields (re-resolving a resolved object)", (): void => {
    const once: ResolvedTilingInteractionCapabilities = resolveInteractionCapabilities({
      ghostPickupScalePercent: 75,
      coherentTransit: false,
    });
    expect(resolveInteractionCapabilities(once)).toEqual(once);
  });

  it("defaults touchDrag to enabled with a 220ms long-press", (): void => {
    expect(resolveInteractionCapabilities(undefined).touchDrag).toEqual({ enable: true, longPressMs: 220 });
    expect(resolveInteractionCapabilities({}).touchDrag).toEqual({ enable: true, longPressMs: 220 });
  });

  it("preserves an explicit touchDrag disable (touch reserved for tap/scroll)", (): void => {
    expect(resolveInteractionCapabilities({ touchDrag: { enable: false } })).toEqual({
      ...RESOLVED_DEFAULTS,
      touchDrag: { enable: false, longPressMs: 220 },
    });
  });

  it("merges a custom long-press delay, keeping enable defaulted on", (): void => {
    expect(resolveInteractionCapabilities({ touchDrag: { longPressMs: 350 } }).touchDrag).toEqual({
      enable: true,
      longPressMs: 350,
    });
  });

  it("clamps a negative long-press delay to 0 (a timer cannot fire before t=0)", (): void => {
    expect(resolveInteractionCapabilities({ touchDrag: { longPressMs: -40 } }).touchDrag.longPressMs).toBe(0);
  });

  it("is idempotent over touchDrag (re-resolving a resolved touchDrag object)", (): void => {
    const once: ResolvedTilingInteractionCapabilities = resolveInteractionCapabilities({
      touchDrag: { enable: false, longPressMs: 300 },
    });
    expect(resolveInteractionCapabilities(once)).toEqual(once);
  });

  it("merges multiple overrides at once", (): void => {
    expect(resolveInteractionCapabilities({ resize: "none", rearrange: false, focus: false })).toEqual({
      ...RESOLVED_DEFAULTS,
      resize: "none",
      rearrange: false,
      focus: false,
    });
  });

  it("defaults dragMode to \"live\" when undefined", (): void => {
    expect(resolveInteractionCapabilities(undefined).dragMode).toBe("live");
    expect(resolveInteractionCapabilities({}).dragMode).toBe("live");
    expect(resolveInteractionCapabilities({ rearrange: true }).dragMode).toBe("live");
  });

  it("preserves an explicit dragMode \"live\" (idempotent with the default)", (): void => {
    expect(resolveInteractionCapabilities({ dragMode: "live" })).toEqual(RESOLVED_DEFAULTS);
  });

  it("merges a partial dragMode override without disturbing other fields", (): void => {
    expect(resolveInteractionCapabilities({ dragMode: "live", rearrange: false })).toEqual({
      ...RESOLVED_DEFAULTS,
      dragMode: "live",
      rearrange: false,
    });
  });

  it("preserves an explicit dragMode \"preview\" (overrides the live default)", (): void => {
    expect(resolveInteractionCapabilities({ dragMode: "preview" })).toEqual({
      ...RESOLVED_DEFAULTS,
      dragMode: "preview",
    });
  });

  it("preserves an explicit maximize disable", (): void => {
    expect(resolveInteractionCapabilities({ maximize: { enable: false } })).toEqual({
      ...RESOLVED_DEFAULTS,
      maximize: { enable: false },
    });
  });

  it("preserves an explicit pane-switching disable, tab-strip hide, and switcher-overlay hide", (): void => {
    expect(resolveInteractionCapabilities({ paneSwitching: { enable: false } })).toEqual({
      ...RESOLVED_DEFAULTS,
      paneSwitching: { enable: false, showTabStrip: true, showSwitcherOverlay: true },
    });
    expect(resolveInteractionCapabilities({ paneSwitching: { showTabStrip: false } })).toEqual({
      ...RESOLVED_DEFAULTS,
      paneSwitching: { enable: true, showTabStrip: false, showSwitcherOverlay: true },
    });
    expect(resolveInteractionCapabilities({ paneSwitching: { showSwitcherOverlay: false } })).toEqual({
      ...RESOLVED_DEFAULTS,
      paneSwitching: { enable: true, showTabStrip: true, showSwitcherOverlay: false },
    });
  });

  it("applies a top-level keymap override (code-based)", (): void => {
    const resolved: ResolvedTilingInteractionCapabilities = resolveInteractionCapabilities({
      keymap: { nextPane: { code: "PageDown", ctrl: true } },
    });
    expect(resolved.keymap.nextPane).toEqual({
      code: "PageDown",
      alt: false,
      ctrl: true,
      meta: false,
      shift: false,
    });
    expect(resolved.keymap.previousPane).toEqual(TILING_KEYMAP_DEFAULTS.previousPane);
  });

  it("lets a capability-level keymap override win over the top-level keymap", (): void => {
    const resolved: ResolvedTilingInteractionCapabilities = resolveInteractionCapabilities({
      keymap: { toggleMaximize: { code: "KeyM", alt: true } },
      maximize: { enable: true, keymap: { toggleMaximize: { code: "KeyF", meta: true } } },
    });
    expect(resolved.keymap.toggleMaximize).toEqual({
      code: "KeyF",
      alt: false,
      ctrl: false,
      meta: true,
      shift: false,
    });
  });

  it("defaults paneTitleBarControls to both-enabled when undefined", (): void => {
    expect(resolveInteractionCapabilities(undefined).paneTitleBarControls).toEqual({
      sizing: true,
      acquireSpace: true,
    });
    expect(resolveInteractionCapabilities({}).paneTitleBarControls).toEqual({
      sizing: true,
      acquireSpace: true,
    });
  });

  it("preserves an explicit paneTitleBarControls disable per group", (): void => {
    expect(resolveInteractionCapabilities({ paneTitleBarControls: { sizing: false } })).toEqual({
      ...RESOLVED_DEFAULTS,
      paneTitleBarControls: { sizing: false, acquireSpace: true },
    });
    expect(resolveInteractionCapabilities({ paneTitleBarControls: { acquireSpace: false } })).toEqual({
      ...RESOLVED_DEFAULTS,
      paneTitleBarControls: { sizing: true, acquireSpace: false },
    });
    expect(
      resolveInteractionCapabilities({ paneTitleBarControls: { sizing: false, acquireSpace: false } }),
    ).toEqual({
      ...RESOLVED_DEFAULTS,
      paneTitleBarControls: { sizing: false, acquireSpace: false },
    });
  });

  it("defaults slotCommitment to delta-responsive / 24px when undefined", (): void => {
    expect(resolveInteractionCapabilities(undefined).slotCommitment).toEqual({
      mode: "delta-responsive",
      reresolveDeltaPx: 24,
    });
    expect(resolveInteractionCapabilities({}).slotCommitment).toEqual({
      mode: "delta-responsive",
      reresolveDeltaPx: 24,
    });
  });

  it("preserves an explicit slotCommitment mode + delta (field-by-field nullish merge)", (): void => {
    expect(resolveInteractionCapabilities({ slotCommitment: { mode: "zone-exit-hold" } })).toEqual({
      ...RESOLVED_DEFAULTS,
      slotCommitment: { mode: "zone-exit-hold", reresolveDeltaPx: 24 },
    });
    expect(resolveInteractionCapabilities({ slotCommitment: { reresolveDeltaPx: 12 } })).toEqual({
      ...RESOLVED_DEFAULTS,
      slotCommitment: { mode: "delta-responsive", reresolveDeltaPx: 12 },
    });
  });

  it("resolves STATIC_DASHBOARD_INTERACTION with both title-bar control groups disabled", (): void => {
    expect(resolveInteractionCapabilities(STATIC_DASHBOARD_INTERACTION).paneTitleBarControls).toEqual({
      sizing: false,
      acquireSpace: false,
    });
  });

  it("defaults dropHitZoneGeometry to the DYNAMIC_DROP_INTENT_CONFIG values when undefined", (): void => {
    expect(resolveInteractionCapabilities(undefined).dropHitZoneGeometry).toEqual({
      centerRatio: 0.34,
      centerRatioX: 0.34,
      centerRatioY: 0.34,
      centerMinPx: 24,
      hysteresisPx: 6,
    });
    expect(resolveInteractionCapabilities({}).dropHitZoneGeometry).toEqual({
      centerRatio: 0.34,
      centerRatioX: 0.34,
      centerRatioY: 0.34,
      centerMinPx: 24,
      hysteresisPx: 6,
    });
  });

  it("merges a partial dropHitZoneGeometry override field-by-field over the defaults", (): void => {
    expect(resolveInteractionCapabilities({ dropHitZoneGeometry: { centerRatio: 0.5 } })).toEqual({
      ...RESOLVED_DEFAULTS,
      dropHitZoneGeometry: { centerRatio: 0.5, centerRatioX: 0.5, centerRatioY: 0.5, centerMinPx: 24, hysteresisPx: 6 },
    });
    expect(resolveInteractionCapabilities({ dropHitZoneGeometry: { centerMinPx: 40 } })).toEqual({
      ...RESOLVED_DEFAULTS,
      dropHitZoneGeometry: { centerRatio: 0.34, centerRatioX: 0.34, centerRatioY: 0.34, centerMinPx: 40, hysteresisPx: 6 },
    });
  });

  it("the symmetric centerRatio seeds both axes when no per-axis override is given", (): void => {
    const resolved: ResolvedTilingInteractionCapabilities = resolveInteractionCapabilities({
      dropHitZoneGeometry: { centerRatio: 0.6 },
    });
    expect(resolved.dropHitZoneGeometry.centerRatioX).toBe(0.6);
    expect(resolved.dropHitZoneGeometry.centerRatioY).toBe(0.6);
  });

  it("a per-axis centerRatioX / centerRatioY override wins for that axis only", (): void => {
    expect(resolveInteractionCapabilities({ dropHitZoneGeometry: { centerRatioX: 0.2 } }).dropHitZoneGeometry).toEqual({
      centerRatio: 0.2,
      centerRatioX: 0.2,
      centerRatioY: 0.34,
      centerMinPx: 24,
      hysteresisPx: 6,
    });
    expect(resolveInteractionCapabilities({ dropHitZoneGeometry: { centerRatioY: 0.7 } }).dropHitZoneGeometry).toEqual({
      centerRatio: 0.34,
      centerRatioX: 0.34,
      centerRatioY: 0.7,
      centerMinPx: 24,
      hysteresisPx: 6,
    });
  });

  it("a per-axis override wins over the symmetric centerRatio for its own axis", (): void => {
    expect(
      resolveInteractionCapabilities({
        dropHitZoneGeometry: { centerRatio: 0.4, centerRatioY: 0.8 },
      }).dropHitZoneGeometry,
    ).toEqual({
      centerRatio: 0.4,
      centerRatioX: 0.4,
      centerRatioY: 0.8,
      centerMinPx: 24,
      hysteresisPx: 6,
    });
  });

  it("preserves an explicit hysteresisPx of 0 (nullish merge does not override the falsy zero)", (): void => {
    expect(resolveInteractionCapabilities({ dropHitZoneGeometry: { hysteresisPx: 0 } })).toEqual({
      ...RESOLVED_DEFAULTS,
      dropHitZoneGeometry: { centerRatio: 0.34, centerRatioX: 0.34, centerRatioY: 0.34, centerMinPx: 24, hysteresisPx: 0 },
    });
  });

  it("is idempotent when re-resolving a resolved object", (): void => {
    const once: ResolvedTilingInteractionCapabilities = resolveInteractionCapabilities({ resize: "vertical" });
    expect(resolveInteractionCapabilities(once)).toEqual(once);
  });

  it("does not mutate the default singleton", (): void => {
    resolveInteractionCapabilities({ resize: "vertical", rearrange: false, focus: false });
    expect(TILING_INTERACTION_CAPABILITY_DEFAULTS).toEqual(RESOLVED_DEFAULTS);
  });
});

describe("isResizeAxisEnabled (axis-convention gate)", (): void => {
  const HORIZONTAL_SPLIT: DynamicSplitAxis = "horizontal"; // width divider (side-by-side panes)
  const VERTICAL_SPLIT: DynamicSplitAxis = "vertical"; // height divider (stacked panes)

  it("\"none\" disables every divider axis", (): void => {
    expect(isResizeAxisEnabled("none", HORIZONTAL_SPLIT)).toBe(false);
    expect(isResizeAxisEnabled("none", VERTICAL_SPLIT)).toBe(false);
  });

  it("\"both\" enables every divider axis", (): void => {
    expect(isResizeAxisEnabled("both", HORIZONTAL_SPLIT)).toBe(true);
    expect(isResizeAxisEnabled("both", VERTICAL_SPLIT)).toBe(true);
  });

  it("\"horizontal\" enables only width dividers (split axis horizontal)", (): void => {
    expect(isResizeAxisEnabled("horizontal", HORIZONTAL_SPLIT)).toBe(true);
    expect(isResizeAxisEnabled("horizontal", VERTICAL_SPLIT)).toBe(false);
  });

  it("\"vertical\" enables only height dividers (split axis vertical)", (): void => {
    expect(isResizeAxisEnabled("vertical", VERTICAL_SPLIT)).toBe(true);
    expect(isResizeAxisEnabled("vertical", HORIZONTAL_SPLIT)).toBe(false);
  });

  it("covers the full capability x axis matrix deterministically", (): void => {
    const capabilities: ReadonlyArray<TilingResizeCapability> = ["both", "horizontal", "vertical", "none"];
    const axes: ReadonlyArray<DynamicSplitAxis> = ["horizontal", "vertical"];
    const expectedByKey: Record<string, boolean> = {
      "both:horizontal": true,
      "both:vertical": true,
      "horizontal:horizontal": true,
      "horizontal:vertical": false,
      "vertical:horizontal": false,
      "vertical:vertical": true,
      "none:horizontal": false,
      "none:vertical": false,
    };
    for (const capability of capabilities) {
      for (const axis of axes) {
        expect(isResizeAxisEnabled(capability, axis)).toBe(expectedByKey[`${capability}:${axis}`]);
      }
    }
  });
});
