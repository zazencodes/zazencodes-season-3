"""Utility functions for Arbiter evaluations."""

import os
import re
import sys
from datetime import datetime
from typing import Any, Callable


def extract_text_from_agent_result(result: Any) -> str:
    """Best-effort extraction of final text from LangGraph agent result."""
    try:
        messages = result.get("messages")
    except AttributeError:
        messages = None

    if messages is None and isinstance(result, dict) and "output" in result:
        return str(result["output"]).strip()

    if not messages and hasattr(result, "get"):
        return str(result)

    if not messages and isinstance(result, dict):
        return str(result)

    if not messages:
        return str(result)

    last = messages[-1]
    content = getattr(last, "content", None)

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, str):
                parts.append(c)
            elif isinstance(c, dict) and c.get("type") == "text":
                parts.append(c.get("text", ""))
        if parts:
            return "\n".join(parts).strip()

    # Fallback
    return str(last)


def ensure_output_dir(base_path: str, *, timestamp: str | None = None) -> str:
    """
    Ensure output directory exists and return timestamped filename.

    Args:
        base_path: Base directory path

    Returns:
        Full path to timestamped output file
    """
    os.makedirs(base_path, exist_ok=True)
    ts = timestamp or datetime.now().strftime("%Y%m%d_%H%M%S")
    return os.path.join(base_path, f"eval_{ts}.json")


_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


class _AnsiStripperTee:
    """A file-like stream that tees writes to a primary stream and a log file.

    ANSI escape sequences are stripped from the copy written to the log file so
    the persisted log remains plain text without Rich formatting.
    """

    def __init__(self, primary_stream, log_stream):
        self._primary = primary_stream
        self._log = log_stream
        # Expose encoding attribute some writers expect
        self.encoding = getattr(primary_stream, "encoding", "utf-8")

    def write(self, data):
        try:
            text = str(data)
        except Exception:
            text = data
        # Write original to primary (terminal)
        self._primary.write(text)
        # Strip ANSI for log and write
        try:
            plain = _ANSI_RE.sub("", text)
            self._log.write(plain)
        except Exception:
            # Best-effort logging; never raise from logging path
            pass
        return len(text)

    def flush(self):
        try:
            self._primary.flush()
        except Exception:
            pass
        try:
            self._log.flush()
        except Exception:
            pass

    def isatty(self):
        # Preserve terminal capabilities for Rich
        try:
            return self._primary.isatty()
        except Exception:
            return False


def setup_console_log_tee(log_path: str) -> Callable[[], None]:
    """Mirror stdout/stderr to a persistent log file with ANSI stripped.

    Returns a restore function that should be called to restore the original
    stdout/stderr and close the log file. Use with try/finally.
    """
    os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)
    log_file = open(log_path, "a", encoding="utf-8")

    orig_stdout = sys.stdout
    orig_stderr = sys.stderr

    tee_out = _AnsiStripperTee(orig_stdout, log_file)
    tee_err = _AnsiStripperTee(orig_stderr, log_file)

    sys.stdout = tee_out  # type: ignore[assignment]
    sys.stderr = tee_err  # type: ignore[assignment]

    def restore() -> None:
        try:
            sys.stdout = orig_stdout  # type: ignore[assignment]
            sys.stderr = orig_stderr  # type: ignore[assignment]
        finally:
            try:
                log_file.flush()
            finally:
                try:
                    log_file.close()
                except Exception:
                    pass

    return restore
