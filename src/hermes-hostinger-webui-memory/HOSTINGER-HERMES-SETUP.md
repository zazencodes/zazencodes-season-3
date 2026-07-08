# Hostinger Hermes Setup: WebUI + Honcho Memory

This guide starts from Hostinger's one-click Hermes Agent VPS and adds two
upgrades:

1. **Hermes WebUI** - a browser UI for chat, sessions, files, skills, and
   memory.
2. **Honcho memory** - an external memory provider that builds a richer model
   of you from normal conversations.

The WebUI setup below keeps everything in the Hostinger Hermes container so the
browser experience uses the same `/opt/hermes`, `/opt/data`, and tool
environment as the CLI.

## Initial VPS setup


Start here:

<https://hostinger.com/zazen>

That opens the Hostinger landing page for the Hermes one-click deploy.

1. Click **Choose plan**.
2. Pick a VPS plan. I recommend **KVM 1** or **KVM 2** for this setup.

    > [!IMPORTANT]
    > Get 10% off yearly plans with code ZAZEN

3. During setup, choose the Hermes one-click template.
4. Finish checkout and wait for Hostinger to provision the VPS.
5. SSH into the server once it is ready:

   ```bash
   ssh root@YOUR_SERVER_IP
   ```

After the one-click deploy is working, continue with the WebUI and Honcho
upgrades below.

## Hostinger Hermes layout

Inside the VPS, Hostinger generated this Hermes project:

```bash
/docker/hermes-agent-qqnm/
```

Key facts:

| Thing | Value |
| --- | --- |
| Hostinger project dir (on VPS) | `/docker/hermes-agent-qqnm/` |
| Hermes data dir (on VPS) | `/docker/hermes-agent-qqnm/data` |
| Hermes data dir (inside docker) | `/opt/data` |
| Hermes home dir (inside docker) | `/opt/hermes` |
| WebUI port added by this guide | `8787` |


## Upgrade 1 - Hermes WebUI

Repo: <https://github.com/nesquena/hermes-webui>

There are two useful ways to show this upgrade:

1. **Quick preview install** - fastest path for proving WebUI works on the VPS.
   This installs WebUI and a normal host-level Hermes Agent beside Hostinger's
   Docker install.
2. **Docker-integrated install** - the cleaner long-term setup. This builds a
   small custom image from Hostinger's Hermes image and runs WebUI inside the
   same container environment as the CLI.


### Option A - quick preview install

> Use Option B for a more robust setup. Here you will build a WebUI for
> Hostinger's one-click deploy Hermes environment.

1. SSH into your Hostinger VPS:

   > Note: replace `hermes-hostinger` with your actual VPS IP address before
   > running the commands below.

   ```bash
   ssh root@hermes-hostinger
   ```

2. Install the basic packages WebUI needs:

   ```bash
   apt update
   apt install -y git curl ca-certificates python3 python3-venv
   ```

3. Clone WebUI and run its bootstrap:

   ```bash
   cd /opt
   git clone https://github.com/nesquena/hermes-webui.git
   cd hermes-webui
   ./start.sh
   ```

   The WebUI bootstrap detects Hermes Agent. If Hermes is not installed on the
   VPS host, it will run the official Hermes installer and walk you through the
   normal setup prompts.

4. Open WebUI through an SSH tunnel. Run this on your machine, not inside the
   VPS:

   ```bash
   ssh -L 8787:127.0.0.1:8787 root@hermes-hostinger
   ```

   Then open <http://localhost:8787>.

5. To stop a WebUI process launched by `./start.sh`, find the process listening
   on port `8787`:

   ```bash
   apt install -y lsof
   lsof -iTCP:8787 -sTCP:LISTEN
   kill <PID>
   ```

   For later daemon-style starts, use `ctl.sh`:

   ```bash
   cd /opt/hermes-webui
   ./ctl.sh start
   ./ctl.sh status
   ./ctl.sh logs --lines 100
   ./ctl.sh restart
   ```

#### Quick preview teardown

If you only used the quick preview install for a demo, stop WebUI first:

```bash
cd /opt/hermes-webui
./ctl.sh stop || true
```

If `./start.sh` launched WebUI directly and `ctl.sh stop` does not find it,
stop the process listening on port `8787`:

```bash
apt install -y lsof
lsof -tiTCP:8787 -sTCP:LISTEN | xargs -r kill
```

Then remove the host-level WebUI checkout:

```bash
rm -rf /opt/hermes-webui
```

Optional: remove the host-level Hermes install created by the preview path.
Only do this if you do not need the separate host install:

```bash
rm -f /usr/local/bin/hermes
rm -rf /usr/local/lib/hermes-agent
rm -rf /root/.hermes
```

Do not remove `/docker/hermes-agent-qqnm`; that is Hostinger's one-click Docker
Hermes project.

### Option B - Docker-integrated install

1. SSH into your Hostinger VPS:

   > Note: replace `hermes-hostinger` with your actual VPS IP address before
   > running the commands below.

   ```bash
   ssh root@hermes-hostinger
   ```

2. Go to the Hostinger Hermes project:

   ```bash
   cd /docker/hermes-agent-qqnm
   ```

3. Back up Hostinger's original compose file:

   ```bash
   cp docker-compose.yml docker-compose.yml.hostinger-backup
   ```

   > To restore the original Hostinger setup later:

   > ```bash
   > cd /docker/hermes-agent-qqnm
   > cp docker-compose.yml.hostinger-backup docker-compose.yml
   > docker compose up -d --force-recreate
   > ```

4. Add a WebUI password to `/docker/hermes-agent-qqnm/.env`:

   ```dotenv
   HERMES_WEBUI_PASSWORD=choose-a-long-password
   ```

5. Create `/docker/hermes-agent-qqnm/Dockerfile.webui`:

   ```dockerfile
   FROM ghcr.io/hostinger/hvps-hermes-agent:latest

   ARG HERMES_WEBUI_REPO=https://github.com/nesquena/hermes-webui.git
   ARG HERMES_WEBUI_REF=master

   RUN rm -rf /opt/hermes-webui \
       && git clone --depth 1 --branch "${HERMES_WEBUI_REF}" \
          "${HERMES_WEBUI_REPO}" /opt/hermes-webui

   RUN uv pip install --python /opt/hermes/.venv/bin/python3 \
       -r /opt/hermes-webui/requirements.txt \
       --trusted-host pypi.org \
       --trusted-host files.pythonhosted.org

   COPY entrypoint.webui.sh /entrypoint.webui.sh
   RUN sed -i '1s/^[[:space:]]*//' /entrypoint.webui.sh && chmod +x /entrypoint.webui.sh

   ENTRYPOINT ["/entrypoint.webui.sh"]
   ```

6. Create `/docker/hermes-agent-qqnm/entrypoint.webui.sh`.

   The first line must be exactly `#!/bin/zsh`, with no leading spaces.

   ```bash
   #!/bin/zsh
   set -e

   export HERMES_HOME="${HERMES_HOME:-/opt/data}"
   export HOME="${HOME:-/opt/data/home}"
   export PATH="/opt/data/bin:/opt/hermes/.venv/bin:/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

   export HERMES_WEBUI_HOST="${HERMES_WEBUI_HOST:-0.0.0.0}"
   export HERMES_WEBUI_PORT="${HERMES_WEBUI_PORT:-8787}"
   export HERMES_WEBUI_STATE_DIR="${HERMES_WEBUI_STATE_DIR:-/opt/data/webui}"
   export HERMES_WEBUI_DEFAULT_WORKSPACE="${HERMES_WEBUI_DEFAULT_WORKSPACE:-/opt/hermes}"
   export HERMES_API_URL="${HERMES_API_URL:-http://127.0.0.1:8642}"

   mkdir -p /opt/data/logs

   if ! pgrep -f "python3 server.py" >/dev/null 2>&1; then
     (
       cd /opt/hermes-webui
       exec gosu hermes /opt/hermes/.venv/bin/python3 server.py
     ) >>/opt/data/logs/webui.log 2>&1 &
   fi

   exec /entrypoint.sh
   ```

7. Replace `/docker/hermes-agent-qqnm/docker-compose.yml` with the custom image
   setup:

   ```yaml
   services:
     hermes-agent:
       build:
         context: .
         dockerfile: Dockerfile.webui
       image: hostinger-hermes-webui:latest
       restart: unless-stopped
       ports:
         - "4860"
         - "127.0.0.1:8787:8787"
       labels:
         - traefik.enable=true
         - traefik.http.routers.${COMPOSE_PROJECT_NAME}.rule=Host(`${COMPOSE_PROJECT_NAME}.${TRAEFIK_HOST}`)
         - traefik.http.routers.${COMPOSE_PROJECT_NAME}.entrypoints=websecure
         - traefik.http.routers.${COMPOSE_PROJECT_NAME}.tls.certresolver=letsencrypt
         - traefik.http.routers.${COMPOSE_PROJECT_NAME}.service=${COMPOSE_PROJECT_NAME}
         - traefik.http.services.${COMPOSE_PROJECT_NAME}.loadbalancer.server.port=4860
       env_file:
         - .env
       environment:
         - HERMES_HOME=/opt/data
         - HERMES_WEBUI_AGENT_DIR=/opt/hermes
         - HOME=/opt/data/home
         - HERMES_WEBUI_HOST=0.0.0.0
         - HERMES_WEBUI_PORT=8787
         - HERMES_WEBUI_STATE_DIR=/opt/data/webui
         - HERMES_WEBUI_DEFAULT_WORKSPACE=/opt/hermes
         - HERMES_API_URL=http://127.0.0.1:8642
       volumes:
         - ./data:/opt/data
   ```

   This keeps Hostinger's terminal UI exposed through Traefik on port `4860`.
   WebUI is bound to `127.0.0.1:8787` on the VPS, so it is reachable through an
   SSH tunnel by default.

8. Build and recreate the Hermes container:

   ```bash
   cd /docker/hermes-agent-qqnm
   docker compose up -d --build --force-recreate
   docker compose logs -f
   ```

9. Open WebUI through an SSH tunnel. Run this on your machine, not inside the
    VPS:

    ```bash
    ssh -L 8787:127.0.0.1:8787 root@hermes-hostinger
    ```

    Then open <http://localhost:8787> and log in with `HERMES_WEBUI_PASSWORD`.

    The `-L` means local port forwarding. When your browser visits
    <http://localhost:8787>, SSH forwards that traffic to
    <http://127.0.0.1:8787> on the VPS.

## Upgrade 2 - Honcho memory

Built-in Hermes memory uses local markdown files. Honcho adds an external memory
provider while the built-in files stay active.

1. Create a Honcho API key at <https://honcho.dev>.

2. Run the memory setup inside the Hermes container:

   ```bash
   cd /docker/hermes-agent-qqnm
   docker compose exec -it hermes-agent /opt/hermes/hermes memory setup
   ```

3. Choose `honcho` when prompted and paste the API key.

4. Confirm the configured provider:

   ```bash
   cd /docker/hermes-agent-qqnm
   docker compose exec -it hermes-agent /opt/hermes/hermes memory status
   ```

5. To disable Honcho and return to built-in memory only:

   ```bash
   cd /docker/hermes-agent-qqnm
   docker compose exec -it hermes-agent /opt/hermes/hermes memory off
   ```

Have a few normal conversations after setup, then start a fresh session and ask
about preferences or facts you mentioned earlier.

Realistically, it will take some time for you to notice the benefits of Honcho.

