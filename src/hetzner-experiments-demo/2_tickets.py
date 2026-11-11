import json
import os
import sys
import time
from pathlib import Path

from openai import OpenAI

api_key = os.environ.get("hetzner_vllm_api_key")
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

tickets_path = Path("data/tickets.json")
if not tickets_path.exists():
    raise Exception(f"Error: {tickets_path} not found.")

tickets = json.loads(tickets_path.read_text())
print(f"Loaded {len(tickets)} support tickets from {tickets_path}.")
print(f"Running batch structured extraction against model '{model}'...\n")

results = []
valid_json_count = 0
total_start = time.perf_counter()

for idx, ticket in enumerate(tickets, 1):
    prompt = f"""Classify this doggy daycare support request.

Return valid JSON ONLY with the following schema:
{{
  "category": "billing" | "technical" | "account" | "feature_request" | "urgent_security",
  "priority": "low" | "medium" | "high" | "critical",
  "summary": "one sentence summary",
  "recommended_action": "recommended action for support agent",
  "customer_response": "polite draft response to the customer"
}}

Ticket #{ticket.get("id", idx)}:
{ticket["subject"]}:
{ticket["text"]}
"""

    start = time.perf_counter()
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=3000,
        )
        elapsed = time.perf_counter() - start
        content = response.choices[0].message.content.strip()

        # Clean potential markdown wrapping
        clean_content = content
        if clean_content.startswith("```json"):
            clean_content = clean_content[7:]
        if clean_content.startswith("```"):
            clean_content = clean_content[3:]
        if clean_content.endswith("```"):
            clean_content = clean_content[:-3]
        clean_content = clean_content.strip()

        parsed_json = None
        try:
            parsed_json = json.loads(clean_content)
            valid_json_count += 1
            json_status = "✓ JSON valid"
        except json.JSONDecodeError:
            json_status = "✗ JSON decode error"

        usage_dict = response.usage.model_dump() if response.usage else None
        print(
            f"[{idx:02d}/{len(tickets):02d}] Ticket ID {ticket.get('id', idx)} - {round(elapsed, 2)}s - {json_status}"
        )

        results.append(
            {
                "ticket_id": ticket.get("id", idx),
                "expected_category": ticket.get("expected_category"),
                "expected_priority": ticket.get("expected_priority"),
                "response_raw": content,
                "parsed_json": parsed_json,
                "seconds": round(elapsed, 2),
                "usage": usage_dict,
            }
        )
    except Exception as e:
        print(
            f"[{idx:02d}/{len(tickets):02d}] Ticket ID {ticket.get('id', idx)} - Error: {e}",
            file=sys.stderr,
        )
        results.append(
            {
                "ticket_id": ticket.get("id", idx),
                "error": str(e),
            }
        )

total_elapsed = time.perf_counter() - total_start

# Save results
results_dir = Path("results")
results_dir.mkdir(exist_ok=True)
safe_name = model.replace("/", "_")
output_file = results_dir / f"{safe_name}_tickets.json"
output_file.write_text(json.dumps(results, indent=2))

print("\n" + "=" * 60)
print(f"BATCH RUN COMPLETE ({model})")
print("=" * 60)
print(f"Total Tickets Processed: {len(tickets)}")
print(
    f"Valid Structured JSON:   {valid_json_count}/{len(tickets)} ({round(valid_json_count / len(tickets) * 100, 1)}%)"
)
print(
    f"Total Batch Runtime:     {round(total_elapsed, 2)}s (avg {round(total_elapsed / len(tickets), 2)}s/ticket)"
)
print(f"Results saved to:        {output_file}")
print("=" * 60)
