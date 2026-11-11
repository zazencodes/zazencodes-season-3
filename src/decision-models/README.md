# Beyond Jev: Five Decision Models

A short notebook tour: one section per provider, with access links, inline demo-key fields, native HTTP requests, raw answers, and request timing.

## Open the notebook

```bash
cd src/decision-models
uv sync
nvb decision_models.ipynb
```

Or use the browser UI:

```bash
uv run jupyter lab decision_models.ipynb
```

Run the shared setup first, then whichever model sections you have configured. You do not need all five accounts. Each first example and changed-input example makes one request; the optional timing cell makes three more.

## Access

| Section | Access | Documentation |
|---|---|---|
| Perplexity Decider | [API keys](https://console.perplexity.ai/project/keys) | [Decisions](https://docs.perplexity.ai/docs/decisions/quickstart) |
| OpenAI Decisions | [API keys](https://platform.openai.com/api-keys) | [Decisions](https://developers.openai.com/api/docs/guides/decisions) |
| Cloudflare Clef | [Workers AI](https://dash.cloudflare.com/?to=/:account/ai/workers-ai): token **and Account ID** | [REST setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), [Clef](https://developers.cloudflare.com/workers-ai/models/clef/) |
| Liquid d1-ultra | [Console](https://console.liquid.ai), Dashboard → API Keys | [Hosted d1](https://docs.liquid.ai/lfm/models/d1) |
| Fastino GLiDE | [API keys](https://agent.fastino.ai/api-keys) | [Call GLiDE](https://docs.fastino.ai/inference/systemone) |

Accounts may need billing, credits, and access to the named model. No credentials are supplied. This uses hosted Liquid d1-ultra; it does not install the separate open d1 models.

> Keys go directly in the notebook for this demo. Keep them off camera; remove them and clear outputs before committing or sharing. Use environment variables or a secret manager in real projects, and revoke any exposed key.

## What to compare

Each provider sees the same short text and equivalent team, urgency, and severity questions. The notebook prints client round-trip milliseconds and preserves the native response, so you can inspect distributions and schema differences. The final table shows only the sections you ran. Repeated measurements reuse the HTTP client and can be affected by caching and provider load; these examples are not a comprehensive benchmark.

GLiDE's `expected_level` corresponds to a weighted severity score; its `score` is the winning level. Other providers' confidence fields also have different definitions.

The shared notebook contains no saved outputs. Request examples were checked against the linked primary documentation on 2026-10-25. Live account access and model responses still need checking after you add your own keys.
