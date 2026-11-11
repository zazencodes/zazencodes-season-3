# Pi Agent Fleet

A hub-and-spoke agent fleet built with [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

The **hub** is any coding agent (Claude Code, Codex, etc.) running at the repo root. It reads `AGENTS.md` for instructions and delegates work to specialized Pi sub-agents living in `agents/`.

## Structure

```text
pi-agent-fleet/
  AGENTS.md                   # hub agent instructions
  agents/
    research-agent/
      package.json            # Pi installed here; "npm start" runs pi
      brain.md                # specialist role, method, and output rules
      .pi/
        APPEND_SYSTEM.md      # appended to Pi's default system prompt; points to brain.md
  work/
    tasks/                    # task files written by the hub
    outputs/                  # results returned by sub-agents
    sessions/                 # Pi session files (one per agent, persisted)
```

## Usage

Start a coding agent at this root — it will read `AGENTS.md` and coordinate the fleet.

Each sub-agent runs Pi inside its own folder, which picks up that folder's `AGENTS.md` as its system prompt:

```bash
root=$(pwd) && \
(cd agents/research-agent && pi --no-session --tools bash,read \
  -p "@$root/work/tasks/research-ai-engineering.md" \
  "Complete the task in the attached file. Return only the final Markdown output.") \
  > work/outputs/research-ai-engineering.md
```

## Adding a New Agent

1. Create `agents/<name>/` with a `brain.md` describing the specialist's role and a `.pi/APPEND_SYSTEM.md` pointing to it.
2. Run `npm install` inside the folder to install Pi.
3. Add the agent and its invocation command to the hub's `AGENTS.md`.
