Build a simple, visual "software factory" in this repo using a Claude Code skill,
subagents, and markdown files. Keep it small: a viewer should understand the whole
thing in a few minutes. Inspect the repo first so the agents know its language,
test command, and conventions.

## The orchestrator

The factory is one skill, /factory. Whichever Claude Code session runs it becomes
the orchestrator: it runs the loop below, spawns every agent, and is the only
writer of factory/board.json.

## The loop (edit this to change the factory)

                   ┌──────────────────┐
                   │     feature      │
                   └─────────┬────────┘
                             ▼
                   ┌──────────────────┐
                   │   spec-writer    │
                   │       opus       │
                   └─────────┬────────┘
                             ▼
                   ┌──────────────────┐
                   │     builder      │◄────────────────────┐
                   │       opus       │                     │
                   └─────────┬────────┘                     │
        ┌─────────────┬──────┴──────┬─────────────┐         │
        ▼             ▼             ▼             ▼         │
  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
  │  security │ │     ux    │ │ ui design │ │    code   │   │
  │    opus   │ │   sonnet  │ │   sonnet  │ │   sonnet  │   │
  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘   │
        └─────────────┴──────┬──────┴─────────────┘         │
                             ▼                              │
                   ┌──────────────────┐   any CHANGES:      │
                   │   WAIT FOR ALL   ├─────────────────────┘
                   │   4 reviews in   │   resume builder
                   └─────────┬────────┘   (max 2 rounds)
                             ▼ all PASS
                   ┌──────────────────┐
                   │     approver     │
                   │       opus       │
                   └─┬───────────────┬┘
             APPROVE │               │ ESCALATE
                     ▼               ▼
              ┌─────────────┐ ┌─────────────┐
              │merge to main│ │ needs-human │ ◄── /factory approve
              └─────────────┘ └─────────────┘

## Target file system

.claude/
  skills/factory/SKILL.md          # the orchestrator's instructions
  agents/                          # one file per agent in the loop
factory/
  board.json                       # durable state, drives the dashboard
  dashboard.html                   # visual board, polls board.json
  backlog.md                       # queue of features for /factory next
  jobs/003-rate-limiting/          # one folder per job
    spec.md
    build.md
    round-1/                       # one folder per review round,
      review-security.md           # one file per reviewer
      review-ux.md
      review-ui.md
      review-code.md
    decision.md

## Example files

.claude/agents/<name>.md  (Claude Code subagent syntax)
---
name: example-agent
description: One line on when the orchestrator should use this agent.
tools: Read, Grep, Glob, Bash, Write
model: sonnet
---
What this agent reads, what it does, and which file it writes.

factory/board.json
{ "jobs": [ { "id": "003-rate-limiting", "branch": "factory/003-rate-limiting",
  "stage": "review", "round": 2,
  "reviews": { "security": "CHANGES", "ux": "PASS", "ui": "pending", "code": "PASS" } } ] }

## Rules
- Agents get context from files, not the conversation, and write only their own file.
- Each review starts with VERDICT: PASS or CHANGES; decision.md starts with
  APPROVE or ESCALATE.
- The builder works and commits on a feature branch (factory/<job-id>) and tests
  against the spec's acceptance criteria.
- WAIT FOR ALL: a review round is done only when every reviewer's file exists in
  the round folder. Never resume the builder mid-round.
- Spawn the builder with a name (builder-<job-id>) and resume that same builder
  with SendMessage for each new round, pointing it at the round folder.

## Commands
/factory <feature>               run a new job through the loop
/factory next                    run the first unchecked item in backlog.md
/factory approve <job-id>        merge a needs-human job into main
/factory rework <job-id> <note>  send a job back to the builder with feedback

## Dashboard
One self-contained HTML file, served with `python3 -m http.server` from factory/.
Jobs are cards moving across the loop's stages. Each review round shows as a row
of reviewer chips that fill in as verdicts land. needs-human jobs stand out. Click
a card to read its markdown files. Clean and minimal.
