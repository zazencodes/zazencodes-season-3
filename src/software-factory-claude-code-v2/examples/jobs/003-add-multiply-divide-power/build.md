STATUS: BLOCKED

# Build: Add multiply, divide and power to calc.py

## Summary
- Blocked: the spec puts the tests in `tests/test_calc.py`, which is a protected path
- `calc.py` has `multiply`, `divide` and `power`, matching the spec
- The tests are in a new `tests/test_multiply_divide_power.py`, and all 7 tests pass
- Round 3 made no code change and no new commit while it waits for a human decision
- Options: amend the spec to allow the new file, or unprotect `tests/test_calc.py`

## Changes
`calc.py` has `multiply(a, b)`, `divide(a, b)` and `power(a, b)` after `add` and `subtract`, and the code matches the spec. The tests for the three new functions are in `tests/test_multiply_divide_power.py` (new file), not in `tests/test_calc.py`, because `tests/test_calc.py` is a protected path in `factory/config.json` and the spec asks to change it.

The spec and the protected list cannot both be met. I have not changed the code to resolve this, because the choice belongs to you (see Blocked).

Files changed (against `origin/main` merge-base `cd860d3`):
- `calc.py`
- `tests/test_multiply_divide_power.py` (new)

Branch `factory/003-add-multiply-divide-power` is pushed at `cace151`, and the tree is clean. No new commit this round. Draft PR: https://github.com/zazencodes/software-factory-sandbox/pull/8

## Acceptance criteria
1. [x] `calc.multiply(3, 4), calc.multiply(-2, 5)` prints `12 -10`: ran the command in round 2, got `12 -10`.
2. [x] `calc.divide(6, 3), calc.divide(7, 2)` prints `2.0 3.5`: ran the command, got `2.0 3.5`.
3. [x] `calc.divide(1, 0)` exits non-zero with last stderr line `ValueError: cannot divide by zero`: exit status `1`, last line as stated.
4. [x] `calc.divide(1, 0.0)` raises the same error: last stderr line `ValueError: cannot divide by zero`.
5. [x] `calc.power(2, 10), calc.power(2, -1)` prints `1024 0.5`: ran the command, got `1024 0.5`.
6. [x] `grep -n "^def " calc.py` lists `add`, `subtract`, `multiply`, `divide`, `power`, in order.
7. [ ] Spec says `grep -n "^from calc import" tests/test_calc.py` shows `add, divide, multiply, power`. Not met: `tests/test_calc.py` is protected and unchanged. The import is `from calc import divide, multiply, power` in `tests/test_multiply_divide_power.py`.
8. [ ] Spec says `tests/test_calc.py` contains `MultiplyTest`, `DivideTest` and `PowerTest`. Not met for the same reason. The classes are in `tests/test_multiply_divide_power.py`. `DivideTest.test_divide_by_zero_raises` and `test_divide_by_float_zero_raises` use `assertRaisesRegex(ValueError, "cannot divide by zero")`.
9. [x] `python3 -m unittest discover -s tests -t . -v` runs and passes: 7 tests, all `ok`, including `test_add`, `test_subtract`, `test_multiply`, `test_divide`, `test_divide_by_zero_raises`, `test_divide_by_float_zero_raises`, `test_power`.
10. [x] `factory/checks.sh` exits 0: re-ran from the worktree this round, exit 0, `Ran 7 tests ... OK`.
11. [ ] Spec says `git diff --name-only origin/main` lists only `calc.py` and `tests/test_calc.py`. Not met: it lists `calc.py` and `tests/test_multiply_divide_power.py`. Note that `origin/main` has moved since the branch was cut (PR #7 merged, which changed `web/index.html`), so a plain `git diff origin/main` also shows `web/index.html`. That is main moving ahead, not this branch. `git diff --name-only origin/main...HEAD` shows only the two files above.
12. [x] `grep -c "^import\|^from" calc.py` prints `0`.

No browser check: none of the criteria concern the page, and `web/index.html` is unchanged by this branch. The dev server was not started.

## Validation
- `bash /Users/alex/pro/software-factory-sandbox/factory/checks.sh` (worktree), this round: exit 0, `Ran 7 tests in 0.000s OK`.
- `git diff --name-only origin/main...HEAD` (worktree): `calc.py`, `tests/test_multiply_divide_power.py`.
- `git status --porcelain` in the worktree: empty.
- `git log origin/main..HEAD`: `38fd851`, `cace151`, both pushed.

## Blocked
The spec contradicts the protected paths. The spec requires the new tests in `tests/test_calc.py` (requirements 5 and 6, acceptance 7, 8 and 11, and "Only `calc.py` and `tests/test_calc.py` change"). `factory/config.json` lists `tests/test_calc.py` under `protected_paths`, and the instructions for this job say it must not be modified. Round 2's review (`round-2/review-code.md`, VERDICT: CHANGES) says this needs a human decision and must not be resolved by the builder. I agree, so I have not moved the tests back into `tests/test_calc.py` and have not edited `factory/config.json`. Choose one:

(a) Amend the spec to allow the tests in `tests/test_multiply_divide_power.py`, and rewrite acceptance 5, 7, 8 and 11 to match. The branch as it stands then meets the spec. Round 3 would then be a PR-ready state with no code change.

(b) Remove `tests/test_calc.py` from `protected_paths` in `factory/config.json`, so the spec's file can be used. I would then rebuild round 4: move the `MultiplyTest`, `DivideTest` and `PowerTest` classes and the extended import into `tests/test_calc.py`, delete `tests/test_multiply_divide_power.py`, and re-run the checks.

Either way, `origin/main` has moved (PR #7). Rebase or merge is needed before the PR merges, but the change is limited to the two files above.

## Log
### Round 1
- Read AGENTS.md, the spec and the existing `calc.py` and `tests/test_calc.py`.
- Added `multiply`, `divide` and `power` to `calc.py` after `subtract`, as the spec describes.
- Extended the test import in `tests/test_calc.py` and added `MultiplyTest`, `DivideTest` and `PowerTest` following the `AddTest` shape.
- Ran the unit tests, `factory/checks.sh` and each acceptance command; all passed.
- Committed as `38fd851`, pushed `factory/003-add-multiply-divide-power`, and opened draft PR #8 with `Closes #3`.

### Round 2
- Gate failed (`round-1/checks.md`): `tests/test_calc.py` is protected and round 1 modified it.
- Restored `tests/test_calc.py` to its `origin/main` content.
- Moved the new tests into `tests/test_multiply_divide_power.py` with the import `from calc import divide, multiply, power`. Test bodies unchanged. `calc.py` unchanged.
- Committed as `cace151`, pushed. Gate passed (`round-2/checks.md`).
- Review (`round-2/review-code.md`): VERDICT: CHANGES, one finding. The new file departs from the spec's file layout (acceptance 7, 8, 11), and the spec and protected list conflict. Asked for a human decision, not a builder workaround.

### Round 3
- Read the round-2 review and checks. The only finding is the spec versus protected-path conflict, which needs your decision: options (a) and (b) in Blocked.
- Re-checked the state: branch clean, `38fd851` and `cace151` pushed, `factory/checks.sh` exit 0.
- Did not change the code, did not edit `tests/test_calc.py`, `factory/config.json` or the spec, and made no new commit. Nothing new to push.
- Marked acceptance 7, 8 and 11 as not met, because the spec's wording is not met by the current layout.
