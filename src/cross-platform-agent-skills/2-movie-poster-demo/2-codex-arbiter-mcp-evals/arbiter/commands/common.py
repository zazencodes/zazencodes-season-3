from __future__ import annotations

import os
from typing import List

RECOMMENDED_MODELS: List[str] = [
    "anthropic:claude-3-5-haiku-latest",
    "openai:gpt-5-nano",
    "google:gemini-2.5-flash",
]


def provider_from_model_id(model_id: str) -> str:
    if ":" in model_id:
        return model_id.split(":", 1)[0].strip()
    return "unknown"


REQUIRED_ENV_BY_PROVIDER = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "google": "GOOGLE_API_KEY",
}


def require_provider_env(provider_or_model: str) -> None:
    """Validate that the provider's API key is set for a provider or model id.

    Raises SystemExit with a helpful message if missing.
    """
    from rich.console import Console

    console = Console(highlight=False)
    provider = (
        provider_or_model
        if provider_or_model in REQUIRED_ENV_BY_PROVIDER
        else provider_from_model_id(provider_or_model)
    )
    env_var = REQUIRED_ENV_BY_PROVIDER.get(provider)
    if env_var and not os.getenv(env_var):
        console.print(
            f"⚠️ Missing required credential for provider '{provider}'. Set {env_var}.",
            style="red",
        )
        raise SystemExit(1)
