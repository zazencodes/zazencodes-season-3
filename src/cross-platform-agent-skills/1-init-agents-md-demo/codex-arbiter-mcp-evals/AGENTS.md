# AGENTS.md

## Project Instructions

## Project Overview

- `arbiter-mcp-evals` is a Python 3.12+ CLI for generating, running, and reviewing MCP eval suites.
- Treat this file as the canonical agent context. Keep `CLAUDE.md` as a pointer back here.

## Repo Shape

- `arbiter/cli.py` exposes the `arbiter` entrypoint and subcommands: `genesis`, `execute`, `forge`, `council`.
- `arbiter/commands/` holds command implementations.
- Core runtime logic lives in `arbiter/config.py`, `arbiter/evaluator.py`, `arbiter/judge.py`, and `arbiter/costs.py`.
- Packaged assets live in `arbiter/assets/`, including `example_evals.json` and the `council` dashboard HTML.
- Unit tests are in `tests/`; live integration coverage is in `tests_integration/`.

## Development Commands

- Install dev deps: `uv sync --extra dev`
- Run unit tests: `uv run pytest`
- Run live integration test: `ARB_TEST_LIVE=1 uv run pytest -m integration`
- Lint/format checks used in CI:
  - `uv run ruff format --check`
  - `uv run ruff check`
  - `uv run isort --check-only --diff .`
- Type check: `uv run mypy arbiter/`
- Smoke-test built package: `uv build && uv run --with dist/*.whl arbiter --help`

## Important Notes

- `arbiter execute` writes `eval_*.json` and `eval_*.log` beside the config file.
- Config currently supports exactly one MCP server per eval suite.
- Manual local validation for the happy path is usually:
  - `uv run arbiter genesis`
  - `uv run arbiter execute -y arbiter_example_evals.json`
- Live evals and integration tests require provider API keys matching configured models/judge:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `GOOGLE_API_KEY`
- Integration tests incur network usage and model cost; prefer unit tests unless the task touches end-to-end execution.

## Validation

- For most code changes, run `uv run pytest` plus the relevant lint/type checks.
- Run the integration path only when changing execution, provider wiring, or packaged example flows.
