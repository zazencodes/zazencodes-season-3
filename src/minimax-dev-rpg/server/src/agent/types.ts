import type { AgentEvent, Issue } from "@minimax-dev-rpg/protocol";

/**
 * A running agent session. The adapter is responsible for streaming AgentEvent
 * values through `onEvent` and resolving `done` when the issue is solved (or
 * failing) — the SessionManager wraps this in a Monster combat encounter.
 */
export interface AgentSessionHandle {
  /** Unique id for this run. */
  readonly id: string;
  /** Cancel the agent (user retreated, player died, timeout). */
  cancel(): void;
  /** Resolves when the session has emitted its terminal event. */
  done: Promise<{ outcome: "victory" | "defeat" | "abandoned"; summary: string }>;
}

export interface AgentAdapter {
  readonly name: string;
  startSession(issue: Issue, onEvent: (e: AgentEvent) => void): AgentSessionHandle;
}
