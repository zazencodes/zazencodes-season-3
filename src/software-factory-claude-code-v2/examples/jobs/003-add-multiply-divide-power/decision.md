ESCALATE

## Summary
- Escalated: the builder is blocked
- The spec requires the tests in `tests/test_calc.py`, a protected path
- Round 2's code review says a human must decide
- Choose (a) amend the spec to allow `tests/test_multiply_divide_power.py`, or (b) remove `tests/test_calc.py` from `protected_paths`
- `origin/main` has moved (PR #7), so a rebase or merge is needed before the PR merges

## Why
The builder is blocked:

The spec contradicts the protected paths. The spec requires the new tests in `tests/test_calc.py` (requirements 5 and 6, acceptance 7, 8 and 11, and "Only `calc.py` and `tests/test_calc.py` change"). `factory/config.json` lists `tests/test_calc.py` under `protected_paths`, and the instructions for this job say it must not be modified. Round 2's review (`round-2/review-code.md`, VERDICT: CHANGES) says this needs a human decision and must not be resolved by the builder. I agree, so I have not moved the tests back into `tests/test_calc.py` and have not edited `factory/config.json`. Choose one:

(a) Amend the spec to allow the tests in `tests/test_multiply_divide_power.py`, and rewrite acceptance 5, 7, 8 and 11 to match. The branch as it stands then meets the spec. Round 3 would then be a PR-ready state with no code change.

(b) Remove `tests/test_calc.py` from `protected_paths` in `factory/config.json`, so the spec's file can be used. I would then rebuild round 4: move the `MultiplyTest`, `DivideTest` and `PowerTest` classes and the extended import into `tests/test_calc.py`, delete `tests/test_multiply_divide_power.py`, and re-run the checks.

Either way, `origin/main` has moved (PR #7). Rebase or merge is needed before the PR merges, but the change is limited to the two files above.
