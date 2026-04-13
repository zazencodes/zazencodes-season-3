"""Command-line interface for Arbiter evaluations."""

import argparse
from pathlib import Path

from .commands import (
    council_command,
    create_example_command,
    forge_command,
    run_command as _run_command,
)
from .evaluator import MCPEvaluator  # re-export for tests expecting attribute on module


def run_command(config_file: Path, verbose: bool = False, yes: bool = False) -> None:
    """Wrapper that forwards to the commands implementation.

    Exposed here so tests can import `run_command` and monkeypatch `MCPEvaluator` on
    this module, which we then pass through to the command layer.
    """
    _run_command(
        config_file,
        verbose=verbose,
        yes=yes,
        evaluator_class=MCPEvaluator,
    )


def main() -> None:
    class HelpFormatter(argparse.ArgumentDefaultsHelpFormatter, argparse.RawTextHelpFormatter):
        pass

    parser = argparse.ArgumentParser(
        prog="arbiter",
        description=(
            "Arbiter - Run configurable MCP (Model Context Protocol) evals across models.\n"
            "Use subcommands to create an example config or execute an evaluation suite."
        ),
        formatter_class=HelpFormatter,
        epilog=(
            "Examples:\n"
            "  - Create an example config file:\n"
            "      arbiter genesis\n\n"
            "  - Execute the example config with verbose output:\n"
            "      arbiter execute arbiter_example_evals.json -v\n\n"
        ),
    )
    parser.add_argument("--version", action="version", version="arbiter 0.1.0")

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Evals command
    run_parser = subparsers.add_parser(
        "execute",
        help="Run an evaluation suite from a configuration file",
        description=(
            "Run an evaluation suite described by a JSON configuration file. "
            "See 'arbiter genesis' to generate a starter file."
        ),
        formatter_class=HelpFormatter,
    )
    run_parser.add_argument(
        "config_file",
        type=Path,
        help="Path to evaluation configuration JSON file",
    )
    run_parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show detailed results including prompts and model responses",
    )

    # Genesis command
    _example_parser = subparsers.add_parser(
        "genesis",
        help="Create an example configuration file",
        description=(
            "Write 'arbiter_example_evals.json' into the current directory. "
            "Edit it and run with 'arbiter execute arbiter_example_evals.json'."
        ),
        formatter_class=HelpFormatter,
    )

    # Forge command
    forge_parser = subparsers.add_parser(
        "forge",
        help="Interactively generate a custom evaluation config",
        description=(
            "Guide you through selecting models, judge, and MCP server details, "
            "then write a generated config file you can execute."
        ),
        formatter_class=HelpFormatter,
    )

    # Council command
    council_parser = subparsers.add_parser(
        "council",
        help="Launch a local dashboard to review an eval results JSON",
        description=(
            "Serve a local dashboard for inspecting an eval_*.json results file.\n"
            "Example: arbiter council eval_20250915_144704.json"
        ),
        formatter_class=HelpFormatter,
    )
    council_parser.add_argument(
        "results_file",
        type=Path,
        help="Path to eval_*.json produced by 'arbiter execute'",
    )
    council_parser.add_argument(
        "--host",
        dest="host",
        default="127.0.0.1",
        help="Host interface to bind",
    )
    council_parser.add_argument(
        "--port",
        dest="port",
        type=int,
        default=8000,
        help="Port to bind",
    )
    forge_parser.add_argument(
        "--forge-model",
        dest="forge_model",
        default="openai:gpt-5",
        help="Model used to help generate evals (provider-prefixed)",
    )
    forge_parser.add_argument(
        "--num-tool-evals",
        dest="num_tool_evals",
        type=int,
        default=20,
        help="Target number of tool-use eval items to generate",
    )
    forge_parser.add_argument(
        "--num-abstention-evals",
        dest="num_abstention_evals",
        type=int,
        default=5,
        help="Target number of abstention eval items to generate",
    )
    forge_parser.add_argument(
        "--repeats",
        dest="repeats",
        type=int,
        default=3,
        help="How many times each eval should be repeated in execution",
    )
    forge_parser.add_argument(
        "--output",
        dest="output",
        type=Path,
        default=Path("arbiter_forged_evals.json"),
        help="Path to write the generated config JSON",
    )

    args = parser.parse_args()

    if args.command == "execute":
        # Pass MCPEvaluator via keyword so tests can monkeypatch arbiter.cli.MCPEvaluator
        _run_command(
            args.config_file,
            verbose=args.verbose,
            yes=getattr(args, "yes", False),
            evaluator_class=MCPEvaluator,
        )
    elif args.command == "genesis":
        create_example_command()
    elif args.command == "forge":
        forge_command(
            forge_model=args.forge_model,
            num_tool_evals=args.num_tool_evals,
            num_abstention_evals=args.num_abstention_evals,
            repeats=args.repeats,
            output_path=args.output,
        )
    elif args.command == "council":
        council_command(results_file=args.results_file, host=args.host, port=args.port)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
