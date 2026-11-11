import os
import sys
import time
import json
import random
import urllib.request
from pathlib import Path
from openai import OpenAI
import tiktoken

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
# 2. Book Data Acquisition & Tokenizer
# ---------------------------------------------------------------------------
data_dir = Path("data")
data_dir.mkdir(exist_ok=True)
book_path = data_dir / "book.txt"
ground_truth_path = data_dir / "ground_truth_cut.txt"

BOOK_URL = "https://www.gutenberg.org/cache/epub/164/pg164.txt"

if not book_path.exists():
    print(f"Fetching public domain novel (Twenty Thousand Leagues Under the Sea) from {BOOK_URL}...")
    req = urllib.request.Request(BOOK_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        text = resp.read().decode("utf-8")
    book_path.write_text(text)
    print(f"Saved to {book_path}\n")

book_text = book_path.read_text(errors="ignore")

# Tokenize using standard OpenAI cl100k_base tokenizer
enc = tiktoken.get_encoding("cl100k_base")
token_count = len(enc.encode(book_text))

print(f"=== Text Corpus Statistics ===")
print(f"File: {book_path}")
print(f"Characters: {len(book_text):,}")
print(f"Words: {len(book_text.split()):,}")
print(f"Token Count (cl100k_base): {token_count:,} tokens\n")

# ---------------------------------------------------------------------------
# 3. Optional Helper: Random Cut Generator (--cut flag)
# ---------------------------------------------------------------------------
if "--cut" in sys.argv:
    # Find candidate paragraphs in the middle 60% of the book
    paragraphs = [p.strip() for p in book_text.split("\n\n") if len(p.strip()) > 200]
    mid_start = int(len(paragraphs) * 0.2)
    mid_end = int(len(paragraphs) * 0.8)
    chosen_idx = random.randint(mid_start, mid_end)
    original_para = paragraphs[chosen_idx]
    
    # Split roughly halfway at a space or sentence boundary
    half_idx = len(original_para) // 2
    cut_point = original_para.find(" ", half_idx)
    if cut_point == -1:
        cut_point = half_idx
        
    kept_part = original_para[:cut_point]
    cut_part = original_para[cut_point:]
    
    # Save the excised portion as ground truth
    ground_truth_path.write_text(cut_part.strip())
    
    # Replace in book text and save
    modified_text = book_text.replace(original_para, kept_part + " [TRUNCATED]")
    book_path.write_text(modified_text)
    
    print(f"Applied random paragraph cut at paragraph index {chosen_idx}.")
    print(f"Excised section saved to: {ground_truth_path}")
    print(f"First 80 chars of cut portion: {cut_part.strip()[:80]}...\n")
    sys.exit(0)

# Filter out flags to get model argument
args = [a for a in sys.argv[1:] if not a.startswith("--")]
model = args[0] if args else "Qwen/Qwen3.6-35B-A3B-FP8"


# ---------------------------------------------------------------------------
# 4. Construct Prompt
# ---------------------------------------------------------------------------
prompt = f"""Below is the complete text of the novel 'Twenty Thousand Leagues Under the Sea' by Jules Verne.

Somewhere in this text, one paragraph has been abruptly cut off mid-way.

Your tasks:
1. Locate the truncated paragraph and identify which chapter it is in.
2. Quote the exact sentence snippet where the text cuts off.
3. Complete the truncated paragraph by providing the exact missing continuation as originally written.
4. Briefly explain the context of what is happening in that scene.

NOVEL TEXT:
{book_text}
"""

print(f"Sending ~{token_count:,} tokens to model '{model}' on Hetzner Inference API...")
start = time.perf_counter()

response = client.chat.completions.create(
    model=model,
    messages=[{"role": "user", "content": prompt}],
    max_tokens=1000,
)

elapsed = time.perf_counter() - start
output_content = response.choices[0].message.content

# ---------------------------------------------------------------------------
# 5. Output & Ground Truth Comparison
# ---------------------------------------------------------------------------
print("\n" + "=" * 70)
print(f"MODEL RESPONSE ({model}):")
print("=" * 70)
print(output_content)
print("=" * 70)

if ground_truth_path.exists():
    ground_truth = ground_truth_path.read_text().strip()
    print("\n" + "=" * 70)
    print("GROUND TRUTH (ACTUAL EXCISED TEXT):")
    print("=" * 70)
    print(ground_truth)
    print("=" * 70)

print(f"\nRuntime: {round(elapsed, 2)} seconds")
print(f"Reported Token Usage: {response.usage}")

# Save output to results
results_dir = Path("results")
results_dir.mkdir(exist_ok=True)
safe_name = model.replace("/", "_")
output_file = results_dir / f"{safe_name}_completion.txt"
output_file.write_text(
    f"Model: {model}\nRuntime: {round(elapsed, 2)}s\nUsage: {response.usage}\n\n"
    f"--- Model Response ---\n{output_content}\n\n"
    f"--- Ground Truth ---\n{ground_truth_path.read_text() if ground_truth_path.exists() else 'N/A'}"
)
print(f"Saved results to: {output_file}")
