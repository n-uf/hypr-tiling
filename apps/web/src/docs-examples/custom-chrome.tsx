import { useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  useTilingTheme,
  isMultiSelectModifierActive,
  type TilingLayoutNode,
  type TilingTile,
  type TilingRenderTileProps,
  type TilingTheme,
} from "@n-uf/hypr-tiling";

// renderTile is a FULL-PANE render prop, not a content slot: it returns the
// WHOLE pane — frame, header, body — and receives every interaction handle +
// state flag the renderer computes. That means you can own the ENTIRE pane
// look-and-feel (your own frame, header, buttons, focus/drag affordances), not
// just `tile.content`, while the renderer keeps running layout, resize, drag,
// grouping, focus and keyboard control underneath.
//
// The contract for a custom pane:
//   • root is `article[data-leaf-id={leafId}]` — the renderer resolves the drag
//     source from it (`closest("article[data-leaf-id]")`); wire onFocus,
//     onPointerMove and onPointerLeave on it too.
//   • your drag handle (typically the header) wires onHandlePointerDown.
//   • wire the action handlers you want to expose: onToggleMaximize,
//     onToggleMultiSelect + onGroupMultiSelection (Alt/Opt+click grouping), etc.
//   • style from the state flags (isFocused, isMaximized, isDragSource, …) and
//     compose with theme tokens from useTilingTheme() so a custom frame still
//     tracks the active theme + per-tile accent.
//   • render your body only when paneBodyRenderMode === "render-content" (the
//     drag ghost reuses the same render path, so this keeps the ghost body in
//     sync and never empty).

const tiles: TilingTile[] = [
  { id: "editor", title: "editor", accent: "sky", content: <code>main.tsx</code> },
  { id: "preview", title: "preview", accent: "emerald", content: <span>rendered output</span> },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: { kind: "leaf", id: "a", tileId: "editor" },
  second: { kind: "leaf", id: "b", tileId: "preview" },
};

// A pane whose frame + header are entirely yours. Only the public
// TilingRenderTileProps handles + flags and the theme tokens are used.
function CustomPane(args: TilingRenderTileProps): ReactElement {
  const theme: TilingTheme = useTilingTheme();
  const frameStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    borderRadius: 10,
    background: "#101114",
    overflow: "hidden",
    outline: "none",
    opacity: args.isDragSource ? 0.6 : 1,
    boxShadow: "0 18px 40px -30px rgba(0,0,0,0.9)",
  };
  return (
    <article
      data-leaf-id={args.leafId}
      tabIndex={-1}
      onFocus={args.onFocus}
      onPointerMove={args.onPointerMove}
      onPointerLeave={args.onPointerLeave}
      style={frameStyle}
      // Focus frame comes from the active theme + this pane's accent — a custom
      // frame still reads as part of the themed surface.
      className={args.isFocused ? theme.resolveFocusFrame(args.tile.accent) : ""}
    >
      <header
        onPointerDown={args.onHandlePointerDown}
        onClick={(event): void => {
          // Alt/Opt+click toggles this pane's multi-selection without focusing.
          if (args.isMultiSelectGroupingEnabled && isMultiSelectModifierActive(event)) {
            event.stopPropagation();
            event.preventDefault();
            args.onToggleMultiSelect();
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "7px 10px",
          cursor: "grab",
          touchAction: "none",
          borderBottom: "1px solid #ffffff14",
        }}
      >
        <span
          className={theme.resolveAccentText(args.tile.accent)}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em" }}
        >
          {args.tile.title}
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          {args.isMultiSelected && args.canGroupMultiSelection ? (
            <button
              type="button"
              onPointerDown={(e): void => e.stopPropagation()}
              onClick={(e): void => {
                e.stopPropagation();
                args.onGroupMultiSelection(args.leafId);
              }}
              style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, border: "1px solid #fbbf2470", color: "#fde68a", background: "transparent" }}
            >
              group
            </button>
          ) : null}
          {args.isMaximizeEnabled ? (
            <button
              type="button"
              onPointerDown={(e): void => e.stopPropagation()}
              onClick={(e): void => {
                e.stopPropagation();
                args.onToggleMaximize();
              }}
              aria-label={args.isMaximized ? "restore pane" : "maximize pane"}
              style={{ fontSize: 12, lineHeight: 1, padding: "2px 6px", borderRadius: 6, border: "1px solid #ffffff1f", color: "#d6d3d1", background: "transparent" }}
            >
              {args.isMaximized ? "\u2715" : "\u2922"}
            </button>
          ) : null}
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12, fontSize: 13, color: "#e7e5e4" }}>
        {args.paneBodyRenderMode === "render-content" ? args.tile.content : null}
      </div>
    </article>
  );
}

export function CustomChromeExample(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      themeId="mosaic"
      onLayoutChange={setLayout}
      renderTile={(args: TilingRenderTileProps): ReactNode => <CustomPane {...args} />}
    />
  );
}
