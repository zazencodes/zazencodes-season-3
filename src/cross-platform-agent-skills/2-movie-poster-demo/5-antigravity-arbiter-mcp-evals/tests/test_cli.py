import json
from pathlib import Path

import pytest

from arbiter.cli import create_example_command, run_command


def test_create_example_command_writes_file(tmp_cwd):
    create_example_command()
    out = Path("arbiter_example_evals.json")
    assert out.exists()
    data = json.loads(out.read_text(encoding="utf-8"))
    assert "models" in data and "mcp_servers" in data


def test_run_command_missing_file_exits(tmp_path):
    with pytest.raises(SystemExit) as ei:
        run_command(tmp_path / "does_not_exist.json", verbose=False, yes=True)
    assert ei.value.code == 1


def test_run_command_missing_api_keys_exits(tmp_path, monkeypatch):
    cfg = {
        "name": "Eval",
        "models": ["openai:gpt-4o-mini"],
        "judge": {"model": "openai:gpt-4o-mini"},
        "repeats": 1,
        "mcp_servers": {"srv": {"command": "uvx", "args": ["echo"], "transport": "stdio"}},
        "tool_use_evals": [],
        "abstention_evals": [],
    }
    p = tmp_path / "cfg.json"
    p.write_text(json.dumps(cfg), encoding="utf-8")

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(SystemExit) as ei:
        run_command(p, verbose=False, yes=True)
    assert ei.value.code == 1


def test_run_command_success_with_stubbed_evaluator(tmp_path, monkeypatch):
    cfg = {
        "name": "Eval",
        "models": ["anthropic:claude-3-5-haiku-latest"],
        "judge": {"model": "anthropic:claude-3-5-haiku-latest"},
        "repeats": 1,
        "mcp_servers": {"srv": {"command": "uvx", "args": ["echo"], "transport": "stdio"}},
        "tool_use_evals": [],
        "abstention_evals": [],
    }
    p = tmp_path / "cfg.json"
    p.write_text(json.dumps(cfg), encoding="utf-8")

    class DummyEvaluator:
        def __init__(self, config, verbose=False):
            self.config = config
            self.verbose = verbose

        async def run_evaluation(self):
            out = tmp_path / "eval_out.json"
            out.write_text("{}", encoding="utf-8")
            return str(out)

    import arbiter.cli as cli_mod

    monkeypatch.setattr(cli_mod, "MCPEvaluator", DummyEvaluator)

    run_command(p, verbose=True, yes=True)
