---
name: init-agents-md
description: Create or refresh a minimal repository-level AGENTS.md for coding agents, keeping it short, repo-specific, and interoperable with CLAUDE.md. Use when Codex needs to inspect a codebase, draft AGENTS.md, preserve useful details from an existing CLAUDE.md, stop before overwriting an existing AGENTS.md, or mirror the same context into a companion CLAUDE.md.
---

# Initialize AGENTS.md

Create a short, repo-specific `AGENTS.md`. Inspect the repository first, keep only the facts that help an agent work faster, and treat `AGENTS.md` as the canonical context file.

Read [references/agents-md-best-practices.md](references/agents-md-best-practices.md) before drafting.

## Workflow

1. Check the current files.
- If `AGENTS.md` already exists, stop. Tell the user and ask whether to continue and overwrite it.
- If `CLAUDE.md` exists, read it and use it as seed material for the new `AGENTS.md`.
- If `CLAUDE.md` does not exist, plan to create it after `AGENTS.md`.

2. Explore the repository.
- Inspect only enough to explain the real project shape and workflows.
- Start with root files and directories, using the `README` as an initial guide to understand the project.
- Look for the commands people actually run, where the important code lives, whether tests exist, and any sharp edges an agent could miss.
- Prefer `rg`, `rg --files`, `ls`, and targeted file reads over broad dumps.

3. Draft `AGENTS.md`.
- Keep it minimal. Cut anything generic, obvious, or duplicated from existing docs.
- Start the file with `# AGENTS.md`. If you also create `CLAUDE.md`, start that file with `# CLAUDE.md`.
- Place `## Project Instructions` near the top. Leave it blank if there is nothing project-specific to add.
- Favor section names that match the real repo shape instead of generic placeholders.
- Focus on a few high-value facts:
  - what the repository is
  - where important code or content lives
  - the main workflows or commands
  - testing or validation expectations
  - any important gotchas
- Use short sections and terse bullets. If the file starts feeling long, compress it again.
- If the repository has useful topic-specific groupings, split them into small sections like `Reference Docs`, `Development Commands`, `Architecture`, `Important Notes`, or similarly precise names.

4. Sync `CLAUDE.md`.
- If `CLAUDE.md` existed, extract any useful repo-specific details into `AGENTS.md`, then keep `CLAUDE.md` minimal: `# CLAUDE.md` plus a single line telling the agent to read `AGENTS.md`, unless the repository already clearly uses a fuller mirrored `CLAUDE.md` convention.
- If `CLAUDE.md` did not exist, create it as a minimal companion file with `# CLAUDE.md` and a single line telling the agent to read `AGENTS.md`.

5. Sanity-check the result.
- Confirm `AGENTS.md` is the source of truth.
- Confirm every command and path matches the repository.
- Confirm the file stays short and agent-specific.

## Suggested Shape

Use only the sections that earn their keep. A good default for a richer repo is:

- `## Project Overview`
- `## Project Instructions`
- `## Reference Docs`
- `## Development Commands`
- `## Architecture`
- `## Important Notes`
- `## Validation`

If the repository has clear domain-specific buckets, prefer those over the generic defaults. For example: `Styling System`, `Path Aliases`, `State Management`, or `Admin Scripts`.
