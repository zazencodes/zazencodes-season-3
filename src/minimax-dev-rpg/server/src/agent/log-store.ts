/**
 * In-memory ring buffer of every agent event emitted by any Pi session.
 * The /agent-log HTTP route serves a live viewer page that subscribes to
 * this store; it gets the full transcript on connect and stays live as
 * new events arrive.
 *
 * This is intentionally not on disk — the goal is "watch what the agent
 * is doing right now". For a permanent per-session artifact, use
 * PiAgent.exportToHtml() instead.
 */

export type LogLevel =
  | "session"   // session start/end, turn boundaries, agent lifecycle
  | "thinking"  // model thinking-block deltas (the agent's reasoning)
  | "text"      // assistant text-block deltas (the agent's prose)
  | "tool"      // tool call start/end (bash, read, edit, write)
  | "test"      // parsed test runner output
  | "file"      // file edit (mapped from write/edit tool end)
  | "pr"        // PR opened / merged / issue closed
  | "message"   // user/assistant/system messages
  | "error"     // failures
  | "system";   // server-side annotations (prompt, branch info, etc.)

export interface LogEntry {
  /** epoch ms */
  ts: number;
  /** session id this entry belongs to; null for server-wide notes */
  sessionId: string | null;
  level: LogLevel;
  /** one-line, pre-formatted text — viewers just render this verbatim */
  text: string;
}

const CAP = 20_000;
const entries: LogEntry[] = [];
const subscribers = new Set<(e: LogEntry) => void>();

export function log(entry: Omit<LogEntry, "ts">): void {
  const e: LogEntry = { ...entry, ts: Date.now() };
  entries.push(e);
  if (entries.length > CAP) entries.splice(0, entries.length - CAP);
  for (const sub of subscribers) {
    try {
      sub(e);
    } catch {
      /* subscriber errors must not break logging */
    }
  }
}

export function snapshot(): readonly LogEntry[] {
  return entries;
}

export function subscribe(fn: (e: LogEntry) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
