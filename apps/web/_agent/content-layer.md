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
   `updated` (`YYYY-MM-DD`, real, not in the future), `author: n-uf`, `takeaways`
   (3 to 5), `faq` (4 to 5, each `q` and `a`), `sources` (`title`, https `url`,
   `checked` date) and `related` (2 to 4 site paths).
3. Body: markdown with H2/H3, paragraphs, lists, tables, fenced code, links, inline
   code. No h1 (it comes from the front matter), no raw HTML, no images yet. The first
   paragraph is the lede. Links are relative (`/docs#quickstart`, `/blog/other`), must
   point at a real page or `/docs` anchor, and at most 2 per target.
4. Render the share images: `pnpm --filter hypr-tiling-web og` (needs Chrome and
   network for the fonts), then commit `apps/web/public/og/*.png`.
5. Regenerate the client index: `pnpm --filter hypr-tiling-web prebuild`
   (also runs on every build) and commit `src/content-index.generated.ts`.
   `content:check` fails when the committed copy is stale.

## Where things live

- `src/content/`: types, front-matter reader, markdown renderer, checks
  (`validate.ts`), loader (`site.ts`), sitemap. Unit tests sit next to them.
- `src/content-page.tsx`, `src/content-head.ts`: the page components and the head tags
  with JSON-LD. `src/entry-server.tsx` exports them to `prerender.mjs`.
- `scripts/content-index.mjs` and `scripts/render-og.mjs` bundle the same TypeScript
  with Vite (`scripts/lib/site-module.mjs`), so the build runs the checks the tests cover.
- The page bodies never reach the client bundle: only the home page and `/docs` read
  `src/content-index.generated.ts` (section, slug, path, title, h1, description).
