import * as React from "react";
import { DynamicTilingShowcase } from "hypr-tiling-showcase";

// `/showcase` route: the original full interactive showcase
// (`DynamicTilingShowcase` from the `hypr-tiling-showcase` package), preserved
// at its own URL distinct from the redesigned docs homepage at `/`. Client-only
// (not part of the homepage SEO prerender). A floating link returns to home.

export function ShowcaseRoute({
  navigate,
}: {
  navigate?: (to: string) => void;
}): React.ReactElement {
  return (
    <div className="relative h-screen max-h-screen w-full overflow-hidden">
      <a
        href="/"
        onClick={(event: React.MouseEvent<HTMLAnchorElement>): void => {
          if (navigate != null) {
            event.preventDefault();
            navigate("/");
          }
        }}
        className="group fixed left-3 top-3 z-[300] inline-flex items-center gap-2 rounded-md border border-white/15 bg-[#121316]/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-stone-200 backdrop-blur transition-colors hover:border-amber-300/50 hover:text-amber-100"
      >
        <span
          aria-hidden
          className="transition-transform duration-150 group-hover:-translate-x-0.5"
        >
          {"\u2190"}
        </span>
        home
      </a>
      <DynamicTilingShowcase />
    </div>
  );
}
