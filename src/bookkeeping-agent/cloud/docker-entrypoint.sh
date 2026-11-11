#!/bin/sh
# Wire agent-home/{memory,sessions} and .current-session-id to the persistent
# volume at $DATA_DIR (a gcsfuse-mounted GCS bucket on Cloud Run). On first run
# the bucket is empty, so seed memory/ from the example templates baked into
# the image.
set -e

DATA_DIR="${DATA_DIR:-/data}"
AGENT_HOME="/app/agent-home"

if [ -d "$DATA_DIR" ]; then
  mkdir -p "$DATA_DIR/memory/images" "$DATA_DIR/sessions"

  # Seed memory files on first run.
  for pair in "expenses.example.json:expenses.json" "facts.example.json:facts.json"; do
    src="${pair%%:*}"; dst="${pair##*:}"
    if [ ! -f "$DATA_DIR/memory/$dst" ] && [ -f "$AGENT_HOME/memory/$src" ]; then
      cp "$AGENT_HOME/memory/$src" "$DATA_DIR/memory/$dst"
      echo "seeded $dst from $src"
    fi
  done

  # Replace baked-in dirs with symlinks to the mount.
  rm -rf "$AGENT_HOME/memory" "$AGENT_HOME/sessions"
  ln -s "$DATA_DIR/memory" "$AGENT_HOME/memory"
  ln -s "$DATA_DIR/sessions" "$AGENT_HOME/sessions"

  # Persist the current-session-id pointer too.
  if [ ! -e "$AGENT_HOME/.current-session-id" ] || [ ! -L "$AGENT_HOME/.current-session-id" ]; then
    rm -f "$AGENT_HOME/.current-session-id"
    ln -s "$DATA_DIR/.current-session-id" "$AGENT_HOME/.current-session-id"
  fi
fi

exec "$@"
