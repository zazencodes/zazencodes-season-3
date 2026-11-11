STATUS: READY

# Build: Show a history of results on the page

## Summary
- The page now lists the last 5 calculations under the result, newest first
- Each entry reads `a + b = sum` and is built with `textContent`
- The list stays hidden until the first submit and resets on reload
- Round 1 changed only `web/index.html` (commit `5ab9cce`) and opened draft PR #7
- Unit tests, `checks.sh` and the browser checks all pass

## Changes
The page now keeps the last 5 calculations in memory and shows them in a list under the result line, newest first. Each entry reads `a + b = sum`, built with `textContent`. The list is hidden with `#history:empty { display: none; }` until the first submit, and it resets on reload.

Files changed (commit `5ab9cce`):
- `web/index.html`: added `<ul id="history"></ul>` below `#result`, two CSS rules (`#history` and `#history:empty`), and a few lines in the existing submit handler.

Draft PR #7

## Acceptance criteria
1. [x] `git diff --name-only origin/main...HEAD` lists only the page: output was `web/index.html`.
2. [x] Unit tests and gate pass: `python3 -m unittest discover -s tests -t .` printed `OK`; `bash factory/checks.sh` exited 0.
3. [x] First load shows nothing extra: in the browser on `http://localhost:5120/`, `#history` computed `display: none` and had 0 `li` children. Screenshot in the scratchpad.
4. [x] Defaults 2 and 3 then `=`: `#result` is `5`, `display` is `block`, and `#history li` text is exactly `2 + 3 = 5`.
5. [x] Inputs `10` and `-4` then `=`: `#result` is `6`, and the items are `["10 + -4 = 6", "2 + 3 = 5"]`, newest first.
6. [x] Six submits in a row (`1+1`, `2+2`, `3+3`, `4+4`, `5+5`, `6+7`): 5 `li` items, newest first (`6 + 7 = 13`, `5 + 5 = 10`, `4 + 4 = 8`, `3 + 3 = 6`, `2 + 2 = 4`). `1 + 1 = 2` is gone.
7. [x] Reload: `#history` is `display: none` with 0 `li` children.
8. [x] `grep -n "innerHTML\|insertAdjacentHTML\|localStorage\|sessionStorage" web/index.html`: no matches (exit 1).
9. [x] `grep -n "history" web/index.html` shows the markup `<ul id="history"></ul>`, the `#history:empty` rule, and the `prepend` and `createElement` code that adds `<li>` items.
10. [x] `git diff origin/main -- calc.py tests AGENTS.md`: no output.

## Validation
- `bash <repo>/factory/checks.sh` (run from the worktree): passed, exit 0.
- `python3 -m unittest discover -s tests -t .`: `OK`, 1 test.
- `python3 -m http.server 5120 --directory web`, checked with agent-browser (session `002-show-a-history-of-builder`). Dev server and browser were closed afterwards.
- `git status --porcelain`: clean after commit and push.

Notes from the browser run:
- The number inputs keep the default `step=1`, so a non-integer such as `0.1` is blocked by the browser's own validation before the submit handler runs. This is existing behaviour and was not changed. I used integer pairs for the six-submit check.

## Log
### Round 1
- Read the spec and AGENTS.md. Setup: none needed (standard library only).
- Added the list markup, the two CSS rules, and the submit handler changes in `web/index.html`. The handler computes `sum` once and writes it to `#result`. It then prepends an `li` with the text `${a} + ${b} = ${sum}` and removes the last item while there are more than 5.
- Ran the gate and unit tests, then the browser checks for criteria 3 to 7. My first six-submit attempt looked wrong (`0 + 0` entries) because zsh did not split my loop variable. That was a harness bug. My second attempt had `6 + 0.1`, which the browser blocked, as noted above. The third attempt, with integers, passed.
- Committed, pushed the branch, and opened the PR as a draft (#7).
