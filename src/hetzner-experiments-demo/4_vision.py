import os
import sys
import time
import base64
import random
import urllib.request
from pathlib import Path
from openai import OpenAI

# ---------------------------------------------------------------------------
# 1. API Configuration (Self-isolated)
# ---------------------------------------------------------------------------
api_key = os.environ.get("HETZNER_VLLM_API_KEY")
if not api_key:
    print("Error: HETZNER_VLLM_API_KEY environment variable is not set.", file=sys.stderr)
    print("Export your Hetzner token: export HETZNER_VLLM_API_KEY='<YOUR_TOKEN>'", file=sys.stderr)
    sys.exit(1)

client = OpenAI(
    base_url="https://inference.hetzner.com/api/v1",
    api_key=api_key,
)

# ---------------------------------------------------------------------------
# 2. Command Line Arguments & Model Selection
# ---------------------------------------------------------------------------
# Vision model on Hetzner:
# - Qwen/Qwen3.6-35B-A3B-FP8 (default)
model = "Qwen/Qwen3.6-35B-A3B-FP8"
custom_source = None
reuse_existing = "--reuse" in sys.argv


args = [a for a in sys.argv[1:] if a != "--reuse"]

if len(args) > 0:
    if args[0].startswith("http://") or args[0].startswith("https://") or Path(args[0]).exists():
        custom_source = args[0]
    else:
        model = args[0]

if len(args) > 1:
    custom_source = args[1]

# ---------------------------------------------------------------------------
# 3. Image Acquisition & Local Persistence
# ---------------------------------------------------------------------------
data_dir = Path("data")
data_dir.mkdir(exist_ok=True)
local_image_file = data_dir / "random_image.jpg"

if reuse_existing and local_image_file.exists():
    print(f"Reusing existing local image: {local_image_file}")
    image_bytes = local_image_file.read_bytes()
    resolved_source = str(local_image_file)
elif custom_source:
    if custom_source.startswith("http://") or custom_source.startswith("https://"):
        print(f"Fetching provided remote URL: {custom_source}")
        req = urllib.request.Request(custom_source, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            resolved_source = resp.geturl()
            image_bytes = resp.read()
        local_image_file.write_bytes(image_bytes)
    else:
        # Local file path provided
        resolved_source = custom_source
        image_bytes = Path(custom_source).read_bytes()
        local_image_file.write_bytes(image_bytes)
else:
    # Fetch a fresh high-resolution photo from Lorem Picsum (1024x768)
    seed = f"hetzner-{random.randint(100, 99999)}"
    target_url = f"https://picsum.photos/seed/{seed}/1024/768"
    print(f"Fetching fresh random high-quality photo from Picsum API...")
    req = urllib.request.Request(target_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        resolved_source = resp.geturl()
        image_bytes = resp.read()
    local_image_file.write_bytes(image_bytes)

# Base64 data URI representation for reliable API transfer
base64_img = base64.b64encode(image_bytes).decode("utf-8")
image_data_uri = f"data:image/jpeg;base64,{base64_img}"

print(f"Image Source: {resolved_source}")
print(f"Saved local file: {local_image_file.resolve()} ({len(image_bytes):,} bytes)")
print(f"Vision Model: {model}\n")

# ---------------------------------------------------------------------------
# 4. Construct Vision Prompt
# ---------------------------------------------------------------------------
prompt = """Analyze this photograph and answer the following:
1. Primary Subject: What is the main subject and setting of the image?
2. Detailed Visual Elements: Describe the key objects, lighting, dominant color palette, and textures.
3. Mood & Atmosphere: What tone or feeling does the composition convey?
4. Creative Title: Give this photograph a creative, fitting title.
"""

print(f"Sending image to '{model}' on Hetzner Inference API...\n")
start = time.perf_counter()

response = client.chat.completions.create(
    model=model,
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": image_data_uri}},
            ],
        }
    ],
    max_tokens=600,
)

elapsed = time.perf_counter() - start
content = response.choices[0].message.content

# ---------------------------------------------------------------------------
# 5. Output Results & Save to File
# ---------------------------------------------------------------------------
print("=" * 70)
print(f"VISION ANALYSIS RESULT ({model}):")
print("=" * 70)
print(content)
print("\n" + "=" * 70)
print(f"Runtime: {round(elapsed, 2)} seconds")
print(f"Usage: {response.usage}")
print("=" * 70)

results_dir = Path("results")
results_dir.mkdir(exist_ok=True)
safe_name = model.replace("/", "_")
output_path = results_dir / f"vision_{safe_name}.txt"
output_path.write_text(
    f"Model: {model}\nSource: {resolved_source}\nLocal File: {local_image_file.resolve()}\n"
    f"Runtime: {round(elapsed, 2)}s\nUsage: {response.usage}\n\n"
    f"--- Description ---\n{content}\n"
)
print(f"Saved analysis to: {output_path}")
print(f"To view image locally, run: open {local_image_file}")
