# Blog reading time next to the date

> Feature: Show an estimated reading time next to the date on blog post pages and blog list cards

## Context

Blog posts are Markdown files at `src/assets/blog/posts/<folder>/blog_post.md`,
with metadata (`id`, `title`, `description`, `date`, `tags`) in
`src/assets/blog/index.json`, keyed by the public slug. None of the posts use
front matter. Two views show a post's date:

- **`src/views/BlogPostView.vue`** (route `/blog/:slug`). In `onMounted` it
  loads the post with
  `import(\`../assets/blog/posts/${metadata.id}/blog_post.md?raw\`)`, so
  `content.default` is the raw Markdown string. It strips the leading H1, splits
  the body with `splitAtCta`, and builds `post.value` with a formatted `date`.
  The date renders in the header byline as
  `<div class="blog-post-meta"><time>{{ post.date }}</time></div>`.
  `.blog-post-meta` (in the same file's `<style>`) is already a wrapping flex
  row with `gap: 0.25rem 0.65rem`, so it can hold more than one item.
- **`src/views/BlogListView.vue`** (route `/blog`). In `onMounted` it loads every
  post with `import.meta.glob('../assets/blog/posts/*/blog_post.md')`, with no
  `?raw`. Those files go through `vite-plugin-markdown`
  (`vite.config.js`, `mode: ['markdown']`), which exports only the named
  bindings `attributes` and `markdown`. There is **no** `default` export, so
  `content.default` is `undefined` and the existing excerpt code always
  produces `''`. The Markdown body is available as `content.markdown`. Each card
  renders the date as `<p class="text-sm text-gray-500">{{ post.date }}</p>`.
  Posts are sorted with `new Date(b.date) - new Date(a.date)` on the formatted
  `date` string, so `date` must stay a bare date.

Pure blog helpers live in `src/blog/`. `src/blog/splitAtCta.js` is the
existing example: a dependency-free ES module with a named export and a doc
comment explaining the rule.

`scripts/prerender-blog.js` snapshots `BlogPostView` to static HTML with
Puppeteer. Its `RENDERER_DEPENDENCIES` array lists the source files whose
contents feed the renderer cache hash, so editing any of them re-renders every
post. Whatever the post page shows, including the new reading time, ends up in
`dist/blog/<slug>/index.html`. The `/blog` list page is not prerendered
(`scripts/prerender-static.js` `ROUTES`).

Nothing in `src/` computes or shows a reading time today.

## Requirements

1. Add `src/blog/readingTime.js`. It is a dependency-free ES module (no imports,
   so plain `node` can import it) that exports
   `readingTimeMinutes(markdown)`. It counts words as the whitespace-separated
   tokens of the whole Markdown string (`markdown.trim().split(/\s+/)`, which
   matches `wc -w`), divides by 200 words per minute, rounds up with
   `Math.ceil`, and returns a whole number that is never below 1. Give it a
   short doc comment stating the rule, in the style of `splitAtCta.js`.
2. Both views pass the full, unmodified file contents of `blog_post.md` to
   `readingTimeMinutes`, so a post shows the same number in both places:
   - `BlogPostView.vue`: `content.default` from the existing `?raw` import,
     before the H1 strip.
   - `BlogListView.vue`: `content.markdown` from the existing glob import.
3. `BlogPostView.vue` stores the value on `post.value` as its own field and
   renders it inside `.blog-post-meta`, after the `<time>`, as
   `<span aria-hidden="true">·</span>` followed by `<span>N min read</span>`.
   It uses the existing `.blog-post-meta` styling and adds no new CSS.
4. `BlogListView.vue` adds the value to each post object as its own field
   (`date` stays the bare formatted date) and renders it in the card's existing
   date `<p>`, so the line reads `<date> · N min read`, for example
   `June 26, 2025 · 3 min read`. It keeps the existing
   `text-sm text-gray-500` classes.
5. The label is always `N min read`, with no singular or plural variant.
6. Add `join(__dirname, '..', 'src', 'blog', 'readingTime.js')` to
   `RENDERER_DEPENDENCIES` in `scripts/prerender-blog.js`, so a change to the
   rule invalidates the prerender cache.
7. `src/firebase.js` is committed with the emulator block commented out (see
   AGENTS.md "Firebase Emulator Block").

No docs change is needed. The value is derived from the Markdown, so the blog
content workflow in AGENTS.md (folder, cover image, `index.json` entry, sitemap)
is unchanged.

## Acceptance criteria

1. The helper exists and follows the rule. From the worktree, run:
   `node -e "import('./src/blog/readingTime.js').then(({readingTimeMinutes:r})=>console.log(r(''), r('one'), r('w '.repeat(200)), r('w '.repeat(201))))"`.
   It prints `1 1 1 2`.
2. The helper matches `wc -w` on real posts. Run:
   `node -e "import('./src/blog/readingTime.js').then(({readingTimeMinutes:r})=>{const f=require('fs');for(const d of ['2025_06_25_random_number_mcp','2025_03_28_7_step_guide_for_vibe_coding_new_features_for_existing_projects','2026_08_22_hetzner_experiments_ai_inference_api'])console.log(d,r(f.readFileSync('src/assets/blog/posts/'+d+'/blog_post.md','utf8')))})"`.
   It prints `3`, `4` and `16` in that order (519, 757 and 3148 words today).
3. `npm run build` succeeds.
4. Run `npm run dev` and open `/blog/random-number-mcp`. Under the author name
   the meta line reads `June 26, 2025 · 3 min read`, on one line at desktop
   width, in the same grey and size as the date.
5. Open `/blog/hetzner-experiments-ai-inference-api`. The meta line reads
   `August 30, 2026 · 16 min read`.
6. Open `/blog`. Every card's date line reads `<date> · N min read`. The
   "Random Number MCP" card reads `June 26, 2025 · 3 min read`, matching
   criterion 4, and the Hetzner card shows `16 min read`, matching criterion 5.
7. Cards on `/blog` are still ordered newest first, and the tag filter and
   pagination behave as before.
8. `grep -n "readingTime.js" scripts/prerender-blog.js` shows the new
   `RENDERER_DEPENDENCIES` entry.
9. After `npm run build && npm run prerender-blog:force`,
   `grep -o "3 min read" dist/blog/random-number-mcp/index.html` prints a
   match.
10. `git diff main -- src/firebase.js` is empty.

## Out of scope

- Fixing the empty excerpts in `BlogListView.vue` (`content.default` is
  undefined, see Context). Leave the excerpt code as it is. Fixing it would put
  new text on every card, which is a separate change.
- Switching the list view's glob to `?raw`, or changing how either view loads
  Markdown.
- Adding a reading-time or word-count field to `src/assets/blog/index.json`, or
  a build step that precomputes it.
- Stripping code blocks, images, links or Markdown syntax before counting, or
  weighting images. The count is the plain whitespace-token rule above.
- Showing reading time anywhere else, such as course lessons (`TopicView`), the
  homepage, OG/meta tags or JSON-LD.
- An icon next to the reading time, new CSS classes, or restyling the byline or
  card.
- Adding `splitAtCta.js` or `InlineCta.vue` to `RENDERER_DEPENDENCIES`. They are
  missing from it today, but that gap predates this job.

## Assumptions

- **200 words per minute, rounded up, minimum 1.** This is a common
  conservative rate for technical writing, and rounding up never shows
  `0 min read`.
- **The whole Markdown counts, code blocks included.** It is the simplest rule
  that gives the same number on both pages. Code-heavy posts read slower, so
  counting code does not badly overstate the time.
- **Label format `N min read`, joined to the date with a middle dot `·`.**
  This is the widely recognised convention, and the label needs no plural
  handling.
- **The value is computed in the browser rather than stored in `index.json`.**
  Both views already load the post Markdown, so this adds no extra fetch and
  leaves authors nothing to keep in sync.
- **The reading time also appears in the prerendered post HTML.** This happens
  automatically because prerendering snapshots `BlogPostView`, and the list page
  is not prerendered.
