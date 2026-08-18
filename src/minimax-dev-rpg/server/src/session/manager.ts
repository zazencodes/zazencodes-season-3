import type {
  AgentEvent,
  CombatTick,
  Issue,
  Monster,
  SessionOutcome,
  SessionStatus,
  SessionSummary,
} from "@minimax-dev-rpg/protocol";
import type { AgentAdapter, AgentSessionHandle } from "../agent/types.js";
import { newId } from "../util/ids.js";
import { CombatTranslator } from "./translator.js";

export interface SessionEventSink {
  /** Called for every raw agent event. */
  onAgentEvent(sessionId: string, event: AgentEvent): void;
  /** Called for every pre-translated combat tick. */
  onCombatTick(tick: CombatTick): void;
  /** Called when a session ends (any terminal outcome). */
  onSessionEnded(sessionId: string, outcome: SessionOutcome, summary: string): void;
  /** Called when a monster is defeated. */
  onMonsterDefeated(monsterId: string): void;
  /** Called when the player takes damage and may have died. */
  onPlayerDamaged(monsterId: string | null, amount: number): void;
}

const LOG_CAP = 40;

/**
 * One in-flight agent session. Wraps an AgentAdapter handle, drives the
 * CombatTranslator, and emits everything via the sink. The SessionManager
 * owns the lifecycle; this class owns the per-session state.
 */
export class AgentSession {
  readonly id: string;
  readonly issue: Issue;
  readonly monster: Monster;
  private readonly agent: AgentAdapter;
  private readonly sink: SessionEventSink;
  private readonly translator: CombatTranslator;
  private handle: AgentSessionHandle;
  status: SessionStatus = "active";
  private events: AgentEvent[] = [];
  private monsterDefeatedEmitted = false;

  constructor(args: {
    id?: string;
    issue: Issue;
    monster: Monster;
    agent: AgentAdapter;
    sink: SessionEventSink;
  }) {
    this.id = args.id ?? newId();
    this.issue = args.issue;
    this.monster = args.monster;
    this.agent = args.agent;
    this.sink = args.sink;
    this.translator = new CombatTranslator(this.id, this.issue.number);
    this.handle = this.agent.startSession(this.issue, (event) => this.onEvent(event));
    this.handle.done.then(({ outcome, summary }) => this.finish(outcome, summary));
  }

  private onEvent(event: AgentEvent) {
    this.events.push(event);
    if (this.events.length > LOG_CAP) this.events.shift();
    this.sink.onAgentEvent(this.id, event);
    const ticks = this.translator.translate(event);
    for (const tick of ticks) this.sink.onCombatTick(tick);
    if (
      !this.monsterDefeatedEmitted &&
      (event.kind === "pr.merged" || event.kind === "issue.closed")
    ) {
      this.monsterDefeatedEmitted = true;
      this.sink.onMonsterDefeated(this.monster.id);
    }
  }

  private finish(outcome: SessionOutcome, summary: string) {
    if (this.status !== "active") return;
    this.status = outcome;
    if (outcome === "victory" && !this.monsterDefeatedEmitted) {
      this.monsterDefeatedEmitted = true;
      this.sink.onMonsterDefeated(this.monster.id);
    }
    this.sink.onSessionEnded(this.id, outcome, summary);
  }

  cancel() {
    this.handle.cancel();
  }

  toSummary(): SessionSummary {
    return {
      id: this.id,
      issueId: this.issue.id,
      monsterId: this.monster.id,
      status: this.status,
      startedAt: Date.now() - this.events.length * 800, // rough
      log: this.events,
    };
  }
}

/**
 * Top-level session registry. Tracks active sessions, prevents duplicate
 * engagements on the same monster, and exposes a `tick` for the world loop
 * (player regen, monster AI, etc.) — not used in v0.1 but the hook is here.
 */
export class SessionManager {
  private readonly sink: SessionEventSink;
  private readonly agent: AgentAdapter;
  private readonly active = new Map<string, AgentSession>();
  private readonly monsterToSession = new Map<string, string>();

  constructor(sink: SessionEventSink, agent: AgentAdapter) {
    this.sink = sink;
    this.agent = agent;
  }

  canEngage(monsterId: string): boolean {
    return !this.monsterToSession.has(monsterId);
  }

  /** Look up the session that owns a given sessionId (e.g. on a combat.tick). */
  getById(sessionId: string): AgentSession | undefined {
    return this.active.get(sessionId);
  }

  start(issue: Issue, monster: Monster): AgentSession {
    if (!this.canEngage(monster.id)) {
      throw new Error(`Monster ${monster.id} already engaged`);
    }
    const session = new AgentSession({
      issue,
      monster,
      agent: this.agent,
      sink: this.sink,
    });
    this.active.set(session.id, session);
    this.monsterToSession.set(monster.id, session.id);
    return session;
  }

  cancel(sessionId: string) {
    const session = this.active.get(sessionId);
    if (!session) return;
    session.cancel();
  }

  /** Called by the sink when a session ends to clean up. */
  reap(sessionId: string) {
    const session = this.active.get(sessionId);
    if (!session) return;
    this.active.delete(sessionId);
    this.monsterToSession.delete(session.monster.id);
  }

  list(): SessionSummary[] {
    return Array.from(this.active.values()).map((s) => s.toSummary());
  }
}
