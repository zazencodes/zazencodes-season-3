import pytest

from arbiter.config import EvalConfig


def test_from_dict_validates_single_server_zero():
    data = {
        "name": "x",
        "models": ["anthropic:dummy"],
        "repeats": 1,
        "mcp_servers": {},
        "tool_use_evals": [],
        "abstention_evals": [],
    }
    with pytest.raises(ValueError, match="Exactly one MCP server"):
        EvalConfig.from_dict(data)


def test_from_dict_validates_single_server_multiple():
    data = {
        "name": "x",
        "models": ["anthropic:dummy"],
        "repeats": 1,
        "mcp_servers": {
            "a": {"command": "uvx", "args": ["echo"], "transport": "stdio"},
            "b": {"command": "uvx", "args": ["echo"], "transport": "stdio"},
        },
        "tool_use_evals": [],
        "abstention_evals": [],
    }
    with pytest.raises(ValueError, match="Exactly one MCP server"):
        EvalConfig.from_dict(data)


def test_from_dict_parses_items_and_types(example_config_dict):
    cfg = EvalConfig.from_dict(example_config_dict)
    assert cfg.name == "Test Suite"
    assert cfg.models == ["anthropic:dummy-model"]
    assert cfg.repeats == 2
    assert len(cfg.mcp_servers) == 1
    ((name, server),) = cfg.mcp_servers.items()
    assert name == "unit-converter"
    assert server.command == "uvx"
    assert server.transport == "stdio"
    assert len(cfg.tool_use_evals) == 1
    assert cfg.tool_use_evals[0].judge_mode in ("llm", "contains")
    assert len(cfg.abstention_evals) == 1
