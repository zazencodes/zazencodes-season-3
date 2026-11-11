# Arbiter

Lightweight framework for generating, running, and reviewing MCP evals.

<div align="center">
  <img src="arbiter/assets/arbiter_mcp_evals.png" alt="Arbiter MCP Evals Logo" width="256" />
</div>

[![PyPI](https://img.shields.io/pypi/v/arbiter-mcp-evals.svg?logo=pypi&label=PyPI)](https://pypi.org/project/arbiter-mcp-evals/)
[![Python Versions](https://img.shields.io/pypi/pyversions/arbiter-mcp-evals.svg?logo=python&label=Python)](https://pypi.org/project/arbiter-mcp-evals/)
[![License](https://img.shields.io/github/license/zazencodes/arbiter-mcp-evals.svg)](LICENSE)
[![CI](https://github.com/zazencodes/arbiter-mcp-evals/actions/workflows/publish.yml/badge.svg?branch=main)](https://github.com/zazencodes/arbiter-mcp-evals/actions/workflows/publish.yml)

## Video demo: https://youtu.be/yVbVJ8SeQpU?t=23

<a href="https://youtu.be/yVbVJ8SeQpU?t=23" target="_blank">
  <img
    alt="Watch the demo video on YouTube"
    src="https://img.shields.io/badge/▶%20Watch%20the%20Demo-YouTube-red?logo=youtube&style=for-the-badge"
  />
</a>

## What are MCP evals?

MCP evals are lightweight, reproducible tests that measure how well LLMs use MCP servers/tools.

### Scoring evals

Evals are scored via rule checks and LLM-as-judge, with metrics like task accuracy, tool-use precision, latency, and token cost.

### Why MCP evals?

They test the ability for LLMs to:

* Select the right tools at the right time
* Pass appropriate arguments to those tools
* Produce correct final outcomes

### How does Arbiter do MCP evals?

Arbiter is a lightweight framework for running eval suites on your MCP servers across different models and providers.

1. Define your evals in a JSON config file `my_evals.json` (see [config](#configuration) section)
2. Run the CLI `arbiter execute my_evals.json`

## Quickstart

### Run the example evals

```bash
# make new project
mkdir arbiter-demo-project
cd arbiter-demo-project 

# install arbiter with uv
uv venv
uv pip install arbiter-mcp-evals

# configure claude api key
export ANTHROPIC_API_KEY=...

# run demo (will incur a small amount of api cost)
uv run arbiter genesis
uv run arbiter execute arbiter_example_evals.json
```

### Generate evals for your own MCP server

```bash
# install arbiter globally using pipx (or use uv, as demonstrated above)
pipx install arbiter

# configure claude api key
export ANTHROPIC_API_KEY=...

# generate and run custom eval suite
uv run arbiter forge --forge-model "anthropic:claude-sonnet-4-20250514" \
  --num-tool-evals 15 \
  --num-abstention-evals 4 \
  --repeats 2
arbiter execute arbiter_forged_evals.json
```

## Installation

### Global

Install globally using pipx:

```bash
pipx install arbiter-mcp-evals
arbiter --version
```

### Project

Or install inside your project:

```bash
uv init # This will create a new virtual environment for your project
uv add arbiter-mcp-evals
uv run arbiter --version
```

### Credentials

Arbiter is open-source and free to use.

Credentials are required based on the providers referenced in your config. Set env vars:

```bash
# Anthropic
export ANTHROPIC_API_KEY=...

# OpenAI
export OPENAI_API_KEY=...

# Google
export GOOGLE_API_KEY=...
```

## Usage

- Generate an example config you can edit:

```bash
arbiter genesis
```

- Run an evaluation from a config file:

```bash
arbiter execute my_evals.json
```

The results will be saved to a timestamped JSON file in the same directory as your config file.

### Execution confirmation

By default, `arbiter execute` shows a short confirmation preview before running:
- Suite name, models, judge model, repeats
- MCP server command and args
- Total eval items (tool-use vs abstention counts)
- Per-1K token rates for each configured model (from LiteLLM). If pricing cannot be resolved, the rate shows as "unknown" and cost is treated as 0.

To run non-interactively, pass the `-y/--yes` flag:
```bash
arbiter execute -y my_evals.json
```

Combine with verbose mode for detailed traces:
```bash
arbiter execute -y -v my_evals.json
```

## Configuration

Config files are JSON with this structure:

> Arbiter is currently limited to testing one MCP server at a time.

```json
{
    "name": "Unit Converter MCP Evals Suite",
    "models": [
        "anthropic:claude-sonnet-4-0",
        "anthropic:claude-3-5-haiku-latest",
        "openai:gpt-4o-mini",
        "google:gemini-2.5-pro"
    ],
    "judge": {
        "model": "google:gemini-2.5-pro",
        "max_tokens": 128,
    },
    "repeats": 3,
    "mcp_servers": {
        "unit-converter": {
            "command": "uvx",
            "args": ["unit-converter-mcp"],
            "transport": "stdio"
        }
    },
    "tool_use_evals": [
        {
            "query": "convert 0 celsius to fahrenheit",
            "answer": "32 Fahrenheit",
            "judge_mode": "llm"
        },
        {
            "query": "convert 100 fahrenheit to celsius",
            "answer": "37.7778",
            "judge_mode": "contains"
        }
    ],
    "abstention_evals": [
        {
            "query": "who are the temperature units named after?"
        }
    ]
}
```

## Requirements

- Python 3.12+
- Provider API keys set based on the providers used in `models` and `judge.model`

## Features

- Configurable LLM models and MCP servers
- Tool usage tracking and validation
- LLM-as-a-judge evaluation with ground truth comparison or case-insensitive contains matching
- Detailed metrics including pass rates, precision, recall
- Timestamped output files with comprehensive results
- Rich console output with progress tracking
- Cost tracking (tokens and USD) for model runs and cumulative judge usage
  - Note: Cost estimation only counts tokens used during evaluation turns and judge responses. It does not attempt to estimate long system/context prompts or hidden preambles.

### Cost configuration

- Costs are estimated using LiteLLM's [pricing metadata](https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json). We pass models without providers (e.g., `gpt-5-mini`, `gemini-2.5-pro`, `claude-3-haiku-20240307`). If pricing cannot be resolved for a model, it will be set to 0.
- Anthropic models: If you use non-dated aliases like `claude-3-5-haiku-latest`, LiteLLM cannot provide pricing. Use dated model IDs such as `claude-3-haiku-20240307`. See the [Anthropic model overview](https://docs.anthropic.com/en/docs/about-claude/models/overview) and for the latest model IDs.

## Testing

- Unit tests (no LLM calls, no MCP servers):
```bash
uv run pytest
```

- Live integration test (will incur costs by issuing calls to LLMs):
    - Equivalent to running:
    ```bash
    arbiter genesis
    arbiter execute arbiter_example_evals.json
    ```
    - This pytest integration is intended for CI/CD testing.
    - **Prefer running the command above, if testing manually**.
```bash
export ARB_TEST_LIVE=1
export ANTHROPIC_API_KEY=...
export OPENAI_API_KEY=...
export GOOGLE_API_KEY=...
uv run pytest -m integration
```

## Output files

Running `arbiter execute my_evals.json` writes two files to the same directory as your config:

- `eval_YYYYMMDD_HHMMSS.json` — structured results (config, per-model runs, summaries, costs)
- `eval_YYYYMMDD_HHMMSS.log` — human-readable run log with progress lines

### Results JSON example

```json
{
  "created_at": "2025-09-15T14:47:36.086492",
  "config": {
    "name": "Unit Converter MCP Evals Suite",
    "models": ["anthropic:claude-3-5-haiku-latest", "openai:gpt-5-mini", "google:gemini-2.5-flash"],
    "judge_model": "openai:gpt-5-mini",
    "repeats": 1,
    "mcp_servers": {
      "unit-converter-mcp": { "command": "uvx", "args": ["unit-converter-mcp"], "transport": "stdio" }
    }
  },
  "tool_use_evals": [
    { "query": "convert 0 celsius to fahrenheit", "answer": "32 Fahrenheit", "judge_mode": "llm" },
    { "query": "convert 8 radians to degrees", "answer": "458.366236", "judge_mode": "contains" },
    ...
  ],
  "abstention_evals": [
    { "query": "who is the Pascal unit named after?" },
    ...
  ],
  "results": {
    "openai:gpt-5-mini": {
      "model": "openai:gpt-5-mini",
      "runs": [
        {
          "iteration": 1,
          "query": "convert 0 celsius to fahrenheit",
          "ground_truth": "32 Fahrenheit",
          "model_raw_response": "0 °C = 32 °F ...",
          "grade": "pass",
          "judge_mode": "llm",
          "judge_raw_response": "<thinking>...</thinking>\n<result>correct</result>",
          "tool_expected": true,
          "tool_used": true,
          "tool_calls": ["convert_temperature"],
          "latency_s": 11.913,
          "tokens": { "input": 21756, "output": 138, "total": 21894 },
          "cost_usd": 0.005715
        },
        ...
      ],
      "summary": {
        "total_runs": 3,
        "judged_runs": 2,
        "pass_count": 2,
        "pass_rate": 1.0,
        "tool_use": {
          "expected_total": 2,
          "used_when_expected": 2,
          "recall": 1.0,
          "total_used": 2,
          "used_when_not_expected": 0,
          "precision": 1.0,
          "false_positive_rate": 0.0
        },
        "avg_latency_s": 6.877,
        "tokens": { "input": 54276, "output": 1020, "total": 55296 },
        "cost_usd": 0.015609
      }
    },
    "anthropic:claude-3-5-haiku-latest": { ... },
    "google:gemini-2.5-flash": { ... }
  },
  "summary_table_markdown": "| metric | ... |",
  "judge_cost_summary": {
    "model": "openai:gpt-5-mini",
    "tokens": { "input": 562, "output": 1816, "total": 2378 },
    "cost_usd": 0.003773
  },
  "summary": {
    "table_markdown": "| metric | ... |",
    "judge_cost": { ... },
    "overall": {
      "total_runs": 9,
      "judged_runs": 6,
      "pass_count": 4,
      "pass_rate": 0.6667,
      "tool_use": {
        "expected_total": 6,
        "used_when_expected": 6,
        "recall": 1.0,
        "total_used": 6,
        "used_when_not_expected": 0,
        "precision": 1.0,
        "false_positive_rate": 0.0
      },
      "avg_latency_s": 7.314,
      "tokens": { "input": 142241, "output": 3627, "total": 145868 },
      "cost_usd": 0.102978
    },
    "per_model": {
      "openai:gpt-5-mini": { "pass_rate": 1.0, ... },
      "anthropic:claude-3-5-haiku-latest": { ... },
      "google:gemini-2.5-flash": { ... }
    }
  }
}
```

### Log file example

A compact example of the run log:

```text
2025-09-15 14:47:05,986 INFO Starting MCP server 'unit-converter-mcp' and loading tools...
2025-09-15 14:47:06,281 INFO Loaded 16 tool(s) from MCP server.
2025-09-15 14:47:14,104 INFO ✅ [google:gemini-2.5-flash] convert 0 celsius to fahrenheit #1/1 | tools=True (convert_temperature) | tokens=7003 | 2.83s | $0.0024
2025-09-15 14:47:28,547 INFO ✅ [openai:gpt-5-mini] convert 8 radians to degrees #1/1 | tools=True (convert_angle) | tokens=21897 | 3.90s | $0.0057
2025-09-15 14:47:36,083 INFO === Overall Summary (All Models) ===
```

## 🛠️ Development

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager

### Setup

```bash
# Clone the repository
git clone https://github.com/zazencodes/arbiter-mcp-evals
cd arbiter-mcp-evals

# Install dependencies
uv sync --extra dev

# Run tests
uv run pytest

# Run linting and formatting
uv run ruff format
uv run ruff check --fix
uv run isort .

# Type checking
uv run mypy arbiter/
```

### Building

```bash
# Build package
uv build

# Test installation
uv run --with dist/*.whl arbiter --help
```

### Release Checklist

1.  **Update Version:**
    - Increment the `version` number in `pyproject.toml` and `arbiter/__init__.py`.

2.  **Update Changelog:**
    - Add a new entry in `CHANGELOG.md` for the release.
        - Draft notes from recent changes (e.g., via `git log --oneline` or a diff).

3.  **Create GitHub Release:**
    - Draft a new release on the GitHub UI and publish it.
    - The GitHub workflow will automatically build and publish the package to PyPI.

