import {
  ModelRuntime,
  SessionManager,
  createAgentSession,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import type { AgentEvent, Issue } from "@minimax-dev-rpg/protocol";
import type { AgentAdapter, AgentSessionHandle } from "./types.js";
import { newId } from "../util/ids.js";
import { log } from "./log-store.js";

/**
 * Real agent adapter that runs Pi (MiniMax-M3 via the `minimax` provider)
 * IN-PROCESS using `@earendil-works/pi-coding-agent`. This is the path
 * Pi's own docs recommend for Node.js apps ("If you're building a Node.js
 * application, consider using AgentSession directly instead of spawning a
 * subprocess" — docs/rpc.md).
 *
 * Why in-process over the old `--print --mode json` subprocess:
 *  - Typed event stream (`AgentSessionEvent`) — no JSON line parsing
 *  - Full thinking-block deltas stream live (the agent's reasoning)
 *  - Native abort via `session.abort()` — no SIGTERM, no zombies
 *  - `session.exportToHtml(path)` available for permanent per-session
 *    artifacts if we want them later
 *  - Same external surface (AgentEvent → combat translator) so the rest
 *    of the server is untouched
 *
 * External surface (mapped to existing AgentEvent for the game UI):
 *   tool_execution_start{bash} → tool.start{Bash, command}
 *   tool_execution_end{bash}   → tool.end{Bash, ok|error}
 *     + if command runs tests  → tests.run{passed, failed}
 *   tool_execution_end{write|edit, ok} → file.edited{path, +/-}
 *                                  + tool.end
 *   message_update.text_end    → message{assistant, text}
 *   child Pi finishes cleanly  → real PR via gh CLI → pr.opened → pr.merged
 *                                → issue.closed (real GitHub side-effects)
 *   error / non-zero / abort   → error → defeat / abandoned
 *
 * Selection: server/src/index.ts reads `AGENT_ADAPTER` (default "mock")
 * and `AGENT_WORKDIR` (default $HOME/pro/habit-cli).
 */
export class PiAgent implements AgentAdapter {
  readonly name = "pi";
  private readonly workdir: string;
  private readonly timeoutMs: number;

  constructor(opts: { workdir: string; timeoutMs?: number }) {
    this.workdir = opts.workdir;
    this.timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  }

  startSession(issue: Issue, onEvent: (e: AgentEvent) => void): AgentSessionHandle {
    const id = newId();
    let cancelled = false;
    let resolveDone!: (v: {
      outcome: "victory" | "defeat" | "abandoned";
      summary: string;
    }) => void;
    const done = new Promise<{
      outcome: "victory" | "defeat" | "abandoned";
      summary: string;
    }>((res) => (resolveDone = res));

    const emit = (e: AgentEvent) => {
      if (cancelled) return;
      onEvent(e);
    };

    let session: AgentSession | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    log({
      sessionId: id,
      level: "session",
      text: `SESSION START  issue=#${issue.number}  "${issue.title}"  workdir=${this.workdir}`,
    });

    void (async () => {
      try {
        const modelRuntime = await ModelRuntime.create();
        const { session: s } = await createAgentSession({
          cwd: this.workdir,
          sessionManager: SessionManager.inMemory(),
          modelRuntime,
        });
        session = s;

        timeoutHandle = setTimeout(() => {
          if (cancelled) return;
          log({ sessionId: id, level: "error", text: `Agent timed out after ${this.timeoutMs}ms` });
          emit({ kind: "error", message: `Agent timed out after ${this.timeoutMs}ms` });
          void session?.abort();
        }, this.timeoutMs);

        const unsubscribe = s.subscribe((evt: AgentSessionEvent) => {
          handleSdkEvent(evt, id, emit);
        });

        const prompt = buildPrompt(issue);
        log({ sessionId: id, level: "system", text: `PROMPT (${prompt.length} chars): ${oneLine(prompt)}` });
        await s.prompt(prompt);

        // waitForIdle resolves once the agent emits agent_settled (no
        // more streaming). We bound it with our own timer rather than
        // passing a timeout to the SDK.
        await new Promise<void>((resolve) => {
          const t = setTimeout(() => {
            log({ sessionId: id, level: "error", text: `Agent timed out after ${this.timeoutMs}ms — aborting` });
            void session?.abort();
            resolve();
          }, this.timeoutMs);
          void s.waitForIdle().then(() => {
            clearTimeout(t);
            resolve();
          });
        });
        clearTimeout(timeoutHandle);
        unsubscribe();

        if (cancelled) {
          log({ sessionId: id, level: "session", text: `SESSION END  outcome=abandoned` });
          resolveDone({ outcome: "abandoned", summary: "Player retreated." });
          try { s.dispose(); } catch { /* ignore */ }
          return;
        }

        // Real PR creation against the actual GitHub repo.
        log({ sessionId: id, level: "system", text: `Pi settled — beginning real PR flow` });
        try {
          const pr = await openRealPullRequest(issue, this.workdir, id, emit);
          log({
            sessionId: id,
            level: "session",
            text: `SESSION END  outcome=victory  pr=${pr.url}`,
          });
          resolveDone({
            outcome: "victory",
            summary: `Closed issue #${issue.number} via PR ${pr.url}`,
          });
        } catch (err) {
          log({
            sessionId: id,
            level: "error",
            text: `PR creation failed: ${(err as Error).message}`,
          });
          emit({
            kind: "error",
            message: `Real PR creation failed: ${(err as Error).message}`,
          });
          log({ sessionId: id, level: "session", text: `SESSION END  outcome=defeat` });
          resolveDone({ outcome: "defeat", summary: "PR creation failed." });
        }

        try { s.dispose(); } catch { /* ignore */ }
      } catch (err) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        log({ sessionId: id, level: "error", text: `Agent crashed: ${(err as Error).message}` });
        emit({ kind: "error", message: `Agent crashed: ${(err as Error).message}` });
        log({ sessionId: id, level: "session", text: `SESSION END  outcome=defeat` });
        resolveDone({ outcome: "defeat", summary: "Agent crashed." });
      }
    })();

    return {
      id,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        void session?.abort().catch(() => undefined);
        log({ sessionId: id, level: "session", text: `SESSION CANCELLED (player retreated)` });
        resolveDone({ outcome: "abandoned", summary: "Player retreated." });
      },
      done,
    };
  }
}

/* ────────────────────────────  prompt  ──────────────────────────── */

function buildPrompt(issue: Issue): string {
  const body = issue.body?.trim() || "(no description provided)";
  return [
    `Solve GitHub issue #${issue.number}: ${issue.title}`,
    ``,
    `Description:`,
    body,
    ``,
    `The current working directory is the repository for this issue.`,
    ``,
    `Steps:`,
    `1. Explore the repo to find the relevant code (ls, find, read).`,
    `2. Make the code changes needed to fix the issue.`,
    `3. Run the test suite to verify your fix passes.`,
    `4. Reply with the single word DONE once tests pass.`,
    ``,
    `Constraints:`,
    `- Do NOT run any git commit / git push / gh pr create / gh issue close — the harness handles ALL of that after you finish.`,
    `- Do NOT switch branches. Stay on the branch you start on.`,
    `- Do NOT make unrelated changes or touch files outside the fix scope.`,
    `- Be efficient. The player is fighting this issue in real time.`,
    `- If you discover the issue is ambiguous or unfixable, explain briefly and stop.`,
  ].join("\n");
}

/* ────────────────────────  SDK event mapping  ──────────────────────── */

/**
 * Per-call state. The SDK's `tool_execution_end` event deliberately
 * omits `args` (they're considered "done with them"), so we stash the
 * args at start and look them up by toolCallId at end.
 */
const pendingToolArgs = new Map<string, { toolName: string; args: Record<string, unknown> }>();

/**
 * Per-session buffers for streaming content. Thinking/text deltas come in
 * one-or-few tokens at a time; emitting each as its own log entry floods
 * the viewer with single-word rows. We accumulate per (session, content
 * index) and emit a single full-content entry on `*_end`. A short
 * "thinking… / writing…" preview goes out at `*_start` so the viewer
 * still sees activity while a block streams.
 */
interface StreamBuf {
  text: string;
  started: boolean;
}
const streamBufs = new Map<string, StreamBuf>();
const bufKey = (sessionId: string, idx: number, kind: "t" | "x") =>
  `${sessionId}:${kind}:${idx}`;

function handleSdkEvent(
  evt: AgentSessionEvent,
  sessionId: string,
  emit: (e: AgentEvent) => void,
): void {
  switch (evt.type) {
    case "message_update": {
      const inner = evt.assistantMessageEvent;
      // contentIndex exists on every sub-event except the initial
      // `{type:"start"}`. Default to 0 (the first block in a message).
      const idx = "contentIndex" in inner ? (inner.contentIndex as number) : 0;
      switch (inner.type) {
        case "thinking_start": {
          streamBufs.set(bufKey(sessionId, idx, "t"), { text: "", started: true });
          log({ sessionId, level: "thinking", text: `💭 thinking…` });
          break;
        }
        case "thinking_delta": {
          if (!inner.delta) break;
          const k = bufKey(sessionId, idx, "t");
          const buf = streamBufs.get(k) ?? { text: "", started: true };
          buf.text += inner.delta;
          streamBufs.set(k, buf);
          break;
        }
        case "thinking_end": {
          const k = bufKey(sessionId, idx, "t");
          const buf = streamBufs.get(k);
          streamBufs.delete(k);
          const text = inner.content ?? buf?.text ?? "";
          if (text.trim()) log({ sessionId, level: "thinking", text });
          break;
        }
        case "text_start": {
          streamBufs.set(bufKey(sessionId, idx, "x"), { text: "", started: true });
          log({ sessionId, level: "text", text: `✎ writing…` });
          break;
        }
        case "text_delta": {
          if (!inner.delta) break;
          const k = bufKey(sessionId, idx, "x");
          const buf = streamBufs.get(k) ?? { text: "", started: true };
          buf.text += inner.delta;
          streamBufs.set(k, buf);
          break;
        }
        case "text_end": {
          const k = bufKey(sessionId, idx, "x");
          const buf = streamBufs.get(k);
          streamBufs.delete(k);
          const text = inner.content ?? buf?.text ?? "";
          if (text.trim()) {
            log({ sessionId, level: "text", text });
            emit({ kind: "message", role: "assistant", text });
          }
          break;
        }
        // toolcall_* sub-events are not surfaced — tool_execution_start/end
        // give us the authoritative run record below.
      }
      break;
    }

    case "tool_execution_start": {
      const tool = evt.toolName ?? "unknown";
      const args = (evt.args ?? {}) as Record<string, unknown>;
      pendingToolArgs.set(evt.toolCallId, { toolName: tool, args });
      log({
        sessionId,
        level: "tool",
        text: `▶ ${tool}(${summarizeArgs(args)})`,
      });
      // Skip tool.start for write/edit — they emit a combined file.edited
      // + tool.end so diff stats line up. Read/bash/etc. emit tool.start.
      if (tool !== "write" && tool !== "edit") {
        emit({ kind: "tool.start", tool, args });
      }
      break;
    }

    case "tool_execution_end": {
      const tool = evt.toolName ?? "unknown";
      const stashed = pendingToolArgs.get(evt.toolCallId);
      const args = stashed?.args ?? {};
      pendingToolArgs.delete(evt.toolCallId);
      const isError = !!evt.isError;
      const resultText = extractText(evt.result);
      const summary = oneLine(resultText).slice(0, 120);
      log({
        sessionId,
        level: "tool",
        text: `◀ ${tool} ${isError ? "ERROR" : "ok"} ${summary}`,
      });

      if (tool === "write" || tool === "edit") {
        const stats = editStats(tool, args);
        if (!isError) {
          log({
            sessionId,
            level: "file",
            text: `✎ ${String(args.path ?? "")} +${stats.added}/-${stats.removed}`,
          });
          emit({
            kind: "file.edited",
            path: String(args.path ?? ""),
            linesAdded: stats.added,
            linesRemoved: stats.removed,
          });
        }
        emit({
          kind: "tool.end",
          tool,
          result: isError ? "error" : "ok",
          summary: isError ? summary || "edit failed" : `+${stats.added}/-${stats.removed}`,
        });
      } else {
        emit({
          kind: "tool.end",
          tool,
          result: isError ? "error" : "ok",
          summary,
        });
        // Detect test runs on bash and surface as combat damage.
        if (tool === "bash" && !isError) {
          const cmd = String(args.command ?? "");
          if (looksLikeTest(cmd)) {
            const { passed, failed } = parseTestCounts(resultText);
            if (passed > 0 || failed > 0) {
              log({
                sessionId,
                level: "test",
                text: `Tests: ${passed} passed, ${failed} failed`,
              });
              emit({ kind: "tests.run", passed, failed });
            }
          }
        }
      }
      break;
    }

    case "agent_start":
      log({ sessionId, level: "session", text: `agent_start` });
      break;
    case "agent_end": {
      const m = evt.messages;
      log({
        sessionId,
        level: "session",
        text: `agent_end  willRetry=${evt.willRetry}  messages=${Array.isArray(m) ? m.length : 0}`,
      });
      break;
    }
    case "agent_settled":
      log({ sessionId, level: "session", text: `agent_settled (idle)` });
      break;
    case "turn_start":
      log({ sessionId, level: "session", text: `turn_start` });
      break;
    case "turn_end": {
      const m = evt.message as { stopReason?: string; usage?: { input?: number; output?: number } } | undefined;
      log({
        sessionId,
        level: "session",
        text: `turn_end  stopReason=${m?.stopReason ?? "?"}  in=${m?.usage?.input ?? 0}  out=${m?.usage?.output ?? 0}`,
      });
      break;
    }
    // Other SDK events (compaction_*, entry_appended, queue_update, etc.)
    // are intentionally not surfaced — they don't map to game events.
  }
}

/* ──────────────────────────────  helpers  ────────────────────────────── */

function extractText(result: { content?: Array<{ type: string; text?: string }> } | undefined): string {
  if (!result?.content) return "";
  return result.content
    .map((c) => (c.type === "text" && c.text ? c.text : ""))
    .join("")
    .trim();
}

function editStats(
  toolName: string,
  args: Record<string, unknown>,
): { added: number; removed: number } {
  if (toolName === "write") {
    const content = String(args.content ?? "");
    return { added: countLines(content), removed: 0 };
  }
  // edit: args.edits[].oldText / args.edits[].newText (Pi's shape)
  const edits = Array.isArray(args.edits) ? args.edits : [];
  let added = 0;
  let removed = 0;
  for (const e of edits) {
    if (e && typeof e === "object") {
      const edit = e as { oldText?: unknown; newText?: unknown };
      removed += countLines(String(edit.oldText ?? ""));
      added += countLines(String(edit.newText ?? ""));
    }
  }
  return { added, removed };
}

function countLines(s: string): number {
  if (s === "") return 0;
  return s.split("\n").length;
}

function looksLikeTest(cmd: string): boolean {
  return /\b(?:npm|pnpm|yarn|npx|node|vitest|jest|mocha)\b[^\n]*\btest\b|\bvitest(?:\s|$)|\bvitest\b/i.test(
    cmd,
  );
}

function parseTestCounts(output: string): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  const vitestLine = output.match(/Tests\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed/i);
  if (vitestLine) {
    failed = Number(vitestLine[1]);
    passed = Number(vitestLine[2]);
    return { passed, failed };
  }
  const vitestOnly = output.match(/Tests\s+(\d+)\s+passed/i);
  if (vitestOnly) {
    passed = Number(vitestOnly[1]);
    return { passed, failed };
  }
  const jestLine = output.match(/(\d+)\s+failed[,\s]+(\d+)\s+passed/i);
  if (jestLine) {
    failed = Number(jestLine[1]);
    passed = Number(jestLine[2]);
    return { passed, failed };
  }
  const jestOnly = output.match(/(\d+)\s+passed/i);
  if (jestOnly) {
    passed = Number(jestOnly[1]);
  }
  return { passed, failed };
}

function summarizeArgs(args: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    out.push(`${k}=${truncate(s, 80)}`);
  }
  return out.join(" ");
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function oneLine(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/* ────────────────────────  real PR creation  ──────────────────────── */

/**
 * After Pi exits cleanly (agent_settled received), take the uncommitted
 * changes in `workdir`, commit them on a per-issue branch, push, open a
 * real PR with the gh CLI, merge it, and close the issue. Emits the same
 * `pr.opened` / `pr.merged` / `issue.closed` events the combat
 * translator keys on — but with the real GitHub URLs.
 */
async function openRealPullRequest(
  issue: Issue,
  workdir: string,
  sessionId: string,
  emit: (e: AgentEvent) => void,
): Promise<{ url: string; number: number }> {
  // 1. Pi must have actually changed something.
  const status = await runCmd("git", ["status", "--porcelain"], { cwd: workdir });
  if (!status.stdout.trim()) {
    throw new Error("Pi finished but left no changes in the workdir");
  }

  // 2. Best-effort checkout of main so we branch from the tip.
  await runCmd("git", ["checkout", "main"], { cwd: workdir }).catch(() => undefined);

  // 3. Create our per-issue branch.
  const slug =
    issue.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "fix";
  const branch = `agent/fix-${issue.number}-${slug}`;
  await runCmd("git", ["checkout", "-b", branch], { cwd: workdir });

  // 4. Commit everything Pi touched.
  await runCmd("git", ["add", "-A"], { cwd: workdir });
  await runCmd(
    "git",
    ["commit", "-m", `Fix #${issue.number}: ${issue.title}\n\nAutomated by Pi (MiniMax-M3).`],
    { cwd: workdir },
  );

  // 5. Push the branch.
  await runCmd("git", ["push", "-u", "origin", branch], { cwd: workdir });

  // 6. Open the PR.
  const prCreate = await runCmd(
    "gh",
    [
      "pr", "create",
      "--base", "main",
      "--head", branch,
      "--title", `Fix #${issue.number}: ${issue.title}`,
      "--body",
        `Automatically generated by Pi agent session.\n\nResolves #${issue.number}.\n\n` +
        `Issue body:\n\n> ${(issue.body || "(no description)").replace(/\n/g, "\n> ")}`,
    ],
    { cwd: workdir },
  );
  const prUrl = prCreate.stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  if (!/^https?:\/\//.test(prUrl)) {
    throw new Error(`gh pr create did not return a URL: stdout=${prCreate.stdout} stderr=${prCreate.stderr}`);
  }
  log({ sessionId, level: "pr", text: `pr.opened  ${prUrl}  title="Fix #${issue.number}: ${issue.title}"` });
  emit({ kind: "pr.opened", url: prUrl, title: `Fix #${issue.number}: ${issue.title}` });

  // 7. Merge. --admin bypasses branch-protection reviews for the demo
  //    repo; --squash keeps history clean; --delete-branch cleans up.
  await runCmd(
    "gh",
    ["pr", "merge", prUrl, "--squash", "--admin", "--delete-branch"],
    { cwd: workdir },
  );
  log({ sessionId, level: "pr", text: `pr.merged  ${prUrl}` });
  emit({ kind: "pr.merged", url: prUrl });

  // 8. Close the issue.
  await runCmd(
    "gh",
    ["issue", "close", String(issue.number), "--reason", "completed"],
    { cwd: workdir },
  );
  log({ sessionId, level: "pr", text: `issue.closed  reason=completed` });
  emit({ kind: "issue.closed", reason: "completed" });

  // 9. Pull main so the next engagement starts from the merged tip.
  await runCmd("git", ["checkout", "main"], { cwd: workdir }).catch(() => undefined);
  await runCmd("git", ["pull", "--ff-only"], { cwd: workdir }).catch(() => undefined);

  const m = prUrl.match(/\/pull\/(\d+)/);
  return { url: prUrl, number: m ? Number(m[1]) : 0 };
}

function runCmd(
  cmd: string,
  args: string[],
  opts: { cwd: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `${cmd} ${args.join(" ")} exited ${code}: ${stderr.trim() || "<no stderr>"}`,
          ),
        );
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
