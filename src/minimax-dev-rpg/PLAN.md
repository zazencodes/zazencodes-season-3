# minimax-dev-rpg — Plan

Browser RPG that visualizes a coding agent solving GitHub issues. Phaser + React + TypeScript.

## Architecture (locked in by spec)

1. **Phaser** — presentation & gameplay only (overworld, combat, FX, sound).
2. **React** — non-game UI overlay (HUD, quest log, issue roster, dialogue).
3. **Local Node server** — owns GitHub and agent integration.
4. **Client ↔ server** — typed events over WebSocket via a shared `protocol` package.
5. **GitHub issue → Monster** — every issue becomes a Monster entity in the world.
6. **Engage Monster → AgentSession** — a session is created for that issue.
7. **Agent tool activity → events** — `file.edited`, `tests.passed`, etc.
8. **Phaser → combat animations** — Phaser translates events into combat.

## Repo layout (pnpm workspace)

```
minimax-dev-rpg/
├── packages/
│   └── protocol/      # Shared types & event definitions (zod schemas + TS types)
├── server/            # Node + ws + tsx
│   ├── src/
│   │   ├── agent/     # AgentAdapter interface + Mock + (future) Claude impl
│   │   ├── github/    # IssueProvider interface + Mock + (future) Octokit impl
│   │   ├── session/   # AgentSession lifecycle
│   │   ├── ws/        # WebSocket hub, client registry
│   │   └── fixtures/  # issues.json for the mock provider
│   └── ...
└── client/            # Vite + React + Phaser
    └── src/
        ├── ui/        # React HUD overlay
        ├── game/      # Phaser scenes, entities, FX
        ├── ws/        # Typed WS client
        ├── store.ts   # zustand
        └── App.tsx
```

## Protocol

Two channels of typed events on a single WS connection.

**Client → Server** (commands):
- `engage` { issueId }
- `retreat` { sessionId }
- `ping`

**Server → Client** (state + agent stream):
- `hello` — initial payload (player, issues, monsters, sessions)
- `issue.synced` { issues[] }
- `monster.spawned` / `monster.moved` / `monster.despawned`
- `session.started` / `session.ended` / `session.event` (raw agent events)
- `combat.tick` { sessionId, source, target, kind, magnitude, fx }
- `player.state` { hp, xp, position }

All events are discriminated unions (`kind` field) with a thin zod schema for runtime validation on the boundary.

## MVP (v0.1) — "One full battle loop"

- [x] Monorepo + protocol package
- [x] Server: Mock IssueProvider, Mock Agent, WebSocket hub, AgentSession manager
- [x] Client: Vite + React + Phaser boot
- [x] Phaser BootScene → WorldScene → BattleScene transitions
- [x] Player walks the overworld with WASD/arrows, sees 4 monsters named after real issues
- [x] Click monster in world OR quest in left panel → server `engage` event → AgentSession starts
- [x] Mock agent runs a canned 6-step tool sequence over ~10s
- [x] Each tool event → combat animation (slash, projectile, hit, screen shake)
- [x] Tests pass → big damage. Test fail → monster hits player. Final close → monster dies.
- [x] React HUD: HP/XP bar, quest log with kind filters, session panel, combat log
- [x] End: return to overworld, monster gone, quest log entry
- [x] Procedural pixel art — no external assets required

## Known v0.1 issues (cosmetic, not blockers)

- Defeated monster sprites occasionally linger in the world with HP 0/HP shown. Cleanup logic exists in `WorldScene.shutdown()` but doesn't fully cover HMR scenarios. Fix: make `syncMonsters` the single source of truth and destroy all sprites on every despawn detection.
- World map is 24×18 tiles; the canvas is larger, so the right side and bottom show a black void. Intentional for v0.1 — a larger map or camera-based scrolling is v0.2.
- React HUD player panel slightly overlaps the quest log at small viewports; v0.2 should reposition or collapse.
- BattleScene's decorative red banner sits behind the `● CONNECTED` indicator at the top of the canvas.
- The 1.7MB Phaser bundle ships as a single chunk. Acceptable for the MVP; v0.2 can split it.

## v0.2+ (out of scope for v0.1, designed for)

- Real Octokit GitHub provider behind `GITHUB_TOKEN` (interface in `server/src/github/types.ts`)
- Real Claude Agent SDK adapter behind `ANTHROPIC_API_KEY` (interface in `server/src/agent/types.ts`)
- Persistent HP/XP across server restarts, level up, party system
- Monster AI: roam, chase, idle — driven by `monster.moved` events
- Multiple concurrent sessions (party attacks multiple issues at once)
- Sound + music
- Save/load
- Fix the sprite-leak bug above
- A real tileset (OpenGameArt LPC / Desert pack) swapped into `client/src/game/ProceduralAssets.ts`

## How to run

```bash
pnpm install
pnpm -r dev        # runs server (3001) and client (5173) concurrently
# open http://localhost:5173
```
