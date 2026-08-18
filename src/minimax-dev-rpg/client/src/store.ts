import { create } from "zustand";
import type {
  AgentEvent,
  Issue,
  Monster,
  PlayerState,
  SessionStatus,
  SessionSummary,
} from "@minimax-dev-rpg/protocol";
import type { WsClient } from "./ws/client.js";

interface LogEntry {
  ts: number;
  who: "player" | "monster" | "system";
  text: string;
}

interface Store {
  player: PlayerState | null;
  issues: Map<string, Issue>;
  monsters: Map<string, Monster>;
  sessions: Map<string, SessionSummary>;
  currentSessionId: string | null;
  log: LogEntry[];
  connected: boolean;

  // Selectors
  activeSession: () => SessionSummary | null;
  monstersList: () => Monster[];
  issuesList: () => Issue[];

  // Actions
  init: (client: WsClient) => void;
}

const LOG_CAP = 200;

const pushLog = (log: LogEntry[], entry: LogEntry): LogEntry[] => {
  const next = [...log, entry];
  if (next.length > LOG_CAP) next.splice(0, next.length - LOG_CAP);
  return next;
};

const summarizeAgentEvent = (e: AgentEvent): LogEntry | null => {
  switch (e.kind) {
    case "tool.start":
      return { ts: Date.now(), who: "system", text: `→ ${e.tool}(${summarizeArgs(e.args)})` };
    case "tool.end":
      return {
        ts: Date.now(),
        who: e.result === "ok" ? "system" : "monster",
        text: e.result === "ok" ? `✓ ${e.tool}` : `✗ ${e.tool}: ${e.summary}`,
      };
    case "tests.run":
      return {
        ts: Date.now(),
        who: e.failed > 0 ? "monster" : "player",
        text: `Tests: ${e.passed} passed, ${e.failed} failed`,
      };
    case "file.edited":
      return {
        ts: Date.now(),
        who: "player",
        text: `Edited ${shortPath(e.path)} (+${e.linesAdded} -${e.linesRemoved})`,
      };
    case "message":
      if (e.role === "user" || e.role === "system") return null;
      return { ts: Date.now(), who: "system", text: e.text };
    case "pr.opened":
      return { ts: Date.now(), who: "player", text: `PR opened: ${e.title}` };
    case "pr.merged":
      return { ts: Date.now(), who: "player", text: `PR merged!` };
    case "issue.closed":
      return { ts: Date.now(), who: "player", text: `Issue closed (${e.reason})` };
    case "error":
      return { ts: Date.now(), who: "monster", text: `Error: ${e.message}` };
  }
};

const summarizeArgs = (args: Record<string, unknown>): string => {
  const entries = Object.entries(args).slice(0, 2);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}=${s.length > 24 ? s.slice(0, 24) + "…" : s}`;
    })
    .join(", ");
};

const shortPath = (p: string) => {
  const parts = p.split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : p;
};

export const useStore = create<Store>((set, get) => ({
  player: null,
  issues: new Map(),
  monsters: new Map(),
  sessions: new Map(),
  currentSessionId: null,
  log: [],
  connected: false,

  activeSession: () => {
    const id = get().currentSessionId;
    if (!id) return null;
    return get().sessions.get(id) ?? null;
  },
  monstersList: () => Array.from(get().monsters.values()),
  issuesList: () => Array.from(get().issues.values()),

  init: (client) => {
    client.onStatus((connected) => set({ connected }));
    client.onServerEvent((event) => {
      switch (event.kind) {
        case "hello": {
          const issues = new Map(event.issues.map((i) => [i.id, i]));
          const monsters = new Map(event.monsters.map((m) => [m.id, m]));
          const sessions = new Map(event.sessions.map((s) => [s.id, s]));
          set({ player: event.player, issues, monsters, sessions });
          set((s) => ({
            log: pushLog(s.log, {
              ts: Date.now(),
              who: "system",
              text: `Connected. ${event.monsters.length} monsters roam the realm.`,
            }),
          }));
          return;
        }
        case "issue.synced": {
          const map = new Map(get().issues);
          for (const i of event.issues) map.set(i.id, i);
          set({ issues: map });
          return;
        }
        case "monster.spawned": {
          const map = new Map(get().monsters);
          map.set(event.monster.id, event.monster);
          set({ monsters: map });
          return;
        }
        case "monster.moved": {
          const m = get().monsters.get(event.monsterId);
          if (!m) return;
          const map = new Map(get().monsters);
          map.set(event.monsterId, { ...m, x: event.x, y: event.y });
          set({ monsters: map });
          return;
        }
        case "monster.despawned": {
          const m = get().monsters.get(event.monsterId);
          const map = new Map(get().monsters);
          if (event.reason === "defeated" && m) {
            map.set(event.monsterId, { ...m, defeated: true, hp: 0 });
          } else {
            map.delete(event.monsterId);
          }
          set({ monsters: map });
          if (m) {
            set((s) => ({
              log: pushLog(s.log, {
                ts: Date.now(),
                who: m.hp === 0 ? "player" : "system",
                text: `${m.name} ${event.reason === "defeated" ? "defeated" : "vanished"}`,
              }),
            }));
          }
          return;
        }
        case "session.started": {
          const map = new Map(get().sessions);
          map.set(event.session.id, event.session);
          set({
            sessions: map,
            currentSessionId: event.session.id,
            log: pushLog(get().log, {
              ts: Date.now(),
              who: "system",
              text: `Engaged: ${event.session.id.slice(0, 6)}`,
            }),
          });
          return;
        }
        case "session.ended": {
          const map = new Map(get().sessions);
          const existing = map.get(event.sessionId);
          if (existing) {
            map.set(event.sessionId, {
              ...existing,
              status: event.outcome as SessionStatus,
              endedAt: Date.now(),
            });
          }
          const monsterMap = new Map(get().monsters);
          const issueMap = new Map(get().issues);
          if (existing && event.outcome === "victory") {
            const m = monsterMap.get(existing.monsterId);
            if (m) {
              monsterMap.set(existing.monsterId, { ...m, defeated: true, hp: 0 });
            }
            const issue = issueMap.get(existing.issueId);
            if (issue) {
              issueMap.set(existing.issueId, { ...issue, state: "closed" });
            }
          }
          set({
            sessions: map,
            monsters: monsterMap,
            issues: issueMap,
            currentSessionId:
              get().currentSessionId === event.sessionId ? null : get().currentSessionId,
            log: pushLog(get().log, {
              ts: Date.now(),
              who:
                event.outcome === "victory"
                  ? "player"
                  : event.outcome === "defeat"
                    ? "monster"
                    : "system",
              text: `Session ${event.outcome}: ${event.summary}`,
            }),
          });
          return;
        }
        case "session.event": {
          const summary = summarizeAgentEvent(event.event);
          if (!summary) return;
          set((s) => ({ log: pushLog(s.log, summary) }));
          return;
        }
        case "combat.tick": {
          const text = combatTickText(event);
          if (text) {
            set((s) => ({
              log: pushLog(s.log, { ts: Date.now(), who: text.who, text: text.text }),
            }));
          }
          return;
        }
        case "player.state": {
          set({ player: event.player });
          return;
        }
        case "error": {
          set((s) => ({
            log: pushLog(s.log, { ts: Date.now(), who: "system", text: `! ${event.message}` }),
          }));
          return;
        }
        case "pong":
          return;
      }
    });
  },
}));

const combatTickText = (e: import("@minimax-dev-rpg/protocol").CombatTick): {
  who: "player" | "monster" | "system";
  text: string;
} | null => {
  if (e.action === "victory" || e.action === "death") {
    return { who: "player", text: `Victory!` };
  }
  if (e.action === "defeat") {
    return { who: "monster", text: `You were defeated.` };
  }
  if (e.action === "spawn" || e.action === "flee") return null;
  const who = e.source === "player" ? "player" : e.source === "monster" ? "monster" : "system";
  const verb =
    e.action === "slash" ? "slashes" :
    e.action === "spell" ? "casts" :
    e.action === "heal" ? "heals" :
    e.action === "hit" ? "hits" : "strikes";
  const target = e.target === "player" ? "you" : "the monster";
  return { who, text: `${who === "player" ? "You" : "Monster"} ${verb} ${target} for ${e.magnitude}` };
};
