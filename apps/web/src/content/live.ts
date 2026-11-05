// The one rule that decides whether a content page is live, and the one switch
// that decides whether drafts are shown. Everything a page can appear in (the
// route, the sitemap, the section indexes, "Read next" cards, llms.txt, the
// client index behind the home page and /docs links) gets its pages through
// these two functions, via `ContentSite.pages` (see `checkContentFiles`).

/** The only field the rule reads. */
export interface DraftFlag {
  readonly draft?: boolean;
}

/** A page is live unless its front matter says `draft: true`. */
export function isLive(page: DraftFlag): boolean {
  return page.draft !== true;
}

/**
 * Build mode. Drafts are shown only on a Vercel preview (`VERCEL_ENV=preview`)
 * or with `SHOW_DRAFTS=1`. Anything else (a local `pnpm build`, CI, Vercel
 * production) is production mode and hides every draft.
 */
export function draftsShown(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.VERCEL_ENV === "preview" || env.SHOW_DRAFTS === "1";
}

/** Whether a page appears in a build: live pages always, drafts only when they are shown. */
export function isVisible(page: DraftFlag, showDrafts: boolean): boolean {
  return isLive(page) || showDrafts;
}
