# Combat model

Combat is a server-side translation from agent activity to game events.
The client never invents damage — it plays the FX the server tells it to
play and renders the HP the server tells it to render.

## The translator

`server/src/session/translator.ts` owns the rules. One instance per
session (`AgentSession` creates one in its constructor), stateful enough
to ignore late events after the session ends so the mock agent's
`pr.merged` followed by `issue.closed` doesn't fire two death animations.

### Mapping

| `AgentEvent`           | Resulting `CombatTick`                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `file.edited`          | `player → monster`, `slash`, `magnitude = min(12, 2 + floor((linesAdded + linesRemoved) / 2))`, `fx = "spark"`                       |
| `tests.run` (all pass) | `player → monster`, `spell`, `magnitude = 6 + passed * 2`, `fx = "light"`                                                             |
| `tests.run` (any fail) | `monster → player`, `hit`, `magnitude = 4 + failed * 3`, `fx = "shadow"`                                                              |
| `pr.opened`            | `player → monster`, `spell`, `magnitude = 15`, `fx = "light"`                                                                         |
| `pr.merged`            | `player → monster`, `death` + `system → monster`, `victory` (session ends)                                                              |
| `issue.closed`         | Same as `pr.merged` (idempotent; translator sets `ended = true` so subsequent events are dropped).                                    |
| `error`                | `monster → player`, `hit`, `magnitude = 8 + (seed % 4)`, `fx = "shadow"`                                                              |
| `tool.start`, `tool.end` (non-error), `message` | No combat effect — these are observations, not attacks.                                       |

The seed is the issue number, so the same issue always delivers the same
damage profile. (Cosmetic — the translator only uses it for `error`
magnitude right now.)

### Damage applied to the world

For ticks with `magnitude > 0`:

- `source = monster, target = player` → `World.damagePlayer(magnitude)` →
  next `player.state` broadcast.
- `source = player, target = monster` → `World.damageMonster(...)` for
  whichever monster owns the session. The monster's new HP isn't
  re-broadcast on every tick (it would flood the wire); the next
  `monster.spawned` or session end catches the client up.

The translator never touches the world directly. Damage is applied in
`WsHub.onCombatTick` after the translator produces the ticks. Keeps the
translator pure and unit-testable.

## Why server-side?

Two reasons:

1. **Honest gameplay.** The player can't see what the agent is actually
   doing — they only see the FX. If FX came from the client, any
   tampering would corrupt combat. Server translates; client animates.
2. **One knob for game feel.** Tweaking "how much damage does a passing
   test deal" is a one-line change in `translator.ts`, no Phaser
   rebuild, no client redeploy.

## HP, XP, and the overworld math

### Player

```
hp:  100 (max)
xp:  starts at 0
level: 1 (no leveling in v0.1; xp mod 100 is shown as a bar)
```

`damagePlayer(amount)` clamps to `[0, maxHp]`. `setPlayerPosition(x, y)`
takes whatever the client sends (single-player assumption; see
[development.md](./development.md) for the validation gaps).

### Monsters

Monster HP comes from `server/src/util/palettes.ts`:

```ts
hpFor(kind, difficulty) =
  base[kind] + difficulty * 10

base = { bug: 50, feature: 70, docs: 25, chore: 35, epic: 120 }
```

`kind` and `difficulty` come from `IssueProvider`:

- **Mock** — static in `fixtures/issues.json`.
- **`gh`** — `kindFromLabels(labels)` and
  `difficultyFor(labels, body)` heuristics. See
  [github-providers.md](./github-providers.md).

When a monster is defeated (`World.defeatMonster`):

- HP clamped to 0.
- `defeated = true`.
- Issue state flipped to `closed`.
- Player gains `20 + floor(maxHp / 4)` XP.

### XP bar

`HUD.tsx` shows `xp % 100` as a bar. Real level-up is v0.2 — the
infrastructure is there (`PlayerState.level`) but no logic advances it.

## Engagement range

- The player must be within **2 tiles (Chebyshev distance)** of a monster
  to engage. The check is in `WsHub.handle({ kind: "engage" })`:
  ```ts
  if (!this.world.isPlayerNear(monster.id, ENGAGE_RANGE)) {
    this.send(client, {
      kind: "error",
      message: `Too far away (${dist} tiles). Walk closer to engage.`,
    });
    return;
  }
  ```
- The WorldScene also enforces this client-side so the quest log and
  monster click UX reflect range. Both `WorldScene` and `QuestLog` use
  `Math.max(|dx|, |dy|)` so diagonals count.
- The server's check is authoritative. A misbehaving client gets an
  `error` event back, never a session.

## Encounter lifecycle

```
engage       server validates proximity + creates AgentSession
            └── session.started broadcast
                └── currentSessionId set in store → WorldScene transitions
                                                          to BattleScene

... combat ticks stream in ...

agent finishes naturally
            └── session.ended broadcast (victory / defeat)
                └── onCombatTick(death + victory FX)
                    └── BattleScene shows the result screen
                        └── waits for player to click / press space / Esc

player presses Retreat or result-screen keypress
            └── retreat sessionId sent
                └── server reaps session
                    └── session.ended broadcast (re-issued)
                        └── currentSessionId cleared → WorldScene runs
                            └── monster sprite stays (defeated state)
                                OR new monster roster if server re-hydrated
```

The session is **kept alive between `session.ended` (natural) and
`retreat` (player closes engagement screen)**. That window is what lets the
player review the full agent log via the `SessionPanel`.

## Animation rules live where

| Concern                           | File                                     |
| --------------------------------- | ---------------------------------------- |
| Tick → animation                  | `client/src/game/scenes/BattleScene.ts`  |
| Tick → log line                   | `client/src/store.ts` (`combatTickText`) |
| AgentEvent → log line             | `client/src/store.ts` (`summarizeAgentEvent`) |
| AgentEvent → ticks                | `server/src/session/translator.ts`       |
| Damage applied to world           | `server/src/ws/hub.ts` (`onCombatTick`)  |
| Monster HP / palette / sprite     | `server/src/state/world.ts` + `client/src/game/scenes/WorldScene.ts` |