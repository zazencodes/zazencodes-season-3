import argparse
import base64
import json
import mimetypes
from pathlib import Path

import requests


def guess_audio_format(path: Path) -> str:
    ext = path.suffix.lower().lstrip(".")
    if ext in {"wav", "mp3", "m4a", "flac", "ogg", "webm"}:
        return ext
    mime, _ = mimetypes.guess_type(str(path))
    if mime and "/" in mime:
        subtype = mime.split("/", 1)[1].lower()
        if subtype in {"x-wav", "wav"}:
            return "wav"
        return subtype
    return "wav"


def build_payload(model: str, system: str, question: str, audio_b64: str, audio_format: str, max_tokens: int, temperature: float) -> dict:
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": question},
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": audio_b64,
                            "format": audio_format,
                        },
                    },
                ],
            },
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }


def extract_error_text(data: dict) -> str:
    if not isinstance(data, dict):
        return ""
    err = data.get("error")
    if isinstance(err, dict):
        parts = []
        for key in ("message", "type", "code"):
            val = err.get(key)
            if val is not None:
                parts.append(f"{key}={val}")
        return ", ".join(parts)
    return ""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True, help="Path to audio file")
    parser.add_argument("--server", default="http://localhost:8080/v1/chat/completions")
    parser.add_argument("--model", default="gemma")
    parser.add_argument("--question", default="Explain what is happening in this audio.")
    parser.add_argument("--system", default="You explain audio clearly and concretely.")
    parser.add_argument("--max-tokens", type=int, default=256)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()

    audio_path = Path(args.audio)
    if not audio_path.is_file():
        raise SystemExit(f"Audio file not found: {audio_path}")

    audio_bytes = audio_path.read_bytes()
    if not audio_bytes:
        raise SystemExit(f"Audio file is empty: {audio_path}")

    audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
    audio_format = guess_audio_format(audio_path)

    payload = build_payload(
        model=args.model,
        system=args.system,
        question=args.question,
        audio_b64=audio_b64,
        audio_format=audio_format,
        max_tokens=args.max_tokens,
        temperature=args.temperature,
    )

    response = requests.post(
        args.server,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer no-key",
        },
        json=payload,
        timeout=args.timeout,
    )

    content_type = response.headers.get("Content-Type", "")
    try:
        data = response.json() if "json" in content_type.lower() or response.text.strip().startswith("{") else {"raw_text": response.text}
    except Exception:
        data = {"raw_text": response.text}

    if response.status_code >= 400:
        err_text = extract_error_text(data)
        if "audio input is not supported" in err_text.lower():
            raise SystemExit(
                "Server rejected audio input.\n"
                "Your llama-server build/model endpoint is not accepting audio.\n"
                "The server hint says you may need to start it with --mmproj.\n"
                "If you already did that and still get this error, your current backend/model path likely does not support Gemma audio yet.\n\n"
                "Server response:\n"
                f"{json.dumps(data, indent=2)}"
            )
        raise SystemExit(json.dumps(data, indent=2))

    choices = data.get("choices", [])
    if choices:
        message = choices[0].get("message", {})
        content = message.get("content")
        if isinstance(content, str):
            print(content)
            return
        if isinstance(content, list):
            texts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    texts.append(item.get("text", ""))
            if texts:
                print("\n".join(texts))
                return

    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
