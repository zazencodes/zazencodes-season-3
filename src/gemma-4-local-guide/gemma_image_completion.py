import argparse
import base64
import json
import mimetypes
from pathlib import Path

import requests


def guess_image_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    if mime and mime.startswith("image/"):
        return mime
    ext = path.suffix.lower().lstrip(".")
    return f"image/{ext}" if ext else "image/jpeg"


def build_payload(model: str, question: str, image_b64: str, image_mime: str) -> dict:
    return {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": question},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{image_mime};base64,{image_b64}",
                        },
                    },
                ],
            },
        ],
        "stream": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", help="Path to image file")
    parser.add_argument("--question", default="Describe what you see in this image.")
    parser.add_argument("--server", default="http://localhost:8080/v1/chat/completions")
    parser.add_argument("--model", default="gemma")
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.is_file():
        raise SystemExit(f"Image file not found: {image_path}")

    image_bytes = image_path.read_bytes()
    if not image_bytes:
        raise SystemExit(f"Image file is empty: {image_path}")

    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    image_mime = guess_image_mime(image_path)

    payload = build_payload(
        model=args.model,
        question=args.question,
        image_b64=image_b64,
        image_mime=image_mime,
    )

    response = requests.post(
        args.server,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer no-key",
        },
        json=payload,
        timeout=600,
    )

    content_type = response.headers.get("Content-Type", "")
    try:
        data = response.json() if "json" in content_type.lower() or response.text.strip().startswith("{") else {"raw_text": response.text}
    except Exception:
        data = {"raw_text": response.text}

    if response.status_code >= 400:
        raise SystemExit(json.dumps(data, indent=2))

    choices = data.get("choices", [])
    if choices:
        message = choices[0].get("message", {})
        content = message.get("content")
        if isinstance(content, str):
            print(content)
            return
        if isinstance(content, list):
            texts = [item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text"]
            if texts:
                print("\n".join(texts))
                return

    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
