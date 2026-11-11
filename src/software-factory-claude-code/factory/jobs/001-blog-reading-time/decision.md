ESCALATE

## Why
The change is correct and complete: every acceptance criterion is met, all four round-1 reviews are `VERDICT: PASS` with no real problems in their Notes, and `git merge-tree --write-tree main factory/001-blog-reading-time` merges cleanly (tree `6826bee`). I am escalating only because the branch edits a prerender script (`scripts/prerender-blog.js`), which is on the list of deploy/hosting changes that need a human. The edit is one line: it adds `readingTime.js` to `RENDERER_DEPENDENCIES`, which the spec required (Requirement 6).

## Acceptance criteria
1. Helper follows the rule: met. I ran the spec command and got `1 1 1 2`.
2. Helper matches `wc -w` on real posts: met. I ran the spec command and got `3`, `4`, `16` in order.
3. `npm run build` succeeds: met. build.md and the code review both report a passing build.
4. `/blog/random-number-mcp` meta line reads `June 26, 2025 · 3 min read` on one line, same grey and size: met. build.md shows the DOM, the same `top` for all children, and the same color and font size. The UI review confirms it at 390px.
5. Hetzner post reads `August 30, 2026 · 16 min read`: met, per build.md browser check.
6. Every `/blog` card reads `<date> · N min read` with matching values: met. build.md checked all 9 cards on page 1 and the 5 on page 2. The diff shows `date` stays a bare date and `readingTime` is its own field.
7. Ordering, tag filter and pagination unchanged: met. build.md checked them in the browser, and the diff does not touch the sort, filter or pagination code.
8. `RENDERER_DEPENDENCIES` entry: met. I ran the grep and got line 57, `join(__dirname, '..', 'src', 'blog', 'readingTime.js'),`.
9. Prerendered HTML contains `3 min read`: met, per build.md after `npm run build && npm run prerender-blog:force`.
10. `git diff main -- src/firebase.js` is empty: met. I checked and it has 0 lines.

Other checks: one commit, `1cc51a1 Show reading time on blog posts and list cards`, a one-line message with no attribution trailer. No new dependency, nothing under `functions/`, no rules, auth, money or email changes.

## For the human
Decide whether a one-line edit to a prerender script is OK to merge. In `scripts/prerender-blog.js` (line 57), the branch adds `src/blog/readingTime.js` to `RENDERER_DEPENDENCIES`. The only effect is that changing the reading-time rule invalidates the blog prerender cache. On the first `./deploy.sh` after merging, every blog post will re-prerender once, because the dependency hash changes. If that is fine, merge `factory/001-blog-reading-time`.

Files to look at: `scripts/prerender-blog.js`, `src/blog/readingTime.js`, `src/views/BlogPostView.vue`, `src/views/BlogListView.vue`.

Optional product check: the spec assumes 200 words per minute and counts the whole Markdown, code blocks included. That gives, for example, `16 min read` on the Hetzner post.
