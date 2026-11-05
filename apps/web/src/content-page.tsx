import * as React from "react";
import {
  CONTENT_SECTIONS,
  SECTION_INDEX_COPY,
  SECTION_LABELS,
  sectionPath,
  type ContentSection,
} from "./content/constants";
import { formatDate, readingMinutes } from "./content/format";
import { pagesOf, type ContentPage, type ContentSite } from "./content/types";
import { PAGE_TITLE, REPO_URL, LICENSE_NAME, LICENSE_URL } from "./docs";

// Server-rendered chrome for the use-case and blog pages: the /docs frame (top
// bar, section rail on the left, "On this page" on the right) with the article as
// one pane. Plain HTML from the prerender with no tiling script, so these pages
// read the same without JavaScript. The sketch behind it is
// seo/products/hypr-tiling/sketches/article-page.html.

/** Docs links the left rail and the install block use; the build checks they are real /docs anchors. */
export const RAIL_DOCS_LINKS: ReadonlyArray<{ readonly label: string; readonly href: string }> = [
  { label: "Quickstart", href: "/docs#quickstart" },
  { label: "Save & restore a layout", href: "/docs#howto-save-restore" },
  { label: "API reference", href: "/docs#reference" },
];
export const QUICKSTART_HREF: string = "/docs#quickstart";

const LABEL_CLASS: string =
  "font-mono text-[10px] font-medium uppercase leading-normal tracking-[0.32em] text-amber-300/80";
const LINK_CLASS: string =
  "text-amber-200 underline decoration-amber-400/40 underline-offset-[3px] transition-colors hover:text-amber-100 hover:decoration-amber-300/70";
const H2_CLASS: string =
  "mb-2 mt-10 flex scroll-mt-16 items-baseline gap-3 font-display text-[24px] font-medium leading-[1.25] tracking-[-0.01em] text-stone-50";
const PANE_CLASS: string =
  "overflow-hidden border-y border-white/[0.07] bg-[#121316] min-[761px]:my-4 min-[761px]:rounded-xl min-[761px]:border";

// Styles for the rendered markdown body (paragraphs, lists, quotes). Headings,
// code, tables and links carry their own classes from content/markdown.ts.
const BODY_CLASS: string = [
  "[&_p]:[overflow-wrap:anywhere] [&_li]:[overflow-wrap:anywhere]",
  "[&_p]:my-2.5 [&_p]:text-[16px] [&_p]:leading-[1.65] [&_p]:text-stone-300/90",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-amber-300/60",
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:marker:text-amber-300/60",
  "[&_li]:my-1.5 [&_li]:text-[16px] [&_li]:leading-[1.6] [&_li]:text-stone-300/90 [&_li>p]:my-1",
  "[&_strong]:font-semibold [&_strong]:text-stone-100",
  "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-amber-400/40 [&_blockquote]:pl-4",
  "[&_hr]:my-8 [&_hr]:border-white/[0.07]",
].join(" ");

function H2Tick(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="h-5 w-[3px] shrink-0 translate-y-[2px] rounded-sm bg-amber-400"
    />
  );
}

function SectionHeading({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <h2 id={id} className={H2_CLASS}>
      <H2Tick />
      <span>{children}</span>
    </h2>
  );
}

// --- Top bar ---------------------------------------------------------------

function TopBar({
  site,
  current,
}: {
  site: ContentSite;
  current: ContentSection | null;
}): React.ReactElement {
  const navClass =
    "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400 transition-colors hover:text-amber-100 aria-[current]:text-amber-200";
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#0c0d0f]/90 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-4 px-4 min-[761px]:px-5">
        <a
          href="/"
          className="flex items-center gap-2 text-[15px] font-semibold text-stone-50 no-underline"
        >
          <span aria-hidden="true" className="h-4 w-[3px] rounded-sm bg-amber-400" />
          hypr-tiling
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-amber-300/80">
            Guides
          </span>
        </a>
        <nav aria-label="Site" className="ml-auto flex items-center gap-4 min-[761px]:gap-[18px]">
          <a href="/" className={`${navClass} max-[560px]:hidden`}>
            Home
          </a>
          <a href="/docs" className={navClass}>
            Docs
          </a>
          {CONTENT_SECTIONS.filter((section): boolean => pagesOf(site, section).length > 0).map(
            (section): React.ReactElement => (
              <a
                key={section}
                href={sectionPath(section)}
                aria-current={current === section ? "page" : undefined}
                className={navClass}
              >
                {SECTION_LABELS[section].plural}
              </a>
            ),
          )}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${navClass} max-[560px]:hidden`}
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

// --- Rails -------------------------------------------------------------------

function RailLink({
  href,
  current,
  children,
}: {
  href: string;
  current?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <a
      href={href}
      aria-current={current === true ? "page" : undefined}
      className="block truncate rounded-md px-2 py-1 text-[13px] text-stone-300/90 no-underline transition-colors hover:bg-white/[0.03] aria-[current]:bg-amber-200/[0.07] aria-[current]:text-stone-50 aria-[current]:shadow-[inset_2px_0_0_#fbbf24]"
    >
      {children}
    </a>
  );
}

function LeftRail({
  site,
  currentPath,
}: {
  site: ContentSite;
  currentPath: string;
}): React.ReactElement {
  return (
    <aside
      aria-label="Guides"
      className="sticky top-12 hidden h-[calc(100vh-48px)] self-start overflow-y-auto px-4 py-6 min-[761px]:block"
    >
      {CONTENT_SECTIONS.map((section): React.ReactElement | null => {
        const pages: ReadonlyArray<ContentPage> = pagesOf(site, section);
        if (pages.length === 0) {
          return null;
        }
        return (
          <div key={section} className="mb-5">
            <a href={sectionPath(section)} className={`${LABEL_CLASS} mb-1.5 block no-underline`}>
              {SECTION_LABELS[section].plural}
            </a>
            {pages.map(
              (page): React.ReactElement => (
                <RailLink key={page.path} href={page.path} current={page.path === currentPath}>
                  {page.title}
                </RailLink>
              ),
            )}
          </div>
        );
      })}
      <div className="mb-5">
        <div className={`${LABEL_CLASS} mb-1.5`}>Docs</div>
        {RAIL_DOCS_LINKS.map(
          (link): React.ReactElement => (
            <RailLink key={link.href} href={link.href}>
              {link.label}
            </RailLink>
          ),
        )}
      </div>
    </aside>
  );
}

function RightRail({
  items,
}: {
  items: ReadonlyArray<{ readonly id: string; readonly text: string }>;
}): React.ReactElement {
  return (
    <aside
      aria-label="On this page"
      className="sticky top-12 hidden h-[calc(100vh-48px)] self-start overflow-y-auto px-4 py-6 min-[1101px]:block"
    >
      <div className={`${LABEL_CLASS} mb-1.5`}>On this page</div>
      {items.map(
        (item): React.ReactElement => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="block rounded-md px-2 py-[3px] text-[12px] leading-snug text-stone-400 no-underline transition-colors hover:text-amber-100"
          >
            {item.text}
          </a>
        ),
      )}
    </aside>
  );
}

// --- Shell ---------------------------------------------------------------------

function Shell({
  site,
  current,
  currentPath,
  toc,
  children,
}: {
  site: ContentSite;
  current: ContentSection;
  currentPath: string;
  toc: ReadonlyArray<{ readonly id: string; readonly text: string }>;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0c0d0f] font-sans text-stone-100">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-30 focus:rounded focus:bg-[#16171b] focus:px-3 focus:py-2 focus:text-amber-200"
      >
        Skip to the content
      </a>
      <TopBar site={site} current={current} />
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 min-[761px]:grid-cols-[200px_minmax(0,1fr)] min-[1101px]:grid-cols-[230px_minmax(0,1fr)_220px]">
        <LeftRail site={site} currentPath={currentPath} />
        <main id="content" className="min-w-0 min-[761px]:px-4">
          {children}
          <footer className="px-4 pb-10 pt-2 text-[12px] leading-[1.7] text-stone-500 min-[761px]:px-0">
            hypr-tiling is made by n-uf and is source-available under{" "}
            <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              {LICENSE_NAME}
            </a>
            . <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>Source on GitHub</a>.
          </footer>
        </main>
        {toc.length > 0 ? <RightRail items={toc} /> : <div className="hidden min-[1101px]:block" />}
      </div>
    </div>
  );
}

function PaneHeader({
  number,
  title,
}: {
  number: number;
  title: string;
}): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className="flex h-9 items-center gap-2.5 border-b border-white/[0.07] bg-[#16171b] px-3"
    >
      <span className="font-mono text-[11px] text-stone-500">{String(number).padStart(2, "0")}</span>
      <span className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-stone-200">
        {title}
      </span>
      <span className="ml-auto flex gap-1.5">
        {["⤢", "↗"].map(
          (glyph): React.ReactElement => (
            <span
              key={glyph}
              className="grid h-[22px] w-[22px] place-items-center rounded-[5px] border border-white/[0.12] font-mono text-[11px] text-stone-400"
            >
              {glyph}
            </span>
          ),
        )}
      </span>
    </div>
  );
}

// --- Article ---------------------------------------------------------------------

/** What a "Read next" card shows for a related path. */
export function relatedCard(
  path: string,
  site: ContentSite,
): { readonly label: string; readonly title: string } {
  const bare: string = path.split("#")[0];
  const page: ContentPage | undefined = site.pages.find((candidate): boolean => candidate.path === bare);
  if (page != null) {
    return { label: SECTION_LABELS[page.section].chip, title: page.title };
  }
  if (bare === "/") {
    return { label: "Home", title: PAGE_TITLE };
  }
  const docsLink = RAIL_DOCS_LINKS.find((link): boolean => link.href === path);
  return { label: "Docs", title: docsLink?.label ?? "hypr-tiling documentation" };
}

function DateText({ date }: { date: string }): React.ReactElement {
  return <time dateTime={date}>{formatDate(date)}</time>;
}

/**
 * Shown on a draft in a preview build ("Scheduled for 1 Dec 2026"). A
 * production build renders no draft, so a visitor never sees it.
 */
function ScheduledBadge({ date }: { date: string }): React.ReactElement {
  return (
    <span
      data-scheduled-badge=""
      className="inline-block rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.16em] text-amber-300"
    >
      Scheduled for <time dateTime={date}>{formatDate(date)}</time>
    </span>
  );
}

function InstallBlock(): React.ReactElement {
  return (
    <aside
      id="install"
      aria-label="Install hypr-tiling"
      className="my-8 flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-lg border border-white/[0.12] px-4 py-3.5"
    >
      <code className="whitespace-nowrap rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[12.5px] text-amber-200/90">
        pnpm add @n-uf/hypr-tiling
      </code>
      <p className="m-0 min-w-[14rem] flex-1 text-[15px] leading-[1.55] text-stone-300/90">
        Try it in a few minutes with the{" "}
        <a href={QUICKSTART_HREF} className={LINK_CLASS}>
          quickstart
        </a>
        . It needs React 19, and Tailwind in your app: the package ships no CSS.
      </p>
    </aside>
  );
}

export function ArticlePage({
  page,
  site,
}: {
  page: ContentPage;
  site: ContentSite;
}): React.ReactElement {
  const section: ContentSection = page.section;
  const position: number = pagesOf(site, section).findIndex((candidate): boolean => candidate.path === page.path) + 1;
  const toc: ReadonlyArray<{ id: string; text: string }> = [
    ...page.headings
      .filter((heading): boolean => heading.depth === 2)
      .map((heading) => ({ id: heading.id, text: heading.text })),
    { id: "faq", text: "Questions" },
    { id: "sources", text: "Sources" },
  ];
  return (
    <Shell site={site} current={section} currentPath={page.path} toc={toc}>
      <article className={PANE_CLASS}>
        <PaneHeader number={position} title={`${SECTION_LABELS[section].plural} · ${page.title}`} />
        <div className="mx-auto max-w-[720px] px-4 pb-14 pt-6 min-[761px]:px-7 min-[761px]:pt-9">
          <nav
            aria-label="Breadcrumb"
            className="font-mono text-[11px] tracking-[0.08em] text-stone-500 [&_a]:text-stone-400 [&_a]:no-underline [&_a:hover]:text-amber-100"
          >
            <a href="/">Home</a> / <a href={sectionPath(section)}>{SECTION_LABELS[section].plural}</a> /{" "}
            <span aria-current="page">{page.title}</span>
          </nav>
          {page.draft ? (
            <p className="m-0 mt-3.5">
              <ScheduledBadge date={page.published} />
            </p>
          ) : null}
          <h1 className="mb-2.5 mt-3.5 font-display text-[clamp(2rem,3.2vw,2.65rem)] font-medium leading-[1.06] tracking-[-0.015em] text-stone-50">
            {page.h1}
          </h1>
          <p className="m-0 font-mono text-[11.5px] leading-relaxed tracking-[0.04em] text-stone-500">
            By <b className="font-medium text-stone-400">n-uf</b>{" "}
            {page.draft ? null : (
              <>
                {"·"} Published{" "}
                <b className="font-medium text-stone-400">
                  <DateText date={page.published} />
                </b>{" "}
                {"·"} Updated{" "}
                <b className="font-medium text-stone-400">
                  <DateText date={page.updated} />
                </b>{" "}
              </>
            )}
            {"·"} {readingMinutes(page.wordCount)} min read
          </p>

          <div className={BODY_CLASS} dangerouslySetInnerHTML={{ __html: page.ledeHtml }} />

          <section
            aria-labelledby="key-takeaways"
            className="my-6 rounded-lg border border-white/[0.12] border-l-[3px] border-l-amber-400 bg-amber-200/[0.03] px-[18px] pb-1.5 pt-3.5"
          >
            <h2 id="key-takeaways" className={LABEL_CLASS}>
              Key takeaways
            </h2>
            <ul className="my-2 list-disc pl-[18px] text-[15px] text-stone-300/90 marker:text-amber-300/60">
              {page.takeaways.map(
                (takeaway): React.ReactElement => (
                  <li key={takeaway} className="my-[5px] leading-[1.55]">
                    {takeaway}
                  </li>
                ),
              )}
            </ul>
          </section>

          <div className={BODY_CLASS} dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />

          <InstallBlock />

          <section id="faq" className="scroll-mt-16">
            <SectionHeading>Questions</SectionHeading>
            {page.faq.map(
              (item, index): React.ReactElement => (
                <details key={item.q} open={index === 0} className="group border-t border-white/[0.07] py-3">
                  <summary className="flex cursor-pointer list-none items-baseline gap-2.5 font-display text-[16px] font-medium leading-snug text-stone-50 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden="true" className="font-mono text-[13px] text-amber-300/80">
                      <span className="group-open:hidden">+</span>
                      <span className="hidden group-open:inline">{"−"}</span>
                    </span>
                    <span>{item.q}</span>
                  </summary>
                  <p className="m-0 mt-2 pl-[22px] text-[15px] leading-[1.6] text-stone-300/90">{item.a}</p>
                </details>
              ),
            )}
          </section>

          <section id="sources" className="scroll-mt-16">
            <SectionHeading>Sources</SectionHeading>
            <ul className="m-0 list-none p-0">
              {page.sources.map(
                (source): React.ReactElement => (
                  <li key={source.url} className="my-1.5 text-[14px] leading-snug text-stone-300/90">
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                      {source.title}
                    </a>{" "}
                    <span className="font-mono text-[11px] tracking-[0.04em] text-stone-500">
                      checked <DateText date={source.checked} />
                    </span>
                  </li>
                ),
              )}
            </ul>
          </section>

          <section id="read-next" className="scroll-mt-16">
            <SectionHeading>Read next</SectionHeading>
            <div className="mt-3 grid grid-cols-1 gap-2.5 min-[561px]:grid-cols-3">
              {page.related.map((path): React.ReactElement => {
                const card = relatedCard(path, site);
                return (
                  <a
                    key={path}
                    href={path}
                    className="rounded-lg border border-white/[0.07] bg-[#16171b] p-3 no-underline transition-colors hover:border-amber-300/40"
                  >
                    <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-amber-300/80">
                      {card.label}
                    </span>
                    <div className="mt-1.5 font-display text-[15px] font-medium leading-snug text-stone-50">
                      {card.title}
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        </div>
      </article>
    </Shell>
  );
}

// --- Section index -----------------------------------------------------------------

export function SectionIndexPage({
  section,
  site,
}: {
  section: ContentSection;
  site: ContentSite;
}): React.ReactElement {
  const copy = SECTION_INDEX_COPY[section];
  const pages: ReadonlyArray<ContentPage> = pagesOf(site, section);
  return (
    <Shell site={site} current={section} currentPath={sectionPath(section)} toc={[]}>
      <div className={PANE_CLASS}>
        <PaneHeader number={CONTENT_SECTIONS.indexOf(section) + 1} title={SECTION_LABELS[section].plural} />
        <div className="mx-auto max-w-[720px] px-4 pb-14 pt-6 min-[761px]:px-7 min-[761px]:pt-9">
          <nav
            aria-label="Breadcrumb"
            className="font-mono text-[11px] tracking-[0.08em] text-stone-500 [&_a]:text-stone-400 [&_a]:no-underline [&_a:hover]:text-amber-100"
          >
            <a href="/">Home</a> / <span aria-current="page">{SECTION_LABELS[section].plural}</span>
          </nav>
          <h1 className="mb-2.5 mt-3.5 font-display text-[clamp(2rem,3.2vw,2.65rem)] font-medium leading-[1.06] tracking-[-0.015em] text-stone-50">
            {copy.h1}
          </h1>
          <p className="my-5 text-[17.5px] leading-[1.6] text-stone-200">{copy.lede}</p>
          <ul className="m-0 list-none p-0">
            {pages.map(
              (page): React.ReactElement => (
                <li key={page.path} className="border-t border-white/[0.07] py-4">
                  <h2 className="m-0 font-display text-[20px] font-medium leading-snug">
                    <a href={page.path} className="text-stone-50 no-underline hover:text-amber-100">
                      {page.title}
                    </a>
                  </h2>
                  <p className="my-1.5 text-[15px] leading-[1.6] text-stone-300/90">{page.description}</p>
                  <p className="m-0 font-mono text-[11.5px] tracking-[0.04em] text-stone-500">
                    {page.draft ? (
                      <ScheduledBadge date={page.published} />
                    ) : (
                      <>
                        Published <DateText date={page.published} /> {"·"} Updated{" "}
                        <DateText date={page.updated} />
                      </>
                    )}
                  </p>
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </Shell>
  );
}
