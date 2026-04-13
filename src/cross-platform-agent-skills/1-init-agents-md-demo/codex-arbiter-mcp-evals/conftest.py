import os
import shutil
from importlib.resources import files

import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: runs the live LLM + MCP server integration tests (costs money, uses network)",
    )


@pytest.fixture
def tmp_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return tmp_path


@pytest.fixture
def example_config_dict():
    return {
        "name": "Test Suite",
        "models": ["anthropic:dummy-model"],
        "judge": {"model": "anthropic:dummy-model", "max_tokens": 16},
        "repeats": 2,
        "mcp_servers": {
            "unit-converter": {"command": "uvx", "args": ["echo"], "transport": "stdio"}
        },
        "tool_use_evals": [
            {
                "query": "convert 0 celsius to fahrenheit",
                "answer": "32 Fahrenheit",
                "judge_mode": "contains",
            }
        ],
        "abstention_evals": [{"query": "who is the Pascal unit named after?"}],
    }


@pytest.fixture
def ensure_anthropic_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", os.environ.get("ANTHROPIC_API_KEY", "test-key"))


@pytest.fixture
def ensure_openai_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", os.environ.get("OPENAI_API_KEY", "test-key"))


@pytest.fixture
def ensure_gemini_key(monkeypatch):
    # Force usage of GOOGLE_API_KEY for Google models
    val = os.environ.get("GOOGLE_API_KEY") or "test-key"
    monkeypatch.setenv("GOOGLE_API_KEY", val)


@pytest.fixture
def asset_example_json_text():
    return files("arbiter.assets").joinpath("example_evals.json").read_text(encoding="utf-8")


@pytest.fixture
def write_asset_example_to_tmp(tmp_path, asset_example_json_text):
    def _write(filename="arbiter_example_evals.json"):
        p = tmp_path / filename
        p.write_text(asset_example_json_text, encoding="utf-8")
        return p

    return _write


@pytest.fixture
def skip_unless_live():
    if os.environ.get("ARB_TEST_LIVE") != "1":
        pytest.skip("Set ARB_TEST_LIVE=1 to run live integration tests (costs money)")

    if shutil.which("uvx") is None:
        pytest.skip("uvx is required to run the live MCP server test")

    # Best-effort check that unit-converter-mcp is invokable via uvx
    try:
        import subprocess

        subprocess.run(
            ["uvx", "unit-converter-mcp", "--help"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            check=True,
        )
    except Exception:
        pytest.skip("unit-converter-mcp not available to uvx; skipping live test")
