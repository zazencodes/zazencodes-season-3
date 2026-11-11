# Show a history of results on the page

> Issue #2: Show a history of results on the page

## Summary
- Adds a `<ul id="history">` list under `#result` in `web/index.html`, the only file that changes
- The existing submit handler adds an entry like `2 + 3 = 5` at the top and keeps at most 5
- CSS hides the list until the first submit
- No storage, `innerHTML`, extra UI or Python changes
- Checked in the browser, since the page has no JavaScript test runner

## Context

- `web/index.html` is the whole app: a static page with inline CSS and one inline `<script>`. It has no build step and no JavaScript test runner.
- Markup today: a form `#form` with number inputs `#a` and `#b`, a submit button, and an empty `<div id="result">` below the form.
- Submit handler (inline script): calls `e.preventDefault()`, reads `Number(#a.value)` and `Number(#b.value)`, and writes `a + b` into `#result` with `textContent`. This is the only place a sum is computed. `calc.py` (`add`) is not used by the page and is not changed.
- CSS: one `body` rule, a shared `input, button` rule, and `#result { margin-top: 16px; font-weight: 600; }`. The page is 420px wide.
- Tests: `tests/test_calc.py` covers `calc.add` only. `AGENTS.md` says every function in `calc.py` has a test. This change adds no function to `calc.py`, so no test changes are needed.
- `AGENTS.md` describes the dev server (`python3 -m http.server <port> --directory web`) and the checks (`factory/checks.sh`).

## Requirements

1. Edit `web/index.html` only. Do not change `calc.py`, the tests, `AGENTS.md`, or any other file. Add no dependencies.
2. Add a history list below `#result` in the markup, as an element with id `history` (`<ul id="history"></ul>`), so it sits under the result line.
3. Style it in the existing `<style>` block so it looks like the rest of the page: no bullets (`list-style: none`), no default padding, a small top margin (for example `margin: 12px 0 0`), and a muted colour or the same font. Keep it plain. Use the existing CSS block, not inline `style` attributes.
4. Hide the list entirely when it has no items, with CSS only (`#history:empty { display: none; }`). No placeholder text, heading or border appears before the first submit.
5. In the existing submit handler, after the result is written, add one `<li>` at the top of `#history` with the text `a + b = sum`, where `a` and `b` are the two numbers the handler already read and `sum` is the same value written to `#result`. Example: `2 + 3 = 5`.
6. Build the `<li>` text with `textContent` (or `document.createElement` plus `textContent`). Do not use `innerHTML` or `insertAdjacentHTML` for entries.
7. After adding an entry, keep at most 5 entries: remove the oldest (the last `<li>`) while there are more than 5. The list is newest first.
8. Keep the history in page memory only. Do not use `localStorage`, `sessionStorage`, cookies, or any network call. It resets on page reload.
9. Do not add a clear button, per-entry delete, persistence, or any new UI element beyond the list.
10. Keep the change minimal: add the markup, a small CSS addition, and a few lines in the existing submit handler. Do not refactor the handler into new named functions unless it is needed to keep the code readable; if you add a helper, define it inside the existing `<script>` block.
11. No doc changes are needed: `AGENTS.md` does not describe page features in detail and needs no update.

## Acceptance criteria

1. `git diff --name-only origin/main...HEAD` in the worktree lists only `web/index.html`.
2. `cd <worktree> && python3 -m unittest discover -s tests -t .` still passes, and `factory/checks.sh` passes. (No new tests are required because the page has no JS test runner.)
3. Serve the page with `python3 -m http.server 8000 --directory web` and open `http://localhost:8000/`. On first load, the area under the result line shows nothing extra: no list bullets, no empty box, no heading. Verify with the browser dev tools: `#history` has `display: none`, and it has no `<li>` children.
4. With the defaults (2 and 3), click `=`. Under the result `5`, a single line reads `2 + 3 = 5`. Verify `#history li` text is exactly `2 + 3 = 5`.
5. Change the inputs to `10` and `-4` and click `=`. The list shows `10 + -4 = 6` above `2 + 3 = 5` (newest first), and `#result` shows `6`. Verify in dev tools that the first `li` is the newest.
6. Submit six different calculations in a row. The list has exactly 5 `<li>` items, the newest first. The first calculation submitted is no longer present.
7. Reload the page. The list is empty again and hidden (`#history` has `display: none`, no `<li>`).
8. `grep -n "innerHTML\|insertAdjacentHTML\|localStorage\|sessionStorage" web/index.html` in the worktree returns no matches.
9. `grep -n "history" web/index.html` shows the `id="history"` list in the markup, the `#history:empty` rule, and the code that adds `<li>` items.
10. `git diff origin/main -- calc.py tests AGENTS.md` in the worktree shows no changes.

## Out of scope

- Persisting history across reloads (localStorage, sessionStorage, cookies, server storage).
- A clear button, deleting single entries, or editing a past entry.
- Showing history for anything other than form submits, such as on input change or Enter key handling that bypasses submit.
- Any change to `calc.py`, `tests/`, or any new Python function. The page keeps computing the sum itself, as it does now.
- Any new dependency, framework, build step, or separate JavaScript file.
- Making the history count configurable, or adding pagination or scrolling.
- Restyling the existing page (fonts, layout, form controls) beyond the new list.
- Updating `AGENTS.md`, the dashboard, or the factory itself.

## Assumptions

1. Entries use the numbers as the handler reads them (`Number(...)`), so `2 + 3 = 5` and an empty input shows `0`. Reason: this matches the value the result line already shows.
2. The sum in an entry is the same value written to `#result`, including any floating point output such as `0.30000000000000004`. Reason: the issue asks for the result, and the page already shows that value unchanged.
3. Negative numbers are shown as the number itself, for example `10 + -4 = 6`. Reason: no special formatting is requested, and this is the simplest rule.
4. The list is newest first and holds the last 5 entries, not the first 5. Reason: the issue says "the last 5 calculations, newest first."
5. A submit with the same inputs as the previous one still adds a new entry. Reason: each submit is a calculation.
6. No automated test is added for the page. Reason: the repo has no JavaScript test runner and the issue asks for a small UI change; the acceptance criteria are checked in a browser.
