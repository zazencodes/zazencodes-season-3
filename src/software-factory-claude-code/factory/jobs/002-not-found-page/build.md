STATUS: READY

# Build: 404 page for unknown routes

## Summary
Unknown paths now render a 404 page instead of a blank `<RouterView>`. A catch-all
`/:pathMatch(.*)*` route named `NotFound` (title `Page Not Found | ZazenCodes`) is the last
entry in `routes`. It points at a new view styled like `NewsletterView`: a centred dark gradient,
the inverted logo, a "404 - Page not found" heading, one line of explanation and a "Back to home"
`RouterLink` to `/`.

Files changed:
- `src/views/NotFoundView.vue` (new)
- `src/router/index.js` (static import plus the catch-all route)

Commit: `6bb51ce Add 404 page for unknown routes`

## Acceptance criteria
1. [x] `npm run build` exits 0: the emulator block in `src/firebase.js` was commented out (lines 290-291 start with `//`), and the build ended with `✓ built in 4.08s`.
2. [x] I ran `npx vite --port 5120` and checked with agent-browser. `/does-not-exist` gave title `Page Not Found | ZazenCodes` and h1 `404 - Page not found`. `/blog/a/b/c` gave the same title and h1.
3. [x] On `/does-not-exist` I first dismissed the site-wide newsletter popup ("No thanks, hide this"; it covers the page on first visit). Clicking "Back to home" then went to `http://localhost:5120/`, with title `ZazenCodes | Engineering for the Agentic Era` and the home h1 "Engineering for the Agentic Era".
4. [x] Existing routes still render normally (title and h1):
   - `/`: "ZazenCodes | Engineering for the Agentic Era" / "Engineering for the Agentic Era"
   - `/courses`: "ZazenCodes Courses | ..." / "Become the AI expert on your team."
   - `/blog`: "ZazenCodes Blog | ..." / "ZazenCodes Blog"
   - `/newsletter`: "ZazenCodes Newsletter | ..." / "Learn how to use coding agents like the top 1%."
   - `/training`: "Corporate AI Training for Developer Teams | ZazenCodes" / "Get your engineering team using coding agents properly."
   - `/blog/the-awesome-power-of-an-llm-in-your-terminal` (first slug in `index.json`): the post title in both.
5. [x] `src/router/index.js` has the `/:pathMatch(.*)*` route as the last item of `routes`, after the commented-out `/about` block.

## Validation
- `npx eslint src/router/index.js src/views/NotFoundView.vue`: passed, no output.
- `npx prettier --check` on both files: passed.
- `npm run build` (Node 22): passed.
- Dev server and agent-browser checks above: passed. The browser session is closed and the dev server is stopped.
- `git status --porcelain`: clean.

## Log
### Round 1
Added `NotFoundView.vue` and the catch-all `NotFound` route, then verified every acceptance criterion in the dev server and with a production build.
