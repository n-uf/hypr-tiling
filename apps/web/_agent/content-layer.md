# Content layer: use-case and blog pages

Markdown pages for `/use-cases/<slug>` and `/blog/<slug>`, rendered to static HTML
at build time. They ship no tiling app JavaScript and read the same with JS off.

## Adding a page

1. Write `apps/web/content/<section>/<slug>.md` (`<section>` is `use-cases` or `blog`;
   `<slug>` is lower case with hyphens). Only `<slug>.md` files are pages: a
   `.draft.md` or `.review.md` in those folders stops the build.
2. Front matter, all fields required: `title` (at most 60 characters),
   `description` (120 to 155), `h1`, `mainKeyword` (one page each; the home's
   "react tiling window manager" and the docs' "hypr-tiling documentation" are taken),
   `kind` (use-case, how-to, what-is, comparison, best-tools), `published` and
   `updated` (`YYYY-MM-DD`, real, not after today in UTC: a build just before UTC midnight rejects tomorrow's date;
   a scheduled page is the exception, see "Scheduling a page"), `author: n-uf`, `takeaways`
   (3 to 5), `faq` (4 to 5, each `q` and `a`), `sources` (`title`, https `url`,
   `checked` date) and `related` (2 to 4 site paths). One optional field: `draft`
   (`true` or `false`, default `false`).
3. Body: markdown with H2/H3, paragraphs, lists, tables, fenced code, links, inline
   code. No h1 (it comes from the front matter), no raw HTML, no images yet. The first
   paragraph is the lede. Links are relative (`/docs#quickstart`, `/blog/other`), must
   point at a real page or `/docs` anchor, and at most 2 per target.
4. Render the share images: `pnpm --filter hypr-tiling-web og` (needs Chrome and
   network for the fonts), then commit `apps/web/public/og/*.png`.
5. Nothing to regenerate: the client index (`src/content-index.generated.ts`) is
   git-ignored and written by `prebuild`, `predev`, `pretypecheck` and `pretest`.
   `pnpm --filter hypr-tiling-web content:check` runs every check and the generator
   without writing anything.

## Scheduling a page

A finished, reviewed page can merge to `main` before its go-live day and appear on
that day with no further edit.

1. Merge the page with `draft: true` and `published: <go-live date>` (UTC,
   `YYYY-MM-DD`; it may be in the future). Set `updated` to the same date. Every other
   rule applies as usual, and a draft is checked on every build, so a mistake in it
   fails now, not on go-live day. A non-draft page's dates still may not be in the future.
2. `.github/workflows/publish.yml` runs daily at 00:10 UTC (and by hand from the
   Actions tab, "Run workflow"). `apps/web/scripts/publish-due.mjs` sets `draft: false`
   on every draft whose `published` date is today or earlier, and nothing else. When
   something changed, the workflow commits `publish: <slug>[, <slug>]` as
   github-actions[bot] and pushes to `main`; Vercel builds it like any push. Nothing
   due: no commit, no deploy. Preview what is due with
   `node apps/web/scripts/publish-due.mjs --dry-run [--today YYYY-MM-DD]`.
3. One rule decides "live": `draft !== true` (`src/content/live.ts`, `isLive`). In a
   production build (a local `pnpm build`, CI, Vercel production) a draft has no HTML
   (it answers 404), no share image in `dist`, and is absent from the sitemap, the
   section index, "Read next" cards, `llms.txt`, the home page's and `/docs`'s links
   (both home copies) and the nav. A section whose pages are all drafts has no index
   page, no nav link and no sitemap entry, as if it were empty.
4. Drafts show only on a Vercel preview (`VERCEL_ENV=preview`) or with `SHOW_DRAFTS=1`
   (`pnpm dev` sets it): they render like any page, with a "Scheduled for <date>" badge
   before the h1 and `<meta name="robots" content="noindex">`, listed in indexes and
   links so a try sees the whole batch. They stay out of the sitemap.
5. A live page must never link to a draft. A production build fails, naming the page
   and the link, when a live page's body links or `related` paths point at a draft (a
   preview build only warns). Draft-to-draft and draft-to-live links are fine. So the
   link lines from live pages to a scheduled page (and `related` entries) wait until
   the flip: add them in a follow-up after the publish commit lands.
6. Undo: revert the publish commit, or set `draft: true` again (with `published` and
   `updated` set to the new go-live date).
7. Caveats: GitHub can start a scheduled run up to about an hour late, and switches
   schedules off in a repo with no activity for 60 days (re-enable from the Actions
   tab). The bot's push does not run the CI workflow; Vercel's build is the check, and
   if it fails the previous version stays live. `published` ends up as the go-live
   date, so run the workflow by hand early rather than editing dates.

## Where things live

- `src/content/`: types, front-matter reader, markdown renderer, checks
  (`validate.ts`), loader (`site.ts`), sitemap, and the live rule plus build-mode
  switch (`live.ts`). `ContentSite.pages` holds what the build shows; `hidden` holds
  the drafts a production build leaves out. Unit tests sit next to them.
- `src/content-page.tsx`, `src/content-head.ts`: the page components and the head tags
  with JSON-LD. `src/entry-server.tsx` exports them to `prerender.mjs`.
- `scripts/content-index.mjs` and `scripts/render-og.mjs` bundle the same TypeScript
  with Vite (`scripts/lib/site-module.mjs`), so the build runs the checks the tests cover.
- The page bodies never reach the client bundle: only the home page and `/docs` read
  `src/content-index.generated.ts` (section, slug, path, title, h1, description), for
  the pages the build shows.
- `apps/web/scripts/publish-due.mjs` and `.github/workflows/publish.yml`: the daily flip.
