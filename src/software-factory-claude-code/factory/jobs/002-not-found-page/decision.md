APPROVE

## Why
The change is small and self-contained. It adds a static NotFoundView and a catch-all route as the last router entry, and touches nothing related to money, auth, deploy or dependencies. All four round-1 reviews pass, their notes raise no real problems (the white button colour is a matter of taste), and the branch merges into main without conflicts.

## Acceptance criteria
1. `npm run build` exits 0: met. build.md reports a passing build with the emulator block commented out, and the code review re-ran the build and got a pass.
2. `/does-not-exist` and `/blog/a/b/c` show the 404 page with the NotFound title: met. build.md has browser checks of both. The `/:pathMatch(.*)*` pattern matches multi-segment paths.
3. The home link goes to `/`: met. build.md has a browser check, and the diff shows `RouterLink to="/"`.
4. Existing routes still render: met. build.md lists the title and h1 for all six routes. A catch-all in last position cannot shadow earlier routes.
5. The catch-all is the last item in `routes`: met. I checked this myself in the diff: it comes after the commented-out `/about` block, just before `routes` closes.

## For the human
N/A
