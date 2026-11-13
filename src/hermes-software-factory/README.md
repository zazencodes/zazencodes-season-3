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
| `/factory run OWNER/REPO` | Builds the oldest `factory` issue into a pull request, stage by stage, in the chat |
| `/factory monitor` | Draws what the factory is doing, from any chat |
| `/factory stop [OWNER/REPO]` | Stops the job in progress |

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

```text
/factory add zazencodes/skills
```

Hermes looks for an existing clone under its data folder and your home folder.
If there isn't one, it clones the repository into `$HERMES_HOME/work/`. It
checks that your login can push, creates the `factory` label and remembers
where the clone is.

File an issue, label it `factory`, then:

```text
/factory run zazencodes/skills
```

You can watch every stage in the chat. The factory takes the oldest labeled
issue first.

## Run it on a schedule

Paste this into Hermes chat, with your repository:

```text
Run `/factory run zazencodes/skills` every 10 minutes as a Hermes cron job.
First load the factory skill and run its
`scripts/factory.py install-precheck zazencodes/skills`. Then create the job:
- name: factory zazencodes/skills
- schedule: every 10m
- skills: factory
- prompt: /factory run zazencodes/skills
- script: the pre-check script it printed
- deliver: local
Show me the job and its next run.
```

The pre-check asks GitHub for `factory` issues before each run and wakes
Hermes only when one is waiting.

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

In `/factory run`, Hermes does the judgment work with its own tools: reading
the issue and the repository's AGENTS.md, writing the spec, editing code,
running the checks and fixing failures (two attempts at most).
`scripts/factory.py` keeps the books:

| Command | Does |
| --- | --- |
| `add REPO [--path DIR]` | Finds or clones the repository, checks push access with a dry-run push, creates the `factory` label and records the clone. `--path` picks one clone when several are found. |
| `start REPO` | Picks the oldest open `factory` issue with no job yet, creates `factory/issue-<n>` from the default branch and opens the job at `ingest`. Prints `BUSY` when a job is already open, `NO WORK` when the queue is empty. |
| `stage REPO spec\|build\|validate` | Moves the job forward one stage. It refuses to skip a stage or go back. |
| `note REPO "<text>"` | Adds one line to the job's log. |
| `open-pr REPO --body-file F [--draft]` | Pushes the branch, opens the PR with `Closes #<n>`, marks the job done and switches the clone back to the default branch. |
| `stop [REPO] --reason "<text>"` | Ends the job without a PR. A run still building it stops at its next `factory.py` call. |
| `monitor` | Draws the factory as ASCII from the files below. It doesn't call GitHub. |
| `precheck REPO` | The cron pre-check. Wakes the agent only when an issue is waiting. |
| `install-precheck REPO` | Writes that repository's pre-check into `$HERMES_HOME/scripts/`, where Hermes cron requires it. |

State lives in `$HERMES_HOME/factory/`:

```text
factory/
  repos/<owner>--<repo>.json   the clone's location and the queue at the last check
  jobs/<owner>--<repo>--<issue>/
    job.json      stage, timestamps, log, branch, PR link
    spec.md       written by Hermes in the spec stage
    pr-body.md    the PR description
```

## Guardrails

- Only issues labeled `factory` run. Adding a label needs triage or write
  access to the repository.
- The factory works on one issue per repository at a time. Hermes cron also
  skips a tick while the previous run is still going.
- It pushes only `factory/issue-<n>` branches. It never force-pushes and never
  merges.
- Each issue is built once. A stopped job keeps its branch, and the factory
  doesn't retry it.
- A scheduled run can't ask questions. Hermes lists its assumptions in the PR.

## Cost

A ten-minute schedule is 144 checks a day. The pre-check runs those in Python
against GitHub, so a check with nothing queued makes no model calls. Each
issue the factory builds is one Hermes session, billed by your model provider.
To stop scheduled runs, ask Hermes to pause the cron job.
