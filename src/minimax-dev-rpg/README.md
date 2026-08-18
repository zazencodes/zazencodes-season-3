# I Built a GitHub Issue RPG with MiniMax

Watch the [video on YouTube here](INSERT_LINK)

Sign up for [my free weekly newsletter](https://zazencodes.com/newsletter) for more AI engineering builds.

## What this is

A browser RPG that visualizes a MiniMax coding agent solving GitHub issues. Walk the overworld as the player, engage monsters named after real issues, and watch the agent fight for you — each tool call (read, edit, test, PR) becomes a combat animation. Slash, projectile, hit, screen shake. Tests pass → big damage. Tests fail → the monster hits you. Final close → the monster dies, the PR is merged, the issue is closed.

## Stack

- **Phaser** — overworld, combat, FX, procedural pixel art
- **React** — HUD overlay (HP/XP, quest log, session panel, combat log)
- **Node + ws + tsx** — local server that owns GitHub and agent integration
- **TypeScript** — typed WebSocket protocol shared between client and server (`packages/protocol`)
- **pnpm** workspaces

## Quickstart

```bash
pnpm install
pnpm dev                  # starts server (3001) and client (5173) in parallel
open http://localhost:5173
```

On boot the server also opens `http://localhost:3001/agent-log` — a permanent live viewer that streams every agent event (sessions, thinking, tool calls, file edits, test results, PRs). Drag it to the right side of your screen and leave it open. See [docs/agent-adapters.md](./docs/agent-adapters.md#the-agent-log-viewer).

## How it plays

1. Spawn in a sandy town. Monsters roam, each named after a real issue fetched from GitHub (or from `server/src/fixtures/issues.json` in mock mode).
2. Walk within 2 tiles of a monster (or click its quest in the left panel) to engage. The server checks proximity authoritatively.
3. The server creates an `AgentSession` against the configured `AgentAdapter`. In mock mode it runs a canned ~10-event tool sequence over ~10 seconds (read → edit → test-fail → edit → test-pass → PR); with `AGENT_ADAPTER=pi` it runs the Pi agent in-process against your real repo, opening a real PR at the end.
4. Every `AgentEvent` flows through `CombatTranslator`, which emits pre-shaped `CombatTick` values. Phaser plays slash / spell / hit / death animations; React summarizes the same stream into the combat log.
5. The session ends with `victory` (PR merged, issue closed), `defeat`, or `abandoned` (player retreated). Player HP and XP are tracked across runs.

## Architecture

```
┌────────────────────────────┐  typed events   ┌────────────────────────────┐
│        browser tab         │ ──────────────► │       local Node process   │
│                            │ ◄────────────── │                            │
│   Phaser (canvas)          │                 │   WsHub                    │
│     Boot → World → Battle  │                 │     ├─ SessionManager      │
│   React HUD (DOM)          │                 │     └─ CombatTranslator   │
│     HUD, QuestLog,         │                 │   AgentAdapter             │
│     SessionPanel,          │                 │     ├─ Mock (default)     │
│     CombatLog              │                 │     └─ Pi (real agent)    │
│   zustand + event bus      │                 │   IssueProvider            │
│                            │                 │     ├─ Mock (default)     │
│                            │                 │     └─ gh CLI (real)      │
│                            │                 │   /agent-log viewer        │
└────────────────────────────┘                 └────────────────────────────┘
```

The full breakdown — process topology, state ownership, request flow, animation rules — lives in [docs/architecture.md](./docs/architecture.md).

## Selecting adapters

Everything is opt-in via env vars. Defaults run a fully working zero-network demo loop. To run against real GitHub + a real MiniMax agent:

```bash
ISSUE_PROVIDER=gh \
GITHUB_REPO=your-org/your-repo \
AGENT_ADAPTER=pi \
AGENT_WORKDIR=/abs/path/to/local/clone \
pnpm dev
```

See [docs/development.md](./docs/development.md#environment-variables) for the full table and [docs/agent-adapters.md](./docs/agent-adapters.md) / [docs/github-providers.md](./docs/github-providers.md) for what each adapter actually does.

## Repo layout

```
packages/protocol/   shared types + zod schemas for the WebSocket protocol
server/              Node + ws + tsx
  src/agent/         AgentAdapter (Mock, Pi) + agent log viewer store
  src/github/        IssueProvider (Mock, gh CLI)
  src/session/       AgentSession, SessionManager, CombatTranslator
  src/state/         World (authoritative player + monsters)
  src/ws/            WsHub
  smoke.mjs          WS protocol smoke test
client/              Vite + React + Phaser
  src/game/          Phaser scenes + procedural art
  src/ui/            React HUD panels
  src/ws/            WsClient + event bus
  src/store.ts       zustand
docs/                this directory
PLAN.md              original design doc + v0.1 known issues
```

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/architecture-diagram.md](./docs/architecture-diagram.md) | High-level diagram + layer-by-layer walkthrough (corrected mental model). |
| [docs/architecture.md](./docs/architecture.md) | 3-layer model, runtime topology, state ownership, data flow. |
| [docs/protocol.md](./docs/protocol.md) | WebSocket wire contract — C2S/S2C events, envelope, lifecycle. |
| [docs/combat.md](./docs/combat.md) | How `AgentEvent` becomes `CombatTick`. Damage, HP/XP, range. |
| [docs/agent-adapters.md](./docs/agent-adapters.md) | Mock + Pi adapters and the live agent log viewer. |
| [docs/github-providers.md](./docs/github-providers.md) | Mock + `gh` CLI issue providers. |
| [docs/client.md](./docs/client.md) | Phaser scenes, React HUD, zustand store, event bus. |
| [docs/development.md](./docs/development.md) | Running, env vars, scripts, common pitfalls. |
| [PLAN.md](./PLAN.md) | Original design doc, MVP checklist, and v0.1 known issues. |

## Development

```bash
pnpm dev              # dev mode (HMR + watch)
pnpm typecheck        # typecheck all workspaces
pnpm build            # build all
```

The protocol is the contract — add an event to `packages/protocol/src/events.ts` and both client and server pick it up via type inference. See [docs/development.md](./docs/development.md#adding-a-new-event).
