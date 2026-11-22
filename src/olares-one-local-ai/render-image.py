#!/usr/bin/env python3
import argparse
import secrets
import uuid
from pathlib import Path

from run import comfy_url, render


def main():
    parser = argparse.ArgumentParser(description="Render one 1920 x 1080 ComfyUI wallpaper.")
    parser.add_argument("scene", help="the image description")
    parser.add_argument("output", type=Path, help="destination PNG")
    args = parser.parse_args()
    if not args.scene.strip():
        parser.error("the scene is empty")
    if args.output.exists():
        parser.error(f"output already exists: {args.output}")

    data = render(comfy_url(), args.scene, secrets.randbits(48), str(uuid.uuid4()))
    with args.output.open("xb") as output:
        output.write(data)
    print(f"Saved {args.output}")


if __name__ == "__main__":
    main()
