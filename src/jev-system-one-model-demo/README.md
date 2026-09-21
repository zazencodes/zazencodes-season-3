# Jev System 1 Decision Engine Demo (ZazenCodes Season 3)

Hands-on implementation of **Jev** by **TypeSafe AI** — a non-autoregressive "System One" decision model designed for 100ms agent routing, guardrail verification, and calibrated decision-making without generative LLM overhead.

---

## What is Jev?

Traditional Large Language Models (LLMs) like GPT-4o or Claude 3.7 are **System 2** reasoning models: slow, deliberative, autoregressive (token-by-token), and optimized for conversational prose.

When used inside autonomous agent loops for routine routing, classification, and safety checks, LLMs introduce 1.5–3.5s latency per step, burn significant API cost, and risk JSON schema hallucinations.

**Jev** takes an unstructured input `state` and evaluates typed questions (`Choice`, `Score`, `Noul`) in a **single parallel forward pass** (70ms–500ms) with mathematically calibrated confidence scores trained via RLCD (Reinforcement Learning for Calibrated Decisions).

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
            ├─► Adversarial? ──────► [Drop / Edge Reject]
            ├─► High Confidence? ──► [Instant Deterministic Execution]
            └─► Low Confidence? ───► [Escalate to System 2 / Human]
```

---

## Quick Start

### 1. Clone & Set Up Environment

```bash
cd /Users/alex/pro/zazencodes-jev-demo
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure API Key

Copy `.env.example` to `.env` and add your TypeSafe API key:

```bash
cp .env.example .env
# Edit .env and set TYPESAFE_API_KEY
```

### 3. Launch the Jupyter Notebook

```bash
jupyter notebook jev_system_one_demo.ipynb
```

---

## Notebook Structure (`jev_system_one_demo.ipynb`)

1. **Architecture Overview:** The Kahneman System 1 vs System 2 paradigm in AI engineering.
2. **Core Primitives:** Hands-on code with `Noul` (probabilities), `Choice` (categorical), and `Score` (ordinal ratings).
3. **Autonomous Dispatcher & Guardrail Pipeline:** Evaluating real-world customer tickets across 4 parallel dimensions.
4. **Calibrated Branching Logic:** Edge rejection, Fast-path microservice execution, and System 2 escalation thresholds.
5. **Benchmarks:** Empirical latency and cost comparisons between Jev System 1 vs LLM Structured Outputs.

---

## References

- Official Documentation: [docs.typesafe.ai](https://docs.typesafe.ai)
- TypeSafe AI: [typesafe.ai](https://typesafe.ai)
