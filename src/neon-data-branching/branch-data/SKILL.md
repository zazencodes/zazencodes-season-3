---
name: branch-data
description: Use when the user explicitly asks for branch-data, or when parallel features in the same repo need isolated database changes. Leave routine solo edits in their current checkout.
---

# Branch data

Each agent starts in the same project. When invoked for a new task, create a Git worktree and a matching Neon branch **before editing code or writing data**. An explicit invocation is sufficient. For automatic use, look for concurrent tasks that would otherwise migrate or write to the same database.

## Use in a project

Copy this entire `branch-data/` folder into the repo’s `.agents/skills/` directory. The helper uses Bash, Git, Node.js 22+ and an authenticated Neon CLI via npx. It reads the project ID from the starting repo’s root `.neon` link. For a new repo, link its intended Neon project once with `npx --yes neon@9.9.4 link --project-id <project-id> --no-env-pull`. Keep `.env.local` ignored by Git. If the repo uses a `neon.ts` service configuration, install its dependencies in the starting checkout.

## Start a task

Choose a short, unused feature name. From the repo, run the bundled helper. For example:

```sh
bash .agents/skills/branch-data/scripts/start.sh storyboard
```

It creates a sibling worktree from the current Git **commit** and a fresh Neon branch from the linked project’s **default database branch**. It pins the worktree to the new branch and writes its connection settings to an ignored `.env.local`. With a root `neon.ts`, it pulls the configured services. Otherwise it pulls Postgres settings. Other projects can use the same files and pick their own task names.

- **Work there.** Set the reported worktree as the working directory for subsequent edits, commands and migrations. Configure the app to load that worktree’s `.env.local`. Keep credentials out of chat and Git. Check for inherited connection settings that could override the file before starting anything that writes.
- **Preview the change.** Follow the target repo’s own setup instructions for dependencies, app-only settings, and startup. For simultaneous local previews, use distinct ports and route each frontend to its own backend. Report the worktree path, branch name, preview URL when applicable, and what changed in the schema.
- **Resume deliberately.** If a step fails, stop before feature work. Inspect the reported resources and finish the remaining setup for that task. A collision with an unrelated branch requires a different name. Verify the Git branch, Neon link and generated environment agree before using an existing task worktree.
- **Keep it for review.** Leave the branches and any requested preview available. Merge, promote or remove them when the user chooses a version.
