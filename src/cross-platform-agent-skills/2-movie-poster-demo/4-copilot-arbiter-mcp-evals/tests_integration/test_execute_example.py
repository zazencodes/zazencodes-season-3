import json
from importlib.resources import files

import pytest


@pytest.mark.integration
def test_execute_example_live(
    tmp_path, skip_unless_live, ensure_anthropic_key, ensure_openai_key, ensure_gemini_key
):
    src = files("arbiter.assets").joinpath("example_evals.json")
    cfg_path = tmp_path / "example_live.json"
    cfg_path.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

    from arbiter.cli import run_command

    run_command(cfg_path, verbose=False, yes=True)

    outs = list(tmp_path.glob("eval_*.json"))
    assert outs, "Expected an eval_*.json output in the config directory"
    payload = json.loads(outs[0].read_text(encoding="utf-8"))
    assert "results" in payload and "summary_table_markdown" in payload
