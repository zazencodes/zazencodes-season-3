from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Providers for LLM calls
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from rich.console import Console

from .common import RECOMMENDED_MODELS, REQUIRED_ENV_BY_PROVIDER, provider_from_model_id


def forge_command(
    forge_model: str,
    num_tool_evals: int,
    num_abstention_evals: int,
    repeats: int,
    output_path: Path,
) -> None:
    """Interactively generate a custom evaluation configuration.

    This guides the user through selecting models and MCP details, then uses the
    provided forge model to synthesize eval items in the required JSON format.
    """
    console = Console(highlight=False)

    # Validate forge model provider credentials
    forge_provider = provider_from_model_id(forge_model)
    required_env = REQUIRED_ENV_BY_PROVIDER.get(forge_provider)
    if required_env and not os.getenv(required_env):
        console.print(
            f"⚠️ Missing required credential for forge model provider '{forge_provider}'. Set {required_env}.",
            style="red",
        )
        sys.exit(1)

    def prompt_select_models() -> list[str]:
        console.print("\nSelect models to evaluate:")
        for idx, mid in enumerate(RECOMMENDED_MODELS, start=1):
            console.print(f"  {idx}. {mid}")
        try:
            raw = input("Enter comma-separated numbers (default: all): ").strip()
        except EOFError:
            raw = ""
        if not raw:
            return list(RECOMMENDED_MODELS)
        try:
            indices = [int(x.strip()) for x in raw.split(",") if x.strip()]
            chosen = [
                RECOMMENDED_MODELS[i - 1] for i in indices if 1 <= i <= len(RECOMMENDED_MODELS)
            ]
            return chosen or list(RECOMMENDED_MODELS)
        except Exception:
            return list(RECOMMENDED_MODELS)

    def prompt_select_judge() -> str:
        console.print("\nSelect judge model:")
        for idx, mid in enumerate(RECOMMENDED_MODELS, start=1):
            console.print(f"  {idx}. {mid}")
        default = RECOMMENDED_MODELS[0]
        try:
            raw = input(f"Enter number (default: 1 - {default}): ").strip()
        except EOFError:
            raw = ""
        if not raw:
            return default
        try:
            i = int(raw)
            if 1 <= i <= len(RECOMMENDED_MODELS):
                return RECOMMENDED_MODELS[i - 1]
        except Exception:
            pass
        return default

    def prompt_text(prompt: str, default: str | None = None) -> str:
        try:
            raw = input(f"{prompt}{f' (default: {default})' if default else ''}: ").strip()
        except EOFError:
            raw = ""
        if not raw and default is not None:
            return default
        return raw

    def prompt_multiline(prompt: str) -> str:
        console.print(f"\n{prompt}\nEnter text. Finish with a single line containing 'EOF'.")
        lines: list[str] = []
        while True:
            try:
                line = input()
            except EOFError:
                break
            if line.strip() == "EOF":
                break
            lines.append(line)
        return "\n".join(lines).strip()

    # Prompts
    console.print("\n=== Forge Custom Eval Suite ===")
    models = prompt_select_models()
    judge_model = prompt_select_judge()

    mcp_command = prompt_text("MCP server command (e.g., 'uvx' or path)", default="uvx")
    mcp_args_raw = prompt_text(
        "MCP server arguments (space-separated, e.g., 'unit-converter-mcp')", default=""
    )
    mcp_args = [a for a in mcp_args_raw.split(" ") if a] if mcp_args_raw else []

    # Derive MCP name from args[0] or command
    mcp_name = (mcp_args[0] if mcp_args else Path(mcp_command).name) or "custom-mcp"

    # Descriptions used for LLM generation
    server_description = prompt_multiline("Describe your MCP server (purpose, domain)")
    tools_description = prompt_multiline(
        "Describe the MCP server tools to test (names, args, docstrings, examples)"
    )

    # Build base config (eval items populated below)
    config_data = {
        "name": "Custom MCP Evals Suite",
        "models": models,
        "judge": {
            "model": judge_model,
            "max_tokens": 1000,
        },
        "repeats": repeats,
        "mcp_servers": {
            mcp_name: {
                "command": mcp_command,
                "args": mcp_args,
                "transport": "stdio",
            }
        },
        "tool_use_evals": [],
        "abstention_evals": [],
    }

    # === LLM generation of eval items ===
    def _build_chat_model(model_id: str):
        if ":" in model_id:
            provider, model_name = model_id.split(":", 1)
        else:
            provider, model_name = "anthropic", model_id
        provider = provider.strip().lower()
        if provider == "anthropic":
            return ChatAnthropic(model=model_name, temperature=0.2)
        if provider == "openai":
            return ChatOpenAI(model=model_name, temperature=0.2)
        if provider == "google":
            return ChatGoogleGenerativeAI(model=model_name, temperature=0.2)
        raise ValueError(f"Unsupported model provider: {provider}")

    def _extract_json_payload(text: str) -> dict | None:
        try:
            return json.loads(text)
        except Exception:
            pass
        # Strip code fences if present
        try:
            if "```" in text:
                start = text.find("```")
                if start != -1:
                    rest = text[start + 3 :]
                    # Skip an optional language tag
                    if "\n" in rest:
                        rest = rest[rest.find("\n") + 1 :]
                    end = rest.find("```")
                    if end != -1:
                        fenced = rest[:end]
                        return json.loads(fenced)
        except Exception:
            pass
        # Fallback: find first JSON object heuristically
        try:
            first = text.find("{")
            last = text.rfind("}")
            if first != -1 and last != -1 and last > first:
                return json.loads(text[first : last + 1])
        except Exception:
            return None
        return None

    def _validate_items(payload: dict) -> tuple[list[dict], list[dict]]:
        tool_items: list[dict] = []
        abstain_items: list[dict] = []
        if isinstance(payload, dict):
            t = payload.get("tool_use_evals")
            a = payload.get("abstention_evals")
            if isinstance(t, list):
                for i in t:
                    if not isinstance(i, dict):
                        continue
                    q = i.get("query")
                    ans = i.get("answer")
                    jm = i.get("judge_mode")
                    if isinstance(q, str) and isinstance(ans, str) and jm in ("llm", "contains"):
                        tool_items.append({"query": q, "answer": ans, "judge_mode": jm})
            if isinstance(a, list):
                for i in a:
                    if not isinstance(i, dict):
                        continue
                    q = i.get("query")
                    if isinstance(q, str):
                        abstain_items.append({"query": q})
        return tool_items, abstain_items

    # Compose prompt
    system_prompt = (
        "You are an expert at designing MCP evaluation suites. "
        "Generate realistic eval items to test an LLM agent's tool-use with an MCP server. "
        "Output STRICT JSON only, no code fences."
    )
    user_prompt = (
        "Create evals for the described MCP server and its tools.\n\n"
        f"Server description:\n{server_description}\n\n"
        f"Tools description:\n{tools_description}\n\n"
        "Requirements:\n"
        f"- tool_use_evals: {num_tool_evals} items. Each must include: query, answer, judge_mode ('llm' or 'contains').\n"
        f"- abstention_evals: {num_abstention_evals} items. Each must include: query.\n"
        "Guidelines:\n"
        "- Queries must require the agent to use the described tools to be correct.\n"
        "- Use judge_mode 'contains' only when the answer is a short deterministic string or number suitable for substring checking. Otherwise use 'llm'.\n"
        "- Keep answers concise, factual, and directly comparable to ground truth.\n"
        "- Avoid requiring external web searches or tools not in scope.\n"
        "- Cover varied tool arguments and edge cases (units, ranges, invalid inputs).\n"
        "Return JSON with keys: tool_use_evals, abstention_evals."
    )

    generated_tool_items: list[dict] = []
    generated_abstain_items: list[dict] = []
    try:
        chat = _build_chat_model(forge_model)
        response = chat.invoke(system_prompt + "\n\n" + user_prompt)
        content = getattr(response, "content", "")
        if isinstance(content, list):
            # LangChain content may be list of dicts
            try:
                content = "\n".join(
                    [c.get("text", "") if isinstance(c, dict) else str(c) for c in content]
                )
            except Exception:
                content = str(content)
        elif not isinstance(content, str):
            content = str(content)

        payload = _extract_json_payload(content)
        if payload is None:
            # Retry once with stricter instruction
            response2 = chat.invoke(
                system_prompt
                + "\n\n"
                + user_prompt
                + "\n\nRespond with JSON only. Do not include explanations or code fences."
            )
            content2 = getattr(response2, "content", "")
            if not isinstance(content2, str):
                try:
                    content2 = "\n".join(
                        [
                            c.get("text", "") if isinstance(c, dict) else str(c)
                            for c in (content2 or [])
                        ]
                    )
                except Exception:
                    content2 = str(content2)
            payload = _extract_json_payload(content2)

        if payload is not None:
            t_items, a_items = _validate_items(payload)
            # Trim to requested counts
            generated_tool_items = t_items[: max(0, num_tool_evals)]
            generated_abstain_items = a_items[: max(0, num_abstention_evals)]
    except Exception as e:
        console.print(
            f"[yellow]Warning: eval generation failed: {e}. Proceeding with empty lists.[/yellow]"
        )

    config_data["tool_use_evals"] = generated_tool_items
    config_data["abstention_evals"] = generated_abstain_items

    # Preview and write
    console.print("\n=== Forge Summary ===")
    console.print(f"[bold]Forge model[/bold]: {forge_model}")
    console.print(
        f"[bold]Targets[/bold]: tool_use={num_tool_evals}, abstention={num_abstention_evals}, repeats={repeats}"
    )
    console.print(f"[bold]Models[/bold]: {', '.join(models)}")
    console.print(f"[bold]Judge[/bold]: {judge_model}")
    console.print(f"[bold]MCP[/bold]: {mcp_name} → {mcp_command} {' '.join(mcp_args)}".rstrip())
    console.print(
        f"Generated: {len(generated_tool_items)} tool-use evals, {len(generated_abstain_items)} abstention evals"
    )
    console.print(f"Will write: {output_path}")

    console.print("")
    try:
        resp = input("Proceed to write config? [Y/n]: ").strip().lower()
    except EOFError:
        resp = ""
    if resp not in ("y", "yes", ""):
        console.print("Aborted by user.")
        sys.exit(0)

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=2)
        console.print(f"\n📄 Generated configuration: [bold]{output_path}[/bold]")
        console.print(f"Run it with: [cyan]arbiter execute {output_path}[/cyan]")
    except Exception as e:
        console.print(f"⚠️ Error writing config: {e}", style="red")
        sys.exit(1)
