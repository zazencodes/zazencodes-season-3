# Interoperable Agent Skills

A practical cross-tool guide to "Agent Skills" in coding agents.

---

## Quick reference table

| Tool               | System-wide (primary)                            | Repo/workspace (primary)       | Primary invocation                  | Auto-finds skills |
| ------------------ | ------------------------------------------------ | ------------------------------ | ----------------------------------- | ----------------- |
| Claude Code        | `~/.claude/skills/`                             | `.claude/skills/`             | `/<skill-name>`                     | Yes               |
| GitHub Copilot     | `~/.copilot/skills/`                            | `.github/skills/`             | `/<skill-name>` (or agent auto-use) | Yes               |
| OpenAI Codex       | `~/.agents/skills/` (and `/etc/codex/skills/`) | `.agents/skills/`             | `/skills` or `$<skill-name>`        | Yes               |
| Google Antigravity | `~/.gemini/antigravity/skills/`                 | `<workspace>/.agent/skills/` | ask naturally (match description)   | Yes               |
| Cursor             | `~/.cursor/skills/`                             | `.cursor/skills/`             | slash-command menu                  | Yes               |


> [!NOTE] Several tools intentionally support **multiple** repo/system locations for compatibility (for example, Copilot also recognizes `.claude/skills`).

---

## General pattern

Most "agent skills" systems converge on the same shape:

* A skill is a folder containing a required entry file, typically `SKILL.md`.
* Two scopes are common:
  * **Project/repo scope**: stored inside the repository so teammates share it.
  * **User/system scope**: stored in a per-user config directory (sometimes also an admin-wide directory).

* Two activation modes are common:
  * **Explicit invocation**: slash command or UI selection (e.g., `/my-skill`).
  * **Implicit invocation**: the agent auto-selects the skill when your request matches the skill’s description/metadata.

Typical layout:

```text
<scope-root>/
  skills/
    <skill-name>/
      SKILL.md        # entrypoint (instructions + metadata)
      (optional) ...  # scripts, templates, docs, examples, etc.
```


Example:

```
~/.agents/skills/
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

---

## Claude Code

### Where skills live

* **System-wide (per-user):**

  * `~/.claude/skills/<skill-name>/SKILL.md`
* **In-repo:**

  * `.claude/skills/<skill-name>/SKILL.md`
* **Also supported:**

  * **Plugin-bundled** skills: `<plugin>/skills/<skill-name>/SKILL.md`
  * **Enterprise-managed** distribution (org-controlled settings)

### How to use skills

* **Explicit:** type `/<skill-name>` in Claude Code (example: `/explain-code`).
* **Implicit (automatic):** Claude can invoke a skill when your request matches the skill’s `description`.

### Alternate / advanced behaviors

* **Disable auto-invocation but keep manual invocation:** use a setting such as `disable-model-invocation: true` (so only you can trigger it).
* **Project scoping:** project skills make it easy for teams to share consistent workflows.

---

## OpenAI Codex

### Where skills live

* **System-wide (per-user):**

  * `$HOME/.agents/skills/…`
* **System-wide (admin / machine):**

  * `/etc/codex/skills/…`
* **In-repo / workspace:**

  * `.agents/skills/…` (discovered relative to your working directory / repo root)

### How to use skills

* **Explicit:** include the skill directly in your prompt. In CLI/IDE, run `/skills` or type `$` to mention a skill (for example, `$my-skill`).
* **Implicit:** Codex can choose a skill automatically when your task matches the skill’s `description`.

### Alternate / advanced behaviors

* **Skill authoring helpers:** Codex ships with built-in helpers such as `$skill-creator` (to scaffold a new skill) and `$skill-installer` (to install skills).
* **Disable implicit invocation but keep explicit invocation:** set `allow_implicit_invocation: false` (Codex still allows explicit `$skill` invocation).
* **Multi-project setups:** using `.agents/skills` in each repo keeps skills versioned with the codebase.

---

## Google Antigravity

> “Antigravity” guidance varies depending on which Google workflow you’re using (e.g., Gemini-based agentic dev flows). The pattern below reflects the Antigravity codelab-style setup.

### Where skills live

* **System-wide (per-user):**

  * `~/.gemini/antigravity/skills/…`
* **Workspace:**

  * `<workspace-root>/.agents/skills/…`

### How to use skills

* **Primary:** ask naturally; the agent loads skills based on matching the skill description/intent.

### Alternate / advanced behaviors

* **Workflows vs skills:** “workflows” are often saved prompts/actions and may be triggered via `/…` commands, while “skills” are the reusable capability bundles the agent can select when relevant.
* **Progressive loading:** metadata can be used for matching; full instructions load when needed (tool-dependent).

---

## Cursor

### Where skills live

* **System-wide (per-user):**

  * `~/.cursor/skills/…`
* **In-repo:**

  * `.cursor/skills/<skill>/SKILL.md`

### How to use skills

* **Primary:** invoke via the **slash-command menu** inside Cursor’s agent/chat UI.
* **Implicit:** Cursor can apply skills automatically when relevant.

### Alternate / advanced behaviors

* **Separate feature: custom slash commands**

  * Cursor also supports user-defined slash commands stored as:

    * `.cursor/commands/<command>.md`
  * These are not always identical to “skills,” but they can overlap in practice (both are reusable instruction bundles).
* **Real-world gotcha:** users sometimes report discovery issues in certain environments (e.g., symlinked folders, remote/SSH modes, or non-default data dirs), so if a skill isn’t showing up, validate the directory and whether Cursor is indexing that location.

---

## GitHub Copilot

### Where skills live

* **System-wide (per-user):**

  * `~/.copilot/skills/<skill>/SKILL.md`
  * (Compatibility) `~/.claude/skills/…` may also be recognized
* **In-repo:**

  * `.github/skills/<skill>/SKILL.md`
  * (Compatibility) `.claude/skills/…` may also be recognized

### How to use skills

* **Explicit (force a specific skill):** include the skill name in your prompt preceded by a slash (for example, `/frontend-design`).
* **Skill commands in Copilot CLI (management / discovery):**

  * `/skills list`
  * `/skills` (toggle enable/disable)
  * `/skills info`
  * `/skills add` (register a location)
  * `/skills reload`
  * `/skills remove …`
* **Agent usage (implicit):**

  * Copilot’s agent can load skills automatically when relevant to the task.

### Alternate / advanced behaviors

* **Multiple surfaces:** skills are designed to work across Copilot experiences (e.g., coding agent flows and CLI-driven usage), with support varying by IDE channel/version.
* **Skill folder requirements:** the skill directory must include `SKILL.md` as the entrypoint.

---

