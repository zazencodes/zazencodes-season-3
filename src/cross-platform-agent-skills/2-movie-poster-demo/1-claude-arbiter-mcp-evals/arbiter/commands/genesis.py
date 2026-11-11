from __future__ import annotations

import json
import sys
from importlib.resources import files
from pathlib import Path

from rich.console import Console


def create_example_command() -> None:
    """Create an example configuration file."""
    console = Console(highlight=False)

    input_config_file_name = "example_evals.json"
    output_config_file_name = "arbiter_example_evals.json"

    # Load example configuration JSON from packaged assets
    try:
        resource_path = files("arbiter.assets").joinpath(input_config_file_name)
        example_config = json.loads(resource_path.read_text(encoding="utf-8"))
    except Exception as e:
        console.print(f"⚠️ Error loading bundled example config: {e}", style="red")
        sys.exit(1)

    try:
        output_file = Path(output_config_file_name)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(example_config, f, indent=2)

        console.print(f"📄 Example configuration created: [bold]{output_file}[/bold]")
        console.print(f"Edit this file and run: [cyan]arbiter execute {output_file}[/cyan]")

    except Exception as e:
        console.print(f"⚠️ Error creating example: {e}", style="red")
        sys.exit(1)
