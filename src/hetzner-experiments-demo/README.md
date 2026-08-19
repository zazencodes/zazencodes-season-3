# Hetzner Experiments: Testing Hetzner's AI inference API — Demo Codebase

A hands-on demo repository exploring Hetzner's AI Inference API using **Qwen 3.6** (`Qwen/Qwen3.6-35B-A3B-FP8`).

> **Hetzner Experiments Disclaimer**:
> *Hetzner Experiments is a place to explore what actually works, and what doesn't. Anything available today might disappear tomorrow or get an update. It's open to surprises, and therefore not suited for business-critical, long-term projects.*

---

## 1. Setup

### Environment & Dependencies
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install openai tiktoken
```

### API Token
```bash
export HETZNER_VLLM_API_KEY="<YOUR_HETZNER_API_TOKEN>"
```

---

## 2. Demo Structure

| File / Folder | Demo Part | Description | Status |
| :--- | :--- | :--- | :--- |
| `1_basic.py` | Part 1 | Basic completion using the OpenAI SDK against Hetzner. | Coded live |
| `2_tickets.py` | Part 2 | Batch process 25 hosting support tickets with structured JSON (`data/tickets.json`). | Ready to run |
| `3_long_context.py` | Part 3 | ~150K token needle & completion test on Jules Verne's *20,000 Leagues*. | Ready to run |
| `4_vision.py` | Part 4 | Vision understanding via Random Image API (Picsum) or remote URL. | Ready to run |
| `compare_results.py` | Evaluation | Inspection of long-context model completion vs ground truth snippet. | Ready to run |
| `agent-demo/` | Part 5 | Autonomous coding agent using Hetzner with OpenCode. | Ready to run |

> **Note:** Each demo script is completely self-isolated and creates its own client connection. There are no shared `common.py` dependencies.

---

## 3. Running the Demos

### Part 1 — Basic SDK Request
```bash
python 1_basic.py
```

### Part 2 — Batch Structured Ticket Extraction
```bash
python 2_tickets.py
```

### Part 3 — Long-Context Truncation & Completion Test (~150K Tokens)

1. **The Context**: `data/book.txt` contains the full text of *Twenty Thousand Leagues Under the Sea* (~150,200 tokens via `cl100k_base`).
2. **The Cut**:
   * You can manually cut a paragraph in `data/book.txt` and save the excised snippet to `data/ground_truth_cut.txt`.
   * Or run `python 3_long_context.py --cut` to automatically generate a random cut for testing.
3. **Run Qwen 3.6**:
   ```bash
   python 3_long_context.py
   ```
4. **Compare against ground truth**:
   ```bash
   python compare_results.py
   ```

### Part 4 — Multimodal Vision (Random Image API & Remote URLs)

Fetches a fresh high-resolution photo from the Random Image API (`Lorem Picsum`), saves a local preview to `data/random_image.jpg`, and asks Qwen 3.6 to analyze the photograph:
```bash
python 4_vision.py
```

You can also pass any custom remote image URL from the web or a local file:
```bash
python 4_vision.py https://images.unsplash.com/photo-1579546929518-9e396f3cc809
```

---

## 4. Part 5 — OpenCode Agentic Demo

Part 5 transitions from standalone inference requests to an autonomous agentic loop using **OpenCode** powered by Hetzner's backend.

### What is happening here?
1. **The Provider Config** (`agent-demo/opencode.json`): Configures OpenCode to use Hetzner's endpoint (`https://inference.hetzner.com/api/v1`) with `Qwen/Qwen3.6-35B-A3B-FP8`.
2. **The Target Repo** (`agent-demo/`): Contains a small storage pricing module with specification docs (`docs/pricing_spec.md`) and source files (`src/models.py`, `src/storage_pricing.py`).
3. **The Subtle Logic Bug**: No failing unit tests are included. The code executes cleanly, but incorrectly evaluates the bulk discount threshold against `total_gb` (including cold snapshot storage) instead of `primary_gb` (active NVMe + Boosted storage).

### Step-by-Step Execution:

1. **Navigate to the agent directory**:
   ```bash
   cd agent-demo
   ```

2. **Launch OpenCode**:
   ```bash
   opencode
   ```

3. **Provide this prompt to OpenCode**:
   ```text
   find any bugs in this codebase. only real bugs not potential features.
   ```

4. **Verify the fix**:
   ```bash
   git diff
   ```

