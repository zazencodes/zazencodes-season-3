# Turn Your Hermes Agent Into a Software Factory

A Hermes skill that turns GitHub issues into pull requests on its own. Label an
issue `factory`, and Hermes picks it up, writes a spec, builds it, validates it
and opens a PR. You review and merge.

```text
GitHub issue labeled `factory`
        |
        v
+--------+    +------+    +-------+    +----------+    +----+
| INGEST |--->| SPEC |--->| BUILD |--->| VALIDATE |--->| PR |
+--------+    +------+    +-------+    +----------+    +----+
                                                          |
                                                          v
                                   ready PR, or a draft PR with what's left
```

| Command | What it does |
| --- | --- |
| `/factory add OWNER/REPO` | Finds the repository's clone on the machine or clones it, checks push access and registers it |
| `/factory run OWNER/REPO` | Works through every queued `factory` issue, oldest first, each in a fresh Hermes session |
| `/factory monitor` | Draws what the factory is doing, from any chat |
| `/factory stop [OWNER/REPO]` | Stops the job in progress |
| `/factory resume OWNER/REPO ISSUE` | Picks a stopped job back up where it left off |

The factory works in any GitHub repository you can push to. It never merges.
When it can't finish an issue, it opens a draft PR that lists what's left, and
you take it from there.

## Install

You need a running Hermes with a model provider. The video uses Hostinger's
one-click **Hermes Workspace** template on a VPS, so Hermes keeps working when
your laptop is closed.

Paste this into Hermes chat:

```text
Install the factory skill:
hermes skills install zazencodes/zazencodes-season-3/src/hermes-software-factory/skills/factory --yes
```

## Connect GitHub

The factory uses the GitHub CLI (`gh`) and your login. Set this up once.
Hermes keeps `GH_TOKEN` and `GITHUB_TOKEN` out of its terminal, and the Hermes
Docker image doesn't include `gh`, so log in with a device code. Paste this
into Hermes chat:

```text
Connect GitHub for me. Download the GitHub CLI 2.97.0 Linux release from
https://github.com/cli/cli/releases into $HERMES_HOME/.local/bin. Then run
`gh auth login --hostname github.com --git-protocol https --web --insecure-storage`
in the background and show me the one-time code. When I've approved it, run
`gh auth setup-git` and set my git user.name and user.email from `gh api user`.
```

Enter the code at <https://github.com/login/device>. The login is saved in
Hermes' data folder, so chat and scheduled runs both use it, and no token
passes through the chat.

## Use it

Every prompt in this section starts with the same line. Put your GitHub
repository there, in place of `OWNER/REPO`, and the rest of the prompt refers
to it as `FACTORY_REPO`.

Add your repository to the factory:

```text
FACTORY_REPO = OWNER/REPO   # <- your GitHub repository, e.g. zazencodes/skills

Load the factory skill and run `/factory add FACTORY_REPO`.
```

Hermes looks for an existing clone under its data folder and your home folder.
If there isn't one, it clones the repository into `$HERMES_HOME/work/`. It
checks that your login can push, creates the `factory` label and remembers
where the clone is.

File an issue, label it `factory`, then:

```text
FACTORY_REPO = OWNER/REPO   # <- your GitHub repository, e.g. zazencodes/skills

Load the factory skill and run `/factory run FACTORY_REPO`.
```

Hermes works through every waiting `factory` issue, oldest first. Each issue
gets its own fresh Hermes session and its own pull request. Issues you file
while it's running wait for the next run. Use `/factory monitor` (below) to see
which stage it's on.

## Run it on a schedule

```text
FACTORY_REPO = OWNER/REPO   # <- your GitHub repository, e.g. zazencodes/skills

Run `/factory run FACTORY_REPO` every 10 minutes as a Hermes cron job.
Write the real repository name into the job wherever FACTORY_REPO appears.
First load the factory skill and run its
`scripts/factory.py install-precheck FACTORY_REPO --dispatch`. Then create the job:
- name: factory FACTORY_REPO
- schedule: every 10m
- skills: factory
- prompt: /factory run FACTORY_REPO
- script: the dispatcher script it printed
- no_agent: true
- deliver: local
Show me the job and its next run.
```

Each tick runs the dispatcher script directly. It asks GitHub for `factory`
issues and starts a Hermes session only for the ones waiting.

A scheduled run happens in the background. To see it, open another chat:

```text
/factory monitor
```

```text
 NOW BUILDING
 zazencodes/skills  #12  Add a pattern gallery to ascii-viz
 factory/issue-12  |  started 14:02 UTC  |  updated 14:09 UTC (1m ago)

 +--------+    +------+    +-------+    +----------+    +----+
 | INGEST |--->| SPEC |--->| BUILD |--->| VALIDATE |--->| PR |
 +--------+    +------+    +-------+    +----------+    +----+
  done 1m      done 3m      done 3m      working 2m
                                              ^
                                           HERMES
```

Below the diagram it lists the job's latest log lines, the queue and finished
PRs.

## How it works

`/factory run` runs `factory.py dispatch`. It claims each waiting issue in
turn and starts a fresh Hermes worker session for it. In that session, Hermes
does the judgment work with its own tools: reading the issue and the
repository's AGENTS.md, writing the spec, editing code, running the checks and
fixing failures (two attempts at most). A worker that stops or fails halts the
batch, so its work is kept. `scripts/factory.py` keeps the books:

| Command | Does |
| --- | --- |
| `add REPO [--path DIR]` | Finds or clones the repository, checks push access with a dry-run push, creates the `factory` label and records the clone. `--path` picks one clone when several are found. |
| `dispatch REPO` | Works through the queue: claims each waiting issue with `start` and runs a separate `hermes chat --oneshot` worker for it, one at a time. Halts when a worker doesn't finish. A lock stops two dispatchers overlapping. |
| `start REPO` | Picks the oldest open `factory` issue with no job yet, creates `factory/issue-<n>` from the default branch and opens the job at `ingest`. Prints `BUSY` when a job is already open, `NO WORK` when the queue is empty. |
| `stage REPO spec\|build\|validate` | Moves the job forward one stage. It refuses to skip a stage or go back. |
| `note REPO "<text>"` | Adds one line to the job's log. |
| `open-pr REPO --body-file F [--draft]` | Pushes the branch, opens the PR with `Closes #<n>`, marks the job done and switches the clone back to the default branch. |
| `resume REPO ISSUE` | Reopens a stopped job at its saved stage, keeping its branch and changes. |
| `stop [REPO] --reason "<text>"` | Ends the job without a PR. A run still building it stops at its next `factory.py` call. |
| `monitor` | Draws the factory as ASCII from the files below. It doesn't call GitHub. |
| `precheck REPO` | Reports whether an issue is waiting, as Hermes cron pre-check JSON. |
| `install-precheck REPO [--dispatch]` | Writes a cron script for the repository into `$HERMES_HOME/scripts/`, where Hermes cron requires it. With `--dispatch` it runs `dispatch`, which is what the schedule above uses. |

State lives in `$HERMES_HOME/factory/`:

```text
factory/
  repos/<owner>--<repo>.json   the clone's location and the queue at the last check
  jobs/<owner>--<repo>--<issue>/
    job.json      stage, timestamps, log, branch, PR link
    spec.md       written by Hermes in the spec stage
    pr-body.md    the PR description
    worker-output.log   the worker session's output
```

## Guardrails

- Only issues labeled `factory` run. Adding a label needs triage or write
  access to the repository.
- The factory works on one issue per repository at a time, each in a fresh
  Hermes session. Hermes cron also skips a tick while the previous run is
  still going.
- It pushes only `factory/issue-<n>` branches. It never force-pushes and never
  merges.
- Each issue is built once. A stopped job keeps its branch, and the factory
  doesn't retry it until you run `/factory resume`.
- A scheduled run can't ask questions. Hermes lists its assumptions in the PR.

## Cost

A ten-minute schedule is 144 checks a day. The dispatcher runs those in
Python against GitHub, so a check with nothing queued makes no model calls. Each
issue the factory builds is one Hermes session, billed by your model provider.
To stop scheduled runs, ask Hermes to pause the cron job.
