# Software Factory for Claude Code

> **v2 is here.** It works through your GitHub issues, runs several jobs at
> once, gates every build with your own checks, and merges through PRs. See
> [`software-factory-claude-code-v2`](../software-factory-claude-code-v2).

A small, visual software factory built from one Claude Code skill, seven
subagents and plain markdown files. You type `/factory <feature>` and agents
write a spec, build it on its own branch, review it from four angles, and either
merge it to `main` or hand it to you.

```
feature → spec-writer → builder → [security, ux, ui, code] → WAIT FOR ALL
                           ▲                                      │
                           └──── any CHANGES: resume builder ◄────┤
                                                                  ▼ all PASS
                                     merge to main ◄─ APPROVE ─ approver ─ ESCALATE → needs-human
```

This folder is laid out like a repo root, so you can copy it straight into
yours.

```
.claude/
  skills/factory/SKILL.md        the orchestrator: runs the loop, writes job.json
  agents/                        one file per agent in the loop
    spec-writer.md               opus    writes spec.md
    builder.md                   opus    commits on factory/<job-id>, writes build.md
    reviewer-security.md         opus    writes round-N/review-security.md
    reviewer-ux.md               sonnet  writes round-N/review-ux.md
    reviewer-ui.md               sonnet  writes round-N/review-ui.md
    reviewer-code.md             sonnet  writes round-N/review-code.md
    approver.md                  opus    writes decision.md
factory/
  backlog.md                     queue for /factory next
  dashboard.html                 the visual board
  jobs/                          one folder per job (two examples included)
BUILD_PROMPT.md                  the prompt that built the original factory
```

## How it works

- The Claude Code session that runs `/factory` becomes the orchestrator. It
  spawns every agent and is the only writer of the job's `job.json`.
- Agents get their context from files, not the conversation, and each writes
  only its own file. Every review starts with `VERDICT: PASS` or
  `VERDICT: CHANGES`; `decision.md` starts with `APPROVE` or `ESCALATE`.
- The four reviewers run in parallel. A round is done only when all four files
  exist. If any says CHANGES, the same builder is resumed (at most twice).
- Each job gets its own git worktree next to your repo
  (`../<repo>-factory/<job-id>/`) on a `factory/<job-id>` branch. Open several
  Claude sessions and run `/factory` in each to build features in parallel.

## Commands

```
/factory <feature>               run a new job through the loop
/factory next                    run the first unchecked item in factory/backlog.md
/factory approve <job-id>        merge a needs-human job into main
/factory rework <job-id> <note>  send a needs-human job back to the builder with feedback
```

## Use it in your repo

1. Copy `.claude/` and `factory/` into your repo root.
2. Delete the example jobs in `factory/jobs/` and the checked items in
   `factory/backlog.md`.
3. Add `/factory/jobs/` to your `.gitignore`. Job folders are runtime state.
4. Make sure your `AGENTS.md` (or `CLAUDE.md`) says how to set up a fresh
   checkout, start the dev server on a given port, and run your tests, build
   and lint. The agents carry nothing repo-specific; they read all of it from
   there.
5. Install the [`agent-browser`](https://github.com/vercel-labs/agent-browser)
   CLI if your project has pages to look at. The builder and the UX and UI
   reviewers use it to check the running app.
6. Commit everything on `main`, then run `/factory <feature>`.

The review checklists are deliberately general. Ask Claude to tailor them to
your stack: your framework, your security hot spots, and what the approver
should always escalate.

## Dashboard

```bash
cd factory && python3 -m http.server
```

Open <http://localhost:8000/dashboard.html>. Jobs move across the stages as
cards, review chips fill in as verdicts land, and jobs that need you stand out.
Click a card to read its markdown files. It polls every two seconds, so leave it
open while jobs run.

## The example jobs

Both came from running the factory on [zazencodes.com](https://zazencodes.com),
a Vue + Firebase site. Serve the dashboard from this folder to click through
them.

- **001-blog-reading-time** passed all four reviews in round 1, but the approver
  escalated it because it edited a prerender script, which counts as a deploy
  change. A human read `decision.md` and ran `/factory approve`.
- **002-not-found-page** passed review and the approver merged it to `main` on
  its own.

## BUILD_PROMPT.md

The prompt used to build the original factory, kept verbatim for reference.
If you are copying this folder as a template, ignore it.

The factory has grown since then: it now runs each job in its own git worktree
and gives every job its own `job.json`, instead of the single `board.json` the
prompt describes, so several jobs can run at once.
