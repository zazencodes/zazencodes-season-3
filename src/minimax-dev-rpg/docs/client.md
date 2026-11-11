# Client architecture

The browser tab has two parallel renderers — Phaser (game canvas) and React
(DOM HUD) — wired together by a single zustand store and an event bus.

```
                         ┌──────────────────────────┐
                         │  zustand store           │
                         │  (persistent state)      │
                         └────────────┬─────────────┘
                                      │ subscribes
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
    ┌───────▼────────┐       ┌────────▼────────┐       ┌────────▼────────┐
    │  Phaser        │       │  React HUD       │       │  WsClient      │
    │  BootScene     │       │  HUD             │       │  reconnect,    │
    │   └► WorldScene│       │  QuestLog        │       │  validate,     │
    │       └► Battle │       │  SessionPanel    │       │  fan-out       │
    │           Scene │       │  CombatLog       │       └────────┬────────┘
    └────────────────┘       └──────────────────┘                │
            ▲                         ▲                           │
            │                         │                           │
            │       ┌─────────────────┴───────────┐               │
            │       │  EventBus (transient)       │◄──────────────┘
            └───────┤  combat.tick, session.ended │  every event goes
                    └─────────────────────────────┘  to both bus and store
```

## Boot order

`client/src/main.tsx` runs before React:

1. `connectShared()` — constructs the singleton `WsClient`, opens the WS.
2. `useStore.getState().init(ws)` — registers the store's reducers and
   the status listener.
3. `createRoot(...).render(<App />)` — mounts React.

Then in `App.tsx`'s `useEffect`:

4. `startGame(phaserRef.current)` — instantiates the Phaser game with
   `BootScene`, `WorldScene`, `BattleScene`.

This ordering matters: if React mounted first the `currentSessionId` /
`monsters` / etc. would be empty for the first frame and Phaser would
briefly render nothing.

> **Note:** `main.tsx` deliberately skips `React.StrictMode`. StrictMode
> double-invokes effects in dev, which would re-create the Phaser game
> and accumulate scene listeners. The game is deterministic — the
> safety net isn't needed.

## Phaser scenes

Three scenes, each with a single responsibility:

### `BootScene`

`client/src/game/scenes/BootScene.ts`

- Generates every texture procedurally (sand, water, stone, player,
  monster, decorations, FX, UI icons).
- Transitions straight to `WorldScene`.

The procedural asset generation lives in
`client/src/game/ProceduralAssets.ts` so it stays out of the scene
init. Adding real pixel art later = adding files under
`client/public/assets/` and loading them here alongside (or instead of)
the procedural generators.

### `WorldScene`

`client/src/game/scenes/WorldScene.ts`

- 200×100 tile overworld, camera follows the player.
- WASD / arrow keys move one tile at a time (throttled to ~120ms per
  tile so key auto-repeat feels right).
- Click on a monster (or its quest log entry) → `engage` over the WS.
- Spacebar attacks the nearest in-range monster.
- Range ring (semi-transparent circle) shows the engagement zone;
  monsters in range brighten up.

Constants that **must match the server**:

```ts
WORLD_W = 200
WORLD_H = 100
ENGAGE_RANGE = 2
```

`WorldScene` re-checks `ENGAGE_RANGE` client-side so the range ring and
interactive state stay in sync with the server's authority. The server
is still the gate — a tampered client can't bypass it.

Scene lifecycle:

```
create()
  ├── events.on(SHUTDOWN, ...)
  ├── events.on(DESTROY, ...)
  ├── buildMap()               // 20,000 tile sprites
  ├── buildDecorations()       // palms, cacti, lanterns, etc.
  ├── buildPlayer()
  ├── buildRangeRing()
  ├── cameras.main.startFollow(player, true, 0.15, 0.15)
  ├── storeUnsub = useStore.subscribe(syncMonsters + transition logic)
  └── syncMonsters(initial)

shutdown()
  ├── storeUnsub()
  ├── tweens.killTweensOf(player)
  └── destroy every monster sprite + the player sprite
```

### `BattleScene`

`client/src/game/scenes/BattleScene.ts`

- Launched via `this.scene.start("BattleScene", { monster })` from
  `WorldScene`, gated on `state.currentSessionId` changing.
- Receives the monster in `init(data)`.
- Subscribes to `combat.tick` and `session.ended` on the event bus for
  the duration of the engagement.
- Plays slash / spell / hit / death animations as ticks arrive; pops
  damage numbers; flashes + shakes on big hits.
- On `session.ended`, shows the result text and waits for click / space
  / enter / esc. The handler sends `retreat` so the server reaps the
  session, then transitions back to `WorldScene`.

Animations:

| Tick action | Animation                                                                |
| ----------- | ------------------------------------------------------------------------ |
| `slash`     | Player dashes forward, white slash arc on monster, shake, damage pop.   |
| `spell`     | Tinted orb travels from player to monster, bursts into 8 particles, shake + damage pop. |
| `hit`       | Camera shake, player shake, red damage pop.                              |
| `death`     | White flash, monster particles fly, monster body fades + scales up.       |
| `victory` / `defeat` | Full-screen text in green/red. Wait for player input.            |

## React HUD

Four DOM panels. Each is a pure function of the store — none of them hold
local state beyond UI ephemera (filter selection, scroll position).

| Panel         | File                            | Content                                                       |
| ------------- | ------------------------------- | ------------------------------------------------------------- |
| `HUD`         | `client/src/ui/HUD.tsx`         | Player name, HP bar, XP bar (xp mod 100), tile coords.        |
| `QuestLog`    | `client/src/ui/QuestLog.tsx`    | Filtered list of monsters (kind filter chips), click → engage. Shows in-range / out-of-range. |
| `SessionPanel`| `client/src/ui/SessionPanel.tsx`| Active session summary: kind, name, status, monster HP, agent step progress dots. |
| `CombatLog`   | `client/src/ui/CombatLog.tsx`   | Rolling 80-line log; auto-scrolls.                            |

Plus a connection indicator (`● connected` / `○ offline`) rendered
outside `App.tsx`'s panel list.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  HUD panel            [● connected]            SessionPanel       │
│  (top-left)                                  (top-right)         │
│                                                                  │
│                                                                  │
│                                                                  │
│       QuestLog                                                   │
│       (left, below HUD)                                          │
│                                                                  │
│                                                                  │
│ ───────────────────── CombatLog (bottom strip) ──────────────── │
└──────────────────────────────────────────────────────────────────┘
```

CSS lives in `client/src/styles.css`. The panels use
`image-rendering: pixelated` so future bitmap assets stay crisp.

## zustand store

`client/src/store.ts`

Single source of persistent client state:

```ts
{
  player: PlayerState | null,
  issues: Map<string, Issue>,
  monsters: Map<string, Monster>,
  sessions: Map<string, SessionSummary>,
  currentSessionId: string | null,
  log: LogEntry[],           // capped at LOG_CAP = 200
  connected: boolean,
}
```

A single `init(ws)` function registers:

- `ws.onStatus(setConnected)` — connection indicator.
- `ws.onServerEvent(handleEvent)` — one big switch over `event.kind`,
  each branch applying the right state mutation.

Why a switch: TypeScript exhaustiveness-checks `kind`, so adding a new
event to the protocol without handling it in the store is a typecheck
failure. Same pattern as the server.

Key reducers:

- `hello` — replace player, issues, monsters, sessions wholesale.
- `monster.despawned` (defeated) — keep the sprite but mark `defeated = true, hp = 0`.
- `session.ended` — flip session status, on `victory` mark the monster
  defeated and the issue closed. Clear `currentSessionId` if it was
  this session.
- `session.event` — append a human-readable summary to the log.
- `combat.tick` — append a one-line summary to the log.

## Event bus

`client/src/ws/bus.ts`

For transient events that Phaser scenes need to react to without
persisting into the store. Same event flows through both:

```ts
// in WsClient.onMessage
const event = S2CEventSchema.parse(...);
bus.emit(event);              // transient subscribers (Phaser)
for (const h of storeHandlers) h(event);  // persistent (zustand)
```

Subscribers:

- `BattleScene` subscribes to `combat.tick` and `session.ended` for its
  duration and unsubscribes on shutdown.
- `WorldScene` doesn't subscribe — it reacts via the store.

The bus has no replay. If you subscribe after the event, you miss it.
That's the point — these are short-lived FX, not state.

## WsClient

`client/src/ws/client.ts`

Reconnect-with-backoff, validate-at-boundary, fan-out-to-bus-and-store.

```
new WebSocket(url)
  ├── open   → connected = true, notify, startPing()
  ├── close  → connected = false, notify, stopPing(), scheduleReconnect()
  ├── error  → console.warn only; close handler does the reconnect
  └── message → JSON.parse → S2CEventSchema.safeParse
                  ├── bus.emit(event)
                  └── for (h of storeHandlers) h(event)
```

Reconnect backoff: `min(8000, 500 * 2 ** attempts)`. Caps at 8s so a long
disconnect doesn't get an exponentially-long retry.

Heartbeat: `ping` every 15s. The server replies with `pong`; the client
just drops it. Exists for proxy detection and as a hook for future auth.

Outbound messages are re-validated against `C2SEventSchema` before send.
Cheap, defensive, catches drift.

## What lives where

| Concern                              | Where                                          |
| ------------------------------------ | ---------------------------------------------- |
| Overworld layout & movement          | `client/src/game/scenes/WorldScene.ts`         |
| Combat animations                    | `client/src/game/scenes/BattleScene.ts`        |
| Procedural art                       | `client/src/game/ProceduralAssets.ts`          |
| Persistent game state                | `client/src/store.ts`                          |
| Transient FX channel                 | `client/src/ws/bus.ts`                         |
| WS protocol + reconnection           | `client/src/ws/client.ts`                      |
| HUD chrome (panels)                  | `client/src/ui/*.tsx` + `client/src/styles.css` |
| Bootstrap order (WS → store → React → Phaser) | `client/src/main.tsx` + `client/src/App.tsx` |