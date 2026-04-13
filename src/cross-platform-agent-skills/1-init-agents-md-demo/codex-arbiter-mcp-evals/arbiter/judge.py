"""LLM-as-a-judge implementation for Arbiter evaluations."""

import logging
import re
from typing import Callable, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from rich.console import Console

from .config import JudgeConfig
from .costs import CostCache, compute_cost_usd, extract_usage_from_message


class Judge:
    """Judge for evaluating model responses against ground truth.

    Supports two modes:
    - "contains": Case-insensitive substring check of ground truth in model
      response (no LLM used).
    - "llm": LLM-based grading using configurable prompts.
    """

    DEFAULT_PROMPT_TEMPLATE = (
        "Grade this response based on the ground truth:\n"
        "    <ground_truth>{ground_truth}</ground_truth>\n"
        "    <model_response>{response}</model_response>\n"
        "    Think through your reasoning in <thinking> tags, then output 'correct' or 'incorrect' in <result> tags."
    )

    def __init__(self, config: JudgeConfig):
        self.config = config
        self.console = Console(highlight=False)
        self._logger: Optional[Callable[[str], None]] = None
        self._py_logger: Optional[logging.Logger] = logging.getLogger("arbiter")

        self.prompt_template = config.prompt_template or self.DEFAULT_PROMPT_TEMPLATE

        # Lazy initialization; only create LLM client if/when needed
        self.llm = None

        # Cost tracking
        self._judge_input_tokens_total = 0
        self._judge_output_tokens_total = 0
        self._judge_cost_usd_total = 0.0
        self._cost_cache: CostCache | None = None

        # Stores the last raw LLM judge response text (if any)
        self._last_raw_response: Optional[str] = None

    def set_cost_cache(self, cache: CostCache) -> None:
        self._cost_cache = cache

    def set_logger(self, logger: Optional[Callable[[str], None]]) -> None:
        """Inject a logger function used instead of direct console printing.

        If None, falls back to rich Console printing.
        """
        self._logger = logger

    def _log(self, message: str) -> None:
        if self._logger is not None:
            try:
                self._logger(message)
                return
            except Exception:
                pass
        # Fallback to console when logger is not provided or fails
        self.console.print(message)
        try:
            if self._py_logger:
                self._py_logger.info(message)
        except Exception:
            pass

    def grade(
        self,
        model_response: str,
        ground_truth: str,
        judge_mode: str,
    ) -> str:
        """
        Grade a model response against the ground truth using the specified judge_mode.

        Args:
            model_response: The model's response
            ground_truth: The expected correct response
            judge_mode: "contains" or "llm"

        Returns:
            "pass" if the response is correct, "fail" otherwise
        """
        # Reset last raw response at the start of each grade call
        self._last_raw_response = None

        if judge_mode == "contains":
            try:
                return (
                    "pass"
                    if (ground_truth or "").lower() in (model_response or "").lower()
                    else "fail"
                )
            except Exception:
                return "fail"

        # LLM-based judging
        if self.llm is None:
            # Parse provider:model syntax; default to anthropic for backwards-compat
            model_id = self.config.model
            if ":" not in model_id:
                raise ValueError(f"Model ID must be in provider:model syntax: {model_id}")
            provider, model_name = model_id.split(":", 1)
            provider = provider.strip().lower()

            if provider == "anthropic":
                kwargs = {"model": model_name}
                if self.config.temperature is not None:
                    kwargs["temperature"] = self.config.temperature
                if self.config.max_tokens is not None:
                    kwargs["max_tokens"] = self.config.max_tokens
                self.llm = ChatAnthropic(**kwargs)
            elif provider == "openai":
                kwargs = {"model": model_name}
                if self.config.temperature is not None:
                    kwargs["temperature"] = self.config.temperature
                if self.config.max_tokens is not None:
                    kwargs["max_tokens"] = self.config.max_tokens
                self.llm = ChatOpenAI(**kwargs)
            elif provider == "google":
                kwargs = {"model": model_name}
                if self.config.temperature is not None:
                    kwargs["temperature"] = self.config.temperature
                if self.config.max_tokens is not None:
                    kwargs["max_output_tokens"] = self.config.max_tokens
                self.llm = ChatGoogleGenerativeAI(**kwargs)
            else:
                raise ValueError(f"Unsupported judge provider: {provider}")

        prompt = self.prompt_template.format(
            ground_truth=ground_truth,
            response=model_response,
        )

        try:
            messages = [
                HumanMessage(content=prompt),
            ]
            resp = self.llm.invoke(messages)

            # Cost/usage tracking
            try:
                inp, out = extract_usage_from_message(resp)
                if self._cost_cache is not None:
                    inc_cost = self._cost_cache.cost(self.config.model, inp, out)
                else:
                    inc_cost = compute_cost_usd(
                        self.config.model,
                        inp,
                        out,
                        warn=lambda m: self.console.print(f"[yellow]{m}[/yellow]"),
                    )
                self._judge_input_tokens_total += int(inp)
                self._judge_output_tokens_total += int(out)
                self._judge_cost_usd_total += float(inc_cost)
            except Exception:
                pass

            text = resp.content or ""
            # Record raw judge response for downstream reporting
            self._last_raw_response = text

            match = re.search(r"<result>\s*(correct|incorrect)\s*</result>", text, re.IGNORECASE)
            if match:
                return "pass" if match.group(1).strip().lower() == "correct" else "fail"
            self._log(f"Judge could not parse <result> tag; assuming failure. Raw response: {resp}")
            return "fail"

        except Exception as e:
            self._log(f"Judge error: {e}")
            return "fail"

    def get_cost_summary(self) -> dict:
        return {
            "model": self.config.model,
            "tokens": {
                "input": self._judge_input_tokens_total,
                "output": self._judge_output_tokens_total,
                "total": self._judge_input_tokens_total + self._judge_output_tokens_total,
            },
            "cost_usd": round(self._judge_cost_usd_total, 6),
        }

    def get_last_raw_response(self) -> Optional[str]:
        """Return the raw text of the last LLM judge response, if any.

        For non-LLM modes (e.g., "contains") this will be None.
        """
        return self._last_raw_response
