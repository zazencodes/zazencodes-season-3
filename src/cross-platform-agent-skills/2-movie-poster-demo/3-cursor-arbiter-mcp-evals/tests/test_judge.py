import types

import pytest

from arbiter.config import JudgeConfig
from arbiter.judge import Judge


def test_contains_mode_pass_and_fail():
    j = Judge(JudgeConfig(model="anthropic:dummy"))
    assert j.grade("The answer is 32 Fahrenheit", "32 fahrenheit", "contains") == "pass"
    assert j.grade("The answer is 31 F", "32 fahrenheit", "contains") == "fail"


def test_llm_mode_invocation_parsing_pass():
    j = Judge(JudgeConfig(model="anthropic:dummy"))

    class FakeLLM:
        def invoke(self, messages):
            return types.SimpleNamespace(content="<thinking>...</thinking><result>correct</result>")

    j.llm = FakeLLM()
    assert j.grade("foo", "bar", "llm") == "pass"


def test_llm_mode_invocation_parsing_fail_on_no_result_tag():
    j = Judge(JudgeConfig(model="anthropic:dummy"))

    class FakeLLM:
        def invoke(self, messages):
            return types.SimpleNamespace(content="No tags here")

    j.llm = FakeLLM()
    assert j.grade("foo", "bar", "llm") == "fail"


def test_llm_model_id_without_provider_raises():
    j = Judge(JudgeConfig(model="claude-3-haiku"))
    with pytest.raises(ValueError, match="provider:model"):
        j.grade("a", "b", "llm")
