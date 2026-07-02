import { useState, type ReactElement } from "react";
import {
  TilingRenderer,
  DEFAULT_TILING_LAYOUT_CONFIG,
  type TilingLayoutNode,
  type TilingTile,
} from "@n-uf/hypr-tiling";

// A whole runnable dashboard: four metric/detail panes in a master-stack shape,
// each with its own accent and content. Copy this file wholesale — it's a
// complete, controlled TilingRenderer app.
//
// No `renderTile` is passed, so the renderer supplies its DEFAULT pane chrome —
// a themed frame + header that is fully interactive out of the box: drag a header
// to rearrange, drag a divider to resize, Alt/Opt+click headers then "Group" to
// tab them, and maximize. Each pane paints its `tile.content` in the body (the
// dev-only content toggle is off by the library default, so content shows at
// rest). Reach for a `renderTile` callback only when you want to own the pane
// frame yourself — see the "custom look-and-feel" guide.

interface Metric {
  readonly label: string;
  readonly value: string;
}

function MetricCard({ metric }: { metric: Metric }): ReactElement {
  return (
    <div style={{ padding: 14, fontFamily: "system-ui" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#a8a29e" }}>
        {metric.label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, color: "#fafaf9" }}>{metric.value}</div>
    </div>
  );
}

const tiles: TilingTile[] = [
  { id: "revenue", title: "Revenue", accent: "emerald", content: <MetricCard metric={{ label: "MRR", value: "$48.2k" }} /> },
  { id: "users", title: "Active users", accent: "sky", content: <MetricCard metric={{ label: "DAU", value: "12,904" }} /> },
  { id: "errors", title: "Error rate", accent: "rose", content: <MetricCard metric={{ label: "5xx / min", value: "0.03%" }} /> },
  { id: "latency", title: "Latency", accent: "amber", content: <MetricCard metric={{ label: "p95", value: "142 ms" }} /> },
];

const initialLayout: TilingLayoutNode = {
  kind: "split",
  id: "root",
  axis: "horizontal",
  ratio: 0.5,
  first: {
    kind: "split",
    id: "left",
    axis: "vertical",
    ratio: 0.5,
    first: { kind: "leaf", id: "revenue-pane", tileId: "revenue" },
    second: { kind: "leaf", id: "users-pane", tileId: "users" },
  },
  second: {
    kind: "split",
    id: "right",
    axis: "vertical",
    ratio: 0.5,
    first: { kind: "leaf", id: "errors-pane", tileId: "errors" },
    second: { kind: "leaf", id: "latency-pane", tileId: "latency" },
  },
};

export function DashboardApp(): ReactElement {
  const [layout, setLayout] = useState<TilingLayoutNode>(initialLayout);
  return (
    <TilingRenderer
      layout={layout}
      tiles={tiles}
      config={DEFAULT_TILING_LAYOUT_CONFIG}
      themeId="clean-flat"
      onLayoutChange={setLayout}
    />
  );
}
