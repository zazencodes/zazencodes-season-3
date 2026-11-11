from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

SUPPORTED_ENGINES = ("tectonic", "pdflatex", "xelatex")
DEFAULT_IMAGE_MANIFEST = "literature_review_images.json"
DEFAULT_IMAGE_SNIPPET = "literature_review_images.tex"


def pick_engine() -> str | None:
    for engine in SUPPORTED_ENGINES:
        if shutil.which(engine):
            return engine
    return None


def run_command(cmd: list[str], cwd: Path) -> int:
    completed = subprocess.run(cmd, cwd=cwd, check=False)
    return completed.returncode


def validate_image_artifacts(tex_path: Path) -> int:
    cwd = tex_path.parent
    manifest_path = cwd / DEFAULT_IMAGE_MANIFEST
    snippet_path = cwd / DEFAULT_IMAGE_SNIPPET

    if not manifest_path.exists():
        return 0

    if not snippet_path.exists():
        print(
            "error: image manifest found but LaTeX image snippet is missing. "
            f"Run the image preparation step first to create {snippet_path.name}.",
            file=sys.stderr,
        )
        return 4

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"error: invalid image manifest JSON: {exc}", file=sys.stderr)
        return 4

    if not isinstance(manifest, list):
        print("error: image manifest must be a JSON array", file=sys.stderr)
        return 4

    missing_assets: list[str] = []
    for entry in manifest:
        if not isinstance(entry, dict):
            continue
        output_path = entry.get("output_path")
        if isinstance(output_path, str) and output_path:
            asset_path = cwd / output_path
            if not asset_path.exists():
                missing_assets.append(output_path)

    if missing_assets:
        print(
            "error: image preparation is incomplete; missing asset files: "
            + ", ".join(missing_assets),
            file=sys.stderr,
        )
        return 4

    return 0


def compile_tex(tex_path: Path, engine: str) -> int:
    cwd = tex_path.parent
    filename = tex_path.name

    if engine == "tectonic":
        return run_command([engine, filename], cwd)

    return run_command(
        [engine, "-interaction=nonstopmode", "-halt-on-error", filename],
        cwd,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compile a LaTeX file into PDF using an available TeX engine."
    )
    parser.add_argument("tex_file", help="Path to the .tex file to compile")
    args = parser.parse_args()

    tex_path = Path(args.tex_file).expanduser().resolve()
    if not tex_path.exists():
        print(f"error: file not found: {tex_path}", file=sys.stderr)
        return 1
    if tex_path.suffix.lower() != ".tex":
        print(f"error: expected a .tex file: {tex_path}", file=sys.stderr)
        return 1

    engine = pick_engine()
    if engine is None:
        print(
            "error: no supported TeX engine found. Install one of: "
            + ", ".join(SUPPORTED_ENGINES)
            + ". On macOS, `brew install tectonic` is the simplest setup.",
            file=sys.stderr,
        )
        return 2

    validation_result = validate_image_artifacts(tex_path)
    if validation_result != 0:
        return validation_result

    print(f"Using TeX engine: {engine}")
    result = compile_tex(tex_path, engine)
    pdf_path = tex_path.with_suffix(".pdf")

    if result != 0:
        print("error: LaTeX compilation failed", file=sys.stderr)
        return result

    if not pdf_path.exists():
        print(
            f"error: compilation completed but PDF was not created: {pdf_path}",
            file=sys.stderr,
        )
        return 3

    print(f"PDF created: {pdf_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
