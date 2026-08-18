import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import {
  C2SEventSchema,
  type AgentEvent,
  type CombatTick,
  type S2CEvent,
  type SessionOutcome,
} from "@minimax-dev-rpg/protocol";
import { newId } from "../util/ids.js";
import type { World } from "../state/world.js";
import { SessionManager, type SessionEventSink } from "../session/manager.js";
import type { AgentAdapter } from "../agent/types.js";

interface Client {
  id: string;
  socket: WebSocket;
}

/**
 * Wires up the WebSocket server, parses incoming C2S events, and drives the
 * SessionManager. The sink pattern means the WS layer never reaches into
 * session internals — it just receives callbacks.
 */
export class WsHub implements SessionEventSink {
  private wss: WebSocketServer;
  private clients = new Set<Client>();
  private sessions: SessionManager;

  constructor(
    server: Server,
    private readonly world: World,
    agent: AgentAdapter,
  ) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.sessions = new SessionManager(this, agent);
    this.wss.on("connection", (socket) => this.onConnection(socket));
  }

  private onConnection(socket: WebSocket) {
    const client: Client = { id: newId(), socket };
    this.clients.add(client);
    socket.on("message", (raw) => this.onMessage(client, raw.toString()));
    socket.on("close", () => this.clients.delete(client));
    socket.on("error", () => this.clients.delete(client));

    // Reset player position and randomize monster positions on client connection/reload
    this.world.reset();

    this.send(client, {
      kind: "hello",
      player: this.world.player,
      issues: this.world.getIssues(),
      monsters: this.world.getMonsters(),
      sessions: this.sessions.list(),
    });
  }

  private onMessage(client: Client, raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.send(client, { kind: "error", message: "Malformed JSON" });
      return;
    }
    const event = C2SEventSchema.safeParse(parsed);
    if (!event.success) {
      this.send(client, { kind: "error", message: event.error.message });
      return;
    }
    this.handle(client, event.data);
  }

  private handle(client: Client, event: import("@minimax-dev-rpg/protocol").C2SEvent) {
    switch (event.kind) {
      case "ping":
        this.send(client, { kind: "pong", ts: event.ts });
        return;
      case "engage": {
        const issue = this.world.getIssue(event.issueId);
        if (!issue) {
          this.send(client, { kind: "error", message: `Unknown issue: ${event.issueId}` });
          return;
        }
        const monster = this.world
          .getMonsters()
          .find((m) => m.issueId === event.issueId);
        if (!monster) {
          this.send(client, { kind: "error", message: "No monster for that issue" });
          return;
        }
        if (!this.sessions.canEngage(monster.id)) {
          this.send(client, { kind: "error", message: "Already engaged" });
          return;
        }
        // Proximity check: the player must be within melee range.
        const ENGAGE_RANGE = 2;
        if (!this.world.isPlayerNear(monster.id, ENGAGE_RANGE)) {
          const dist = this.world.distanceToMonster(monster.id);
          this.send(client, {
            kind: "error",
            message: `Too far away (${dist} tiles). Walk closer to engage.`,
          });
          return;
        }
        const session = this.sessions.start(issue, monster);
        this.broadcast({ kind: "session.started", session: session.toSummary() });
        return;
      }
      case "retreat": {
        // `retreat` is the universal "close the engagement screen" signal.
        // It works for both still-running sessions (cancel Pi + reap) and
        // already-finished sessions (just reap + re-broadcast so the client
        // can transition off the BattleScene). The session's terminal
        // outcome is preserved if Pi already finished.
        const s = this.sessions.getById(event.sessionId);
        if (!s) return;
        s.cancel(); // SIGTERM if still running; no-op if already terminal
        const outcome = s.status === "active" ? "abandoned" : s.status;
        this.sessions.reap(event.sessionId);
        this.broadcast({
          kind: "session.ended",
          sessionId: event.sessionId,
          outcome,
          summary: "Player closed the engagement screen.",
        });
        return;
      }
      case "move": {
        this.world.setPlayerPosition(event.x, event.y);
        return;
      }
    }
  }

  private send(client: Client, event: S2CEvent) {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify({ ...event, id: newId(), ts: Date.now() }));
    }
  }

  private broadcast(event: S2CEvent) {
    const payload = JSON.stringify({ ...event, id: newId(), ts: Date.now() });
    for (const client of this.clients) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(payload);
      }
    }
  }

  /* ── SessionEventSink ──────────────────────────────────────────── */

  onAgentEvent(sessionId: string, event: AgentEvent) {
    this.broadcast({ kind: "session.event", sessionId, event });
  }

  onCombatTick(tick: CombatTick) {
    // Apply damage to the world BEFORE broadcasting so the client always
    // sees the new state on the same tick it sees the attack animation.
    if (tick.magnitude > 0) {
      if (tick.target === "player" && tick.source === "monster") {
        this.world.damagePlayer(tick.magnitude);
        this.broadcast({ kind: "player.state", player: this.world.player });
      } else if (tick.target === "monster" && tick.source === "player") {
        // Find which monster is bound to this session and damage it.
        const session = this.findSessionByTick(tick);
        if (session) {
          const applied = this.world.damageMonster(session.monster.id, tick.magnitude);
          // Note: we don't re-broadcast the monster here on every tick to
          // avoid a flood. The next `monster.spawned`/state event will catch
          // up. (v0.2: add a `monster.state` event for per-tick sync.)
          if (applied > 0 && applied === this.world.getMonster(session.monster.id)?.hp) {
            // Edge case: we just killed it. The session.event for
            // pr.merged/issue.closed will follow shortly and the
            // AgentSession.onEvent will call onMonsterDefeated. We don't
            // need to do it here.
          }
        }
      }
    }
    this.broadcast({ kind: "combat.tick", ...tick });
  }

  private findSessionByTick(
    tick: CombatTick,
  ): { monster: import("@minimax-dev-rpg/protocol").Monster } | null {
    // Reach into the session manager via the list of active sessions. We
    // don't expose a public getter, so use a typed cast.
    const list = (this.sessions as unknown as { active: Map<string, { monster: import("@minimax-dev-rpg/protocol").Monster }> }).active;
    for (const session of list.values()) {
      if (session.monster) return { monster: session.monster };
    }
    return null;
  }

  onSessionEnded(sessionId: string, outcome: SessionOutcome, summary: string) {
    // Pi (or the agent) finished naturally. We DON'T reap yet — the
    // session stays alive so the player can review the event log via
    // the engagement screen. The reap happens when the player closes
    // the engagement screen (which sends `retreat`).
    this.broadcast({ kind: "session.ended", sessionId, outcome, summary });
  }

  onMonsterDefeated(monsterId: string) {
    this.world.defeatMonster(monsterId);
    this.broadcast({ kind: "monster.despawned", monsterId, reason: "defeated" });
    this.broadcast({ kind: "player.state", player: this.world.player });
  }

  onPlayerDamaged(_monsterId: string | null, amount: number) {
    this.world.damagePlayer(amount);
    this.broadcast({ kind: "player.state", player: this.world.player });
  }
}
