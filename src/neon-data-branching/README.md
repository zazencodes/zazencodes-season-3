# Data branching for your coding agents

Bring the [branch-data skill](branch-data/SKILL.md) into an app you already work on. Each agent can create a Git worktree for its feature, create a matching Neon database branch, and connect the two before it writes any data.

## Start in your own repo

You need a Git repo with a commit, a Neon project containing your app’s database, Bash, Git, Node.js 22+ and a signed-in Neon CLI. The helper reads the project link from the repo’s root `.neon` file. If the link is missing, run the following with your existing Neon project ID:

```sh
npx --yes neon@9.9.4 link --project-id <your-project-id> --no-env-pull
```

Commit an ignore rule for `.env.local` so new worktrees inherit it. If your project uses `neon.ts`, install the app’s dependencies in your starting checkout so the CLI can load the config.

## Give your coding agent this install prompt

> Install the branch-data skill from the GitHub repo zazencodes/zazencodes-season-3. Copy the entire src/neon-data-branching/branch-data folder to .agents/skills/branch-data in this repo (or the proper folder for Claude, if you're using Claude Code). If this repo does not use Neon then let me know that I will not be able to use this skill unless we set that up.

The installed folder contains `SKILL.md` and `scripts/start.sh`.

## Build your feature

Replace the text in brackets with the change you want to make, then paste this prompt into your agent:

> Use the branch-data skill to build [feature you want to build]. When it’s ready, show me how to test it in the new worktree.

You can also trigger the skill explicitly in the prompt with `$branch-data` or `/branch-data`.

The agent works in its own Git worktree, connected to its own Neon branch. Try the change there before deciding whether to keep it. The worktree is a sibling folder of your repo, so your agent needs permission to write there and to reach the network.

## Clean up

When you are done with a feature, ask your agent to remove it, or run this from your repo with the feature’s name:

```sh
npx --yes neon@9.9.4 branches delete <feature> --project-id <your-project-id>
git worktree remove --force ../<repo>-<feature>
git branch -D <feature>
```

The Neon branch and everything written to it are deleted. Your default branch is untouched.
