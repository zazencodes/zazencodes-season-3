import type { Issue, Monster, PlayerState } from "@minimax-dev-rpg/protocol";
import { newId } from "../util/ids.js";
import { hpFor, kindFromLabels, paletteFor } from "../util/palettes.js";

/**
 * Overworld is large enough to cover any reasonable viewport at 32px/tile
 * (200×100 = 6400×3200px). The client renders only the viewport-sized
 * portion via a camera that follows the player, so the visible area
 * always shows the map — never a void.
 */
export const WORLD_W = 200;
export const WORLD_H = 100;
export const PLAYER_START = { x: 100, y: 50 };

/**
 * Generate a random set of spawn points scattered in a ring around the
 * player's start. Each point is placed at a random angle in
 * [minDist, maxDist] from the center, and points are rejected if they
 * end up too close to an existing one (so monsters never overlap).
 */
function generateSpawnPoints(
  count: number,
  cx: number,
  cy: number,
  minDist: number,
  maxDist: number,
  minSeparation: number,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  let attempts = 0;
  while (out.length < count && attempts < count * 40) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const dist = minDist + Math.random() * (maxDist - minDist);
    const x = Math.round(cx + Math.cos(angle) * dist);
    const y = Math.round(cy + Math.sin(angle) * dist);
    if (out.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) < minSeparation)) {
      continue;
    }
    out.push({ x, y });
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export class World {
  private _player: PlayerState;
  private _monsters = new Map<string, Monster>();
  private _issues = new Map<string, Issue>();
  private _defeatedIssueIds = new Set<string>();

  constructor() {
    this._player = {
      id: newId(),
      name: "Adventurer",
      hp: 100,
      maxHp: 100,
      xp: 0,
      level: 1,
      x: PLAYER_START.x,
      y: PLAYER_START.y,
    };
  }

  hydrate(issues: Issue[]) {
    for (const issue of issues) this._issues.set(issue.id, { ...issue, state: "open" });
    this.resetDemoData();
  }

  reset() {
    this._player.x = PLAYER_START.x;
    this._player.y = PLAYER_START.y;
    this._player.hp = this._player.maxHp;
    this.randomizeMonsters();
  }

  resetDemoData() {
    this._defeatedIssueIds.clear();
    for (const issue of this._issues.values()) {
      issue.state = "open";
    }
    this._player = {
      id: newId(),
      name: "Adventurer",
      hp: 100,
      maxHp: 100,
      xp: 0,
      level: 1,
      x: PLAYER_START.x,
      y: PLAYER_START.y,
    };
    this._monsters.clear();
    this.randomizeMonsters();
  }

  randomizeMonsters() {
    const defeatedMonsters = Array.from(this._monsters.values()).filter((m) => m.defeated || this._defeatedIssueIds.has(m.issueId));
    const openIssues = Array.from(this._issues.values()).filter(
      (i) => i.state === "open" && !this._defeatedIssueIds.has(i.id),
    );
    // Random scatter around the player start — 8–18 tiles out, at least
    // 4 tiles between monsters so they never overlap.
    const spawnPoints = generateSpawnPoints(
      openIssues.length,
      PLAYER_START.x,
      PLAYER_START.y,
      8,
      18,
      4,
    );
    this._monsters.clear();
    // Re-add defeated monsters (dead markers)
    for (const dm of defeatedMonsters) {
      this._monsters.set(dm.id, { ...dm, defeated: true, hp: 0 });
    }
    let i = 0;
    for (const issue of openIssues) {
      const kind = kindFromLabels(issue.labels);
      const maxHp = hpFor(kind, issue.difficulty);
      const point = spawnPoints[i] ?? { x: PLAYER_START.x + 10, y: PLAYER_START.y + 10 };
      const monster: Monster = {
        id: newId(),
        issueId: issue.id,
        name: `#${issue.number}: ${truncate(issue.title, 28)}`,
        kind,
        hp: maxHp,
        maxHp,
        x: point.x,
        y: point.y,
        palette: paletteFor(kind, issue.number),
        defeated: false,
      };
      this._monsters.set(monster.id, monster);
      i++;
    }
  }

  get player(): PlayerState {
    return this._player;
  }

  damagePlayer(amount: number) {
    if (amount <= 0) return;
    this._player.hp = clamp(this._player.hp - amount, 0, this._player.maxHp);
  }

  /**
   * Update the player's tile position. Called when the client reports a
   * move so the server can authoritatively check engagement proximity.
   * The client is trusted for now (single-player); a future iteration
   * should validate bounds, water tiles, and rate-limit.
   */
  setPlayerPosition(x: number, y: number) {
    this._player.x = x;
    this._player.y = y;
  }

  /** Apply damage to a monster. Returns the actual amount applied (post-clamp). */
  damageMonster(monsterId: string, amount: number): number {
    if (amount <= 0) return 0;
    const m = this._monsters.get(monsterId);
    if (!m || m.defeated) return 0;
    const applied = Math.min(m.hp, amount);
    m.hp -= applied;
    return applied;
  }

  /** Called on a victory. */
  defeatMonster(monsterId: string) {
    const m = this._monsters.get(monsterId);
    if (!m) return;
    m.defeated = true;
    m.hp = 0;
    this._defeatedIssueIds.add(m.issueId);
    const issue = this._issues.get(m.issueId);
    if (issue) {
      issue.state = "closed";
    }
    this._player.xp += 20 + Math.floor(m.maxHp / 4);
  }

  removeMonster(monsterId: string) {
    this._monsters.delete(monsterId);
  }

  /**
   * Chebyshev distance (max of |dx|, |dy|) between the player and a
   * monster. Returns Infinity if either is missing. Engagement is only
   * allowed when this is ≤ the engagement range.
   */
  distanceToMonster(monsterId: string): number {
    const m = this._monsters.get(monsterId);
    if (!m) return Infinity;
    return Math.max(Math.abs(this._player.x - m.x), Math.abs(this._player.y - m.y));
  }

  getMonsters(): Monster[] {
    return Array.from(this._monsters.values());
  }

  getMonster(id: string): Monster | undefined {
    return this._monsters.get(id);
  }

  getIssues(): Issue[] {
    return Array.from(this._issues.values());
  }

  getIssue(id: string): Issue | undefined {
    return this._issues.get(id);
  }

  /** Authoritative engagement-range check. */
  isPlayerNear(monsterId: string, range: number): boolean {
    return this.distanceToMonster(monsterId) <= range;
  }
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
