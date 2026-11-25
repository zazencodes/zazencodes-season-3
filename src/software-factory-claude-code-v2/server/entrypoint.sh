#!/usr/bin/env bash
# Prepare the volume, then start the webhook server.
set -euo pipefail

: "${GITHUB_REPO:?set GITHUB_REPO to owner/name}"
: "${GH_TOKEN:?set GH_TOKEN to a token that can push to $GITHUB_REPO}"
: "${WEBHOOK_SECRET:?set WEBHOOK_SECRET}"
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN" >&2
  exit 1
fi

DATA_DIR="${DATA_DIR:-/data}"
REPO_DIR="${FACTORY_REPO_DIR:-$DATA_DIR/repo}"
mkdir -p "$DATA_DIR/logs" "${CLAUDE_CONFIG_DIR:-$DATA_DIR/claude}"

# git pushes and fetches go through gh, which reads GH_TOKEN.
gh auth setup-git
git config --global user.name "${GIT_USER_NAME:-$(gh api user --jq .login)}"
git config --global user.email "${GIT_USER_EMAIL:-$(gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"')}"

if [ ! -d "$REPO_DIR/.git" ]; then
  git clone "https://github.com/$GITHUB_REPO.git" "$REPO_DIR"
fi

exec python3 /app/factory_server.py
