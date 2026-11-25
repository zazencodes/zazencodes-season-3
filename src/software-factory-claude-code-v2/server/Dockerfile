# The software factory as a webhook server. Build from this folder:
#   docker build -t software-factory server/
#
# Python 3.13 runs the server and the factory's own scripts. Add your project's
# toolchain (Node, Go, a database client, ...) below: factory/checks.sh and the
# builder run inside this container.
FROM python:3.13-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git gnupg zstd \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# --- your project's toolchain goes here ---

RUN useradd --create-home --uid 1000 factory \
 && mkdir -p /data /app \
 && chown factory:factory /data
USER factory
ENV PATH=/home/factory/.local/bin:$PATH \
    DATA_DIR=/data \
    CLAUDE_CONFIG_DIR=/data/claude \
    PYTHONUNBUFFERED=1

# Claude Code, installed for the factory user. The factory needs 2.1.257 or later.
RUN curl -fsSL https://claude.ai/install.sh | bash \
 && claude --version

COPY --chown=factory:factory factory_server.py entrypoint.sh /app/

VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD curl -fsS http://127.0.0.1:${PORT:-8080}/healthz || exit 1
ENTRYPOINT ["/app/entrypoint.sh"]
