import os
import sys
import time

from openai import OpenAI

api_key = os.environ.get("HETZNER_VLLM_API_KEY")
if not api_key:
    print(
        "Error: HETZNER_VLLM_API_KEY environment variable is not set.", file=sys.stderr
    )
    print(
        "Export your Hetzner token: export HETZNER_VLLM_API_KEY='<YOUR_TOKEN>'",
        file=sys.stderr,
    )
    sys.exit(1)

client = OpenAI(
    base_url="https://inference.hetzner.com/api/v1",
    api_key=api_key,
)

model = "Qwen/Qwen3.6-35B-A3B-FP8"
prompt = "Explain what a reverse proxy does in three concise bullet points."

print(f"Sending basic completion request to model '{model}'...")
start = time.perf_counter()

response = client.chat.completions.create(
    model=model,
    messages=[
        {
            "role": "user",
            "content": prompt,
        }
    ],
    max_tokens=500,
)

elapsed = time.perf_counter() - start

print("\n" + "=" * 60)
print("RESPONSE:")
print("=" * 60)
print(response.choices[0].message.content)
print("=" * 60)
print(f"Runtime: {round(elapsed, 2)} seconds")
print(f"Usage: {response.usage}")
