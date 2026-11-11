from __future__ import annotations

import argparse
import json
import mimetypes
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".pdf"}
DEFAULT_ASSET_DIR = "literature_review_assets/images"
DEFAULT_SNIPPET = "literature_review_images.tex"


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return slug or "image"


def latex_escape(value: str) -> str:
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in value)


def infer_extension(source: str, response_headers: dict[str, str] | None = None) -> str:
    parsed = urllib.parse.urlparse(source)
    suffix = Path(parsed.path).suffix.lower()
    if suffix in SUPPORTED_EXTENSIONS:
        return suffix

    if response_headers:
        content_type = response_headers.get("Content-Type", "").split(";")[0].strip()
        guessed = mimetypes.guess_extension(content_type) or ""
        if guessed == ".jpe":
            guessed = ".jpg"
        if guessed.lower() in SUPPORTED_EXTENSIONS:
            return guessed.lower()

    raise ValueError(
        f"unsupported image format for {source!r}; use PNG, JPG, JPEG, or PDF"
    )


def fetch_remote_image(source: str, destination: Path) -> None:
    request = urllib.request.Request(
        source,
        headers={"User-Agent": "Codex literature review image fetcher/1.0"},
    )
    with urllib.request.urlopen(request) as response:
        extension = infer_extension(source, dict(response.headers.items()))
        if destination.suffix != extension:
            destination = destination.with_suffix(extension)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as handle:
            shutil.copyfileobj(response, handle)


def copy_local_image(source: Path, destination: Path) -> None:
    extension = source.suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"unsupported image format for {source}; use PNG, JPG, JPEG, or PDF"
        )
    destination = destination.with_suffix(extension)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def materialize_image(
    entry: dict, cwd: Path, manifest_dir: Path, asset_dir: Path, index: int
) -> dict:
    if not isinstance(entry, dict):
        raise ValueError(f"manifest entry {index} must be an object")

    source = entry.get("source")
    if not isinstance(source, str) or not source.strip():
        raise ValueError(f"manifest entry {index} is missing a string 'source'")
    source = source.strip()

    filename = entry.get("filename")
    if isinstance(filename, str) and filename.strip():
        base_name = Path(filename.strip()).stem
    else:
        parsed = urllib.parse.urlparse(source)
        stem = Path(parsed.path).stem if parsed.scheme else Path(source).stem
        base_name = stem or f"image_{index}"

    destination_base = asset_dir / f"{index:02d}_{slugify(base_name)}"
    parsed = urllib.parse.urlparse(source)

    if parsed.scheme in {"http", "https"}:
        try:
            request = urllib.request.Request(
                source,
                headers={"User-Agent": "Codex literature review image fetcher/1.0"},
            )
            with urllib.request.urlopen(request) as response:
                extension = infer_extension(source, dict(response.headers.items()))
                destination = destination_base.with_suffix(extension)
                destination.parent.mkdir(parents=True, exist_ok=True)
                with destination.open("wb") as handle:
                    shutil.copyfileobj(response, handle)
        except urllib.error.URLError as exc:
            raise ValueError(f"failed to fetch remote image {source}: {exc}") from exc
    else:
        local_source = Path(source).expanduser()
        if not local_source.is_absolute():
            local_source = (manifest_dir / local_source).resolve()
        if not local_source.exists():
            raise ValueError(f"local image not found: {local_source}")
        destination = destination_base.with_suffix(local_source.suffix.lower())
        copy_local_image(local_source, destination)

    rel_output = destination.relative_to(cwd).as_posix()
    caption = str(entry.get("caption", "")).strip()
    credit = str(entry.get("credit", "")).strip()
    section = str(entry.get("section", "Main Findings")).strip() or "Main Findings"
    placement = str(entry.get("placement", "htbp")).strip() or "htbp"
    width = str(entry.get("width", "0.9\\linewidth")).strip() or "0.9\\linewidth"
    label = str(entry.get("label", f"fig:{slugify(base_name)}")).strip()

    return {
        "source": source,
        "output_path": rel_output,
        "caption": caption,
        "credit": credit,
        "section": section,
        "placement": placement,
        "width": width,
        "label": label,
    }


def build_snippet(entries: list[dict]) -> str:
    lines = [
        "% Auto-generated by prepare_report_images.py",
        "% Input this file where figures should appear in the review.",
    ]
    for entry in entries:
        caption_parts = []
        if entry["caption"]:
            caption_parts.append(latex_escape(entry["caption"]))
        if entry["credit"]:
            caption_parts.append(r"\emph{Source: " + latex_escape(entry["credit"]) + "}")
        caption = " ".join(caption_parts) or "Figure"

        lines.extend(
            [
                "",
                rf"% Suggested section: {entry['section']}",
                rf"\begin{{figure}}[{entry['placement']}]",
                r"\centering",
                rf"\includegraphics[width={entry['width']}]{{{entry['output_path']}}}",
                rf"\caption{{{caption}}}",
                rf"\label{{{latex_escape(entry['label'])}}}",
                r"\end{figure}",
            ]
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prepare literature review images and generate a LaTeX snippet."
    )
    parser.add_argument(
        "manifest",
        nargs="?",
        default="literature_review_images.json",
        help="Path to the JSON image manifest",
    )
    parser.add_argument(
        "--asset-dir",
        default=DEFAULT_ASSET_DIR,
        help="Directory for prepared image assets relative to the current working directory",
    )
    parser.add_argument(
        "--snippet",
        default=DEFAULT_SNIPPET,
        help="Output path for the generated LaTeX figure snippet",
    )
    args = parser.parse_args()

    cwd = Path.cwd().resolve()
    manifest_path = Path(args.manifest).expanduser()
    if not manifest_path.is_absolute():
        manifest_path = (cwd / manifest_path).resolve()
    if not manifest_path.exists():
        print(f"error: manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"error: invalid JSON manifest: {exc}", file=sys.stderr)
        return 1

    if not isinstance(manifest, list):
        print("error: manifest must be a JSON array", file=sys.stderr)
        return 1

    asset_dir = Path(args.asset_dir)
    if not asset_dir.is_absolute():
        asset_dir = (cwd / asset_dir).resolve()
    snippet_path = Path(args.snippet)
    if not snippet_path.is_absolute():
        snippet_path = (cwd / snippet_path).resolve()

    prepared_entries = []
    for index, entry in enumerate(manifest, start=1):
        try:
            prepared_entries.append(
                materialize_image(
                    entry,
                    cwd,
                    manifest_path.parent,
                    asset_dir,
                    index,
                )
            )
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2

    snippet_path.write_text(build_snippet(prepared_entries), encoding="utf-8")
    manifest_path.write_text(
        json.dumps(prepared_entries, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )

    print(f"Prepared {len(prepared_entries)} image(s)")
    print(f"Image snippet created: {snippet_path}")
    print(f"Image manifest updated: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
