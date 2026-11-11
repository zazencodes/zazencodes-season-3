STATUS: READY

# Build: Add a subtract function

## Summary
- `calc.py` now has `subtract(a, b)` after `add`, returning `a - b`
- New `tests/test_subtract.py` asserts `subtract(5, 3) == 2`
- `tests/test_calc.py` is untouched because it is a protected path
- Round 1 committed `2934f5d` and opened draft PR #6
- All acceptance criteria and `checks.sh` pass

## Changes
`calc.py` now defines `subtract(a, b)` directly after `add`, with no docstring and the one-line body `return a - b`. A new test file `tests/test_subtract.py` holds `SubtractTest.test_subtract`, which asserts `subtract(5, 3) == 2`. `tests/test_calc.py` is unchanged because it is a protected path. No UI was changed, so no dev server or browser check was needed.

Files changed (vs `main`):
- `calc.py` (+4 lines)
- `tests/test_subtract.py` (new, 12 lines)

Commit: `2934f5d Add subtract function with test`. Draft PR #6

## Acceptance criteria
1. [x] `calc.py` has `def subtract(a, b):` right after `add` with body `return a - b`: `grep -n "def subtract" calc.py` printed `8:def subtract(a, b):`, after `def add` on line 4. `sed -n '1,20p' calc.py` shows `    return a - b` as the only body line.
2. [x] `python3 -c "from calc import subtract; print(subtract(5, 3))"` printed `2`.
3. [x] `python3 -c "from calc import subtract; print(subtract(2, 7))"` printed `-5`.
4. [x] `tests/test_subtract.py` defines `class SubtractTest(unittest.TestCase)` with `test_subtract`; `grep -n "subtract(5, 3)" tests/test_subtract.py` printed `8:        self.assertEqual(subtract(5, 3), 2)`.
5. [x] `python3 -m unittest discover -s tests -t .` printed `Ran 2 tests` and `OK`.
6. [x] `python3 -m unittest tests.test_subtract -v` printed `test_subtract (tests.test_subtract.SubtractTest.test_subtract) ... ok` and `OK`.
7. [x] `git diff main -- tests/test_calc.py` printed nothing.
8. [x] `git diff --name-only main` printed `calc.py` and `tests/test_subtract.py` only.
9. [x] `bash <repo>/factory/checks.sh`, run from the worktree, exited 0 (`Ran 2 tests`, `OK`).

## Validation
- `python3 -m unittest tests.test_subtract -v`: pass.
- `python3 -m unittest discover -s tests -t .`: pass, 2 tests.
- `bash <repo>/factory/checks.sh` (run from the worktree): exit 0.
- `git status --porcelain` after commit: empty.
- No UI criteria, so the dev server and `agent-browser` were not used (port 5110 was not needed).

## Log
### Round 1
- Read AGENTS.md, spec.md and config.json. Confirmed the branch is `factory/001-add-a-subtract-function`. No setup needed (standard library only).
- Added `subtract` to `calc.py` after `add`, matching its style (no docstring, same parameter names).
- Added `tests/test_subtract.py` mirroring the layout of `tests/test_calc.py`.
- Left `tests/test_calc.py` untouched (protected path).
- Ran all acceptance criteria and the gate script; all passed.
- Committed the two files explicitly and pushed `factory/001-add-a-subtract-function`.
- Opened draft PR #6 against `main` with `Closes #1`.
