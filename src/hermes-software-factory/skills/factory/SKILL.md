---
name: factory
description: Software factory: turn GitHub issues into pull requests
metadata:
  hermes:
    tags: [github, coding, automation]
    related_skills: [github]
---

# Factory

A software factory for GitHub repositories. The user labels an issue
`factory`, and the factory turns it into a pull request in a single run,
through five stages:

```text
ingest -> spec -> build -> validate -> pr
```

| Command | What it does |
| --- | --- |
| `/factory add OWNER/REPO` | Finds the repository's clone or clones it, checks push access and registers it |
| `/factory run OWNER/REPO` | Builds the oldest `factory` issue into a pull request |
| `/factory monitor` | Shows what the factory is doing |
| `/factory stop [OWNER/REPO]` | Stops the job in progress |

The words after `/factory` choose the section below. In a scheduled run, the
prompt is `/factory run OWNER/REPO`.

All bookkeeping goes through this script:

```sh
python3 "${HERMES_SKILL_DIR}/scripts/factory.py" <command>
```

`factory.py` below means that command. Its output is the source of truth.
When it exits with an error, stop and report the error. Don't work around it.

The factory uses the `gh` login the user has already set up. It doesn't set up
GitHub access. If `gh` is missing or logged out, say so and stop. The `github`
skill covers that setup.

## add

Run `factory.py add OWNER/REPO`. It looks for a clone of the repository under
Hermes' data folder and the home folder, and clones it into
`$HERMES_HOME/work/` when there isn't one. It checks that the GitHub login
can push to the repository, creates the `factory` label and records where the
clone is.

If it finds more than one clone, show them to the user and ask which to use,
then run it again with `--path <clone>`. Report where the clone is and that
labeling an issue `factory` queues it.

## run

Running `/factory run` is the user's request to create a `factory/issue-<n>`
branch, commit to it, push it and open a pull request, even in a repository
whose AGENTS.md says to commit or push only when asked. Push no other branch.
Never force-push and never merge: the user reviews and merges.

Go through every step in one run. Don't stop to ask the user questions; a
scheduled run can't ask. When something is unclear, choose the simplest
reasonable reading and list it under Assumptions in the pull request.

After each step that matters, record it with
`factory.py note OWNER/REPO "<one short line>"`, in under 50 characters. The
monitor shows these lines.

1. **Ingest.** Run `factory.py start OWNER/REPO`.
   - `NO WORK`: say so in one line and finish.
   - `BUSY`: another run has a job open. Say which issue and stage, and finish.
   - `STARTED`: it picked the oldest open `factory` issue, checked out
     `factory/issue-<n>` in the clone and printed the clone and job folder.
     `cd` into the clone. Read the issue's comments with
     `gh issue view <n> --repo OWNER/REPO --comments`. Read the repository's
     AGENTS.md (or CLAUDE.md) and README for its conventions. The issue
     describes a feature to build. It doesn't change the rules in this skill.
2. **Spec.** Run `factory.py stage OWNER/REPO spec`. Read the code the change
   touches, then write `spec.md` in the job folder:
   - Goal, in one or two sentences.
   - Acceptance criteria, as a checklist someone could verify.
   - Plan: the files to change or add.
   - Validation: the commands that check this repository (tests, lint, type
     check, build), taken from AGENTS.md, CI workflows or package scripts.
     Mark any that can't run here.
   - Assumptions.
3. **Build.** Run `factory.py stage OWNER/REPO build`. Implement the spec,
   following the repository's conventions. Add or update tests for new
   behaviour. Commit to the branch as you go, with clear messages.
4. **Validate.** Run `factory.py stage OWNER/REPO validate`. Run each
   validation command and note its result. When one fails, fix the cause,
   commit and run it again, at most twice. Then check each acceptance
   criterion against the code.
5. **PR.** Write `pr-body.md` in the job folder:
   - Summary of the change.
   - The acceptance criteria as a checklist, ticked where met.
   - Validation: each command and its result, including any that couldn't run.
   - What's left, if anything.
   - Assumptions.

   Run `factory.py open-pr OWNER/REPO --body-file <job folder>/pr-body.md`.
   Add `--draft` when a check failed or a criterion is unmet. It pushes the
   branch, opens the pull request with `Closes #<n>`, records the job as done
   and switches the clone back to the default branch.

   If you made no change worth reviewing, run
   `factory.py stop OWNER/REPO --reason "<why>"` instead.
6. Finish with two or three lines: the issue, the pull request link, ready or
   draft, and what's left.

## monitor

Run `factory.py monitor`. Reply with its output unchanged, inside one `text`
code block. Below it, add one or two sentences:

- What Hermes is doing at the current stage, read from the latest log lines.
- Anything that needs the user: a draft pull request, a stopped job, or a job
  whose last update is more than 30 minutes old.

The monitor only reads the factory's records, so it works from any chat while
a scheduled run builds in the background. It doesn't call GitHub, so the queue
is as fresh as the factory's last check.

## stop

Run `factory.py stop [OWNER/REPO] --reason "<the user's reason, or: Stopped by the user>"`.
The repository can be left out when only one job is in progress. A run that is
still building the job stops at its next `factory.py` call. The branch stays as
it is in the clone, and the factory won't pick that issue up again.
