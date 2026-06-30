import * as React from "react";
import { HomePage } from "./page";

// Tiny client-side router. `/` renders the redesigned docs homepage (the SEO /
// prerender surface); `/showcase` renders the original full interactive
// showcase. The showcase chunk is code-split (React.lazy) so the homepage bundle
// stays light. Navigation is pushState-based (no full reload) with a popstate
// listener for back/forward.

const ShowcaseRoute = React.lazy(
  (): Promise<{ default: React.ComponentType<{ navigate?: (to: string) => void }> }> =>
    import("./showcase-route").then(
      (module): { default: React.ComponentType<{ navigate?: (to: string) => void }> } => ({
        default: module.ShowcaseRoute,
      }),
    ),
);

function normalizePath(pathname: string): string {
  const trimmed: string = pathname.replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

function ShowcaseFallback(): React.ReactElement {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#080a14] font-mono text-[12px] uppercase tracking-[0.22em] text-slate-400">
      loading showcase…
    </div>
  );
}

export function App(): React.ReactElement {
  const [path, setPath] = React.useState<string>((): string =>
    normalizePath(window.location.pathname),
  );

  React.useEffect((): (() => void) => {
    const onPopState = (): void => {
      setPath(normalizePath(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return (): void => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const navigate = React.useCallback((to: string): void => {
    const target: string = normalizePath(to);
    if (target === normalizePath(window.location.pathname)) {
      return;
    }
    window.history.pushState({}, "", to);
    setPath(target);
    window.scrollTo(0, 0);
  }, []);

  if (path === "/showcase") {
    return (
      <React.Suspense fallback={<ShowcaseFallback />}>
        <ShowcaseRoute navigate={navigate} />
      </React.Suspense>
    );
  }
  return <HomePage navigate={navigate} />;
}
