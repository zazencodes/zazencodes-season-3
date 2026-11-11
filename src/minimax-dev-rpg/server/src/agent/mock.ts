import type { AgentEvent, Issue } from "@minimax-dev-rpg/protocol";
import type { AgentAdapter, AgentSessionHandle } from "./types.js";
import { newId } from "../util/ids.js";

/**
 * A canned sequence that mimics a Claude-style agent solving an issue. Designed
 * to be a representative spread of tool calls (read, edit, test, retry) so the
 * combat translation produces a satisfying mix of player attacks and monster
 * counter-attacks, ending in a victory.
 *
 * Timing is intentionally slow (~1.4s per step) so the player can see the
 * events translate into combat animations in real time.
 */
export class MockAgent implements AgentAdapter {
  readonly name = "mock";

  startSession(issue: Issue, onEvent: (e: AgentEvent) => void): AgentSessionHandle {
    const id = newId();
    let cancelled = false;
    let resolveDone!: (v: { outcome: "victory" | "defeat" | "abandoned"; summary: string }) => void;
    const done = new Promise<{ outcome: "victory" | "defeat" | "abandoned"; summary: string }>(
      (res) => (resolveDone = res),
    );

    const emit = (e: AgentEvent) => {
      if (cancelled) return;
      onEvent(e);
    };

    const step = (ms: number) =>
      new Promise<void>((r) => {
        const t = setTimeout(r, ms);
        // If cancelled mid-wait we resolve immediately; events are gated above.
        if (cancelled) clearTimeout(t);
      });

    const sequence = async () => {
      try {
        const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32);
        const file = `src/${slug}.ts`;

        // Read the relevant code
        emit({ kind: "message", role: "assistant", text: `Investigating issue #${issue.number}…` });
        await step(900);
        emit({ kind: "tool.start", tool: "Read", args: { filePath: file } });
        await step(700);
        emit({ kind: "tool.end", tool: "Read", result: "ok", summary: file });

        emit({ kind: "tool.start", tool: "Grep", args: { pattern: "TODO" } });
        await step(600);
        emit({ kind: "tool.end", tool: "Grep", result: "ok", summary: "3 matches" });

        // First attempt at a fix
        emit({ kind: "tool.start", tool: "Edit", args: { filePath: file } });
        await step(900);
        emit({
          kind: "file.edited",
          path: file,
          linesAdded: 6,
          linesRemoved: 2,
        });
        emit({ kind: "tool.end", tool: "Edit", result: "ok", summary: "applied" });

        // First test run — fails, monster counter-attacks
        emit({ kind: "tool.start", tool: "Bash", args: { command: "pnpm test" } });
        await step(1200);
        emit({ kind: "tool.end", tool: "Bash", result: "error", summary: "tests failed" });
        emit({ kind: "tests.run", passed: 4, failed: 2 });
        await step(700);

        // Read the failing test
        emit({ kind: "tool.start", tool: "Read", args: { filePath: `tests/${slug}.test.ts` } });
        await step(700);
        emit({ kind: "tool.end", tool: "Read", result: "ok", summary: "failing assertion located" });

        // Refine
        emit({ kind: "tool.start", tool: "Edit", args: { filePath: file } });
        await step(900);
        emit({
          kind: "file.edited",
          path: file,
          linesAdded: 4,
          linesRemoved: 3,
        });
        emit({ kind: "tool.end", tool: "Edit", result: "ok", summary: "refined" });

        // Second test run — passes, big player hit
        emit({ kind: "tool.start", tool: "Bash", args: { command: "pnpm test" } });
        await step(1200);
        emit({ kind: "tool.end", tool: "Bash", result: "ok", summary: "all tests pass" });
        emit({ kind: "tests.run", passed: 6, failed: 0 });
        await step(700);

        // Open the PR — big finishing move
        emit({ kind: "message", role: "assistant", text: "Opening pull request." });
        emit({
          kind: "pr.opened",
          url: `https://github.com/acme/web/pull/${issue.number + 100}`,
          title: `Fix #${issue.number}: ${issue.title}`,
        });
        await step(900);
        emit({ kind: "pr.merged", url: `https://github.com/acme/web/pull/${issue.number + 100}` });
        emit({ kind: "issue.closed", reason: "completed" });
        await step(400);

        if (!cancelled) {
          resolveDone({ outcome: "victory", summary: `Closed issue #${issue.number} via PR.` });
        }
      } catch (err) {
        if (!cancelled) {
          emit({ kind: "error", message: (err as Error).message });
          resolveDone({ outcome: "defeat", summary: "Agent crashed." });
        }
      }
    };

    // Fire and forget — caller awaits `done`.
    void sequence();

    return {
      id,
      cancel: () => {
        cancelled = true;
        resolveDone({ outcome: "abandoned", summary: "Player retreated." });
      },
      done,
    };
  }
}
