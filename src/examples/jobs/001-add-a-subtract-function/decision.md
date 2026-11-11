APPROVE

## Summary
- Approved: the change does exactly what issue #1 asks
- Round 1 gate passed and the code review passed with no findings
- All 9 acceptance criteria are met
- The test lives in a new file because `tests/test_calc.py` is protected
- Touches nothing sensitive: no dependencies, CI, deploy config, data or access code

## Why
The change adds `subtract(a, b)` to `calc.py` and a test for it in a new `tests/test_subtract.py`. That is exactly what issue #1 asks for and nothing more. Round 1 says `GATE: PASS` at HEAD `2934f5d`, the only review says `VERDICT: PASS` with no findings, and the change touches nothing sensitive: no dependencies, CI, deploy config, data or access code. Intake put the test in `tests/test_calc.py`, but that file is a protected path, so the spec put it in a new test file instead. This still meets the scope and the AGENTS.md rule that every function has a test in `tests/`.

## Acceptance criteria
1. `def subtract(a, b):` comes right after `add`, with the body `return a - b`: met. The diff shows it on the lines after `add`, with no docstring.
2. `subtract(5, 3)` prints `2`: met (build.md), and the unit test asserts it.
3. `subtract(2, 7)` prints `-5`: met. I ran it myself and it printed `-5`.
4. `tests/test_subtract.py` defines `SubtractTest.test_subtract` asserting `subtract(5, 3) == 2`: met. The diff shows the file with the required layout.
5. `unittest discover` runs 2 tests and reports OK: met. I ran it myself: `Ran 2 tests`, `OK`.
6. `python3 -m unittest tests.test_subtract -v` reports `test_subtract ... ok`: met (build.md output).
7. `tests/test_calc.py` is unchanged: met. It is not in the diff, and checks.md lists no protected paths changed.
8. Only `calc.py` and `tests/test_subtract.py` changed: met. I checked with `git diff --name-only origin/main...HEAD`.
9. `factory/checks.sh` exits 0: met. checks.md shows exit 0 at commit `2934f5d`, which is HEAD.
