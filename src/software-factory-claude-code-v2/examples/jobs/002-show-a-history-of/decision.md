APPROVE

## Summary
- Approved: a small change to `web/index.html` only
- Adds an in-memory list of the last 5 calculations, newest first
- Round 1 gate passed and all three reviews (code, UI, UX) passed
- All 10 acceptance criteria are met
- Touches nothing in money, access, deploy, data or dependencies

## Why
A small change to `web/index.html` only. It adds an in-memory list of the last 5 calculations, newest first, built with `createElement` and `textContent` and hidden by `:empty` until the first submit. The round 1 gate passed, all three reviews passed, and none of their Notes is a real problem (they cover optional a11y polish, a variable that shadows `window.history` inside the callback, and the existing `step=1` behaviour). It touches nothing in money, access, deploy, data, or dependencies, and it stays inside intake's Scope.

## Acceptance criteria
1. Only `web/index.html` changed: met. I ran `git diff --stat origin/main...HEAD` and it shows 1 file.
2. Unit tests and checks.sh pass: met. round-1/checks.md says `GATE: PASS` and the log shows `OK`.
3. First load shows nothing extra: met. The `#history:empty { display: none; }` rule and the empty `<ul id="history"></ul>` (no whitespace inside) are in the diff. The builder and the UX reviewer both saw `display: none` with 0 `li` in the browser.
4. `2 + 3 = 5` after the defaults: met. The handler writes `${a} + ${b} = ${sum}` using the same `sum` it writes to `#result`. The builder confirmed it in the browser.
5. `10 + -4 = 6` above `2 + 3 = 5`: met. `prepend` puts the newest entry first. The builder and the UX reviewer both confirmed it in the browser.
6. Six submits leave 5 entries, newest first: met. The `while (children.length > 5) lastElementChild.remove()` loop trims the list. The builder, UX and UI reviews all confirmed it.
7. Reload clears the list: met. Nothing is stored, and the browser check showed it hidden and empty after reload.
8. No innerHTML, insertAdjacentHTML, localStorage or sessionStorage: met. I ran the grep in the worktree and it exited 1 with no matches.
9. `grep history` shows the markup, the rule and the code: met. All three are in the diff.
10. No changes to calc.py, tests or AGENTS.md: met. The diff touches only `web/index.html`.
