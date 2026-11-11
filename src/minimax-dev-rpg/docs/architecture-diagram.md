# Architecture (diagram + walkthrough)

A visual overview of the system and a layer-by-layer walkthrough. For
deeper detail on any single layer, see:

- [architecture.md](./architecture.md) — process topology, state ownership, data flow.
- [protocol.md](./protocol.md) — every event on the wire.
- [combat.md](./combat.md) — the combat translation rules.
- [agent-adapters.md](./agent-adapters.md) — Mock + Pi adapters in detail.
- [client.md](./client.md) — Phaser scenes, React HUD, store, bus.

## Corrected mental model

The diagram captures the core conceptual layers and responsibilities, but
has one key topological nuance to clarify:

> **Nuance:** **React (HUD)** and **Phaser (Game Canvas)** are **peer
> frontend components running in the browser**, not stacked over a
> WebSocket. The **WebSocket connection is between the browser client
> (both React & Phaser) and the Node.js Server**.

## Architecture flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser Client (Vite)                     │
│                                                              │
│  ┌────────────────────────────┐  ┌────────────────────────┐  │
│  │       React UI (HUD)       │  │ Phaser 2D Canvas Game  │  │
│  │ • Issue details & quests   │  │ • Overworld movement   │  │
│  │ • HP / XP bars & stats     │  │ • Monster sprites      │  │
│  │ • Agent stream & controls  │  │ • Combat & spell VFX   │  │
│  └─────────────▲──────────────┘  └───────────▲────────────┘  │
│                │                             │               │
│                └────── Zustand Store & ──────┘               │
│                     In-Memory Event Bus                      │
└───────────────────────────────▲──────────────────────────────┘
                                │
                                │ Typed WebSocket Events (packages/protocol)
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                Node.js Server (Orchestrator)                 │
│ • GitHub Issue provider (gh CLI / Mock)                      │
│ • Authoritative World state (monsters, player HP/XP)         │
│ • Combat Translator (maps agent actions -> RPG combat ticks) │
│ • WebSocket Hub (/ws)                                        │
└───────────────────────────────▲──────────────────────────────┘
                                │
                                │ Runs in-process (typed SDK event stream)
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                    Pi Agent / MiniMax-M3                     │
│ • MiniMax-M3 model via the Pi SDK                            │
│ • Inspects repo, edits code, runs Vitest / test suites       │
│ • Server creates Git branch, opens real PR, merges & closes  │
└──────────────────────────────────────────────────────────────┘
```

## Layer-by-layer walkthrough

### 1. Frontend: React HUD + Phaser 2D Canvas ([client/src/App.tsx](../client/src/App.tsx))

- **Co-located in the browser:** Phaser renders the visual 2D world onto a
  canvas (`#phaser-root`), while React overlays the HUD, quest list, and
  activity log.
- **Shared state via [Zustand](../client/src/store.ts) & [event bus](../client/src/ws/bus.ts):**
  - Persistent game state (player level, HP, quest list, session status)
    updates the Zustand store, which React components reactively render.
  - Transient visual events (slashes, spell bursts, damage floats)
    broadcast over a lightweight event bus directly into Phaser's active
    scene ([BattleScene.ts](../client/src/game/scenes/BattleScene.ts)).

### 2. The wire: typed WebSocket protocol ([packages/protocol](../packages/protocol/src/events.ts))

- Client and server communicate over a single typed WebSocket connection
  ([WsClient](../client/src/ws/client.ts) ↔ [WsHub](../server/src/ws/hub.ts)).
- Client sends `C2SEvent`s — `engage`, `retreat`, `move`, `ping` (see
  [protocol.md](./protocol.md) for the full schema).
- Server broadcasts `S2CEvent`s — `hello`, `session.started`,
  `session.event`, `combat.tick`, `session.ended`, `player.state`, and
  the monster lifecycle events.

### 3. Backend: Node.js orchestrator ([server/src/index.ts](../server/src/index.ts))

- **GitHub sync:** Fetches open repository issues (using the GitHub CLI
  [gh](../server/src/github/gh.ts) or
  [MockIssueProvider](../server/src/github/mock.ts)) and converts them
  into roaming monster entities with HP derived from
  [`kindFromLabels`](../server/src/util/palettes.ts) and the difficulty
  heuristic.
- **Combat translator
  ([translator.ts](../server/src/session/translator.ts)):** The key
  bridge turning code actions into RPG combat:
  - Agent reads files / explores → Player channels energy.
  - Agent edits files → Player casts attacks / slashes.
  - Agent runs tests → Critical hits (if passing) or monster
    counter-attacks (if failing).
  - Agent finishes → Monster defeat animation, XP awarded, and victory
    sequence.

### 4. Agent & model execution: MiniMax-M3 ([server/src/agent/pi.ts](../server/src/agent/pi.ts))

- **Pi SDK & MiniMax-M3:** When an issue engagement starts, the server
  instantiates the Pi agent in-process via
  `@earendil-works/pi-coding-agent` (`createAgentSession`) — there is no
  subprocess and no JSON-line parsing. The SDK streams typed
  `AgentSessionEvent` values that the adapter maps onto the game's
  `AgentEvent` schema.
- **Tool loop:** The model reasons through the issue, modifies files,
  and executes tests.
- **Automated Git workflow:** Once tests pass cleanly, the server
  automatically branches the workspace, commits changes, creates a real
  GitHub PR (`gh pr create`), squash-merges it, and closes the issue.

For the precise event mapping and the full real-PR flow, see
[agent-adapters.md](./agent-adapters.md#piagent).