import asyncio

from arbiter.config import EvalConfig
from arbiter.evaluator import MCPEvaluator


def make_cfg():
    data = {
        "name": "Eval",
        "models": ["anthropic:dummy"],
        "judge": {"model": "anthropic:dummy"},
        "repeats": 2,
        "mcp_servers": {"srv": {"command": "uvx", "args": ["echo"], "transport": "stdio"}},
        "tool_use_evals": [{"query": "q1", "answer": "a1", "judge_mode": "contains"}],
        "abstention_evals": [{"query": "q2"}],
    }
    return EvalConfig.from_dict(data)


def test_calculate_summary_basic():
    evaluator = MCPEvaluator(make_cfg())
    runs = [
        {"grade": "pass", "tool_expected": True, "tool_used": True, "latency_s": 0.2},
        {"grade": "fail", "tool_expected": True, "tool_used": True, "latency_s": 0.3},
        {"grade": None, "tool_expected": False, "tool_used": True, "latency_s": 0.5},
        {"grade": None, "tool_expected": False, "tool_used": False, "latency_s": 0.1},
    ]
    summary = evaluator._calculate_summary(runs)
    assert summary["total_runs"] == 4
    assert summary["judged_runs"] == 2
    assert summary["pass_count"] == 1
    assert 0.0 <= summary["pass_rate"] <= 1.0
    assert summary["tool_use"]["expected_total"] == 2
    assert summary["tool_use"]["total_used"] == 3
    assert summary["tool_use"]["used_when_not_expected"] == 1
    assert summary["avg_latency_s"] == round((0.2 + 0.3 + 0.5 + 0.1) / 4, 3)


def test_evaluate_model_with_monkeypatched_run(monkeypatch):
    cfg = make_cfg()
    ev = MCPEvaluator(cfg, verbose=False)
    ev.tools = []
    monkeypatch.setattr(ev, "_build_chat_model", lambda model_id: object())
    # Avoid create_react_agent trying to convert tools
    import arbiter.evaluator as evaluator_mod

    monkeypatch.setattr(evaluator_mod, "create_react_agent", lambda cm, tools: object())

    calls = {"run_once": 0}

    async def fake_run_once(agent, query):
        calls["run_once"] += 1
        if query == "q1":
            return "a1", ["toolA"], 0.12
        return "text", [], 0.34

    ev.run_once = fake_run_once  # type: ignore[attr-defined]
    ev.judge.grade = lambda ans, gt, mode: "pass"  # type: ignore[method-assign]

    res = asyncio.run(ev.evaluate_model(cfg.models[0]))

    assert len(res["runs"]) == 4
    assert calls["run_once"] == 4
    s = res["summary"]
    assert s["pass_count"] == 2
    assert s["tool_use"]["expected_total"] == 2
    assert "avg_latency_s" in s


def test_build_overall_summary_table_markdown():
    cfg = make_cfg()
    ev = MCPEvaluator(cfg)
    all_results = {
        "m1": {
            "summary": {
                "total_runs": 2,
                "judged_runs": 1,
                "pass_count": 1,
                "pass_rate": 1.0,
                "tool_use": {
                    "expected_total": 1,
                    "used_when_expected": 1,
                    "recall": 1.0,
                    "total_used": 1,
                    "used_when_not_expected": 0,
                    "precision": 1.0,
                    "false_positive_rate": 0.0,
                },
                "avg_latency_s": 0.1,
            }
        },
        "m2": {
            "summary": {
                "total_runs": 2,
                "judged_runs": 1,
                "pass_count": 0,
                "pass_rate": 0.0,
                "tool_use": {
                    "expected_total": 1,
                    "used_when_expected": 0,
                    "recall": 0.0,
                    "total_used": 1,
                    "used_when_not_expected": 1,
                    "precision": 0.0,
                    "false_positive_rate": 1.0,
                },
                "avg_latency_s": 0.2,
            }
        },
    }
    ev.config.models = ["m1", "m2"]
    table, md = ev._build_overall_summary_table(all_results)
    assert "| metric | m1 | m2 | totals |" in md
    assert "pass_rate" in md
