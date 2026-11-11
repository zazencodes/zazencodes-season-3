#!/usr/bin/env python3
"""
Generate a movie poster image using Google Gemini based on a codebase concept.

Usage:
    python generate_poster.py --concept "..." --title "..." --tagline "..." --genre "..." --output movie-poster.png
"""

import argparse
import base64
import os
import sys
from pathlib import Path


def load_api_key():
    # Load from the skill directory's .env file
    skill_dir = Path(__file__).parent.parent
    env_file = skill_dir / ".env"

    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if key:
                        return key

    # Fall back to environment variable
    key = os.environ.get("GEMINI_API_KEY", "")
    if key:
        return key

    print("ERROR: No GEMINI_API_KEY found.")
    print(f"  Create a .env file at: {env_file}")
    print("  With contents: GEMINI_API_KEY=your_key_here")
    sys.exit(1)


def generate_poster(
    concept: str, title: str, tagline: str, genre: str, output_path: str
):
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("ERROR: google-genai package not installed.")
        print("  Run: pip install google-genai")
        sys.exit(1)

    api_key = load_api_key()
    client = genai.Client(api_key=api_key)

    prompt = f"""Create a dramatic, cinematic movie poster for a film called "{title}".

Genre: {genre}
Tagline: {tagline}

Visual concept: {concept}

Style requirements:
- PORTRAIT orientation, tall format — standard US one-sheet movie poster proportions (2:3 ratio, like 27"x40")
- Classic Hollywood movie poster composition designed for a tall vertical canvas
- Bold, eye-catching typography with the movie title prominently displayed near the bottom third
- Dramatic lighting and cinematic color grading appropriate for the {genre} genre
- Include the tagline "{tagline}" in smaller text beneath or above the title
- Professional poster design with strong visual hierarchy
- Photorealistic or painterly illustration style, whichever fits the genre better
- Make it look like a real blockbuster movie poster you'd see on a theater wall or billboard

Do not include any text other than the movie title and tagline in the image."""

    print(f"Generating movie poster for: {title}")
    print(f"Genre: {genre}")
    print(f"Concept: {concept[:100]}...")
    print("Calling Gemini image generation API...")

    response = client.models.generate_content(
        model="gemini-3-pro-image-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(
                aspect_ratio="2:3",  # Standard US one-sheet movie poster (27"x40")
            ),
        ),
    )

    image_saved = False
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            image_data = part.inline_data.data
            # data may already be bytes or base64 string
            if isinstance(image_data, str):
                image_bytes = base64.b64decode(image_data)
            else:
                image_bytes = image_data

            with open(output_path, "wb") as f:
                f.write(image_bytes)
            image_saved = True
            print(f"\nPoster saved to: {output_path}")
            break
        elif hasattr(part, "text") and part.text:
            print(f"Model note: {part.text}")

    if not image_saved:
        print("ERROR: No image was returned by the API.")
        print("Response parts received:")
        for i, part in enumerate(response.candidates[0].content.parts):
            print(
                f"  Part {i}: {type(part)}, has inline_data={part.inline_data is not None}"
            )
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Generate a movie poster using Gemini")
    parser.add_argument(
        "--concept", required=True, help="Visual concept description for the poster"
    )
    parser.add_argument("--title", required=True, help="Movie title")
    parser.add_argument("--tagline", required=True, help="Movie tagline")
    parser.add_argument("--genre", required=True, help="Film genre")
    parser.add_argument("--output", default="movie-poster.png", help="Output file path")
    args = parser.parse_args()

    generate_poster(
        concept=args.concept,
        title=args.title,
        tagline=args.tagline,
        genre=args.genre,
        output_path=args.output,
    )


if __name__ == "__main__":
    main()
