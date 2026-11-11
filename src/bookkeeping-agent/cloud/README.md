# cloud-bookkeeping-pi-agent

A personal bookkeeping agent built on top of [`pi`](https://pi.dev), with an Express + SSE chat interface for recording expenses and uploading receipts.

The agent runs as a `pi` subprocess against the `agent-home/` directory:

- `agent-home/AGENTS.md` — agent instructions
- `agent-home/brain/brain.md` — categories, conventions, evolving rules
- `agent-home/memory/` — your data (expenses, facts, receipt images)
- `agent-home/skills/` — placeholder skills (`send-email`, `web-fetch`)
- `agent-home/settings.json` — model/provider for `pi`

## Requirements

- Node.js **22.x**
- The [`pi`](https://pi.dev) CLI on your `PATH` (`pi --version`)
- `ANTHROPIC_API_KEY` in your environment (the default `agent-home/settings.json` uses `claude-sonnet-4-6`)

## First-time setup

```sh
git clone <this repo>
cd cloud-bookkeeping-pi-agent
npm install
npm run setup           # creates memory/expenses.json, memory/facts.json from templates
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev             # http://localhost:3000
```

`npm run setup` is idempotent — it only fills in files that don't exist yet, so it's safe to run again later.

## What's tracked in git, and what isn't

Personal data never goes in git. The `.gitignore` excludes:

| Path | Why |
|---|---|
| `agent-home/memory/expenses.json` | your ledger |
| `agent-home/memory/facts.json` | facts the agent has learned about you |
| `agent-home/memory/images/*` (except `.gitkeep`) | uploaded receipts |
| `agent-home/sessions/`, `agent-home/.current-session-id` | `pi` session state |

What **is** tracked:

- `agent-home/memory/expenses.example.json` and `facts.example.json` — empty templates that `npm run setup` copies into place on a fresh clone.
- `agent-home/memory/images/.gitkeep` — keeps the directory present.
- `agent-home/brain/brain.md` — knowledge, not memory. Treated as code: shared across clones, evolved via PRs (or by the agent at your direction). If you'd rather keep your bookkeeping rules private, add it to `.gitignore` and ship a `brain.example.md`.

## Day-to-day

- **Chat** at `http://localhost:3000`. Type a message, press ⏎. Shift+⏎ for a newline.
- **Attach receipts** with the `¶` button, drag-and-drop onto the composer, or paste an image (⌘V). Files are saved to `agent-home/memory/images/<ISO-timestamp>-<slug>.<ext>` and the agent reads them.
- **Reset session** in the top-right starts a fresh `pi` conversation. Old sessions remain on disk under `agent-home/sessions/`.

## Backing up your data

Since `memory/` is gitignored, back it up out-of-band:

```sh
tar -czf bookkeeping-backup-$(date +%F).tar.gz agent-home/memory agent-home/brain
```

## Deploying to Google Cloud Run

The app is a single container that fits Cloud Run well: HTTP on `$PORT`, scale-to-zero, and a gcsfuse-mounted GCS bucket for persistent `memory/` and `sessions/` data.

High-level steps:

1. Create a **GCS bucket** for the agent's data (expenses, facts, receipt images, session state).
2. Create a **service account** for the Cloud Run service and grant it object-level access to that bucket.
3. Store your `ANTHROPIC_API_KEY` in **Secret Manager**.
4. Deploy from source with `gcloud run deploy`, mounting the bucket at `/data` and wiring the secret as an env var. Pin `--max-instances=1` since the agent's state is a single shared volume.

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full command-by-command guide.

## Architecture notes

- `server.ts` spawns `pi -p --mode json [--session <id>]` per chat turn, with `cwd=agent-home/` and `PI_CODING_AGENT_DIR=agent-home/` so `pi` picks up our `AGENTS.md`, `settings.json`, and `skills/`.
- The first turn captures `pi`'s `session.id` from its NDJSON output and writes it to `agent-home/.current-session-id`; subsequent turns pass `--session <id>` for continuity.
- `pi`'s NDJSON events are translated into SSE events for the browser: `session`, `delta`, `tool_start`, `tool_end`, `turn_end`, `error`, `done`.
