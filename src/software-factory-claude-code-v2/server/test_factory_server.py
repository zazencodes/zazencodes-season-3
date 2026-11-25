"""Tests for factory_server.py. Run: python3 -m unittest discover -s server -v

Nothing here talks to GitHub or Claude: the repo is a temp folder whose
factory/bin/job and claude are stub scripts.
"""

import hashlib
import hmac
import json
import os
import stat
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import factory_server as fs

SECRET = "s3cret"
REPO = "octo/app"

# A stub factory/bin/job: the queue is whatever queue.txt holds, and feedback
# and reject record their stdin, or refuse when refuse.txt exists.
JOB_STUB = """#!/usr/bin/env python3
import sys, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
cmd = sys.argv[1]
if cmd == "queue":
    q = root / "queue.txt"
    sys.stdout.write(q.read_text() if q.exists() else "")
elif cmd in ("feedback", "reject"):
    if (root / "refuse.txt").exists():
        sys.exit("job: stub refuses")
    (root / f"{cmd}-{sys.argv[2]}.txt").write_text(sys.stdin.read())
"""

# A stub claude: counts its runs and, unless stall.txt exists, finishes the job.
CLAUDE_STUB = """#!/usr/bin/env python3
import sys, json, pathlib, time
root = pathlib.Path.cwd()
runs = root / "runs.txt"
runs.write_text(runs.read_text() + " ".join(sys.argv[1:]) + "\\n" if runs.exists() else " ".join(sys.argv[1:]) + "\\n")
if (root / "slow.txt").exists():
    time.sleep(0.5)
if not (root / "stall.txt").exists():
    (root / "queue.txt").write_text("skip\\t1\\t001-x\\tmerged\\tmerged\\n")
    job = root / "factory" / "jobs" / "001-x"
    job.mkdir(parents=True, exist_ok=True)
    (job / "job.json").write_text(json.dumps({"id": "001-x", "issue": 1, "pr": 7, "stage": "merged", "round": 1}))
"""


def script(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.replace("#!/usr/bin/env python3", "#!" + os.sys.executable, 1))
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


class Case(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name) / "repo"
        script(self.root / "factory" / "bin" / "job", JOB_STUB)
        script(self.root / "claude-stub", CLAUDE_STUB)
        (self.root / "factory" / "config.json").write_text(json.dumps({"labels": {"queue": "factory"}}))
        (self.root / "factory" / "dashboard.html").write_text("<html>board</html>")
        self.cfg = fs.Config(repo=REPO, secret=SECRET, repo_dir=self.root, log_dir=Path(tmp.name) / "logs",
                             port=0, claude_bin=str(self.root / "claude-stub"), claude_args="--flag",
                             sync=False, dashboard_password="pw")

    def runs(self):
        path = self.root / "runs.txt"
        return path.read_text().splitlines() if path.exists() else []


def issue(number=1, labels=("factory",), state="open", **extra):
    return {"number": number, "state": state, "labels": [{"name": l} for l in labels], **extra}


def payload(**fields):
    return {"repository": {"full_name": REPO}, **fields}


def comment(body, assoc="OWNER"):
    return {"body": body, "author_association": assoc, "user": {"login": "octocat"}}


class SignatureTest(unittest.TestCase):
    def test_accepts_only_the_right_hmac(self):
        body = b'{"a":1}'
        good = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        self.assertTrue(fs.valid_signature(SECRET, body, good))
        self.assertFalse(fs.valid_signature(SECRET, body + b" ", good))
        self.assertFalse(fs.valid_signature("other", body, good))
        self.assertFalse(fs.valid_signature(SECRET, body, None))
        self.assertFalse(fs.valid_signature(SECRET, body, good.replace("sha256=", "sha1=")))
        self.assertFalse(fs.valid_signature("", body, "sha256=" + hmac.new(b"", body, hashlib.sha256).hexdigest()))


class DecideTest(Case):
    def decide(self, event, **fields):
        return fs.decide(event, payload(**fields), self.cfg)

    def test_queue_label_starts_a_run(self):
        kind, _ = self.decide("issues", action="labeled", label={"name": "factory"}, issue=issue())
        self.assertEqual(kind, "run")

    def test_other_labels_and_actions_are_ignored(self):
        for fields in (
            dict(action="labeled", label={"name": "bug"}, issue=issue()),
            dict(action="labeled", label={"name": "factory:needs-human"}, issue=issue()),
            dict(action="unlabeled", label={"name": "factory"}, issue=issue()),
            dict(action="opened", issue=issue()),
            dict(action="reopened", issue=issue(labels=())),
        ):
            self.assertEqual(self.decide("issues", **fields)[0], "ignore", fields)

    def test_another_repository_is_ignored(self):
        kind, _ = fs.decide("issues", {"repository": {"full_name": "evil/app"}, "action": "labeled",
                                       "label": {"name": "factory"}, "issue": issue()}, self.cfg)
        self.assertEqual(kind, "ignore")

    def test_the_factorys_own_comments_are_ignored(self):
        kind, _ = self.decide("issue_comment", action="created", issue=issue(),
                              comment=comment(fs.MARKER + "\nIntake accepted this."))
        self.assertEqual(kind, "ignore")

    def test_a_reply_on_a_queued_issue_starts_a_run(self):
        reply = comment("Use euros.", assoc="NONE")
        self.assertEqual(self.decide("issue_comment", action="created", issue=issue(), comment=reply)[0], "run")
        for other in (issue(labels=()), issue(state="closed"), issue(pull_request={})):
            self.assertEqual(self.decide("issue_comment", action="created", issue=other, comment=reply)[0], "ignore")
        self.assertEqual(self.decide("issue_comment", action="edited", issue=issue(), comment=reply)[0], "ignore")

    def test_commands_need_write_access(self):
        body = "/factory feedback make it blue\nand round"
        kind, cmd = self.decide("issue_comment", action="created", issue=issue(7, pull_request={}), comment=comment(body))
        self.assertEqual((kind, cmd), ("command", {"kind": "feedback", "number": 7, "text": "make it blue\nand round",
                                                   "login": "octocat"}))
        kind, cmd = self.decide("issue_comment", action="created", issue=issue(), comment=comment("/factory reject no"))
        self.assertEqual((kind, cmd["kind"], cmd["text"]), ("command", "reject", "no"))
        self.assertEqual(self.decide("issue_comment", action="created", issue=issue(), comment=comment("/factory run"))[0], "run")
        for assoc in ("NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR"):
            kind, _ = self.decide("issue_comment", action="created", issue=issue(), comment=comment(body, assoc))
            self.assertEqual(kind, "ignore", assoc)
        self.assertEqual(self.decide("issue_comment", action="created", issue=issue(),
                                     comment=comment("/factory deploy"))[0], "ignore")

    def test_only_a_merged_factory_pr_starts_a_run(self):
        pr = {"number": 7, "merged": True, "head": {"ref": "factory/001-x"}}
        self.assertEqual(self.decide("pull_request", action="closed", pull_request=pr)[0], "run")
        self.assertEqual(self.decide("pull_request", action="closed", pull_request={**pr, "merged": False})[0], "ignore")
        self.assertEqual(self.decide("pull_request", action="closed",
                                     pull_request={**pr, "head": {"ref": "feature"}})[0], "ignore")
        self.assertEqual(self.decide("pull_request", action="opened", pull_request=pr)[0], "ignore")

    def test_ping_and_unknown_events_are_ignored(self):
        self.assertEqual(fs.decide("ping", {}, self.cfg)[0], "ignore")
        self.assertEqual(self.decide("push")[0], "ignore")


class RunnerTest(Case):
    def test_an_empty_queue_never_starts_claude(self):
        self.assertIn("0 run(s)", fs.Runner(self.cfg).cycle())
        self.assertEqual(self.runs(), [])

    def test_runs_until_nothing_is_startable(self):
        (self.root / "queue.txt").write_text("new\t1\t-\t-\tAdd x\n")
        self.assertIn("1 run(s)", fs.Runner(self.cfg).cycle())
        self.assertEqual(self.runs(), ["-p /factory run --flag"])
        self.assertTrue(list(self.cfg.log_dir.glob("run-*.log")))

    def test_waiting_and_held_rows_dont_start_claude(self):
        (self.root / "queue.txt").write_text("wait\t1\t001-x\tneeds-human\tmerge PR #7\nhold\t2\t-\t-\tconcurrency\n")
        fs.Runner(self.cfg).cycle()
        self.assertEqual(self.runs(), [])

    def test_gives_up_when_runs_change_nothing(self):
        (self.root / "queue.txt").write_text("resume\t1\t001-x\tbuild\tround 1\n")
        (self.root / "stall.txt").write_text("")
        self.assertIn("changed nothing", fs.Runner(self.cfg).cycle())
        self.assertEqual(len(self.runs()), self.cfg.max_stalls)

    def test_commands_reach_the_job_script_on_stdin(self):
        job = self.root / "factory" / "jobs" / "001-x"
        job.mkdir(parents=True)
        (job / "job.json").write_text(json.dumps({"id": "001-x", "issue": 1, "pr": 7, "stage": "needs-human", "round": 3}))
        runner = fs.Runner(self.cfg)
        runner.can_write = lambda login: login == "octocat"
        text = "make it blue; $(rm -rf /) `id`"
        runner.commands.put({"kind": "feedback", "number": 7, "text": text, "login": "octocat"})  # by PR number
        runner.commands.put({"kind": "reject", "number": 1, "text": "no", "login": "octocat"})    # by issue number
        runner.cycle()
        self.assertEqual((self.root / "feedback-001-x.txt").read_text(), text)
        self.assertEqual((self.root / "reject-001-x.txt").read_text(), "no")

    def test_a_refusal_or_unknown_job_is_reported_not_raised(self):
        replies = []
        runner = fs.Runner(self.cfg)
        runner.reply = lambda number, body: replies.append((number, body))
        runner.can_write = lambda login: login == "octocat"
        runner.commands.put({"kind": "feedback", "number": 99, "text": "x", "login": "octocat"})
        runner.cycle()
        job = self.root / "factory" / "jobs" / "001-x"
        job.mkdir(parents=True)
        (job / "job.json").write_text(json.dumps({"id": "001-x", "issue": 1, "pr": None, "stage": "build", "round": 1}))
        (self.root / "refuse.txt").write_text("")
        runner.commands.put({"kind": "feedback", "number": 1, "text": "x", "login": "octocat"})
        runner.cycle()
        self.assertEqual([n for n, _ in replies], [99, 1])
        self.assertIn("stub refuses", replies[1][1])

    def test_a_command_from_someone_without_write_permission_is_not_applied(self):
        job = self.root / "factory" / "jobs" / "001-x"
        job.mkdir(parents=True)
        (job / "job.json").write_text(json.dumps({"id": "001-x", "issue": 1, "pr": 7, "stage": "needs-human", "round": 3}))
        replies = []
        runner = fs.Runner(self.cfg)
        runner.reply = lambda number, body: replies.append((number, body))
        runner.can_write = lambda login: False
        runner.commands.put({"kind": "feedback", "number": 1, "text": "ship it", "login": "reader"})
        runner.cycle()
        self.assertFalse((self.root / "feedback-001-x.txt").exists())
        self.assertIn("write access", replies[0][1])

    def test_can_write_refuses_odd_logins_without_asking_github(self):
        runner = fs.Runner(self.cfg)
        runner.sh = lambda *a, **k: self.fail("asked GitHub")
        for login in ("", "a/b", "../x", "a b"):
            self.assertFalse(runner.can_write(login))

    def test_events_during_a_run_coalesce_into_one_orchestrator(self):
        (self.root / "queue.txt").write_text("new\t1\t-\t-\tAdd x\n")
        (self.root / "slow.txt").write_text("")
        runner = fs.Runner(self.cfg)
        runner.start()
        for i in range(20):
            runner.trigger(f"event {i}")
        deadline = threading.Event()
        for _ in range(100):
            if runner.last and not runner.running and not runner.wake.is_set():
                break
            deadline.wait(0.1)
        self.assertEqual(len(self.runs()), 1)

    def test_a_timed_out_run_is_killed(self):
        (self.root / "queue.txt").write_text("resume\t1\t001-x\tbuild\tround 1\n")
        script(self.root / "claude-stub", "#!/usr/bin/env python3\nimport time\ntime.sleep(60)\n")
        self.cfg.run_timeout, self.cfg.max_stalls = 1, 1
        self.assertIn("changed nothing", fs.Runner(self.cfg).cycle())


class HttpTest(Case):
    def setUp(self):
        super().setUp()

        class Recorder:
            running, last = False, None

            def __init__(self):
                self.triggers, self.commands = [], []

            def trigger(self, why):
                self.triggers.append(why)

            def command(self, cmd):
                self.commands.append(cmd)

        self.runner = Recorder()
        self.server = fs.make_server(self.cfg, self.runner, host="127.0.0.1")
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def request(self, path, body=None, headers=None):
        req = urllib.request.Request(self.url + path, data=body, headers=headers or {})
        try:
            with urllib.request.urlopen(req) as res:
                return res.status, res.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()

    def hook(self, event, data, secret=SECRET, delivery=None, sign=True):
        body = json.dumps(data).encode()
        headers = {"X-GitHub-Event": event, "Content-Type": "application/json"}
        if sign:
            headers["X-Hub-Signature-256"] = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if delivery:
            headers["X-GitHub-Delivery"] = delivery
        return self.request("/webhook", body, headers)

    def labeled(self):
        return payload(action="labeled", label={"name": "factory"}, issue=issue())

    def test_unsigned_and_missigned_webhooks_are_rejected(self):
        self.assertEqual(self.hook("issues", self.labeled(), sign=False)[0], 401)
        self.assertEqual(self.hook("issues", self.labeled(), secret="wrong")[0], 401)
        self.assertEqual(self.runner.triggers, [])

    def test_a_signed_label_event_wakes_the_runner_once_per_delivery(self):
        self.assertEqual(self.hook("issues", self.labeled(), delivery="d1")[0], 202)
        self.assertEqual(self.hook("issues", self.labeled(), delivery="d1")[0], 202)
        self.assertEqual(len(self.runner.triggers), 1)

    def test_a_command_is_queued_with_its_text(self):
        data = payload(action="created", issue=issue(7, pull_request={}), comment=comment("/factory feedback blue"))
        self.assertEqual(self.hook("issue_comment", data)[0], 202)
        self.assertEqual(self.runner.commands, [{"kind": "feedback", "number": 7, "text": "blue", "login": "octocat"}])

    def test_health_and_unknown_paths(self):
        code, body = self.request("/healthz")
        self.assertEqual((code, json.loads(body)["ok"]), (200, True))
        self.assertEqual(self.request("/")[0], 404)
        self.assertEqual(self.request("/factory/config.json")[0], 404)
        self.assertEqual(self.request("/nope", b"{}")[0], 404)

    def test_a_negative_length_is_rejected(self):
        import http.client
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=5)
        conn.putrequest("POST", "/webhook")
        conn.putheader("Content-Length", "-1")
        conn.endheaders()
        self.assertEqual(conn.getresponse().status, 400)
        conn.close()

    def test_the_dashboard_needs_the_password(self):
        basic = lambda pw: {"Authorization": "Basic " + __import__("base64").b64encode(f"me:{pw}".encode()).decode()}
        self.assertEqual(self.request("/dashboard/dashboard.html")[0], 401)
        self.assertEqual(self.request("/dashboard/dashboard.html", headers=basic("no"))[0], 401)
        code, body = self.request("/dashboard/dashboard.html", headers=basic("pw"))
        self.assertEqual((code, body), (200, "<html>board</html>"))
        self.assertEqual(self.request("/dashboard/../../etc/passwd", headers=basic("pw"))[0], 404)
        self.cfg.dashboard_password = ""
        self.assertEqual(self.request("/dashboard/dashboard.html", headers=basic(""))[0], 404)


if __name__ == "__main__":
    unittest.main()
