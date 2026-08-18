# Protocol

The single WebSocket connection at `ws://<host>:<port>/ws` carries every
message between client and server. All messages share one envelope, all
payloads are zod-validated at the boundary, and the schema lives in
[`packages/protocol/`](../packages/protocol/) so both sides import the same
types.

## Envelope

Every message — client- or server-bound — carries:

```ts
{
  id: string;        // monotonic-ish id (server uses randomUUID)
  ts: number;        // epoch ms
  kind: string;      // discriminator
  ...payload         // discriminated union member
}
```

The id and ts are added by the WS layer right before send. The protocol
itself never cares about ordering — every state-changing event is an
absolute payload (current HP, current monster roster, etc.), not a delta.

## Source of truth

`packages/protocol/src/events.ts` defines `C2SEventSchema` and
`S2CEventSchema` as discriminated unions. The zod types are the wire
contract; `tsc --noEmit` on either side will catch drift at compile time.

Add a new event:

1. Add the zod schema in `events.ts`.
2. Add it to the right union (`C2SEventSchema` or `S2CEventSchema`).
3. Server: emit it from the sink or hub.
4. Client: handle it in `client/src/store.ts` (persistent) or
   `client/src/ws/bus.ts` (transient).

Both sides pick up the type via inference — no code-gen, no shared package
versioning needed.

## Client → Server (`C2SEvent`)

| Kind       | Payload                  | Notes                                        |
| ---------- | ------------------------ | -------------------------------------------- |
| `engage`   | `{ issueId: string }`    | Walk within range (≤ 2 tiles) first or the server rejects with an error event. |
| `retreat`  | `{ sessionId: string }`  | Universal "close engagement screen". Works for both active sessions (cancel + reap) and terminal sessions (just reap + re-broadcast). The session's terminal outcome is preserved. |
| `move`     | `{ x: number, y: number }` | Player tile position. Server updates `World` authoritatively. |
| `ping`     | `{ ts: number }`         | Heartbeat. Server replies with `pong`.      |

Server-side validation:

- `engage` — must reference a known issue with a monster; player must be
  within `ENGAGE_RANGE` (2 tiles, Chebyshev); the monster must not already
  be engaged.
- `move` — out-of-bounds and water-tile checks happen client-side only;
  the server trusts the client for now (single-player assumption).
- Malformed JSON or schema mismatch → server sends `error` back to the
  same client.

## Server → Client (`S2CEvent`)

### Snapshot

| Kind              | Payload                                          | Notes                       |
| ----------------- | ------------------------------------------------ | --------------------------- |
| `hello`           | `{ player, issues[], monsters[], sessions[] }`    | Sent on every WS connection. The client treats this as the reset of all state. |
| `issue.synced`    | `{ issues[] }`                                   | Reserved; v0.1 doesn't push issue updates mid-session. |
| `player.state`    | `{ player }`                                     | HP/XP changed — usually because the player took damage from a monster counter-attack or a monster was defeated. |

### World entities

| Kind                 | Payload                                                  | Notes                                          |
| -------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `monster.spawned`    | `{ monster }`                                            | New monster in the world.                      |
| `monster.moved`      | `{ monsterId, x, y }`                                    | Monster AI moved it. v0.2+.                    |
| `monster.despawned`  | `{ monsterId, reason: "defeated" \| "fled" \| "manual" }` | On `defeated`, client keeps the sprite but greys it out and marks HP 0. |

### Engagement

| Kind              | Payload                                                                  | Notes                                              |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| `session.started` | `{ session }`                                                            | Client sets `currentSessionId` and transitions to `BattleScene`. |
| `session.event`   | `{ sessionId, event: AgentEvent }`                                       | Raw agent output. Phaser ignores this; React summarizes it into the log. |
| `session.ended`   | `{ sessionId, outcome: "victory" \| "defeat" \| "abandoned", summary }`  | Sent by either the agent finishing naturally or by the client retreating from a terminal session. |
| `combat.tick`     | `{ sessionId, source, target, action, magnitude, fx }`                   | Pre-shaped by `CombatTranslator`. Phaser plays the animation; React shows the line. |
| `error`           | `{ message }`                                                            | Malformed JSON, out-of-range engage, etc. Surfaced in the combat log. |
| `pong`            | `{ ts }`                                                                 | Reply to a `ping`. The client just drops it.     |

## Lifecycle

```
client                server                  client
  │ ─── connect ─────►  │                        │
  │                     │  hello                 │
  │ ◄────── hello ──────┤ (player, issues,       │
  │                      │  monsters, sessions)  │
  │                     │                        │
  │  walk around        │                        │
  │  ───── move ──────► │                        │
  │                     │                        │
  │  ─── engage ──────► │ (validate proximity)   │
  │                     │  start AgentSession    │
  │ ◄── session.started ┤                        │
  │                     │                        │
  │                     │  AgentSession runs ──► agent
  │                     │  AgentEvent flows     │
  │ ◄── session.event ──┤ (raw, for the log)     │
  │ ◄── combat.tick ────┤ (pre-shaped, for FX)   │
  │                     │                        │
  │                     │  ...more events...     │
  │                     │                        │
  │ ◄── session.ended ──┤ (agent finished)       │
  │ ◄── combat.tick ────┤ (death + victory FX)   │
  │                     │                        │
  │  ──── retreat ────► │ reap session           │
  │ ◄── session.ended ──┤ (broadcast again       │
  │                     │  so UI transitions)    │
  │                     │                        │
  │  click, keypress,   │                        │
  │  back to WorldScene │                        │
```

The session is **kept alive after `session.ended`** until the player sends
`retreat`. That's so the engagement screen stays open with the full agent
log available — `SessionPanel` and `CombatLog` keep rendering the log until
the player dismisses them.

## Reconnection

The client's `WsClient` (`client/src/ws/client.ts`) reconnects with
exponential backoff (max 8s) on socket close or error. On reconnect the
server treats it like a fresh client:

1. Resets `World` (player position randomized to start, monsters
   re-randomized).
2. Re-runs `listIssues()` on the `IssueProvider` — important for the
   `gh` provider, since issues may have changed in the time the client was
   offline.
3. Sends a fresh `hello`.

So a reconnect isn't a resume — it's a "see what's there now" snapshot.
Existing in-flight sessions are lost (the agent process is unaffected;
it just keeps emitting events into a session nobody is listening to).

## Heartbeat

The client pings every 15s with `{ kind: "ping", ts: Date.now() }`. The
server replies with `{ kind: "pong", ts }`. Nothing actually depends on
these today — they're there so a future proxy or auth layer has a hook,
and so dead connections get detected at the TCP level sooner.

## Validation at the boundary

Both sides re-parse every inbound message against the zod schema. This is
defensive — it catches protocol drift immediately and prints a clear
warning instead of silently misrendering.

- Server: `server/src/ws/hub.ts` → `C2SEventSchema.safeParse` → `error` on
  mismatch.
- Client: `client/src/ws/client.ts` → `S2CEventSchema.safeParse` → log
  warning + drop.

Adding a new event means adding it to the union in
`packages/protocol/src/events.ts`. Both sides then fail to compile (or
fail to typecheck the `switch` on `kind`) until they handle it. That's
deliberate — it's the closest thing we have to a contract test.