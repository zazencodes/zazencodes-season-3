# 404 page for unknown routes

> Feature: Add a 404 page for unknown routes instead of rendering a blank page

## Context
- `src/router/index.js` defines every route with `createWebHistory`. There is no catch-all route, so a URL that matches nothing (e.g. `/does-not-exist`) renders an empty `<RouterView>`, which is the blank page.
- `firebase.json` hosting rewrites `**` to `/index.html`, so every unknown path reaches the SPA. The fix belongs in the client router.
- `router.afterEach` in the same file calls `updateMetaTags` (`src/utils.js`) when a route has `meta.title`. Static routes such as `/newsletter` and `/privacy-policy` set their title this way, and the new route should do the same.
- Views live in `src/views/`. `src/views/NewsletterView.vue` shows the existing centred, dark-gradient page style: the `zc_logo.svg` logo with `invert-svg`, plus Tailwind classes.
- Prerendering (`scripts/prerender-static.js`, `prerender-blog.js`, `prerender-course.js`) uses explicit route lists, so a catch-all route is never prerendered.

## Requirements
1. Add `src/views/NotFoundView.vue`. It shows a clear "404 / page not found" heading, a short line of explanation, and a `RouterLink` to `/`. Style it with Tailwind, following the look of `NewsletterView.vue`.
2. Register a catch-all route as the **last** entry in `routes` in `src/router/index.js`: `{ path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFoundView, meta: { title: ... } }`. The title must be something like `Page Not Found | ZazenCodes`. Import the view the same way the other views are imported (a static import).
3. Every existing route keeps resolving exactly as it does today.
4. `npm run build` succeeds.

## Acceptance criteria
1. Run `npm run build` (with the emulator block in `src/firebase.js` commented out). It exits 0.
2. Run `npm run dev` and open `/does-not-exist` and `/blog/a/b/c`. Each shows the 404 page, not a blank page, and the browser tab title is the NotFound title.
3. On the 404 page, clicking the home link navigates to `/` and shows the home page.
4. Open `/`, `/courses`, `/blog`, `/newsletter`, `/training`, and an existing blog post such as the first slug in `src/assets/blog/index.json`. Each still renders its normal page.
5. `src/router/index.js` has the `/:pathMatch(.*)*` route as the last item of the `routes` array.

## Out of scope
- Showing the 404 for routes that match a pattern but point at missing data (an unknown `/courses/:courseId` or `/blog/:slug`). Those views keep their current behaviour.
- Returning an HTTP 404 status from Firebase Hosting or changing `firebase.json`.
- Prerendering the 404 page, or adding it to sitemaps.
- Changing the navbar, footer or any other view.

## Assumptions
- "Unknown routes" means paths that match no router pattern. Unknown slugs inside known patterns are handled per view, which is a bigger change.
- Hosting keeps returning 200 with the SPA shell. A real HTTP 404 would need server-side changes, which the request does not ask for.
- No doc update is needed. AGENTS.md lists no routes individually, and the page has no content workflow.
