# Self-hosted factory server

Run the factory on a server instead of your laptop. GitHub sends a webhook when
an issue gets the `factory` label; the server runs Claude Code headless against
its own checkout of your repository and the job ends as a pull request, as it
does locally. No terminal has to stay open.

The pipeline, agents and scripts are the same ones you run locally. The server
only decides *when* to run `/factory run`.

## How it works

```
GitHub webhook ──► POST /webhook ── signature check, answers 202 at once
                        │
                        ▼ wakes the one worker (events during a run coalesce)
                 sync the checkout with origin/<base>
                 apply /factory feedback | reject comments (job script, stdin)
                 factory/bin/job queue ── nothing startable → done, Claude never starts
                        │ new | resume
                        ▼
                 claude -p "/factory run"      repeats while jobs are startable
```

| Webhook | What the server does |
|---|---|
| `issues` labeled `factory`, or a labeled issue reopened | starts a run |
| `issue_comment` on an open labeled issue | starts a run: it may answer a `needs-info` question |
| `issue_comment` `/factory run`, `/factory feedback <text>`, `/factory reject <reason>` | works on the issue or its PR; feedback and reject are applied only when GitHub reports write or admin permission for the commenter |
| `pull_request` merged from a `factory/*` branch | starts a run: a slot is free |
| anything else, another repository, the factory's own comments | ignored |

The server never judges an issue. `factory/bin/job queue` decides what starts,
so a webhook that changes nothing costs one `gh` call and no tokens. On start
it runs the queue once, which resumes whatever a restart interrupted.

## Before you start

1. Install the factory in your repository with [`INSTALL.md`](../INSTALL.md)
   and push it to the default branch.
2. Make sure `factory/checks.sh` can run in the container. The image has Python
   3.13, git and `gh`. Add your toolchain to the [`Dockerfile`](Dockerfile)
   where it says so.
3. Have a host with Docker that GitHub can reach over HTTPS.

## Deploy

```bash
cd server
cp .env.example .env        # fill it in; see the comments in the file
docker compose up -d --build
```

That serves plain HTTP on `127.0.0.1:8080` for your own reverse proxy. To let
Caddy fetch a certificate and serve HTTPS itself, point your domain at the host,
set `DOMAIN` in `.env` and run:

```bash
docker compose --profile tls up -d --build
```

Then add the webhook, with the same secret as in `.env`:

```bash
gh api repos/OWNER/REPO/hooks -f name=web -F active=true \
  -f 'events[]=issues' -f 'events[]=issue_comment' -f 'events[]=pull_request' \
  -f config[url]=https://YOUR-DOMAIN/webhook \
  -f config[content_type]=json \
  -f config[secret]=YOUR-WEBHOOK-SECRET
```

GitHub sends a `ping`; the delivery should show a 202. Label an issue
`factory` and watch `docker compose logs -f factory`.

## Settings

| Variable | |
|---|---|
| `GITHUB_REPO` | required. `owner/name`. One server builds one repository. |
| `GH_TOKEN` | required. Fine-grained token for that repository: read and write on Contents, Issues and Pull requests. |
| `WEBHOOK_SECRET` | required. Unsigned or wrongly signed requests get a 401. |
| `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` | one is required. A token from `claude setup-token` runs on your plan. |
| `DASHBOARD_PASSWORD` | serves the dashboard at `/dashboard/` behind basic auth. Unset, it is off. |
| `DOMAIN` | for the `tls` profile. |
| `FACTORY_RUN_TIMEOUT` | seconds per headless run, default 10800. |
| `FACTORY_CLAUDE_ARGS` | flags for `claude -p "/factory run"`. |
| `GIT_USER_NAME`, `GIT_USER_EMAIL` | commit identity. Defaults to the token's user and its GitHub noreply address. |

Everything that has to survive a restart is on the `/data` volume: the checkout
with `factory/jobs/` and `.worktrees/`, Claude Code's transcripts (the cost
figures come from them) and one log per headless run in `/data/logs/`.

## Talking to it

There is no `/factory <anything>` prompt on a server. Comment instead, on the
issue or on its PR:

```
/factory feedback Use the existing Button component, not a new one.
/factory reject We decided not to build this.
/factory run
```

Your words go to `factory/bin/job feedback` or `reject` on stdin, never into a
prompt. If the job script refuses, for example because the job isn't waiting on
a human, the server says so in a comment. Merging a PR on GitHub still approves
it.

## Safety

- The container runs agent-written code and your checks with `GH_TOKEN` and the
  Claude credential in its environment. Scope the token to the one repository
  and give the host nothing else worth taking.
- By default the headless session may use Bash, the file tools and subagents
  without asking. Nobody is there to approve a prompt, so anything outside that
  list is denied.
- The trust boundary is unchanged: only people with triage or write access can
  add the `factory` label. Feedback and reject need write permission, which the
  server asks GitHub for per comment.
- The approver can still merge with no human looking. Start with
  `concurrency: 1`, and protect the base branch if you want a required review.
- One headless run is capped by `FACTORY_RUN_TIMEOUT`. After two runs in a row
  that change no job, the server stops until the next webhook.

## Limits

- One repository per server.
- The UX and UI reviewers need the `agent-browser` CLI and a browser, which the
  image doesn't include. Add them, or expect those reviews to fail on UI work.
- A run that is in progress when the container stops is resumed from its
  stage's start on the next boot, so that stage's tokens are spent again.

## Tests

```bash
cd server && python3 -m unittest -v
```

They cover the signature check, which events start a run, the single worker and
the dashboard's password, with stubs for GitHub and Claude.
