# Architecture

The runtime is three independent processes that talk over one typed WebSocket
connection. Each process owns a single layer of the stack; nothing reaches
across the boundary except through the protocol.

## Layers

```
┌────────────────────────────┐     ┌────────────────────────────┐
│        browser tab         │     │       local Node process   │
│                            │     │                            │
│   ┌────────────────────┐   │     │   ┌────────────────────┐   │
│   │  React HUD (DOM)   │   │     │   │  WsHub             │   │
│   │  HUD, quests, log  │   │     │   │  ─────              │   │
│   └─────────┬──────────┘   │     │   │   ├── parseC2S      │   │
│             │ reads        │     │   │   ├── broadcast     │   │
│   ┌─────────▼──────────┐   │     │   │   └── SessionSink   │   │
│   │  zustand store     │   │     │   └─────────┬──────────┘   │
│   │  persistent state  │   │     │             │ owns          │
│   └─────────┬──────────┘   │     │   ┌─────────▼──────────┐   │
│             │ subscribes   │     │   │  SessionManager    │   │
│   ┌─────────▼──────────┐   │     │   │  AgentSessions[]   │   │
│   │  Phaser canvas     │   │     │   └─────────┬──────────┘   │
│   │  Boot → World →    │ ◄─┼─────┼─►│          │ uses        │
│   │  Battle            │ ws│     │ ws│  ┌───────▼──────────┐   │
│   └────────────────────┘   │     │   │  AgentAdapter     │   │
│                            │     │   │  (Mock | Pi)      │   │
│   ┌────────────────────┐   │     │   └─────────┬──────────┘   │
│   │  EventBus          │   │     │             │              │
│   │  transient FX only │   │     │   ┌─────────▼──────────┐   │
│   └────────────────────┘   │     │   │  World             │   │
│                            │     │   │  player, monsters  │   │
│                            │     │   └────────────────────┘   │
│                            │     │   ┌────────────────────┐   │
│                            │     │   │  IssueProvider     │   │
│                            │     │   │  (Mock | gh)       │   │
│                            │     │   └────────────────────┘   │
└────────────────────────────┘     └────────────────────────────┘
```

### Browser tab (client)

| Component         | File                                     | Role                                      |
| ----------------- | ---------------------------------------- | ----------------------------------------- |
| `main.tsx`        | `client/src/main.tsx`                    | Wires WS → store → React, boots Phaser.   |
| `App.tsx`         | `client/src/App.tsx`                     | Mounts Phaser + HUD panels.                |
| `WsClient`        | `client/src/ws/client.ts`                | Reconnect-with-backoff, zod-validated.    |
| `bus`             | `client/src/ws/bus.ts`                   | Transient FX channel.                     |
| `useStore`        | `client/src/store.ts`                    | Persistent state + per-event reducers.    |
| `BootScene`       | `client/src/game/scenes/BootScene.ts`    | Generates procedural textures.            |
| `WorldScene`      | `client/src/game/scenes/WorldScene.ts`   | Overworld, WASD/arrows, monster click.    |
| `BattleScene`     | `client/src/game/scenes/BattleScene.ts`  | Combat animations, monster/player bars.   |
| HUD panels        | `client/src/ui/*.tsx`                    | Player, quests, session, combat log.      |

### Node process (server)

| Component         | File                                     | Role                                      |
| ----------------- | ---------------------------------------- | ----------------------------------------- |
| `index.ts`        | `server/src/index.ts`                    | HTTP routes (`/health`, `/reset`, `/agent-log`), env-driven wiring, browser auto-open of the log viewer. |
| `WsHub`           | `server/src/ws/hub.ts`                   | WS endpoint + `SessionEventSink`.         |
| `World`           | `server/src/state/world.ts`              | Authoritative player + monster positions and HP. |
| `SessionManager`  | `server/src/session/manager.ts`          | Active-session registry, monster→session dedupe. |
| `AgentSession`    | `server/src/session/manager.ts`          | One session = one running `AgentAdapter` handle + `CombatTranslator`. |
| `CombatTranslator`| `server/src/session/translator.ts`       | `AgentEvent → CombatTick[]` mapping. The gameplay knob. |
| `AgentAdapter`    | `server/src/agent/types.ts`              | Interface (Mock + Pi).                    |
| `IssueProvider`   | `server/src/github/types.ts`             | Interface (Mock + gh).                    |
| `log-store`       | `server/src/agent/log-store.ts`          | In-memory ring buffer of every agent event for the live viewer. |

## State ownership

Every piece of state has exactly one owner. Nothing is duplicated unless one
side is a derived cache of the other.

| State                           | Where                                           | Why                                 |
| ------------------------------- | ----------------------------------------------- | ----------------------------------- |
| Player HP / XP / position       | **Server** (authoritative) → zustand (cache)    | Single source so combat is honest.  |
| Monster HP / positions          | **Server** (authoritative) → zustand (cache)    | Same.                               |
| Open issues                    | **IssueProvider** → `World` → zustand           | Re-fetched on each `hello`.         |
| Active sessions                | **SessionManager** → zustand                    | Player closes the engagement screen to reap. |
| Combat ticks (one-shot FX)     | **Event bus** (transient)                       | Don't pollute the store with per-frame noise. |
| Agent log ring buffer          | **Server** (`log-store`)                        | Only the viewer page reads it.      |
| Procedural textures            | **Client** (`ProceduralAssets`)                 | Pure rendering concern.             |

## Data flow for a single engagement

```
client            server              agent (Pi or Mock)
  │                  │                       │
  │ engage(issueId)  │                       │
  ├─────────────────►│  validate proximity   │
  │                  │  start AgentSession   │
  │                  ├──────────────────────►│
  │                  │                       │ (Pi: run SDK in-process,
  │                  │                       │  Mock: fire timer sequence)
  │                  │   AgentEvent          │
  │                  │◄──────────────────────┤
  │ session.started  │ (broadcast)           │
  │◄─────────────────┤                       │
  │                  │                       │
  │                  │   AgentEvent          │
  │                  │◄──────────────────────┤
  │  session.event   │ (broadcast)           │
  │◄─────────────────┤                       │
  │                  │                       │
  │                  │ CombatTranslator      │
  │                  │   AgentEvent → ticks  │
  │                  │   apply damage to     │
  │                  │   World               │
  │  combat.tick     │ (broadcast)           │
  │◄─────────────────┤                       │
  │                  │                       │
  │   ... more events, more ticks ...         │
  │                  │                       │
  │                  │   AgentEvent          │
  │                  │◄──────────────────────┤ (pr.merged, issue.closed)
  │  combat.tick     │ (death + victory)     │
  │◄─────────────────┤                       │
  │  session.ended   │                       │
  │◄─────────────────┤                       │
  │                  │                       │
  │ retreat(sessionId)                       │
  ├─────────────────►│  reap session         │
  │                  │  broadcast ended      │
  │  session.ended   │ (so UI transitions)  │
  │◄─────────────────┤                       │
```

Key invariants:

1. The client never applies damage itself; it reads damage from the next
   `combat.tick` (Phaser animates) and the next `player.state` /
   monster update (the store updates HP/position).
2. The server never renders; it only shapes data.
3. The agent never knows about Phaser, React, or the game at all. It sees
   `Issue` and emits `AgentEvent` values.
4. Engagement validation is server-authoritative; the client mirrors the
   check only so the UI reflects range and avoids bouncing `engage`
   messages that would always fail.

## Persistent vs transient channels

zustand and the event bus look similar but carry different kinds of data:

| Channel      | Lifetime            | Examples                                       |
| ------------ | ------------------ | ---------------------------------------------- |
| zustand      | Until replaced     | HP, XP, monster roster, active session id     |
| Event bus    | Single frame       | `combat.tick`, `session.ended` for Phaser FX  |

Same event flows through both — `WsClient.onMessage` emits to the bus for FX
subscribers (Phaser scenes) and to the store reducers for persistent state.

## What runs where in the Node process

```
HTTP server (node:http)
├── GET /ws                 → WsHub (WebSocket upgrade)
├── GET /health             → JSON { ok, provider, agent, monsters }
├── GET /reset              → World.resetDemoData()
├── GET /agent-log          → HTML page (inlined)
├── GET /agent-log/stream   → text/event-stream into log-store
└── * (other)               → plain text help
```

`WsHub` owns the `SessionManager` and a `SessionEventSink` that calls back
into it for each `AgentEvent`, `CombatTick`, session end, monster defeat,
and player damage. The hub is the only place where server state is mutated
in response to client input.

See:

- [protocol.md](./protocol.md) — the wire contract.
- [combat.md](./combat.md) — how `AgentEvent` becomes `CombatTick`.
- [agent-adapters.md](./agent-adapters.md) — Mock vs Pi.
- [github-providers.md](./github-providers.md) — Mock vs `gh`.
- [client.md](./client.md) — Phaser scenes, React HUD, store, bus.
- [development.md](./development.md) — running, env vars, troubleshooting.