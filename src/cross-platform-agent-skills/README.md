# Interoperable Agent Skills

Cross-platform agent skills reference for coding agents.

## Quick reference table

| Tool               | System-wide (primary)                            | Repo/workspace (primary)       | Primary invocation                  | Auto-finds skills |
| ------------------ | ------------------------------------------------ | ------------------------------ | ----------------------------------- | ----------------- |
| Claude Code        | `~/.claude/skills/`                             | `.claude/skills/`             | `/<skill-name>`                     | Yes               |
| OpenAI Codex       | `~/.codex/skills/` | `.agents/skills/`             | `/skills` or `$<skill-name>`        | Yes               |
| GitHub Copilot     | `~/.copilot/skills/`                            | `.github/skills/`             | `/<skill-name>` | Yes               |
| Cursor             | `~/.cursor/skills/`                             | `.cursor/skills/`             | `/<skill-name>`                  | Yes               |
| Google Antigravity | `~/.gemini/antigravity/skills/`                 | `.agent/skills/` | `/<skill-name>`   | Yes               |


> [!NOTE]
> Several tools intentionally support multiple repo/system locations for compatibility (e.g, Copilot also recognizes `.claude/skills`).

## Scopes and activations

* Two scopes are common:
  * **Project/repo scope**: stored inside the repository so teammates share it.
  * **User/system scope**: stored in a per-user config directory (sometimes also an admin-wide directory).

* Two activation modes are common:
  * **Explicit invocation**: slash command or UI selection (e.g., `/my-skill`).
  * **Implicit invocation**: the agent auto-selects the skill when your request matches the skill’s description/metadata.

## File system pattern

A skill is a folder containing an entry file (usually `SKILL.md`) and optional supporting files

```text
<scope-root>/
  skills/
    <skill-name>/
      SKILL.md        # entrypoint (instructions + metadata)
      (optional) ...  # scripts, templates, docs, examples, etc.
```

Example:

```
~/.<agent>/skills/
  blog-post-writer/
    SKILL.md
    examples/
      product-post.md
      how-to-post.md
    docs/
      style-guide.md
      publishing-guide.md
    scripts/
      upload_post.py
```


