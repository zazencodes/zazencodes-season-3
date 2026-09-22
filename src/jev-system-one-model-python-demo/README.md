# Jev System 1 Decision Engine Demo (ZazenCodes Season 3)

Hands-on implementation of **Jev** by **TypeSafe AI** — a non-autoregressive "System One" decision model designed for 100ms agent routing, guardrail verification, and calibrated decision-making without generative LLM overhead.

---

## What is Jev?

Traditional Large Language Models (LLMs) like GPT-4o or Claude 3.7 are **System 2** reasoning models: slow, deliberative, autoregressive (token-by-token), and optimized for conversational prose.

When used inside autonomous agent loops for routine routing, classification, and safety checks, LLMs introduce 1.5–3.5s latency per step, burn significant API cost, and risk JSON schema hallucinations.

**Jev** takes an unstructured input `state` and evaluates typed questions (`Choice`, `Score`, `Noul`) in a **single parallel forward pass** (70ms–150ms) with mathematically calibrated confidence scores trained via RLCD (Reinforcement Learning for Calibrated Decisions).

```
┌────────────────────────────────────────────────────────┐
│               Incoming Unstructured State              │
└───────────────────────────┬────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
  [Fast Reflex Layer]              [Heavy Cortex Layer]
   System 1: Jev API               System 2: Deep LLM
   - 70-150ms Latency              - 2-5s Latency
   - $0.042 / 1M Tokens            - $5.00+ / 1M Tokens
   - Parallel Typed Sampler        - Autoregressive Generation
   - Choice / Score / Noul         - Complex Multi-Step Reasoning
            │
            ├─► Adversarial? (Noul >= 0.70) ────────► 🛡️ [Edge Drop / Firewall]
            ├─► Auto-Policy? (Noul >= 0.85 & Conf) ──► ⚡ [Instant Microservice Action]
            └─► Urgent / Low Conf (< 0.75) ──────────► 🚨 [Escalate to System 2 / Human]
```

---

## Quick Start

### 1. Set Up Environment

```bash
cd /Users/alex/pro/zazencodes-season-3/src/jev-system-one-model-python-demo
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure API Key

Copy `.env.example` to `.env` and set your TypeSafe API key:

```bash
cp .env.example .env
# Edit .env and set TYPESAFE_API_KEY=your_key_here
```

---

## 1. Interactive Tutorial (`jev_system_one_demo.ipynb`)

A clean, modular tutorial designed for screencasts and slow walk-throughs:

- **Step 0:** Minimal setup & client initialization (`TypeSafeClient`)
- **Step 1:** Binary Yes/No probability decisions with `Noul`
- **Step 2:** Categorical routing with `Choice` & criteria definitions
- **Step 3:** Continuous ordinal ratings with `Score`
- **Step 4:** Single-pass parallel multi-question evaluation
- **Step 5:** Autonomous triage loop with calibrated branching logic

Launch in Jupyter:

```bash
jupyter notebook jev_system_one_demo.ipynb
```

---

## 2. Production CLI Runner (`demo.py`)

Run the full end-to-end triage dispatcher script with detailed step logging and JSON export:

```bash
python3 demo.py
```

### Script Outputs:
- Prints real-time evaluation logs and decision branching per ticket.
- Renders a complete terminal summary table of actions, assigned handlers, and calibrated rationales.
- Exports a complete structured log to `triage_results.json` for later review.

---

## References

- Official Documentation: [docs.typesafe.ai](https://docs.typesafe.ai)
- TypeSafe AI: [typesafe.ai](https://typesafe.ai)
- Mind Map Canvas: `~/obsidian/ZazenCodesCanvas/src/jev-system-one-model-demo/main.canvas`
