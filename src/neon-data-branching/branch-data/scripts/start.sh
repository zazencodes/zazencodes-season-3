#!/usr/bin/env bash
set -euo pipefail

branch=${1:-}
if [[ $# != 1 || ! $branch =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "Usage: start.sh <unique-feature-name>, e.g. storyboard" >&2
  exit 2
fi

root=$(git rev-parse --show-toplevel)
if [[ ! -f "$root/.neon" ]]; then
  echo 'Link this repo to its intended Neon project first (see SKILL.md).' >&2
  exit 1
fi
project=$(node -e '
  const { projectId } = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  if (typeof projectId !== "string" || !projectId.trim()) throw Error("Missing projectId in .neon");
  console.log(projectId);
' "$root/.neon")

tree="$(dirname "$root")/$(basename "$root")-$branch"
git -C "$root" worktree add -b "$branch" "$tree" HEAD
cd "$tree"
printf 'Worktree: %s\nTask branch: %s\n' "$tree" "$branch"
if ! git check-ignore -q .env.local; then
  echo 'The new worktree must ignore .env.local before pulling database credentials.' >&2
  exit 1
fi

# Create first: checkout --create could adopt an existing branch with the same name.
neon=(npx --yes neon@9.9.4)
umask 077
cp "$root/.neon" .neon
"${neon[@]}" branches create --project-id "$project" --name "$branch" --no-secrets
"${neon[@]}" checkout "$branch" --project-id "$project" --no-env-pull

pull=(--service postgres --env NEON_BRANCH)
if [[ -f "$root/neon.ts" ]]; then
  pull=(--config "$root/neon.ts")
fi
"${neon[@]}" env pull --project-id "$project" --branch "$branch" --file .env.local "${pull[@]}"

node --input-type=module - "$project" "$branch" <<'JS'
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const [project, branch] = process.argv.slice(2);
const link = JSON.parse(readFileSync('.neon', 'utf8'));
const env = parseEnv(readFileSync('.env.local', 'utf8'));
if (link.projectId !== project || link.branch !== branch ||
    env.NEON_BRANCH !== branch || !env.DATABASE_URL) {
  throw new Error('Worktree environment does not match the new Neon branch.');
}
JS
printf 'Branch verified. Continue in %s\n' "$tree"
