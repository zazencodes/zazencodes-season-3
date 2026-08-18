# GitHub providers

The server speaks to GitHub (or its stand-in) through `IssueProvider` —
`server/src/github/types.ts`. Two implementations exist:

| Provider  | File                          | What it does                                                                |
| --------- | ----------------------------- | --------------------------------------------------------------------------- |
| `Mock`    | `server/src/github/mock.ts`   | Reads `server/src/fixtures/issues.json` at boot. No network dependency.     |
| `GhCli`   | `server/src/github/gh.ts`     | Spawns the `gh` CLI to list open issues for a configured repo.               |

Selection is via env var at boot — see
[development.md](./development.md#environment-variables).

## The contract

```ts
interface IssueProvider {
  readonly name: string;
  listIssues(): Promise<Issue[]>;
  onUpdate?(cb: (issues: Issue[]) => void): () => void;
}
```

`listIssues()` is called once at boot when the server hydrates `World`.
Today neither provider implements `onUpdate` — issue changes are picked up
on the next client reconnect (which re-runs `listIssues()` in the hub).

## MockIssueProvider

- Reads `server/src/fixtures/issues.json` from disk.
- Caches the parsed array in memory after the first call.
- Four hardcoded issues spanning `bug`, `feature`, `docs`, and `critical`
  (which becomes `epic`) — enough variety to exercise every palette and
  the full difficulty range.

```ts
async listIssues() {
  if (this.cache) return this.cache;
  const raw = await readFile(
    join(__dirname, "..", "fixtures", "issues.json"),
    "utf8",
  );
  this.cache = JSON.parse(raw) as Issue[];
  return this.cache;
}
```

Use it when you want a zero-network, zero-credential demo loop.

## GhCliIssueProvider

- Spawns `gh issue list --state open --limit 100 --json ... --repo <owner/name>`.
- Parses the JSON output and maps each entry into the protocol's `Issue`
  shape.
- The repo is validated (`/^[^/\s]+\/[^/\s]+$/`) at construction so a
  misconfigured env var fails fast at boot, not on the first
  `listIssues()` call.
- Non-zero exit codes throw — they don't fall back to an empty list
  (silent breakage is worse than a loud boot failure).

```ts
spawn("gh", ["issue", "list", "--state", "open", "--limit", "100",
             "--json", "number,title,body,labels,url", "--repo", this.repo])
```

Required: the `gh` CLI on `$PATH`, authenticated (`gh auth status`),
read access to the target repo.

## Issue → Monster mapping

### Labels → MonsterKind (`kindFromLabels`)

```ts
function kindFromLabels(labels: string[]): MonsterKind {
  const l = new Set(labels.map(x => x.toLowerCase()));
  if (l.has("epic") || l.has("critical")) return "epic";
  if (l.has("bug")) return "bug";
  if (l.has("docs") || l.has("documentation")) return "docs";
  if (l.has("feature") || l.has("enhancement")) return "feature";
  return "chore";
}
```

Each `MonsterKind` has its own palette
(`server/src/util/palettes.ts`) and HP base.

### Difficulty heuristic (`difficultyFor`)

Labels drive the bucketing; body length is a backstop for unlabeled issues.

```
critical | epic          → 5
good first issue | beginner → 1
hard                       → 4
easy                       → 2
otherwise by body length:
  <200   → 2
  <800   → 3
  <2000  → 4
  else   → 5
```

The world only uses `difficulty` for `hpFor(kind, difficulty)`, so the
heuristic doesn't need to be precise — coarse buckets are fine.

### HP formula

```ts
hpFor(kind, difficulty) = base[kind] + difficulty * 10

base = {
  bug: 50, feature: 70, docs: 25, chore: 35, epic: 120
}
```

So a "critical" `bug` issue is `50 + 5*10 = 100 HP`. A "good first
issue" `docs` issue is `25 + 1*10 = 35 HP`. The combat translator's
damage values are tuned to feel right against this range — see
[combat.md](./combat.md).

### Palette shift

Each monster also gets a `palette` derived from its kind + issue number:

```ts
paletteFor(kind, seed) = shift(basePalette[kind], seed)
```

`shift` does a small RGB tweak per channel so two `bug` issues don't
look identical. The client tints the procedural monster sprite with
these colors at spawn time.

## Issue IDs

`id` is provider-namespaced:

- Mock: `"github:acme/web#14"` (matches the fixture URLs).
- `gh`: `"github:<repo>#<number>"` (e.g. `"github:zazencodes/habit-cli#42"`).

The `provider` field is always `"github"` today, but the type allows
extending later (e.g. Linear, Jira) without changing the protocol.

## Spawn layout

`World.randomizeMonsters` places every monster at a random tile in a
ring `[8, 18]` from the player's start (100, 50), with a 4-tile minimum
separation so they never overlap. Constants:

```ts
WORLD_W = 200   // tiles
WORLD_H = 100
PLAYER_START = { x: 100, y: 50 }
ENGAGE_RANGE = 2 (tiles, Chebyshev)
```

These match the constants in `client/src/game/scenes/WorldScene.ts` —
the world is sized large enough that the camera follows the player and
the viewport always shows map (no void).