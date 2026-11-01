# Add multiply, divide and power to calc.py

> Issue #3: Add multiply, divide, power, square root, logarithms, trig functions, a full expression parser and a REPL

## Summary
- Adds `multiply`, `divide` and `power` to `calc.py` after `add` and `subtract`
- Dividing by zero, including `0.0`, raises `ValueError("cannot divide by zero")`
- Adds `MultiplyTest`, `DivideTest` and `PowerTest` to `tests/test_calc.py`
- Only `calc.py` and `tests/test_calc.py` change
- Scientific functions, the parser, the REPL and the page stay out of scope

## Context

- `calc.py` (repo root) is the calculator module. It is a docstring plus two pure functions, `add(a, b)` and `subtract(a, b)`. Each returns the result of the Python operator directly. No validation, no classes.
- `tests/test_calc.py` holds the tests for `add`. It uses `unittest`, imports the functions with `from calc import add`, and has one `TestCase` subclass per function (`AddTest`, with `test_add`). Follow that shape.
- `tests/test_subtract.py` is a separate file for `subtract`. Leave it alone; this job does not touch it.
- `tests/__init__.py` exists, so tests run with `python3 -m unittest discover -s tests -t .`. `factory/checks.sh` runs the same command.
- `web/index.html` is an add-only form. It is out of scope and must not change.
- `AGENTS.md` states two conventions that apply here: standard library only, and every function in `calc.py` has a test in `tests/`. It does not list functions, so it needs no edit for this change.

## Requirements

1. In `calc.py`, add `multiply(a, b)` that returns `a * b`.
2. In `calc.py`, add `divide(a, b)` that returns `a / b` when `b` is not zero. When `b == 0` (this includes `0.0`), it raises `ValueError("cannot divide by zero")`. It must not return `None`, `inf` or any other value in that case.
3. In `calc.py`, add `power(a, b)` that returns `a ** b`. Do not special-case any input; `0 ** -1` keeps Python's behaviour.
4. Each new function is placed after `add` and `subtract` in `calc.py`, with no other change to the module. Keep the existing module docstring.
5. In `tests/test_calc.py`, extend the import to `from calc import add, divide, multiply, power`.
6. In `tests/test_calc.py`, add three `unittest.TestCase` classes following the `AddTest` style: `MultiplyTest`, `DivideTest` and `PowerTest`. Each has at least one `test_*` method.
7. `DivideTest` must include a case where `b` is zero that uses `assertRaises(ValueError)` and also checks the message text "cannot divide by zero" (for example with `assertRaisesRegex` or by inspecting the exception).
8. Only `calc.py` and `tests/test_calc.py` change. No new dependencies. No change to `web/index.html`, `tests/test_subtract.py`, `AGENTS.md` or `factory/`.

## Acceptance criteria

1. `python3 -c "import calc; print(calc.multiply(3, 4), calc.multiply(-2, 5))"` prints `12 -10`.
2. `python3 -c "import calc; print(calc.divide(6, 3), calc.divide(7, 2))"` prints `2.0 3.5`.
3. `python3 -c "import calc; calc.divide(1, 0)"` exits non-zero, and the last line of stderr is `ValueError: cannot divide by zero`.
4. `python3 -c "import calc; calc.divide(1, 0.0)"` also raises `ValueError: cannot divide by zero`.
5. `python3 -c "import calc; print(calc.power(2, 10), calc.power(2, -1))"` prints `1024 0.5`.
6. `grep -n "^def " calc.py` lists, in order, `add`, `subtract`, `multiply`, `divide`, `power`.
7. `grep -n "^from calc import" tests/test_calc.py` shows the import line includes `add, divide, multiply, power`.
8. `tests/test_calc.py` contains classes `MultiplyTest`, `DivideTest` and `PowerTest`, and `DivideTest` contains an `assertRaises(ValueError)` (or `assertRaisesRegex(ValueError, "cannot divide by zero")`) call for a zero divisor.
9. `python3 -m unittest discover -s tests -t . -v` runs and passes, and its output lists the new `MultiplyTest`, `DivideTest` and `PowerTest` tests alongside the existing `AddTest` and `SubtractTest` tests.
10. `factory/checks.sh` exits 0.
11. `git diff --name-only origin/main` lists only `calc.py` and `tests/test_calc.py`.
12. `grep -c "^import\|^from" calc.py` prints `0`, because the module still uses no imports.

## Out of scope

- `sqrt`, `log`, `sin`, `cos`, `tan` and any other scientific function.
- The expression parser (parentheses, operator precedence, string input).
- The interactive REPL, and any `__main__` entry point in `calc.py`.
- Any change to `web/index.html`, including adding multiply, divide or power buttons or inputs.
- Moving, renaming or rewriting `subtract`, or its test in `tests/test_subtract.py`.
- Moving the `add` tests into a new file or reorganising the test layout.
- Input type checking or conversion (for example rejecting strings or non-numbers, or coercing with `float()`).
- Special handling for `power` edge cases such as `0 ** -1`, negative bases with fractional exponents, or overflow.
- Adding a helper, base class, decorator or shared error constant.
- Edits to `AGENTS.md`, `factory/`, `.gitignore` or any other doc.

## Assumptions

1. `divide` uses Python true division (`/`), so integer inputs can produce floats (`divide(7, 2) == 3.5`). The intake says `a / b`, so no floor division or integer result.
2. The zero check is `if b == 0:`, which also covers `0.0`. The intake says "when `b` is zero", and the float zero is also zero, so this avoids a silent `inf` for `0.0`.
3. The error message is exactly `cannot divide by zero`. The intake gave this as the example, and a fixed message makes the test checkable.
4. `power` relies on Python's `**` for every input, because the intake says "No special-casing". Errors from Python's own operator (such as `ZeroDivisionError` for `0 ** -1`) propagate unchanged.
5. `multiply`, `divide` and `power` get their tests in `tests/test_calc.py`, not new files, because the intake names that file and the `AddTest` pattern. The existing `tests/test_subtract.py` is left as it is, because the intake keeps the change to two files.
6. No `AGENTS.md` change is needed: it does not list functions, and its convention ("every function has a test") is met by the new tests.
