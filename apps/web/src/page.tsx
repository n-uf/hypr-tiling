import * as React from "react";
import { DynamicTilingShowcase } from "hypr-tiling-showcase";

export function HomePage(): React.ReactElement {
  return (
    <main className="min-h-screen w-full overflow-auto bg-slate-950 text-slate-100">
        <DynamicTilingShowcase />
    </main>
  );
}
