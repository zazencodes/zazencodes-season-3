import argparse
import json
from pathlib import Path

import requests


def build_payload(model: str, question: str, document_text: str) -> dict:
    return {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": f"<document>\n{document_text}\n</document>\n\n{question}",
            },
        ],
        "stream": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("document", help="Path to document file (text, markdown, etc.)")
    parser.add_argument(
        "--question",
        default="Summarize this document.",
        help="Question to ask about the document",
    )
    parser.add_argument("--server", default="http://localhost:8080/v1/chat/completions")
    parser.add_argument("--model", default="gemma")
    args = parser.parse_args()

    doc_path = Path(args.document)
    if not doc_path.is_file():
        raise SystemExit(f"Document file not found: {doc_path}")

    document_text = doc_path.read_text(encoding="utf-8", errors="replace")
    if not document_text.strip():
        raise SystemExit(f"Document file is empty: {doc_path}")

    print(f"Loaded document: {doc_path.name} ({len(document_text):,} characters)")

    payload = build_payload(
        model=args.model,
        question=args.question,
        document_text=document_text,
    )

    response = requests.post(
        args.server,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer no-key",
        },
        json=payload,
        timeout=1800,
    )

    content_type = response.headers.get("Content-Type", "")
    try:
        data = (
            response.json()
            if "json" in content_type.lower() or response.text.strip().startswith("{")
            else {"raw_text": response.text}
        )
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
            texts = [
                item.get("text", "")
                for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            ]
            if texts:
                print("\n".join(texts))
                return

    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
