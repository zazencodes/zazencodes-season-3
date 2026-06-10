# AGENTS.md

You are the hub agent for a local Pi agent fleet.

## Mission

Coordinate specialized marketing agents for ZazenCodes. Do not try to do every task yourself. Delegate to the narrowest specialist that can produce the requested output.

## Available Agents

### `research-agent`

Folder: `agents/research-agent`

Use for:

- Finding recent AI engineering or coding-agent news
- Turning raw links into marketing angles
- Producing a short research brief for downstream content agents

Session file: `work/sessions/research-agent.jsonl`

Pi creates this file on first run and resumes it on every subsequent run. The session carries full conversation history so you can follow up, refine, or extend a previous task without re-explaining context.

**Model selection:** Controlled by `agents/research-agent/.pi/settings.json` (project-level), which overrides the global `~/.pi/agent/settings.json`. Edit that file to change the model for this agent without affecting other agents. You can also override per-run with `--provider` and `--model` flags. Pi's built-in default (when no settings exist) is `google`.

**Run / continue session** (run from `pi-agent-fleet/`):

```bash
root=$(pwd) && \
(cd agents/research-agent && pi --session "$root/work/sessions/research-agent.jsonl" \
  --tools bash,read \
  --no-skills \
  --verbose \
  -p "@$root/work/tasks/research-ai-engineering.md" \
  "Complete the task in the attached file. Return only the final Markdown output.") \
  | tee -a work/outputs/research-ai-engineering.md
```

`--verbose` prints startup info (provider, model, session path). `tee -a` streams output live to your terminal while also appending to the output file.

`--no-skills` blocks global skills in `~/.pi/agent/skills/` from loading. To load a local skill while still blocking globals, add `--skill` with an explicit path — explicit paths override `--no-skills`:

```bash
--no-skills --skill .pi/skills/my-skill.md
```

**Override model for a single run:**

```bash
root=$(pwd) && \
(cd agents/research-agent && pi \
  --provider anthropic --model claude-sonnet-4-20250514 \
  --session "$root/work/sessions/research-agent.jsonl" \
  --tools bash,read \
  --no-skills \
  --verbose \
  -p "@$root/work/tasks/research-ai-engineering.md" \
  "Complete the task in the attached file. Return only the final Markdown output.") \
  | tee -a work/outputs/research-ai-engineering.md
```

**Start a fresh session** (wipes history — use when the task context has changed completely):

```bash
rm -f work/sessions/research-agent.jsonl
```

Then re-run the command above. Pi will create a new session file at the same path.

## Handoff Contract

Use Markdown files for all handoffs.

Task files go in:

```text
work/tasks/
```

Agent outputs go in:

```text
work/outputs/
```

Every task file should include:

- Goal
- Audience
- Inputs
- Output format
- Constraints

Every output file should include:

- Summary
- Findings or draft content
- Source links when research is involved
- Suggested next agent, if useful

## Security & Isolation

Each agent runs with explicit tool and skill allowlists. Never remove these flags:

- `--tools <list>` — only grant tools the agent actually needs
- `--no-skills` — blocks global skills in `~/.pi/agent/skills/` from auto-loading
- To add a local skill to one agent, use `--no-skills --skill .pi/skills/my-skill.md`

Apply this pattern to every agent added to the fleet.

## Demo Flow

1. Start with `research-agent`.
2. Ask it for trending AI engineering stories worth turning into ZazenCodes content.
3. Add an `x-post-agent` that converts the research brief into a post.
4. Add a `comment-reply-agent` that drafts replies to likely comments.

Keep the system boring and inspectable. The point is the architecture: one hub agent coordinating smaller Pi agents through folders and files.
