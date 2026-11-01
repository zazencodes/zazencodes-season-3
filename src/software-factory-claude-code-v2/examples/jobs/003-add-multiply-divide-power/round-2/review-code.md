VERDICT: CHANGES

## Summary
- Changes requested: the spec and the protected paths conflict
- The builder moved the tests to a new file on its own, so acceptance 7, 8 and 11 fail as written
- A human must choose: amend the spec or unprotect `tests/test_calc.py`
- The code in `calc.py` and the tests themselves are correct

## Findings
1. `tests/test_multiply_divide_power.py:1` and `tests/test_calc.py` (unchanged): the spec puts the new tests in `tests/test_calc.py` (requirements 5 and 6, acceptance 7, 8 and 11, and "Only `calc.py` and `tests/test_calc.py` change"). `factory/config.json` lists `tests/test_calc.py` as a protected path, so the spec and the protected list cannot both be satisfied. The branch resolved this on its own by moving the tests to a new file. That is a silent departure from the spec's file layout: `tests/test_calc.py` no longer gets the extended import, and acceptance 7, 8 and 11 fail as written. Do not approve this on the builder's say-so. Fix: stop and get a decision from the user. Either (a) the user amends the spec to allow `tests/test_multiply_divide_power.py` (and rewrites acceptance 5, 7, 8 and 11 to match), or (b) the user removes `tests/test_calc.py` from `protected_paths` so the spec's file is used. Then rebuild to whichever is chosen. The code in `calc.py` and the tests themselves are correct and need no change.

## Notes
- Checked the code against the spec. `multiply`, `divide` and `power` are placed after `subtract`, the docstring and the absence of imports are unchanged, `divide` raises `ValueError("cannot divide by zero")` for `0` and `0.0`, and `power` is a bare `**`. The three test classes follow the `AddTest` shape, and `DivideTest` uses `assertRaisesRegex` for both zero divisors.
- A separate test file per function matches the existing `tests/test_subtract.py`, so the new layout is defensible if the user chooses option (a).
- The branch history still contains round 1's edit to `tests/test_calc.py` (`38fd851`), reverted in `cace151`. The net diff is clean, so this is non-blocking.
- No `round-1/review-code.md` exists, so there were no prior findings to check against.
- Commit messages are one line each with the required trailer.
