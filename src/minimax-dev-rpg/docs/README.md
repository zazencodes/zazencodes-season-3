# Documentation

Architecture and reference docs for the project. Start here, then jump
into the layer you care about.

| Doc                                                  | What it covers                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| [architecture-diagram.md](./architecture-diagram.md)    | High-level architecture diagram + layer-by-layer walkthrough (corrected mental model). |
| [architecture.md](./architecture.md)                | The 3-layer model, runtime topology, state ownership, data flow.            |
| [protocol.md](./protocol.md)                          | The WebSocket wire contract — C2S/S2C events, envelope, lifecycle.          |
| [combat.md](./combat.md)                              | How `AgentEvent` becomes `CombatTick`. Damage formulas, HP/XP, engagement range. |
| [agent-adapters.md](./agent-adapters.md)              | The two `AgentAdapter` implementations (Mock, Pi) and the live log viewer.   |
| [github-providers.md](./github-providers.md)          | The two `IssueProvider` implementations (Mock, `gh` CLI).                   |
| [client.md](./client.md)                              | Phaser scenes, React HUD, zustand store, event bus.                         |
| [development.md](./development.md)                    | Running, env vars, scripts, common pitfalls.                                |

## Suggested reading order

- **New to the codebase?** → [architecture-diagram.md](./architecture-diagram.md) for
  the visual overview, then [architecture.md](./architecture.md), then
  [protocol.md](./protocol.md), then the doc for the layer you'll
  touch.
- **Want to wire in a real agent or a real GitHub repo?** →
  [agent-adapters.md](./agent-adapters.md) and
  [github-providers.md](./github-providers.md) plus the env-var table
  in [development.md](./development.md#environment-variables).
- **Working on the visuals?** → [client.md](./client.md).
- **Tuning combat feel?** → [combat.md](./combat.md) — all the rules
  live in one file (`server/src/session/translator.ts`).