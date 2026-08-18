# Agent adapters

The server speaks to the agent through `AgentAdapter` —
`server/src/agent/types.ts`. Two implementations exist:

| Adapter  | File                          | What it does                                                                                       |
| -------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `Mock`   | `server/src/agent/mock.ts`    | A canned ~10-event Read → Edit → Test(fail) → Edit → Test(pass) → PR sequence, ~10s total, deterministic. |
| `Pi`     | `server/src/agent/pi.ts`      | Runs [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) in-process with the `MiniMax-M3` model, then opens a real PR via the `gh` CLI. |

Selection is via env var at boot — see
[development.md](./development.md#environment-variables) for the full list.

## The contract

```ts
interface AgentAdapter {
  readonly name: string;
  startSession(issue: Issue, onEvent: (e: AgentEvent) => void): AgentSessionHandle;
}

interface AgentSessionHandle {
  readonly id: string;
  cancel(): void;
  done: Promise<{ outcome: "victory" | "defeat" | "abandoned"; summary: string }>;
}
```

`done` resolves with the session's terminal outcome. The session is
considered terminal when one of these AgentEvents is observed:

- `pr.merged` → `victory`
- `issue.closed` → `victory`
- `error` (no later success event) → `defeat`
- `cancel()` called by the player before the agent finishes → `abandoned`

## MockAgent

A deliberate, fully scripted sequence so the demo works with zero external
dependencies. Designed to:

1. Show the full spread of `AgentEvent` kinds (read, grep, edit, test,
   retry, pr).
2. Include at least one failed test run so the monster counter-attacks at
   least once.
3. End with a victory in roughly 10 seconds — slow enough to watch each
   tick, fast enough not to bore.

Sequence (`server/src/agent/mock.ts`):

```
1. message "Investigating issue #N…"
2. tool.start Read { filePath }            ─┐
3. tool.end   Read                          │  no combat effect
4. tool.start Grep { pattern: "TODO" }     ─┤
5. tool.end   Grep                          │
6. tool.start Edit { filePath }            ─┘
7. file.edited (lines +6/-2)                 ─► combat.tick slash ~8
8. tool.end   Edit
9. tool.start Bash { command: "pnpm test" }
10.tool.end   Bash result=error
11.tests.run 4 passed, 2 failed              ─► combat.tick monster→player hit
12.tool.start Read { filePath: tests/... }   ─┐ no combat effect
13.tool.end   Read                          ─┘
14.tool.start Edit                          ─┐
15.file.edited (lines +4/-3)                  ─► combat.tick slash ~7
16.tool.end   Edit                          ─┘
17.tool.start Bash { command: "pnpm test" }
18.tool.end   Bash result=ok
19.tests.run 6 passed, 0 failed               ─► combat.tick spell
20.message "Opening pull request."
21.pr.opened (URL)                            ─► combat.tick spell 15
22.pr.merged (URL)                            ─► combat.tick death + victory
23.issue.closed reason=completed
```

Total wall-clock: ~10s with ~700–1200ms gaps between steps.

## PiAgent

Runs the agent in-process using the Pi SDK (`createAgentSession`). This
is the SDK-recommended path for Node.js apps and avoids subprocess
plumbing:

- Typed event stream (`AgentSessionEvent`) — no JSON-line parsing.
- Native `session.abort()` for cancellation (no SIGTERM, no zombies).
- Same external surface as `MockAgent` — emits `AgentEvent` values, the
  rest of the server is untouched.

### SDK → AgentEvent mapping

(`handleSdkEvent` in `server/src/agent/pi.ts`)

| SDK event                          | Emitted `AgentEvent`                                                |
| ---------------------------------- | ------------------------------------------------------------------- |
| `message_update.text_end`          | `message { role: "assistant", text }` (final text of a block)       |
| `message_update.thinking_end`      | Logged to viewer only — thinking is opaque to gameplay              |
| `tool_execution_start`             | `tool.start { tool, args }` (skipped for `write` / `edit` — see below) |
| `tool_execution_end` (write/edit)  | `file.edited { path, +/-, … }` + `tool.end` (combined so diff stats line up) |
| `tool_execution_end` (other)       | `tool.end { tool, result, summary }`                                |
| `tool_execution_end` (bash)        | If command looks like a test run and result is `ok`, also `tests.run { passed, failed }` (parsed from output) |

Test-result parsing (`parseTestCounts`) handles Vitest's
`Tests  N failed | M passed` and Jest's `N failed, M passed` formats.

### Per-session state

- `pendingToolArgs` — the SDK omits `args` from `tool_execution_end` (it's
  "done with them" by then), so we stash them at `start` keyed by
  `toolCallId` and look them up at `end`.
- `streamBufs` — thinking and text blocks stream as deltas. We accumulate
  per (session, content index) and emit a single entry on `*_end` so the
  log viewer doesn't get one row per token.

### Cancellation

```ts
cancel: () => {
  if (cancelled) return;
  cancelled = true;
  if (timeoutHandle) clearTimeout(timeoutHandle);
  void session?.abort().catch(() => undefined);
  log({ sessionId: id, level: "session", text: `SESSION CANCELLED (player retreated)` });
  resolveDone({ outcome: "abandoned", summary: "Player retreated." });
}
```

`abort()` is the SDK's native cancel — it stops the model, doesn't leave a
zombie process, and resolves `waitForIdle` promptly.

### Timeouts

`AGENT_TIMEOUT_MS` (default 10 min) caps both the prompt and the idle wait.
On timeout we log, emit `error`, and call `abort()`.

### Real PR flow

After the SDK reports `agent_settled`, `openRealPullRequest` runs:

```
1.  git status --porcelain         must show changes (else error)
2.  git checkout main              (best-effort, ignored if it fails)
3.  git checkout -b agent/fix-<n>-<slug>
4.  git add -A
5.  git commit -m "Fix #N: <title>"
6.  git push -u origin <branch>
7.  gh pr create --base main --head <branch> --title ... --body ...
8.  gh pr merge <url> --squash --admin --delete-branch
9.  gh issue close <N> --reason completed
10. git checkout main && git pull --ff-only
```

Each successful step emits its corresponding `AgentEvent`
(`pr.opened`, `pr.merged`, `issue.closed`). The combat translator keys on
those events exactly the same way it does for `MockAgent`.

### Prompt

```ts
buildPrompt(issue) {
  return `Solve GitHub issue #${issue.number}: ${issue.title}
  ...
  Constraints:
  - Do NOT run any git commit / git push / gh pr create / gh issue close — the harness handles ALL of that after you finish.
  - Do NOT switch branches. Stay on the branch you start on.
  - Do NOT make unrelated changes or touch files outside the fix scope.
  ...`;
}
```

The harness deliberately forbids the agent from touching git itself — that
way we get consistent branch naming and a single place to log the
"finished" state. The agent's only job is to make the code changes and
get tests green.

## The agent log viewer

`server/src/agent/log-store.ts` keeps a 20,000-entry ring buffer of every
event any session produces. Two HTTP routes expose it:

| Route                  | What it serves                                              |
| ---------------------- | ----------------------------------------------------------- |
| `GET /agent-log`       | Static HTML page that opens an `EventSource`.               |
| `GET /agent-log/stream` | `text/event-stream`. Replays the current buffer on connect, then streams new entries. |

The server auto-opens the page on boot (set `AGENT_LOG_AUTOOPEN=0` to
disable). Designed to be a permanent right-pane tab — drag it to the right
side of your screen once and forget about it. Has level filters
(session / thinking / text / tools / files / tests / pr / errors /
system), substring search, and auto-scroll.

The viewer's design:

```
┌──────────────────────────────────────────────────────────────┐
│ ● Pi Agent Log       1.2k entries      [all] [session] ...  │  ← sticky header
├──────────────────────────────────────────────────────────────┤
│  ▶ Bash(pnpm test)                                           │  ← per-event card,
│  ───────────────────────                                       color-coded by
│  Tests: 6 passed, 0 failed                                    │  level, indented
│                                                               │
│  ✎ src/foo.ts +6/-2                                           │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│ ☑ auto-scroll  [filter substring...]  1,243 entries  [clear] │  ← footer
└──────────────────────────────────────────────────────────────┘
```

Levels:

- `session` — session lifecycle (start, end, turn boundaries)
- `thinking` — model thinking-block deltas (italic, dim)
- `text` — assistant text-block deltas
- `tool` — tool call start/end (▶ at start, ◀ at end)
- `file` — write/edit events with +/-
- `test` — parsed test runner output
- `pr` — PR opened / merged / issue closed
- `error` — failures
- `system` — server-side annotations (prompt content, branch info)

The viewer is a separate channel from the WebSocket protocol. It exists
so you can see exactly what the agent did, not just the gameplay-shaped
excerpt that flows into the game UI. Useful for prompt iteration.