# Changelog

All notable changes to `@n-uf/hypr-tiling` are documented here.

This package uses calendar-aligned versioning (`YY.M.R`), which cannot signal a
SemVer "major" bump. **Read the per-release notes below for breaking changes** —
the version number alone does not flag them.

## 26.7.0

> **BREAKING.** This release renames the entire public type/constant surface,
> moves the developer/observability tooling to a `/devtools` subpath, and curates
> the package's public barrel. Code written against `26.6.x` (or any earlier
> unpublished working version) will not compile until imports are updated. The
> grouping/license work from the unpublished `26.6.4` rolls up into this release
> (nothing was published between `26.6.x` and `26.7.0`).

### 1. `Dynamic*` / `DYNAMIC_*` → `Tiling*` / `TILING_*` rename

Every public symbol that carried the `Dynamic`/`DYNAMIC_` prefix is now unified
under a single `Tiling`/`TILING_` namespace. There is **no backward-compat alias**
— update every import.

#### Components & props

| Old (`26.6.x`)              | New (`26.7.0`)            |
| --------------------------- | ------------------------- |
| `DynamicTilingRenderer`     | `TilingRenderer`          |
| `DynamicTilingRendererProps`| `TilingRendererProps`     |
| `DynamicRenderTileArgs`     | `TilingRenderTileProps`   |

#### Layout-tree types

| Old (`26.6.x`)          | New (`26.7.0`)        |
| ----------------------- | --------------------- |
| `DynamicLayoutNode`     | `TilingLayoutNode`    |
| `DynamicLeafNode`       | `TilingLeafNode`      |
| `DynamicSplitNode`      | `TilingSplitNode`     |
| `DynamicGroupNode`      | `TilingGroupNode`     |
| `DynamicTile`           | `TilingTile`          |
| `DynamicLayoutConfig`   | `TilingLayoutConfig`  |
| `DynamicSplitAxis`      | `TilingSplitAxis`     |
| `DynamicLayoutMode`     | `TilingLayoutMode`    |
| `DynamicMasterOrientation` | `TilingMasterOrientation` |
| `DynamicFocusDirection` | `TilingFocusDirection`|
| `DynamicMovePlacement`  | `TilingMovePlacement` |
| `DynamicInsertionOptions` | `TilingInsertionOptions` |
| `DynamicLeafDropZone`   | `TilingLeafDropZone`  |
| `DynamicPaneBodyRenderMode` | `TilingPaneBodyRenderMode` |
| `DynamicPaneFootprint`  | `TilingPaneFootprint` |

#### Accents, constants & helpers

| Old (`26.6.x`)                | New (`26.7.0`)              |
| ----------------------------- | --------------------------- |
| `DynamicTileAccent`           | `TilingTileAccent`          |
| `DynamicTileAccentSwatch`     | `TilingTileAccentSwatch`    |
| `DYNAMIC_TILE_ACCENTS`        | `TILING_TILE_ACCENTS`       |
| `DYNAMIC_TILE_ACCENT_SWATCHES`| `TILING_TILE_ACCENT_SWATCHES` |
| `DYNAMIC_DROP_INTENT_CONFIG`  | `TILING_DROP_INTENT_CONFIG` |
| `STATIC_DASHBOARD_INTERACTION`| `TILING_DASHBOARD_PRESET`   |
| `readTileOrderByLeaf`         | `tileOrderByLeafId`         |
| `modifiersHaveModifier`       | `hasAnyModifier`            |
| `chordHasModifier`            | `chordRequiresModifier`     |

> General rule: any remaining `Dynamic*` type or `DYNAMIC_*` constant from
> `26.6.x` is now `Tiling*` / `TILING_*` with the same trailing name.

### 2. Developer/observability surface moved to `@n-uf/hypr-tiling/devtools`

The observability panel and its seed defaults are no longer on the main entry.
A renderer-only consumer never pulls the ~2,400-line panel into its bundle.
Import them from the new `/devtools` subpath instead:

```ts
// Before (26.6.x)
import { TilingObservabilityPanel, ANIMATION_CONTROL_DEFAULTS } from "@n-uf/hypr-tiling";

// After (26.7.0)
import { TilingObservabilityPanel, ANIMATION_CONTROL_DEFAULTS } from "@n-uf/hypr-tiling/devtools";
```

Moved to `/devtools`: `TilingObservabilityPanel`, `TilingObservabilityLedgerEntry`,
`AnimationControlDefaults`, `ANIMATION_CONTROL_DEFAULTS`,
`TILING_OBSERVABILITY_COLOR_DEFAULTS`, `TILING_OBSERVABILITY_COLOR_ENABLE_DEFAULTS`.

The observability/debug **types** (`TilingObservabilityColorConfig`,
`TilingLiveHitLogState`, `TilingDropIntentDebugState`,
`TilingPaneHitZoneOverlayDebugState`, etc.) remain on the main `.` entry because
they are referenced by public renderer props (`onDropIntentChange`,
`onLiveHitLogChange`, and `renderTile`'s `paneHitZoneDebug` / `observabilityColors`).

### 3. Curated public barrel

The deep-engine internals are no longer re-exported from the package root. The
ghost-transit animation math (`ghost-transit`), leaf geometry (`leaf-geometry`),
drop-validity evaluation (`drop-validity`), projected-layout helpers
(`projected-layout`), and the low-level pane-switching index helpers
(`cycleNextIndex`, `cyclePreviousIndex`, `jumpToPaneIndex`, `matchJumpToPaneNumber`,
`isSwitcherHoldReleased`) are now tagged `@internal` and dropped from the public
surface. The public barrel went from ~214 exports to 171 public API items. An
[API Extractor](https://api-extractor.com/) report (`etc/hypr-tiling.api.md`) is
checked in, and `pnpm api:check` fails CI if an `@internal` symbol ever leaks back
onto the public entry.

If you depended on one of these internals, it is still reachable via a direct deep
import (`@n-uf/hypr-tiling/dist/...`) but is no longer a supported public API and
may change without a breaking-change note.

### Tailwind requirement (reminder, not new)

The package ships no CSS — it emits Tailwind utility classes. Add
`@n-uf/hypr-tiling` to your Tailwind `content` glob or the renderer is unstyled.
See the README "Tailwind content requirement" section.
