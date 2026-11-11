VERDICT: PASS

## Findings
None.

## Notes
- The change touches only `src/router/index.js` (adds a catch-all route) and the new `src/views/NotFoundView.vue`, which renders only static content.
- The unmatched path (`pathMatch`) is never put into the DOM, a URL or meta tags. There is no `v-html`, and the title is a fixed string, so there is no XSS path.
- No Firestore rules, Cloud Functions, payment, content-gating or secrets changes. `src/firebase.js` is not touched, so the emulator block stays as it is on main.
- The catch-all is the last entry in `routes`, so no existing route (gated or otherwise) is shadowed.
