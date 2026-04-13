"""Cost utilities using LiteLLM for model pricing.

This module centralizes cost estimation based on token usage using
`litellm.cost_per_token`. It also provides helpers to extract token
usage from common LangChain result/message shapes.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple


def _cost_per_token():
    """Lazily import LiteLLM's cost_per_token to avoid import-time issues in tests.

    Returns the function if available, otherwise None.
    """
    try:
        from litellm import cost_per_token as _cpt  # type: ignore

        return _cpt
    except Exception:
        return None


ANTHROPIC_MODELS_DOC = "https://docs.anthropic.com/en/docs/about-claude/models/overview"


def litellm_model_from_model_id(model_id: str) -> Tuple[str, str, str]:
    """Return (litellm_model, provider, model_name) from a provider:model id.

    LiteLLM expects the raw model name (without provider prefix), e.g.,
    "gpt-4o-mini", "gemini-2.5-pro", "claude-3-haiku-20240307".
    """
    provider = "anthropic"
    model_name = model_id
    if ":" in model_id:
        provider, model_name = model_id.split(":", 1)
    return model_name.strip(), provider.strip().lower(), model_name.strip()


def compute_cost_usd(
    model_id: str,
    input_tokens: int,
    output_tokens: int,
    *,
    warn: Callable[[str], None] | None = None,
) -> float:
    """Compute cost in USD using LiteLLM's cost_per_token.

    If the model is unknown to LiteLLM, this returns 0.0 and optionally warns.
    """
    litellm_model, provider, model_name = litellm_model_from_model_id(model_id)

    try:
        cpt = _cost_per_token()
        if cpt is None:
            if warn:
                _maybe_warn_unknown_model(warn, provider, model_name)
            return 0.0
        result = cpt(
            model=litellm_model,
            prompt_tokens=int(input_tokens or 0),
            completion_tokens=int(output_tokens or 0),
        )
        total = _normalize_total_cost(result)
        if total is None:
            if warn:
                _maybe_warn_unknown_model(warn, provider, model_name)
            return 0.0
        return float(total)
    except Exception:
        if warn:
            _maybe_warn_unknown_model(warn, provider, model_name)
        return 0.0


def _maybe_warn_unknown_model(warn: Callable[[str], None], provider: str, model_name: str) -> None:
    if provider == "anthropic":
        if "-latest" in model_name or not any(c.isdigit() for c in model_name):
            warn(
                "Could not resolve pricing for Anthropic model. For accurate costs, "
                "use a dated model ID (e.g., 'claude-3-haiku-20240307' instead of "
                "'claude-3-5-haiku-latest'). See: "
                f"{ANTHROPIC_MODELS_DOC}"
            )
        else:
            warn(
                "Could not resolve pricing for Anthropic model via LiteLLM; setting cost=0. "
                f"Model: {model_name}"
            )
    else:
        warn(
            f"Could not resolve pricing for model via LiteLLM; setting cost=0. Model: {model_name}"
        )


def extract_usage_from_llm_result(result: Any) -> Tuple[int, int]:
    """Extract (input_tokens, output_tokens) from a LangChain LLMResult.

    Tries several common locations across providers and LangChain versions.
    """
    inp = 0
    out = 0

    llm_output = getattr(result, "llm_output", None)
    if isinstance(llm_output, dict):
        usage = llm_output.get("token_usage") or llm_output.get("usage") or {}
        inp += int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
        out += int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)

    gens = getattr(result, "generations", None)
    if isinstance(gens, list):
        for gen_list in gens:
            for gen in gen_list or []:
                msg = getattr(gen, "message", None)
                usage_meta = getattr(msg, "usage_metadata", None)
                if isinstance(usage_meta, dict):
                    inp += int(usage_meta.get("input_tokens") or 0)
                    out += int(usage_meta.get("output_tokens") or 0)

                resp_meta = getattr(msg, "response_metadata", None)
                if isinstance(resp_meta, dict):
                    usage2 = resp_meta.get("token_usage") or resp_meta.get("usage") or {}
                    if isinstance(usage2, dict):
                        inp += int(usage2.get("prompt_tokens") or usage2.get("input_tokens") or 0)
                        out += int(
                            usage2.get("completion_tokens") or usage2.get("output_tokens") or 0
                        )

    return inp, out


def extract_usage_from_message(resp_message: Any) -> Tuple[int, int]:
    """Extract (input_tokens, output_tokens) from an AIMessage-like response."""
    inp = 0
    out = 0

    usage = getattr(resp_message, "usage_metadata", None)
    if isinstance(usage, dict):
        inp += int(usage.get("input_tokens") or 0)
        out += int(usage.get("output_tokens") or 0)

    resp_meta = getattr(resp_message, "response_metadata", None)
    if isinstance(resp_meta, dict):
        usage2 = resp_meta.get("token_usage") or resp_meta.get("usage") or {}
        if isinstance(usage2, dict):
            inp += int(usage2.get("prompt_tokens") or usage2.get("input_tokens") or 0)
            out += int(usage2.get("completion_tokens") or usage2.get("output_tokens") or 0)

    addl = getattr(resp_message, "additional_kwargs", None)
    if isinstance(addl, dict):
        usage3 = addl.get("usage") or {}
        if isinstance(usage3, dict):
            inp += int(usage3.get("prompt_tokens") or usage3.get("input_tokens") or 0)
            out += int(usage3.get("completion_tokens") or usage3.get("output_tokens") or 0)

    return inp, out


class CostCache:
    """Preflight and cache per-model token cost rates to warn once and reuse later.

    For each model_id, we attempt to derive cost per 1K input and output tokens via
    LiteLLM at startup. We then use these fixed rates for all cost computations,
    avoiding repeated warnings.
    """

    def __init__(self):
        self._rates: Dict[str, Dict[str, Optional[float]]] = {}

    def preflight_models(
        self, model_ids: List[str], warn: Callable[[str], None] | None = None
    ) -> None:
        seen: set[str] = set()
        cpt = _cost_per_token()
        for mid in model_ids:
            if mid in seen:
                continue
            seen.add(mid)
            name, provider, model_name = litellm_model_from_model_id(mid)
            in_per_1k: Optional[float]
            out_per_1k: Optional[float]
            try:
                if cpt is None:
                    raise ImportError("litellm not available")
                in_raw = cpt(model=name, prompt_tokens=1000, completion_tokens=0)
                out_raw = cpt(model=name, prompt_tokens=0, completion_tokens=1000)
                in_per_1k = _extract_component_cost(in_raw, component="input")
                out_per_1k = _extract_component_cost(out_raw, component="output")
                if in_per_1k is None or out_per_1k is None:
                    raise ValueError("LiteLLM returned None for rates")
            except Exception:
                in_per_1k = None
                out_per_1k = None
                if warn:
                    _maybe_warn_unknown_model(warn, provider, model_name)

            self._rates[mid] = {"input_per_1k": in_per_1k, "output_per_1k": out_per_1k}

    def describe_rates(self, model_id: str) -> Tuple[Optional[float], Optional[float]]:
        r = self._rates.get(model_id) or {}
        return r.get("input_per_1k"), r.get("output_per_1k")

    def has_rates_for(self, model_ids: List[str]) -> bool:
        """Return True if cached rates exist for all provided model ids."""
        try:
            return all(mid in self._rates for mid in model_ids)
        except Exception:
            return False

    def cost(self, model_id: str, input_tokens: int, output_tokens: int) -> float:
        r = self._rates.get(model_id)
        if not r:
            # Not preflighted; fall back to runtime compute without warnings
            return compute_cost_usd(model_id, input_tokens, output_tokens, warn=None)
        in_rate = r.get("input_per_1k")
        out_rate = r.get("output_per_1k")
        if in_rate is None or out_rate is None:
            return 0.0
        return (input_tokens / 1000.0) * float(in_rate) + (output_tokens / 1000.0) * float(out_rate)


def _normalize_total_cost(val: Any) -> Optional[float]:
    """Normalize LiteLLM cost_per_token return value to a total float.

    Handles floats, tuples, and dicts from different LiteLLM versions.
    """
    try:
        if val is None:
            return None
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, tuple):
            # Some versions return (prompt_cost, completion_cost)
            parts = [p for p in val if isinstance(p, (int, float))]
            if parts:
                return float(sum(parts))
            return None
        if isinstance(val, dict):
            # Prefer explicit total keys
            for k in ("total_cost", "total"):
                if k in val and isinstance(val[k], (int, float)):
                    return float(val[k])
            # Otherwise, sum known component keys
            prompt = val.get("prompt_cost") or val.get("input_cost") or 0.0
            completion = val.get("completion_cost") or val.get("output_cost") or 0.0
            if isinstance(prompt, (int, float)) or isinstance(completion, (int, float)):
                try:
                    return float(prompt) + float(completion)
                except Exception:
                    return None
        return None
    except Exception:
        return None


def _extract_component_cost(val: Any, *, component: str) -> Optional[float]:
    """Extract a single component cost (input/prompt or output/completion) from a cost_per_token result."""
    comp = component.lower()
    try:
        if val is None:
            return None
        if isinstance(val, (int, float)):
            # If only one side was requested (other tokens=0), LiteLLM may return a single float
            return float(val)
        if isinstance(val, tuple):
            # Assume (prompt_cost, completion_cost)
            if comp == "input":
                return float(val[0]) if len(val) >= 1 and isinstance(val[0], (int, float)) else None
            return float(val[1]) if len(val) >= 2 and isinstance(val[1], (int, float)) else None
        if isinstance(val, dict):
            if comp == "input":
                for k in ("prompt_cost", "input_cost"):
                    v = val.get(k)
                    if isinstance(v, (int, float)):
                        return float(v)
            else:
                for k in ("completion_cost", "output_cost"):
                    v = val.get(k)
                    if isinstance(v, (int, float)):
                        return float(v)
        return None
    except Exception:
        return None
