# Generic Hermes VPS Setup

Use this path when you have a fresh Linux VPS and you are not using Hostinger's
one-click Hermes image.

## Initial VPS setup

### SSH into the VPS

```bash
ssh root@YOUR_SERVER_IP
```

These commands assume a fresh Ubuntu or Debian VPS and a root login.

### Install basic packages

```bash
apt update
apt install -y curl ca-certificates git
```

### Install Hermes Agent

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

Follow the setup prompts. On a root Linux install, the official installer uses
this layout:

| Thing | Default path |
| --- | --- |
| Hermes command | `/usr/local/bin/hermes` |
| Hermes source | `/usr/local/lib/hermes-agent` |
| Hermes data/config | `/root/.hermes` |

If setup was skipped or needs to be re-run:

```bash
hermes setup
```

If model/provider setup is incomplete:

```bash
hermes model
```

### Test Hermes

```bash
hermes
```

Start with a normal prompt. Once that works, the base Hermes install is done.

## Upgrade 1 - Hermes WebUI

The WebUI is easiest on a generic VPS because it can use the normal Hermes
install instead of Hostinger's Docker container layout.

```bash
cd /opt
git clone https://github.com/nesquena/hermes-webui.git
cd hermes-webui
cp .env.example .env
```

Set a password:

```bash
nano .env
```

Use a long value for:

```dotenv
HERMES_WEBUI_PASSWORD=choose-a-long-password
```

Start WebUI as a background service:

```bash
HERMES_WEBUI_HOST=127.0.0.1 ./ctl.sh start
./ctl.sh status
```

Open it through an SSH tunnel from your laptop:

```bash
ssh -L 8787:127.0.0.1:8787 root@YOUR_SERVER_IP
```

Then open <http://localhost:8787>.

Useful WebUI commands:

```bash
cd /opt/hermes-webui
./ctl.sh logs --lines 100
./ctl.sh restart
./ctl.sh stop
```

## Upgrade 2 - Honcho memory

Create a Honcho API key at <https://honcho.dev>, then run:

```bash
hermes memory setup
```

Choose `honcho` and paste the API key.

Check it:

```bash
hermes memory status
```

Disable it later if needed:

```bash
hermes memory off
```
