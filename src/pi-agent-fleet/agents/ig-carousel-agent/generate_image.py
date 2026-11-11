#!/usr/bin/env python3
"""Generate one square image with Gemini (Nano Banana 2) and save it as PNG.

Usage:
    python3 generate_image.py "<prompt>" <output_path.png>

Reads GEMINI_API_KEY from the environment, or from a .env file two
directories up (the pi-agent-fleet root). Stdlib only — no dependencies.
"""

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

MODEL = "gemini-3.1-flash-image"
API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{MODEL}:generateContent"
)


def load_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    env_file = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("error: GEMINI_API_KEY not set and not found in .env")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(f"usage: {sys.argv[0]} '<prompt>' <output_path.png>")
    prompt, out_path = sys.argv[1], Path(sys.argv[2])

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": "1:1"},
        },
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": load_api_key(),
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = json.load(resp)

    for part in data["candidates"][0]["content"]["parts"]:
        inline = part.get("inlineData")
        if inline and inline.get("mimeType", "").startswith("image/"):
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(base64.b64decode(inline["data"]))
            print(f"saved {out_path}")
            return
    sys.exit(f"error: no image in response: {json.dumps(data)[:500]}")


if __name__ == "__main__":
    main()
