from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path

from rich.console import Console

from ..config import EvalConfig
from ..evaluator import MCPEvaluator


def run_command(
    config_file: Path,
    verbose: bool = False,
    yes: bool = False,
    *,
    evaluator_class: type | None = None,
) -> None:
    """Run an evaluation suite from a configuration file."""
    console = Console(highlight=False)

    # Configure a single shared timestamp for both JSON and log filenames
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    try:
        log_path = (config_file.parent / f"eval_{ts}.log").resolve()
    except Exception:
        log_path = Path(f"eval_{ts}.log").resolve()
    logger = logging.getLogger("arbiter")
    logger.setLevel(logging.INFO)
    # Avoid duplicate handlers if run_command is called multiple times in tests
    logger.handlers = []
    file_handler = logging.FileHandler(str(log_path), encoding="utf-8")
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(file_handler)

    try:
        # Validate config file exists
        if not config_file.exists():
            console.print(f"⚠️ Error: Configuration file does not exist: {config_file}", style="red")
            sys.exit(1)

        # Load configuration
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                config_data = json.load(f)
        except Exception as e:
            console.print(f"⚠️ Error loading config file: {e}", style="red")
            sys.exit(1)

        # Parse configuration
        try:
            config = EvalConfig.from_dict(config_data)
        except Exception as e:
            console.print(f"⚠️ Error parsing config: {e}", style="red")
            sys.exit(1)

        # Validate environment keys based on providers in models and judge.model
        # Only enforce when using the real MCPEvaluator; allow tests to inject a stub.
        should_validate_credentials = evaluator_class is None or evaluator_class is MCPEvaluator

        if should_validate_credentials:

            def provider_from_model_id(model_id: str) -> str:
                # expected syntax: provider:model
                if ":" in model_id:
                    return model_id.split(":", 1)[0].strip()
                return "unknown"

            providers = set(provider_from_model_id(m) for m in config.models)
            if config.judge and getattr(config.judge, "model", None):
                providers.add(provider_from_model_id(config.judge.model))

            # Map providers to required env vars
            required_env_by_provider = {
                "anthropic": "ANTHROPIC_API_KEY",
                "openai": "OPENAI_API_KEY",
                "google": "GOOGLE_API_KEY",
            }

            missing = []
            for p in providers:
                env_var = required_env_by_provider.get(p)
                if env_var and not os.getenv(env_var):
                    missing.append((p, env_var))

            if missing:
                lines = [f"  - {p}: set {env_var}" for p, env_var in missing]
                console.print(
                    "⚠️ Missing required API credentials for configured providers:\n"
                    + "\n".join(lines),
                    style="red",
                )
                sys.exit(1)

        config.output_dir = str(config_file.parent)

        # Create evaluator (evaluator manages its own Console). Allow injection for tests.
        EvaluatorClass = evaluator_class or MCPEvaluator
        # Be flexible with constructor signature for easier testing/mocking
        try:
            evaluator = EvaluatorClass(config, verbose=verbose, logger=logger, run_timestamp=ts)
        except TypeError:
            try:
                evaluator = EvaluatorClass(config, verbose=verbose)
            except TypeError:
                evaluator = EvaluatorClass(config)

        # Pre-execution summary and confirmation
        try:
            models_to_check = list(config.models)
            if config.judge and getattr(config.judge, "model", None):
                models_to_check.append(config.judge.model)

            # Preflighting model pricing with LiteLLM...
            evaluator.cost_cache.preflight_models(
                models_to_check,
                warn=lambda m: evaluator.console.print(f"[yellow]{m}[/yellow]"),
            )

            total_items = len(config.tool_use_evals) + len(config.abstention_evals)
            mcp_name, mcp_cfg = next(iter(config.mcp_servers.items()))
            args_preview = " ".join(mcp_cfg.args) if mcp_cfg.args else ""

            evaluator.console.print("\n=== Execution Preview ===")
            evaluator.console.print(f"[bold]Suite[/bold]: {config.name}")
            evaluator.console.print(f"[bold]Models[/bold]: {', '.join(config.models)}")
            evaluator.console.print(f"[bold]Judge[/bold]: {config.judge.model}")
            evaluator.console.print(f"[bold]Repeats[/bold]: {config.repeats}")
            evaluator.console.print(
                f"[bold]MCP Server[/bold]: {mcp_name} → {mcp_cfg.command} {args_preview}".rstrip(),
            )
            evaluator.console.print(
                f"[bold]Eval items[/bold]: {total_items} ({len(config.tool_use_evals)} tool-use, {len(config.abstention_evals)} abstention)",
            )
            evaluator.console.print("[bold]Pricing (per 1K tokens)[/bold]:")
            for mid in models_to_check:
                inp, out = evaluator.cost_cache.describe_rates(mid)
                inp_str = f"${inp:.6f}" if inp is not None else "unknown"
                out_str = f"${out:.6f}" if out is not None else "unknown"
                evaluator.console.print(f"  - {mid}: input={inp_str}, output={out_str}")
            evaluator.console.print(f"[bold]Logging to[/bold]: {log_path}")

            if not yes:
                evaluator.console.print("")
                try:
                    resp = input("Proceed with the evaluation? [Y/n]: ").strip().lower()
                except EOFError:
                    resp = ""
                if resp not in ("y", "yes", ""):
                    evaluator.console.print("Aborted by user.")
                    sys.exit(0)
        except Exception:
            # Non-fatal preview failure: continue
            pass

        try:
            output_path = asyncio.run(evaluator.run_evaluation())
            console.print("\n✨ Evaluation complete")
            console.print(f"📄 Results saved to: [bold]{output_path}[/bold]")

        except KeyboardInterrupt:
            console.print("\n⚠️  Evaluation interrupted by user", style="yellow")
            sys.exit(1)
        except Exception as e:
            console.print(f"\n⚠️ Error during evaluation: {e}", style="red")
            console.print(traceback.format_exc(), style="dim", highlight=True)
            sys.exit(1)
    finally:
        # Clean up logging handlers
        for h in list(logger.handlers):
            try:
                h.flush()
            except Exception:
                pass
            try:
                h.close()
            except Exception:
                pass
            try:
                logger.removeHandler(h)
            except Exception:
                pass
