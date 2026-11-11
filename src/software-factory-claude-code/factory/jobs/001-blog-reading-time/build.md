STATUS: READY

# Build: Blog reading time next to the date

## Summary
A new dependency-free helper, `readingTimeMinutes(markdown)`, counts the whitespace tokens in a
post's Markdown (`markdown.trim().split(/\s+/)`). It divides by 200 words per minute, rounds up,
and never returns less than 1. Both blog views pass it the full, unmodified `blog_post.md`
contents. The post page reads `content.default` before the H1 is stripped, and the list page reads
`content.markdown`. The post page byline renders `<time>` · `N min read` inside `.blog-post-meta`.
Each list card renders `<date> · N min read` in its existing date `<p>`, and `date` stays a bare
date. The helper is now in the prerender cache's `RENDERER_DEPENDENCIES`.

Commit `1cc51a1 Show reading time on blog posts and list cards`. Files changed:
- `src/blog/readingTime.js` (new)
- `src/views/BlogPostView.vue`
- `src/views/BlogListView.vue`
- `scripts/prerender-blog.js`

## Acceptance criteria
1. [x] The helper follows the rule. The given `node -e` command prints `1 1 1 2`.
2. [x] The helper matches `wc -w` on real posts. The given command prints
   `2025_06_25_random_number_mcp 3`, `2025_03_28_7_step_guide_..._existing_projects 4` and
   `2026_08_22_hetzner_experiments_ai_inference_api 16`.
3. [x] `npm run build` succeeds (`✓ built`). It was run before and after the commit.
4. [x] Dev server on 5110 at 1440x900, `/blog/random-number-mcp`. Under "Alexander Galea" the
   meta line shows `June 26, 2025 · 3 min read` on one line: all three children have the same
   `top` (396.8px). The `<time>` and both spans have the same color `rgb(174, 181, 186)` and the
   same size, 13px. The DOM is
   `<time>June 26, 2025</time><span aria-hidden="true">·</span><span>3 min read</span>`. I also
   confirmed it in a screenshot.
5. [x] `/blog/hetzner-experiments-ai-inference-api`. The meta children are
   `["August 30, 2026","·","16 min read"]`, all on one line.
6. [x] `/blog`. All 9 cards on page 1 match `^<Month D, YYYY> · N min read$`. Random Number MCP
   reads `June 26, 2025 · 3 min read` and Hetzner reads `August 30, 2026 · 16 min read`. The 5
   cards on page 2 also show reading times (for example `March 17, 2025 · 19 min read`).
7. [x] Page 1 is in newest-first order (checked in the browser, comparing each date with the one
   before it). It says "Page 1 of 2". Next shows the 5 older posts on "Page 2 of 2". Selecting the
   `mcp` tag shows 4 matching posts in date order with no pagination. "Clear filters" goes back to
   all posts on page 1. The sort, filter and pagination code is unchanged.
8. [x] `grep -n "readingTime.js" scripts/prerender-blog.js` prints
   `57:  join(__dirname, '..', 'src', 'blog', 'readingTime.js'),`.
9. [x] After `npm run build && npm run prerender-blog:force`, `grep -o "3 min read"
   dist/blog/random-number-mcp/index.html` prints `3 min read`. The Hetzner snapshot also
   contains `16 min read`.
10. [x] `git diff main -- src/firebase.js` is empty (0 lines). The emulator block stayed
    commented out the whole time; the blog pages didn't need the emulators.

## Validation
- `node -e` helper checks (AC1, AC2): pass.
- `npx eslint src/blog/readingTime.js src/views/BlogListView.vue src/views/BlogPostView.vue`:
  pass.
- `npx eslint scripts/prerender-blog.js`: 2 `'process' is not defined` errors (lines 63 and 275).
  They are the same on `main` without this change, so they predate this job.
- `npx prettier --check` on the changed files: `readingTime.js` and `BlogListView.vue` are clean.
  `BlogPostView.vue` (import order) and `prerender-blog.js` (a line wrap) already fail on `main`,
  and this change adds no new Prettier issues to them.
- `npm run build`: pass.
- `npm run prerender-blog:force`: pass.
- Browser checks with `agent-browser --session 001-blog-reading-time-builder` against
  `npx vite --port 5110 --strictPort`: pass. The browser is closed and the dev server is stopped.
- `git status --porcelain`: empty.

## Log
### Round 1
- Added `src/blog/readingTime.js` with a doc comment in the style of `splitAtCta.js`.
- Wired it into `BlogPostView.vue` (a `readingTime` field and the byline spans) and
  `BlogListView.vue` (a `readingTime` field and the card date line), and added it to
  `RENDERER_DEPENDENCIES`.
- Ran Prettier on `BlogListView.vue` so the new import is sorted. I did not reformat the
  Prettier issues in `BlogPostView.vue` and `prerender-blog.js` that predate this change, to keep
  the diff in scope.
- On every page load, a newsletter popup covered the page and had to be dismissed before taking
  screenshots or clicking.
