# Add a subtract function

> Issue #1: Add a subtract function

## Summary
- Adds `subtract(a, b)` to `calc.py` right after `add`, in the same style
- Tests it in a new `tests/test_subtract.py`, asserting `subtract(5, 3) == 2`
- The test can't go in `tests/test_calc.py` as intake suggested, because that file is protected
- Only `calc.py` and the new test file change
- No UI, input validation or other operations

## Context

- `calc.py` (repo root) is a small standard-library module. It has a module
  docstring and one function, `add(a, b)`, whose body is the one-line
  `return a + b`. There are no other functions and no docstrings on functions.
- `tests/test_calc.py` holds `AddTest`, a `unittest.TestCase` subclass with a
  single `test_add` method asserting `add(2, 3) == 5`. It imports
  `from calc import add`. Tests run with
  `python3 -m unittest discover -s tests -t .` (see `AGENTS.md`).
- `AGENTS.md` requires that every function in `calc.py` has a test in `tests/`.
  It also requires the standard library only and no new dependencies.
- `factory/config.json` lists `tests/test_calc.py` under `protected_paths`.
  Builders may add new test files but must not modify that file. This is why
  the new test cannot go into `tests/test_calc.py` (see Assumptions).
- `web/index.html` is the static UI. Intake left it out of scope.

## Requirements

1. `calc.py` defines `subtract(a, b)` that returns `a - b`.
2. `subtract` is placed directly after `add` in `calc.py`.
3. `subtract` uses the same style as `add`: no docstring, one-line body
   `return a - b`, same parameter names.
4. A new test file `tests/test_subtract.py` contains a `unittest.TestCase`
   subclass named `SubtractTest` with a method `test_subtract` that asserts
   `subtract(5, 3) == 2`. It follows the layout of `tests/test_calc.py`: the
   `import unittest` line, a `from calc import subtract` line, and the
   `if __name__ == "__main__": unittest.main()` footer.
5. `tests/test_calc.py` is not modified.
6. No changes to `web/index.html`, `AGENTS.md`, `factory/` or any other file
   beyond `calc.py` and the new test file.
7. No new dependencies are added.

## Acceptance criteria

1. `calc.py` contains `def subtract(a, b):` immediately after the `add`
   function, and its body is `return a - b`. Verify: `grep -n "def subtract" calc.py`
   prints a line that is after the `def add` line, and `sed -n '1,20p' calc.py`
   shows the body as a single `return a - b` line.
2. `python3 -c "from calc import subtract; print(subtract(5, 3))"`, run from
   the repo root, prints `2`.
3. `python3 -c "from calc import subtract; print(subtract(2, 7))"`, run from
   the repo root, prints `-5`.
4. `tests/test_subtract.py` exists and defines `class SubtractTest(unittest.TestCase)`
   with a `test_subtract` method asserting `subtract(5, 3) == 2`. Verify with
   `grep -n "subtract(5, 3)" tests/test_subtract.py`.
5. `python3 -m unittest discover -s tests -t .` runs `test_subtract` and
   `test_add` and reports `OK` with both tests passing. Verify by running the
   command from the repo root and checking the output includes `Ran 2 tests`
   and ends with `OK`.
6. `python3 -m unittest tests.test_subtract -v` reports `test_subtract ... ok`.
7. `git diff main -- tests/test_calc.py` produces no output on the job branch.
8. `git diff --name-only main` lists only `calc.py` and `tests/test_subtract.py`.
9. `bash factory/checks.sh` exits 0 from the repo root.

## Out of scope

- Any UI for subtraction, including changes to `web/index.html`.
- Handling non-numeric input, type checks, error handling or input validation.
- Any other operation (multiply, divide, and so on) or refactoring of `add`.
- Editing `tests/test_calc.py`, which is a protected path.
- Adding a docstring to `subtract`, or any other docstring, since the neighbouring
  function has none.
- Changes to `AGENTS.md`, `factory/`, or the dashboard.
- Adding dependencies or a test runner other than `unittest`.

## Assumptions

- The issue asks for a test "like add", and intake placed it in
  `tests/test_calc.py`. That file is in `protected_paths`, so the builder
  cannot modify it. A new file `tests/test_subtract.py` meets AGENTS.md's rule
  that each function has a test in `tests/`, and `unittest discover` picks it up
  automatically. Reason: the factory forbids editing protected paths, and a new
  file is the smallest change that keeps the factory's rules intact.
- The test asserts only the example from intake (`subtract(5, 3) == 2`). No
  extra cases are required by the spec, because the issue asks for one test
  like `add`. Reason: the smallest change that fully meets the scope.
- `subtract(a, b)` is plain `a - b` with no type coercion or validation,
  matching `add`. Reason: intake excluded non-numeric handling and the
  existing `add` has none.
- The class name `SubtractTest` and the method name `test_subtract` mirror
  `AddTest` and `test_add`. Reason: intake named this pattern explicitly.
