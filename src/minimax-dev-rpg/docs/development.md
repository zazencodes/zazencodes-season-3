# Development

How to run, configure, troubleshoot, and extend the project.

## Quickstart

```bash
pnpm install
pnpm dev               # server (3001) + client (5173) in parallel
open http://localhost:5173
```

`pnpm dev` runs both workspaces concurrently (`pnpm -r --parallel --stream
dev`). Server hot-reloads via `tsx watch`; client hot-reloads via Vite HMR.

## Scripts

Root:

| Command            | Effect                                                   |
| ------------------ | -------------------------------------------------------- |
| `pnpm dev`         | Start server + client with watch mode.                   |
| `pnpm build`       | `pnpm -r build` — typecheck then Vite/tsc build.         |
| `pnpm typecheck`   | `pnpm -r typecheck` — all workspaces, no emit.           |

Server workspace (`server/`):

| Command            | Effect                                                   |
| ------------------ | -------------------------------------------------------- |
| `pnpm dev`         | `tsx watch src/index.ts` — local dev loop.                |
| `pnpm start`       | `tsx src/index.ts` — no watch.                           |
| `pnpm typecheck`   | `tsc --noEmit`.                                          |
| `pnpm build`       | `tsc` — outputs `server/dist/`.                          |

Client workspace (`client/`):

| Command            | Effect                                                   |
| ------------------ | -------------------------------------------------------- |
| `pnpm dev`         | `vite` — dev server on 5173 with HMR.                    |
| `pnpm build`       | `tsc -b && vite build` — typecheck then bundle.          |
| `pnpm preview`     | `vite preview` — serve the production bundle.            |
| `pnpm typecheck`   | `tsc --noEmit`.                                          |

Protocol workspace (`packages/protocol/`):

| Command            | Effect                                                   |
| ------------------ | -------------------------------------------------------- |
| `pnpm typecheck`   | `tsc --noEmit`.                                          |

## Smoke test

`server/smoke.mjs` connects to the running server, prints every event on
the wire, and exits after one full battle.

```bash
pnpm dev                              # in one terminal
node server/smoke.mjs                 # in another
```

Useful for sanity-checking the protocol after a change without running
the browser. ~30s timeout.

## Environment variables

All optional. Defaults make the demo loop work with no configuration.

| Var                    | Default                | Effect                                                              |
| ---------------------- | ---------------------- | ------------------------------------------------------------------- |
| `PORT`                 | `3001`                 | HTTP + WS port for the server.                                      |
| `ISSUE_PROVIDER`       | `mock`                 | `mock` or `gh`. See [github-providers.md](./github-providers.md). |
| `GITHUB_REPO`          | `zazencodes/habit-cli` | Used only when `ISSUE_PROVIDER=gh`. Format `owner/name`.             |
| `AGENT_ADAPTER`        | `mock`                 | `mock` or `pi`. See [agent-adapters.md](./agent-adapters.md).        |
| `AGENT_WORKDIR`        | `$HOME/pro/habit-cli`  | Used only when `AGENT_ADAPTER=pi`. The repo the agent edits.         |
| `AGENT_TIMEOUT_MS`     | `600000`               | Max time a single Pi session can run before forced abort.           |
| `AGENT_LOG_AUTOOPEN`   | unset (auto-open on)   | Set to `0` to suppress auto-opening the `/agent-log` browser tab. Any other value (including unset) opens it. |

Example: real-mode dev loop against a real GitHub repo

```bash
ISSUE_PROVIDER=gh \
GITHUB_REPO=your-org/your-repo \
AGENT_ADAPTER=pi \
AGENT_WORKDIR=/abs/path/to/local/clone \
pnpm dev
```

## HTTP endpoints

The Node server also serves a few HTTP routes alongside the WebSocket
upgrade:

| Method | Path                | Response                                                        |
| ------ | ------------------- | --------------------------------------------------------------- |
| GET    | `/`                 | Plain-text help (lists endpoints + selected adapters).          |
| GET    | `/health`           | JSON `{ ok, provider, agent, monsters }`. Good for liveness checks. |
| GET    | `/reset`            | JSON. Calls `World.resetDemoData()` — wipes defeated flags, re-randomizes monster positions, restores player to full HP. |
| GET    | `/ws`               | WebSocket upgrade. (The WS path; the actual data lives here.)    |
| GET    | `/agent-log`        | Static HTML page. Subscribes to `/agent-log/stream`.              |
| GET    | `/agent-log/stream` | `text/event-stream`. Replays the log-store buffer on connect, then streams new entries. |

Vite proxies `/ws` and `/health` to the server in dev
(`client/vite.config.ts`). In production, point your reverse proxy at the
same paths.

## Adding a new event

1. Add the zod schema in `packages/protocol/src/events.ts`.
2. Add it to `C2SEventSchema` or `S2CEventSchema`.
3. Server side: emit it from the right place
   (`WsHub.broadcast`, `WsHub.send`, `SessionEventSink` callbacks, or
   `World` methods).
4. Client side: handle it in `client/src/store.ts` (persistent) or
   `client/src/ws/bus.ts` (transient FX).

Both workspaces will fail to typecheck (switch on `kind` is exhaustive)
until you handle the new event. That's the contract test.

## Common pitfalls

### React.StrictMode

`client/src/main.tsx` deliberately skips it. StrictMode double-invokes
effects in dev, which re-creates the Phaser game and accumulates scene
listeners on every save. Don't add it back.

### HMR vs `WorldScene` monster sprites

`WorldScene.shutdown()` destroys every tracked sprite and clears the map.
If you add a new sprite kind, register it in `monsterSprites` (or a
parallel map) so shutdown can clean it up. Otherwise an HMR reload can
leave stale sprites on screen.

### World constants must match

`client/src/game/scenes/WorldScene.ts` and
`server/src/state/world.ts` independently define `WORLD_W`, `WORLD_H`,
and `ENGAGE_RANGE`. If you change one, change the other — the server's
proximity check and the client's range ring will drift apart.

### Spawn layout is server-side

The server picks monster positions when it hydrates the world; the client
just renders them. So a monster you click might be in a different
position than where you last saw it after a reconnect — that's expected,
since reconnect triggers `World.reset()`.

### Pi agent adapter wants a clean workdir

The Pi agent does work in `AGENT_WORKDIR` and `openRealPullRequest`
afterwards does `git checkout main`, `git pull`, etc. If the workdir has
uncommitted changes from a previous run, the `git checkout main` step may
fail and the PR flow will fall through to `defeat`. Either start with a
clean checkout or work in a per-session clone (TODO).

### `pnpm lint`

The root `package.json` has a `lint` script that references
`pnpm -r lint`, but no workspace actually defines a linter. Running it
will fail until/unless we add ESLint configs. The README used to mention
it; this doc replaces that mention.

## Repo layout

```
minimax-dev-rpg/
├── packages/
│   └── protocol/         # Shared types + zod schemas (the contract)
├── server/               # Node + ws + tsx
│   ├── src/
│   │   ├── agent/        # AgentAdapter: Mock + Pi
│   │   ├── github/       # IssueProvider: Mock + gh CLI
│   │   ├── session/      # AgentSession, SessionManager, CombatTranslator
│   │   ├── state/        # World (authoritative player + monsters)
│   │   ├── ws/           # WsHub
│   │   ├── util/         # ids, palettes
│   │   ├── fixtures/     # issues.json for the mock provider
│   │   └── index.ts      # HTTP routes + boot
│   └── smoke.mjs         # WS protocol smoke test
├── client/               # Vite + React + Phaser
│   ├── src/
│   │   ├── game/         # Phaser scenes + procedural art
│   │   ├── ui/           # React HUD panels
│   │   ├── ws/           # WsClient + event bus
│   │   ├── store.ts      # zustand
│   │   ├── main.tsx      # boot order
│   │   └── App.tsx       # mounts Phaser + panels
│   └── vite.config.ts
├── docs/                 # this directory
├── PLAN.md               # original design doc, kept for history
└── README.md             # project overview + quickstart
```

## Known issues

Carried over from the original MVP checklist and updated for the current
state:

- The BattleScene's red decorative banner sits behind the `● CONNECTED`
  indicator at the top of the canvas. Cosmetic; v0.2 should reposition.
- Phaser ships as a single ~1.7MB chunk. Acceptable for the MVP; v0.2
  can split it.
- Player position is trusted from the client (single-player assumption).
  Multi-player or hostile clients need server-side bounds + rate limit.

The earlier "void" and "defeated sprite leak" issues from the original
PLAN.md are no longer present — the world is 200×100 tiles with a
camera that follows the player, and `WorldScene.shutdown()` destroys
every monster sprite and clears the map.