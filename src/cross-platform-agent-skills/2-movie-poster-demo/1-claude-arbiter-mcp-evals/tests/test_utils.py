from arbiter.utils import ensure_output_dir, extract_text_from_agent_result


def test_extract_text_from_agent_result_with_output_key():
    result = {"output": "final text"}
    assert extract_text_from_agent_result(result) == "final text"


def test_extract_text_from_agent_result_with_messages_str():
    class Msg:
        def __init__(self, content):
            self.content = content

    result = {"messages": [Msg("hi"), Msg("final")]}

    class R(dict):
        def get(self, k, default=None):
            if k == "messages":
                return result["messages"]
            return super().get(k, default)

    assert "final" in extract_text_from_agent_result(R())


def test_extract_text_from_agent_result_with_list_content_parts():
    class Msg:
        def __init__(self, content):
            self.content = content

    parts = [{"type": "text", "text": "hello"}, {"type": "text", "text": "world"}]
    result = {"messages": [Msg(parts)]}

    class R(dict):
        def get(self, k, default=None):
            if k == "messages":
                return result["messages"]
            return super().get(k, default)

    text = extract_text_from_agent_result(R())
    assert "hello" in text and "world" in text


def test_ensure_output_dir_creates_timestamped_filename(tmp_path):
    out = ensure_output_dir(str(tmp_path))
    assert out.startswith(str(tmp_path))
    assert out.endswith(".json")
