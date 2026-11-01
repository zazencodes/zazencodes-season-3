DECISION: ACCEPT
RISK: low
SURFACES: ui
RESCOPED: no

## Summary
- Accepted as a low-risk UI change to `web/index.html` only
- Shows the last 5 calculations under the result, newest first, as `a + b = sum`
- History lives in page memory and clears on reload
- Entries are rendered with `textContent`, not `innerHTML`
- Leaves out persistence, a clear button, deleting entries and any `calc.py` change

## Scope
Change `web/index.html` only.

- Under the result line, show a list of the last 5 calculations, newest first, each as `a + b = sum` (for example `2 + 3 = 5`).
- Record an entry each time the form is submitted, using the two input values and the sum shown in the result.
- Keep the history in page memory only. It is cleared on reload, so nothing is stored in localStorage or on a server.
- Render each entry with `textContent` (or DOM nodes), not `innerHTML`.
- Show nothing extra when there is no history yet, and keep the list visually simple to match the existing page style.
- Add no new dependencies and no new functions in `calc.py`.

Left out: persistence across reloads, a clear button, deleting single entries, and any change to `calc.py` or the tests.

## Why
The request is clear and small, and the issue states the format and the reset behaviour. `web/index.html` already has the submit handler that computes `a + b` and writes it to `#result`, so the history is a small addition to that one script and markup. No Python change is needed because the sum is already computed in the page. The change is low risk and only touches the UI.
