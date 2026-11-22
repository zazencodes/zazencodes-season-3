#!/usr/bin/env python3
"""Run the software factory from GitHub webhooks, with no terminal attached.

The server keeps one checkout of one repository that has the factory installed.
A webhook that could change the queue wakes a single worker, which syncs the
checkout, asks `factory/bin/job queue` what there is to do, and runs Claude
Code headless (`claude -p "/factory run"`) while something is startable.

  POST /webhook      GitHub webhook: issues, issue_comment, pull_request
  GET  /healthz      liveness and whether a run is in progress
  GET  /dashboard/   the factory dashboard, behind HTTP basic auth

Only the standard library is used. See server/README.md for the settings.
"""

import base64
import functools
import hashlib
import hmac
import json
import logging
import os
import queue
import re
import shlex
import signal
import subprocess
import sys
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

log = logging.getLogger("factory")

MARKER = "<!-- factory -->"  # factory/bin/job starts every comment it posts with this
WRITERS = {"OWNER", "MEMBER", "COLLABORATOR"}
STARTABLE = {"new", "resume"}
MAX_BODY = 5 * 1024 * 1024
COMMAND = re.compile(r"/factory[ \t]+(run|feedback|reject)\b[ \t]*(.*)", re.S)
DEFAULT_CLAUDE_ARGS = (
    "--permission-mode acceptEdits "
    "--allowedTools Bash,Read,Write,Edit,Grep,Glob,Agent,SendMessage,Skill"
)


@dataclass
class Config:
    repo: str                      # owner/name; webhooks for any other repo are ignored
    secret: str                    # the webhook secret
    repo_dir: Path                 # the checkout the factory runs in
    log_dir: Path
    port: int = 8080
    claude_bin: str = "claude"
    claude_args: str = DEFAULT_CLAUDE_ARGS
    run_timeout: int = 3 * 3600    # seconds one headless run may take
    max_stalls: int = 2            # runs in a row that change nothing before giving up
    max_runs: int = 10             # headless runs per wake-up
    dashboard_password: str = ""   # empty: the dashboard is off
    sync: bool = True              # fast-forward the checkout before each cycle

    @classmethod
    def from_env(cls, env=os.environ):
        missing = [k for k in ("GITHUB_REPO", "WEBHOOK_SECRET") if not env.get(k)]
        if missing:
            sys.exit(f"factory_server: set {', '.join(missing)}")
        data = Path(env.get("DATA_DIR", "/data"))
        return cls(
            repo=env["GITHUB_REPO"],
            secret=env["WEBHOOK_SECRET"],
            repo_dir=Path(env.get("FACTORY_REPO_DIR", data / "repo")),
            log_dir=Path(env.get("FACTORY_LOG_DIR", data / "logs")),
            port=int(env.get("PORT", "8080")),
            claude_bin=env.get("FACTORY_CLAUDE_BIN", "claude"),
            claude_args=env.get("FACTORY_CLAUDE_ARGS") or DEFAULT_CLAUDE_ARGS,
            run_timeout=int(env.get("FACTORY_RUN_TIMEOUT", str(3 * 3600))),
            dashboard_password=env.get("DASHBOARD_PASSWORD", ""),
            sync=env.get("FACTORY_SYNC", "1") != "0",
        )

    def factory_config(self):
        try:
            return json.loads((self.repo_dir / "factory" / "config.json").read_text())
        except (OSError, ValueError):
            return {}

    def queue_label(self):
        return self.factory_config().get("labels", {}).get("queue", "factory")

    def base_branch(self):
        return self.factory_config().get("base_branch", "main")


# ---- Webhooks → what to do ---------------------------------------------------


def valid_signature(secret, body, header):
    """True when `header` is GitHub's X-Hub-Signature-256 for `body`."""
    if not secret or not header or not header.startswith("sha256="):
        return False
    want = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, header)


def decide(event, payload, cfg):
    """Map one webhook to ("run", why), ("command", {...}) or ("ignore", why).

    The server never judges an issue. It only decides whether the queue may have
    changed; `factory/bin/job queue` then says what, if anything, starts.
    """
    if event == "ping":
        return "ignore", "ping"
    full_name = (payload.get("repository") or {}).get("full_name", "")
    if full_name.lower() != cfg.repo.lower():
        return "ignore", f"not {cfg.repo}"
    action = payload.get("action")
    label = cfg.queue_label()

    if event == "issues":
        issue = payload.get("issue") or {}
        labels = {l["name"] for l in issue.get("labels", [])}
        if action == "labeled" and (payload.get("label") or {}).get("name") == label:
            return "run", f"issue #{issue.get('number')} labeled {label}"
        if action == "reopened" and label in labels:
            return "run", f"issue #{issue.get('number')} reopened"
        return "ignore", f"issues.{action}"

    if event == "issue_comment":
        if action != "created":
            return "ignore", f"issue_comment.{action}"
        issue = payload.get("issue") or {}
        comment = payload.get("comment") or {}
        body = (comment.get("body") or "").strip()
        number = issue.get("number")
        if body.startswith(MARKER):
            return "ignore", "the factory's own comment"
        if body.startswith("/factory"):
            if comment.get("author_association") not in WRITERS:
                return "ignore", "command from someone without write access"
            m = COMMAND.match(body)
            if not m:
                return "ignore", "unknown /factory command"
            if m.group(1) == "run":
                return "run", f"/factory run on #{number}"
            return "command", {"kind": m.group(1), "number": number, "text": m.group(2).strip(),
                               "login": (comment.get("user") or {}).get("login", "")}
        if "pull_request" in issue:
            return "ignore", "comment on a pull request"
        if issue.get("state") == "open" and label in {l["name"] for l in issue.get("labels", [])}:
            return "run", f"comment on issue #{number}"  # maybe the answer to a needs-info question
        return "ignore", "comment on an issue outside the queue"

    if event == "pull_request":
        pr = payload.get("pull_request") or {}
        ref = (pr.get("head") or {}).get("ref", "")
        if action == "closed" and pr.get("merged") and ref.startswith("factory/"):
            return "run", f"PR #{pr.get('number')} merged"  # frees a slot; the queue marks it merged
        return "ignore", f"pull_request.{action}"

    return "ignore", f"event {event}"


# ---- The worker --------------------------------------------------------------


class Runner(threading.Thread):
    """The only thing that touches the checkout: one cycle at a time.

    Webhooks that arrive during a cycle set `wake` and are served by one
    follow-up cycle, so there is never a second orchestrator on the same jobs.
    """

    def __init__(self, cfg):
        super().__init__(daemon=True, name="factory-runner")
        self.cfg = cfg
        self.wake = threading.Event()
        self.commands = queue.Queue()
        self.running = False
        self.last = None  # one line about the last cycle, for /healthz

    def trigger(self, why):
        log.info("wake: %s", why)
        self.wake.set()

    def command(self, cmd):
        self.commands.put(cmd)
        self.trigger(f"/factory {cmd['kind']} on #{cmd['number']}")

    def run(self):
        while True:
            self.wake.wait()
            self.wake.clear()
            self.running = True
            try:
                self.last = self.cycle()
            except Exception:  # keep serving webhooks whatever a cycle does
                log.exception("cycle failed")
                self.last = "failed; see the server log"
            finally:
                self.running = False
            log.info("cycle done: %s", self.last)

    # -- one cycle

    def cycle(self):
        if self.cfg.sync:
            self.sync_checkout()
        while True:
            try:
                self.apply(self.commands.get_nowait())
            except queue.Empty:
                break
        runs = stalls = 0
        while True:
            startable = [r for r in self.queue_rows() if r[0] in STARTABLE]
            if not startable:
                return f"{runs} run(s), nothing left to start"
            if runs >= self.cfg.max_runs:
                return f"{runs} run(s), stopped at the limit with {len(startable)} startable"
            before = self.snapshot()
            self.headless_run()
            runs += 1
            stalls = stalls + 1 if self.snapshot() == before else 0
            if stalls >= self.cfg.max_stalls:
                return f"{runs} run(s), stopped: {stalls} in a row changed nothing"

    def sh(self, cmd, stdin=None, check=True):
        res = subprocess.run(cmd, cwd=self.cfg.repo_dir, input=stdin, capture_output=True, text=True)
        if check and res.returncode != 0:
            raise RuntimeError(f"{' '.join(cmd)} failed: {(res.stderr or res.stdout).strip()}")
        return res

    def sync_checkout(self):
        """Put the checkout on the remote's base branch.

        The gate and every agent read checks.sh, config.json and the agent files
        from here, so it has to be current. Jobs live in gitignored folders and
        in their own worktrees, so a hard reset can't touch them.
        """
        base = self.cfg.base_branch()
        self.sh(["git", "fetch", "--prune", "origin"])
        self.sh(["git", "checkout", "-q", base])
        self.sh(["git", "reset", "-q", "--hard", f"origin/{base}"])

    def job_bin(self):
        return str(self.cfg.repo_dir / "factory" / "bin" / "job")

    def queue_rows(self):
        out = self.sh([self.job_bin(), "queue"]).stdout
        return [line.split("\t") for line in out.splitlines() if line.strip()]

    def jobs(self):
        found = []
        for path in sorted((self.cfg.repo_dir / "factory" / "jobs").glob("*/job.json")):
            try:
                found.append(json.loads(path.read_text()))
            except ValueError:
                pass
        return found

    def snapshot(self):
        return sorted((j.get("id"), j.get("stage"), j.get("round")) for j in self.jobs())

    def apply(self, cmd):
        """Run `job feedback` or `job reject` with the comment's words on stdin.

        The words never reach a prompt or a command line. A refusal goes back
        to the thread it came from. The webhook already dropped commands from
        people GitHub doesn't associate with the repository; this asks for
        their real permission.
        """
        number = cmd["number"]
        if not self.can_write(cmd.get("login", "")):
            return self.reply(number, f"`/factory {cmd['kind']}` needs write access to this repository.")
        job = next((j for j in self.jobs() if number in (j.get("issue"), j.get("pr"))), None)
        if job is None:
            return self.reply(number, f"There is no factory job for #{number}.")
        res = self.sh([self.job_bin(), cmd["kind"], job["id"]], stdin=cmd["text"], check=False)
        log.info("job %s %s: exit %s %s", cmd["kind"], job["id"], res.returncode,
                 (res.stdout or res.stderr).strip())
        if res.returncode != 0:
            self.reply(number, f"`/factory {cmd['kind']}` was refused:\n\n```\n{(res.stderr or res.stdout).strip()}\n```")

    def can_write(self, login):
        """True when GitHub says `login` has write or admin permission here.

        author_association isn't enough: an organization member or an outside
        collaborator can be read-only, and feedback outranks the spec.
        """
        if not re.fullmatch(r"[A-Za-z0-9-]+(\[bot\])?", login or ""):
            return False
        res = self.sh(["gh", "api", f"repos/{self.cfg.repo}/collaborators/{login}/permission",
                       "--jq", ".permission"], check=False)
        return res.returncode == 0 and res.stdout.strip() in {"admin", "write"}

    def reply(self, number, body):
        res = self.sh(["gh", "issue", "comment", str(number), "--body", f"{MARKER}\n{body}"], check=False)
        if res.returncode != 0:
            log.warning("couldn't comment on #%s: %s", number, res.stderr.strip())

    def headless_run(self):
        self.cfg.log_dir.mkdir(parents=True, exist_ok=True)
        path = self.cfg.log_dir / time.strftime("run-%Y%m%d-%H%M%S.log")
        cmd = [self.cfg.claude_bin, "-p", "/factory run", *shlex.split(self.cfg.claude_args)]
        log.info("headless run → %s", path)
        with path.open("w") as out:
            proc = subprocess.Popen(cmd, cwd=self.cfg.repo_dir, stdin=subprocess.DEVNULL,
                                    stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = proc.wait(timeout=self.cfg.run_timeout)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGTERM)  # the session and every agent it started
                try:
                    proc.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait()
                code = f"timeout after {self.cfg.run_timeout}s"
        log.info("headless run ended: %s", code)


# ---- HTTP --------------------------------------------------------------------


class Deliveries:
    """The last deliveries seen, so a redelivered webhook isn't applied twice."""

    def __init__(self, size=500):
        self.seen, self.size, self.lock = OrderedDict(), size, threading.Lock()

    def first_time(self, delivery_id):
        if not delivery_id:
            return True
        with self.lock:
            if delivery_id in self.seen:
                return False
            self.seen[delivery_id] = True
            if len(self.seen) > self.size:
                self.seen.popitem(last=False)
            return True


class Handler(SimpleHTTPRequestHandler):
    server_version = "factory"

    def __init__(self, *args, cfg, runner, deliveries, **kwargs):
        self.cfg, self.runner, self.deliveries = cfg, runner, deliveries
        super().__init__(*args, directory=str(cfg.repo_dir / "factory"), **kwargs)

    def log_message(self, fmt, *args):
        log.debug("%s %s", self.address_string(), fmt % args)

    def send_text(self, code, text, headers=()):
        body = text.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/webhook":
            return self.send_text(404, "not found\n")
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            return self.send_text(411, "length required\n")
        if length < 0:
            return self.send_text(400, "bad length\n")
        if length > MAX_BODY:
            return self.send_text(413, "too large\n")
        body = self.rfile.read(length)
        if not valid_signature(self.cfg.secret, body, self.headers.get("X-Hub-Signature-256")):
            return self.send_text(401, "bad signature\n")
        try:
            payload = json.loads(body)
        except ValueError:
            return self.send_text(400, "not json\n")
        if not self.deliveries.first_time(self.headers.get("X-GitHub-Delivery")):
            return self.send_text(202, "ignore: already delivered\n")
        kind, detail = decide(self.headers.get("X-GitHub-Event", ""), payload, self.cfg)
        if kind == "run":
            self.runner.trigger(detail)
        elif kind == "command":
            self.runner.command(detail)
            detail = f"/factory {detail['kind']} on #{detail['number']}"
        # Answer before any work happens: GitHub gives a webhook ten seconds.
        self.send_text(202, f"{kind}: {detail}\n")

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/healthz":
            return self.send_text(200, json.dumps({
                "ok": True, "running": self.runner.running, "last": self.runner.last}) + "\n")
        if path == "/dashboard":
            return self.send_text(301, "", [("Location", "/dashboard/dashboard.html")])
        if not path.startswith("/dashboard/") or not self.cfg.dashboard_password:
            return self.send_text(404, "not found\n")
        if not self.authorized():
            return self.send_text(401, "password required\n",
                                  [("WWW-Authenticate", 'Basic realm="factory"')])
        if path == "/dashboard/":
            return self.send_text(301, "", [("Location", "/dashboard/dashboard.html")])
        super().do_GET()

    do_HEAD = do_GET

    def authorized(self):
        scheme, _, value = self.headers.get("Authorization", "").partition(" ")
        if scheme.lower() != "basic":
            return False
        try:
            _, _, password = base64.b64decode(value).decode().partition(":")
        except ValueError:
            return False
        return hmac.compare_digest(password.encode(), self.cfg.dashboard_password.encode())

    def translate_path(self, path):
        # /dashboard/<x> is factory/<x>: the page, and the jobs/ folders it reads.
        return super().translate_path(path[len("/dashboard"):] if path.startswith("/dashboard/") else path)


def make_server(cfg, runner, host="0.0.0.0"):
    handler = functools.partial(Handler, cfg=cfg, runner=runner, deliveries=Deliveries())
    return ThreadingHTTPServer((host, cfg.port), handler)


def main():
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    cfg = Config.from_env()
    if not (cfg.repo_dir / "factory" / "bin" / "job").exists():
        sys.exit(f"factory_server: {cfg.repo_dir} has no factory/bin/job. Install the factory in "
                 f"{cfg.repo} first (INSTALL.md) and push it to the default branch.")
    runner = Runner(cfg)
    runner.start()
    runner.trigger("startup")  # resume whatever a restart interrupted
    server = make_server(cfg, runner)
    log.info("listening on :%s for %s (dashboard %s)", cfg.port, cfg.repo,
             "on" if cfg.dashboard_password else "off")
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    server.serve_forever()


if __name__ == "__main__":
    main()
