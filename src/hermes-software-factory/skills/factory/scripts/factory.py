#!/usr/bin/env python3
"""Bookkeeping for the Hermes software factory.

Hermes does the judgment work: the spec, the code and the validation. This
script does the parts that must not drift: where each repository's clone is,
which issue is next, which stage the job is in, how the branch becomes a pull
request, and the monitor's picture of all of it.

State lives in $HERMES_HOME/factory/:

  repos/<owner>--<repo>.json               the clone's location and the queue at the last check
  jobs/<owner>--<repo>--<issue>/job.json   one record per issue, plus spec.md and pr-body.md
"""
import argparse
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

LABEL = "factory"
STAGES = ["ingest", "spec", "build", "validate", "pr"]
WRITE_ACCESS = {"ADMIN", "MAINTAIN", "WRITE"}
SEARCH_DEPTH = 3
WIDTH = 72


# ---------------------------------------------------------------- helpers

def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run(*args, cwd=None):
    try:
        result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, stdin=subprocess.DEVNULL)
    except FileNotFoundError:
        raise SystemExit(f"`{args[0]}` is not installed.")
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()
        raise SystemExit(f"`{' '.join(args[:3])}` failed: {detail}")
    return result.stdout.strip()


def git_push(path, *args):
    """git push that fails instead of waiting for a password prompt."""
    return run("env", "GIT_TERMINAL_PROMPT=0", "git", "push", *args, cwd=path)


def hermes_home():
    home = os.environ.get("HERMES_HOME")
    if not home:
        raise SystemExit("HERMES_HOME is not set. Run this from Hermes.")
    return Path(home)


def state_dir():
    return hermes_home() / "factory"


def check_slug(slug):
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", slug):
        raise SystemExit(f"Name the repository as OWNER/REPO, not {slug!r}.")
    return slug


def key(slug):
    return slug.replace("/", "--")


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, indent=2) + "\n")
    os.replace(temp, path)


def repo_file(slug):
    return state_dir() / "repos" / f"{key(slug)}.json"


def load_repo(slug):
    path = repo_file(check_slug(slug))
    if not path.exists():
        raise SystemExit(f"{slug} isn't in the factory. Run `/factory add {slug}` first.")
    return json.loads(path.read_text())


def job_dir(slug, number):
    return state_dir() / "jobs" / f"{key(slug)}--{number}"


def all_jobs():
    return [json.loads(p.read_text()) for p in sorted(state_dir().glob("jobs/*/job.json"))]


def active_jobs():
    return [j for j in all_jobs() if j["state"] == "active"]


def active_job(slug):
    return next((j for j in active_jobs() if j["repo"] == slug), None)


def require_active(slug):
    job = active_job(check_slug(slug))
    if job is None:
        raise SystemExit(f"No factory job is in progress for {slug}.")
    return job


def log(job, text):
    job["updated"] = now()
    job["events"].append({"at": job["updated"], "stage": job["stage"], "text": text})
    save(job_dir(job["repo"], job["issue"]) / "job.json", job)


def origin_slug(path):
    """The GitHub owner/name of a clone's origin remote, or None."""
    result = subprocess.run(["git", "-C", str(path), "remote", "get-url", "origin"],
                            text=True, capture_output=True, stdin=subprocess.DEVNULL)
    match = re.search(r"github\.com[:/]([\w.-]+/[\w.-]+?)(?:\.git)?/?$", result.stdout.strip())
    return match.group(1) if match else None


def check_queue(repo):
    """Open `factory` issues with no job yet, oldest first. Records the check on the repo."""
    slug = repo["repo"]
    issues = json.loads(run("gh", "issue", "list", "--repo", slug, "--label", LABEL, "--state", "open",
                            "--json", "number,title", "--limit", "100"))
    built = {j["issue"] for j in all_jobs() if j["repo"] == slug}
    waiting = sorted((i for i in issues if i["number"] not in built), key=lambda i: i["number"])
    record_queue(repo, waiting)
    return waiting


def record_queue(repo, waiting):
    repo.update(checked=now(), queue=waiting)
    save(repo_file(repo["repo"]), repo)


# ---------------------------------------------------------------- add

def find_clones(slug):
    """Clones of `slug` under $HERMES_HOME and the home folder, a few levels deep."""
    roots = []
    for root in (hermes_home(), Path.home()):
        root = root.resolve()
        if root.is_dir() and root not in roots:
            roots.append(root)
    found = []
    for root in roots:
        for current, dirs, files in os.walk(root):
            here = Path(current)
            if ".git" in dirs or ".git" in files:
                if (origin_slug(here) or "").lower() == slug.lower() and here not in found:
                    found.append(here)
                dirs[:] = []
                continue
            depth = len(here.relative_to(root).parts)
            dirs[:] = [] if depth >= SEARCH_DEPTH else [
                d for d in dirs if not d.startswith(".") and d != "node_modules"]
    return found


def add(args):
    slug = check_slug(args.repo)
    info = json.loads(run("gh", "repo", "view", slug, "--json",
                          "nameWithOwner,viewerPermission,hasIssuesEnabled,isArchived,defaultBranchRef"))
    slug = info["nameWithOwner"]
    if info["viewerPermission"] not in WRITE_ACCESS:
        raise SystemExit(f"Your GitHub login can't push to {slug} (permission: {info['viewerPermission']}).")
    if info["isArchived"] or not info["hasIssuesEnabled"]:
        raise SystemExit(f"{slug} must be unarchived with issues enabled.")
    if args.path:
        path = Path(args.path).expanduser().resolve()
        if (origin_slug(path) or "").lower() != slug.lower():
            raise SystemExit(f"{path} isn't a clone of {slug}.")
        how = "Using the clone at"
    else:
        clones = find_clones(slug)
        if len(clones) > 1:
            raise SystemExit(f"Found {len(clones)} clones of {slug}: "
                             + ", ".join(map(str, clones)) + ". Choose one with --path.")
        if clones:
            path, how = clones[0], "Found a clone at"
        else:
            path = hermes_home() / "work" / slug.split("/")[1]
            if path.exists():
                raise SystemExit(f"{path} already exists and isn't a clone of {slug}.")
            path.parent.mkdir(parents=True, exist_ok=True)
            run("gh", "repo", "clone", slug, str(path))
            how = "Cloned into"
    base = info["defaultBranchRef"]["name"]
    git_push(path, "--dry-run", "origin", f"HEAD:refs/heads/{LABEL}/access-check")
    run("gh", "label", "create", LABEL, "--repo", slug, "--color", "5319E7",
        "--description", "Queued for the Hermes software factory", "--force")
    previous = json.loads(repo_file(slug).read_text()) if repo_file(slug).exists() else {}
    save(repo_file(slug), {"repo": slug, "path": str(path), "base": base, "added": now(),
                           "checked": previous.get("checked"), "queue": previous.get("queue", [])})
    print(f"{how} {path}")
    print(f"Push access to {slug} confirmed. Default branch: {base}.")
    print(f"Label an issue '{LABEL}' to queue it. Build with `/factory run {slug}`.")


# ---------------------------------------------------------------- run

def start(args):
    repo = load_repo(args.repo)
    slug, path = repo["repo"], repo["path"]
    busy = active_job(slug)
    if busy:
        print(f"BUSY: issue #{busy['issue']} is at {busy['stage']} (last update {busy['updated']}). "
              "Nothing started.")
        return
    if run("git", "status", "--porcelain", cwd=path):
        raise SystemExit(f"{path} has uncommitted changes. Commit, stash or discard them first.")
    waiting = check_queue(repo)
    if not waiting:
        print(f"NO WORK: {slug} has no open issues labeled '{LABEL}'.")
        return
    requested = getattr(args, "issue", None)
    if requested is not None and waiting[0]["number"] != requested:
        raise SystemExit(f"Queue changed: expected issue #{requested}; inspect before continuing.")
    number = waiting[0]["number"]
    issue = json.loads(run("gh", "issue", "view", str(number), "--repo", slug,
                           "--json", "number,title,body,url,author"))
    branch = f"{LABEL}/issue-{number}"
    run("git", "fetch", "origin", repo["base"], cwd=path)
    run("git", "switch", "-c", branch, f"origin/{repo['base']}", cwd=path)
    folder = job_dir(slug, number)
    job = {
        "repo": slug, "path": path, "issue": number, "title": issue["title"], "url": issue["url"],
        "branch": branch, "base": repo["base"], "stage": "ingest", "state": "active", "result": None,
        "pr": None, "started": now(), "updated": now(), "stages": {"ingest": now()}, "events": [],
    }
    log(job, f"Picked #{number} from {len(waiting)} queued issue(s)")
    record_queue(repo, waiting[1:])
    print(f"STARTED issue #{number} in {slug}")
    print(f"Clone: {path}")
    print(f"Branch: {branch} (from origin/{repo['base']})")
    print(f"Job folder: {folder}")
    print("Issue, as filed on GitHub:")
    print(json.dumps({"title": issue["title"], "author": issue["author"]["login"],
                      "url": issue["url"], "body": issue["body"]}, indent=2))


def stage(args):
    job = require_active(args.repo)
    if job["stage"] in ("validate", "pr"):
        raise SystemExit(f"#{job['issue']} is at {job['stage']}. Finish with `open-pr` or `stop`.")
    expected = STAGES[STAGES.index(job["stage"]) + 1]
    if args.name != expected:
        raise SystemExit(f"#{job['issue']} is at {job['stage']}; the next stage is {expected}.")
    job["stage"] = args.name
    job["stages"][args.name] = now()
    log(job, args.note or f"Started {args.name}")
    print(f"#{job['issue']} is at {args.name}.")


def note(args):
    job = require_active(args.repo)
    log(job, args.text)
    print(f"Noted at {job['stage']}.")


def open_pr(args):
    job = require_active(args.repo)
    path, slug = job["path"], job["repo"]
    if job["stage"] not in ("validate", "pr"):
        raise SystemExit(f"#{job['issue']} is at {job['stage']}. Open the pull request after validate.")
    if run("git", "branch", "--show-current", cwd=path) != job["branch"]:
        raise SystemExit(f"Check out {job['branch']} in {path} first.")
    if run("git", "status", "--porcelain", cwd=path):
        raise SystemExit("Commit or discard the remaining changes first.")
    if run("git", "rev-list", "--count", f"origin/{job['base']}..HEAD", cwd=path) == "0":
        raise SystemExit("The branch has no commits. Use `stop` when there is nothing to open.")
    folder = job_dir(slug, job["issue"])
    body = Path(args.body_file).read_text().rstrip()
    (folder / "pr-body.md").write_text(f"{body}\n\nCloses #{job['issue']}\n\n"
                                       "_Built by the Hermes software factory._\n")
    if job["stage"] == "validate":
        job["stage"] = "pr"
        job["stages"]["pr"] = now()
    log(job, "Pushing the branch and opening the pull request")
    git_push(path, "--set-upstream", "origin", job["branch"])
    command = ["gh", "pr", "create", "--repo", slug, "--base", job["base"], "--head", job["branch"],
               "--title", job["title"], "--body-file", str(folder / "pr-body.md")]
    if args.draft:
        command.append("--draft")
    url = run(*command, cwd=path).splitlines()[-1]
    job.update(pr=url, state="done", result="draft" if args.draft else "ready")
    log(job, f"Opened {'draft ' if args.draft else ''}pull request {url}")
    run("git", "switch", job["base"], cwd=path)
    print(f"{'Draft pull request' if args.draft else 'Pull request'} for #{job['issue']}: {url}")


# ---------------------------------------------------------------- dispatcher

def dispatch(args):
    """Drain a queue snapshot with one fresh process/session per issue."""
    import fcntl
    slug = check_slug(args.repo)
    lock_path = state_dir() / f"{key(slug)}.dispatch.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(f"BUSY: dispatcher already running for {slug}.")
            return
        repo = load_repo(slug)
        if active_job(slug):
            print(f"BUSY: a factory issue is already active for {slug}.")
            return
        waiting = check_queue(repo)
        if not waiting:
            print(f"NO WORK: {slug} has no eligible issues.")
            return
        completed = []
        for issue in waiting:
            number = issue["number"]
            start(argparse.Namespace(repo=slug, issue=number))
            job = active_job(slug)
            if not job or job["issue"] != number:
                raise SystemExit(f"Could not claim #{number}; batch halted.")
            folder = job_dir(slug, number)
            prompt = (
                f"Factory worker for {slug} issue #{number}. The dispatcher already ran start; "
                f"the active job is at ingest in {folder}, clone {repo['path']}. "
                "Do NOT run start or dispatch. Read the issue and comments, repository instructions "
                "and README, then execute factory stages spec, build, validate and open-pr for ONLY "
                "this issue, following the factory skill. Verify the PR on GitHub. Do not merge. "
                "Stop on factory.py errors. End after this issue; the dispatcher handles the queue."
            )
            env = {k: v for k, v in os.environ.items()
                   if not k.startswith("HERMES_SESSION_") and k not in {
                       "HERMES_CRON_SESSION", "HERMES_UI_SESSION_ID"}}
            with (folder / "worker-output.log").open("w") as output:
                result = subprocess.run(
                    ["hermes", "chat", "--oneshot", "--quiet", "--skills", "factory",
                     "-q", prompt],
                    cwd=repo["path"], env=env, stdin=subprocess.DEVNULL,
                    stdout=output, stderr=subprocess.STDOUT)
            saved = json.loads((folder / "job.json").read_text())
            if result.returncode or saved["state"] != "done":
                raise SystemExit(f"Worker #{number} did not complete; batch halted. See {folder}/worker-output.log")
            completed.append(number)
            print(f"Completed #{number}: {saved.get('pr')}", flush=True)
        print(f"Batch complete: {len(completed)} issue(s). New arrivals wait for the next tick.")


# ---------------------------------------------------------------- resume

def resume(args):
    """Explicit operator recovery; preserve the stopped job and its work."""
    repo = load_repo(args.repo)
    slug = repo["repo"]
    if active_job(slug):
        raise SystemExit(f"A factory job is already active for {slug}.")
    target = job_dir(slug, args.issue) / "job.json"
    if not target.exists():
        raise SystemExit(f"No recorded factory job for {slug} #{args.issue}.")
    job = json.loads(target.read_text())
    if job["state"] != "stopped":
        raise SystemExit("Only a stopped job can be resumed.")
    if job["path"] != repo["path"]:
        raise SystemExit("The recorded clone changed; inspect it before resuming.")
    if run("git", "branch", "--show-current", cwd=job["path"]) != job["branch"]:
        raise SystemExit(f"Check out {job['branch']} before resuming.")
    job["state"] = "active"
    log(job, "Resumed by operator after blocker fixed")
    print(f"RESUMED #{job['issue']} in {slug} at {job['stage']}. Work preserved.")


# ---------------------------------------------------------------- stop

def stop(args):
    if args.repo:
        job = require_active(args.repo)
    else:
        jobs = active_jobs()
        if len(jobs) != 1:
            raise SystemExit("No job is in progress." if not jobs else
                             "Several jobs are in progress: " + ", ".join(j["repo"] for j in jobs)
                             + ". Name the repository.")
        job = jobs[0]
    job["state"] = "stopped"
    log(job, f"Stopped: {args.reason}")
    print(f"Stopped #{job['issue']} in {job['repo']} at {job['stage']}. "
          f"{job['branch']} is left as it is in {job['path']}.")


# ---------------------------------------------------------------- cron pre-check

def precheck(args):
    """Hermes cron pre-check: wake the agent only when an issue is waiting."""
    repo = load_repo(args.repo)
    busy = active_job(repo["repo"])
    if busy:
        print(f"{repo['repo']}: #{busy['issue']} is already at {busy['stage']}.")
        wake = False
    else:
        waiting = check_queue(repo)
        if waiting:
            print(f"{repo['repo']}: {len(waiting)} issue(s) labeled '{LABEL}'. Next: #{waiting[0]['number']}.")
        else:
            print(f"{repo['repo']}: no issues labeled '{LABEL}'.")
        wake = bool(waiting)
    print(json.dumps({"wakeAgent": wake}))


def install_precheck(args):
    """Write a cron pre-check for one repository into $HERMES_HOME/scripts, where cron requires it."""
    slug = load_repo(args.repo)["repo"]
    command = "dispatch" if getattr(args, "dispatch", False) else "precheck"
    prefix = "factory-dispatch" if command == "dispatch" else "factory-precheck"
    target = hermes_home() / "scripts" / f"{prefix}-{key(slug)}.py"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        f'"""Hermes cron factory {command} for {slug}."""\n'
        "import runpy\nimport sys\n\n"
        f'sys.argv = ["factory.py", {command!r}, {slug!r}]\n'
        f'runpy.run_path({str(Path(__file__).resolve())!r}, run_name="__main__")\n')
    print(f"Pre-check script: {target.name}")


# ---------------------------------------------------------------- monitor

def parse(stamp):
    return datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def clock(stamp):
    return parse(stamp).strftime("%H:%M")


def age(start, end=None):
    minutes = int(((end or datetime.now(timezone.utc)) - parse(start)).total_seconds() // 60)
    return f"{minutes}m" if minutes < 60 else f"{minutes // 60}h{minutes % 60:02d}m"


def fit(text, width):
    return text if len(text) <= width else text[:width - 3] + "..."


def stage_status(job, index):
    current = STAGES.index(job["stage"])
    stages = job["stages"]
    if job["state"] == "done" or index < current:
        if index == len(STAGES) - 1:
            return job["result"]
        return "done " + age(stages[STAGES[index]], parse(stages[STAGES[index + 1]]))
    if index == current:
        return f"working {age(stages[job['stage']])}" if job["state"] == "active" else "STOPPED"
    return ""


def diagram(job):
    boxes = [f"| {s.upper()} |" for s in STAGES]
    link = "--->"
    starts, x = [], 1
    for box in boxes:
        starts.append(x)
        x += len(box) + len(link)
    border = " " + (" " * len(link)).join("+" + "-" * (len(b) - 2) + "+" for b in boxes)
    status = [" "] * (x + 10)
    for index, box in enumerate(boxes):
        word = stage_status(job, index)
        left = max(starts[index] + (len(box) - len(word)) // 2, 0)
        status[left:left + len(word)] = word
    lines = [border, " " + link.join(boxes), border, "".join(status).rstrip()]
    if job["state"] == "active":
        index = STAGES.index(job["stage"])
        centre = starts[index] + len(boxes[index]) // 2
        lines += [" " * centre + "^", " " * (centre - 3) + "HERMES"]
    return lines


def card(job, heading):
    lines = [f" {heading}",
             f" {job['repo']}  #{job['issue']}  " + fit(job["title"], WIDTH - len(job["repo"]) - 10),
             f" {job['branch']}  |  started {clock(job['started'])} UTC  |  "
             f"updated {clock(job['updated'])} UTC ({age(job['updated'])} ago)", ""]
    lines += diagram(job)
    if job["pr"]:
        lines += ["", f" PR ({job['result']}): {job['pr']}"]
    lines += ["", " Log"]
    for event in job["events"][-6:]:
        lines.append(f"  {clock(event['at'])}  {event['stage']:<9} " + fit(event["text"], WIDTH - 19))
    return lines


def monitor(_args):
    jobs = sorted(all_jobs(), key=lambda j: j["started"])
    repos = sorted((json.loads(p.read_text()) for p in state_dir().glob("repos/*.json")),
                   key=lambda r: r["repo"])
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [f" SOFTWARE FACTORY{stamp:>{WIDTH - 17}}", " " + "=" * (WIDTH - 1)]
    if not repos:
        print("\n".join(lines + ["", " No repositories yet. Add one with `/factory add OWNER/REPO`."]))
        return
    active = [j for j in jobs if j["state"] == "active"]
    for job in active:
        lines += [""] + card(job, "NOW BUILDING")
    if not active:
        lines += ["", " IDLE: no issue in progress."]
        if jobs:
            lines += [""] + card(jobs[-1], "LAST JOB")
    for repo in repos:
        checked = (f"checked {clock(repo['checked'])} UTC, {age(repo['checked'])} ago"
                   if repo["checked"] else "not checked yet")
        lines += ["", f" Queue  {repo['repo']}  ({checked})"]
        lines += [f"  #{i['number']:<5} " + fit(i["title"], WIDTH - 9) for i in repo["queue"]] or ["  empty"]
    finished = list(reversed([j for j in jobs if j["state"] != "active"]))[:5]
    if finished:
        lines += ["", " Finished"]
        for job in finished:
            outcome = f"{job['result']:<6} {job['pr']}" if job["pr"] else f"stopped at {job['stage']}"
            lines.append(f"  {job['repo']} #{job['issue']:<5} {outcome}")
    print("\n".join(lines))


# ---------------------------------------------------------------- CLI

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("add", help="find or clone a repository, check push access and register it")
    p.add_argument("repo")
    p.add_argument("--path", help="use this clone when several are found")
    p.set_defaults(func=add)

    p = sub.add_parser("dispatch", help="drain queued issues using a fresh worker session for each")
    p.add_argument("repo")
    p.set_defaults(func=dispatch)

    p = sub.add_parser("start", help="pick the oldest queued issue and open its job at ingest")
    p.add_argument("repo")
    p.set_defaults(func=start)

    p = sub.add_parser("stage", help="move the job to its next stage")
    p.add_argument("repo")
    p.add_argument("name", choices=STAGES[1:-1])
    p.add_argument("note", nargs="?")
    p.set_defaults(func=stage)

    p = sub.add_parser("note", help="record one line of progress")
    p.add_argument("repo")
    p.add_argument("text")
    p.set_defaults(func=note)

    p = sub.add_parser("open-pr", help="push the branch and open the pull request")
    p.add_argument("repo")
    p.add_argument("--body-file", required=True)
    p.add_argument("--draft", action="store_true")
    p.set_defaults(func=open_pr)

    p = sub.add_parser("resume", help="explicitly resume a stopped job without changing its work")
    p.add_argument("repo")
    p.add_argument("issue", type=int)
    p.set_defaults(func=resume)

    p = sub.add_parser("stop", help="end the job in progress without a pull request")
    p.add_argument("repo", nargs="?")
    p.add_argument("--reason", required=True)
    p.set_defaults(func=stop)

    sub.add_parser("monitor", help="draw the factory as ASCII").set_defaults(func=monitor)

    p = sub.add_parser("precheck", help="cron pre-check: is an issue waiting?")
    p.add_argument("repo")
    p.set_defaults(func=precheck)

    p = sub.add_parser("install-precheck", help="write a repository's cron pre-check script")
    p.add_argument("repo")
    p.add_argument("--dispatch", action="store_true", help="install a script-only batch dispatcher instead")
    p.set_defaults(func=install_precheck)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
