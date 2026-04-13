# AGENTS.md

## Project Overview

`arbiter-mcp-evals` — lightweight Python CLI framework for generating, running, and scoring MCP (Model Context Protocol) evals across multiple LLM providers.

## Project Instructions

- Python 3.12+ required; use `uv` for all package management and running commands.
- Line length is 100 chars (ruff + isort).
- Version is tracked in both `pyproject.toml` and `arbiter/__init__.py` — keep them in sync.

## Repo Shape

```
arbiter/
  cli.py           # entry point (arbiter CLI)
  config.py        # eval config schema (Pydantic)
  evaluator.py     # runs evals against MCP servers
  judge.py         # LLM-as-judge scoring
  costs.py         # token/cost tracking
  utils.py
  commands/
    genesis.py     # generate example eval config
    execute.py     # run an eval suite
    forge.py       # LLM-generated eval configs
    council.py     # multi-judge review
    common.py
tests/             # unit tests (no LLM/MCP calls)
tests_integration/ # live integration tests (costs money)
```

## Development Commands

```bash
uv sync --extra dev      # install all deps including dev
uv run pytest            # unit tests only
uv run ruff format       # format
uv run ruff check --fix  # lint
uv run isort .           # sort imports
uv run mypy arbiter/     # type check
```

## Validation

- Unit tests: `uv run pytest` (no API keys needed)
- Integration tests (costs money): `ARB_TEST_LIVE=1 uv run pytest -m integration`
- mypy excludes `evaluator.py`, `judge.py`, `commands/forge.py`, `commands/council.py`

## Release

1. Bump version in `pyproject.toml` and `arbiter/__init__.py`
2. Add entry to `CHANGELOG.md`
3. Create GitHub release — CI publishes to PyPI automatically
