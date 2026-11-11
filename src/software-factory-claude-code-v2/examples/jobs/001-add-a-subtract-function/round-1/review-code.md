VERDICT: PASS

## Summary
- Passed with no findings
- `subtract` matches the spec: placed after `add`, same style, body `return a - b`
- `tests/test_subtract.py` follows the `tests/test_calc.py` layout, which stays unchanged
- Re-ran the unit tests as a spot check: 2 tests, OK
- Optional follow-up: a negative-result test such as `subtract(2, 7) == -5`

## Findings
None.

## Notes
- `calc.py` adds `subtract(a, b)` directly after `add` with no docstring, the same parameter names and the one-line body `return a - b`, as spec requirements 1 to 3 ask. Two blank lines separate the functions, matching PEP 8 and the file's existing layout.
- `tests/test_subtract.py` follows the `tests/test_calc.py` layout (imports, `SubtractTest`, `test_subtract`, `__main__` footer). `tests/test_calc.py` is unchanged, and the branch touches only `calc.py` and `tests/test_subtract.py`, as spec requirements 5 and 6 and acceptance criterion 8 ask.
- The test covers only the single example from intake (`subtract(5, 3) == 2`), which is what the spec asks for. Adding a negative-result case such as `subtract(2, 7) == -5` would be a reasonable follow-up, but it is not required here.
- Re-ran `python3 -m unittest discover -s tests -t .` on the worktree as a spot check: `Ran 2 tests`, `OK`. `git status` is clean.
- The commit `2934f5d Add subtract function with test` is a single one-line message with no stray files.
