# Data branching for your coding agents

Bring the [branch-data skill](branch-data/SKILL.md) into an app you already work on. Each agent can create a Git worktree for its feature, create a matching Neon database branch, and connect the two before it writes any data.

## Start in your own repo

You need a Git repo with a commit, a Neon project containing your app’s database, Bash, Git, Node.js 22+ and a signed-in Neon CLI. The helper reads the project link from the repo’s root `.neon` file. If the link is missing, run the following with your existing Neon project ID:

```sh
npx --yes neon@9.9.4 link --project-id <your-project-id> --no-env-pull
```

Commit an ignore rule for `.env.local` so new worktrees inherit it. If your project uses `neon.ts`, install the app’s dependencies in your starting checkout so the CLI can load the config.

## Give your coding agent this install prompt

> Install the branch-data skill from the public GitHub repo zazencodes/zazencodes-season-3. Copy the entire src/neon-data-branching/branch-data folder to .agents/skills/branch-data in this repo. Check that the script is present, this repo is linked to its Neon project, and Git ignores .env.local. Tell me when it’s ready.

The installed folder contains `SKILL.md` and `scripts/start.sh`.

## Give it a feature

For example, imagine your personal project is a reading list that already saves book titles. Open an agent in that repo and paste:

> \branch-data Use the installed branch-data skill for this feature. Let me mark a book as finished and save the date I finished it. Start a local preview and give me its URL so I can try it.

The prompt names the skill in plain language so you can use it across agents. For that task the helper command could be:

```sh
bash .agents/skills/branch-data/scripts/start.sh finished-books
```

The helper starts the Git branch from your current commit and the Neon branch from the linked project’s default branch. The agent builds in the reported worktree using its own `.env.local`. You can open the preview, mark a book as finished and compare it with the original app before deciding whether to keep the change.
