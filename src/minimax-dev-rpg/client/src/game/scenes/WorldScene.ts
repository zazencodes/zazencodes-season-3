import Phaser from "phaser";
import { useStore } from "../../store.js";
import { getShared } from "../../ws/client.js";
import { TILE } from "../main.js";
import type { Monster } from "@minimax-dev-rpg/protocol";

const ws = getShared();

/** World is large enough to cover any viewport. 200×100 at 32px/tile =
 *  6400×3200px — the camera follows the player, so the viewport always
 *  shows the map, never a void. Constants must match the server's
 *  `WORLD_W` / `WORLD_H` in `server/src/state/world.ts`. */
const WORLD_W = 200;
const WORLD_H = 100;

export class WorldScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private rangeRing!: Phaser.GameObjects.Graphics;
  private monsterSprites = new Map<string, Phaser.GameObjects.Container>();
  private storeUnsub: (() => void) | null = null;
  private transitioning = false;
  /** Time of the last accepted move. Used to throttle key auto-repeat
   *  to one tile per MOVE_INTERVAL ms. */
  private lastMoveTime = 0;
  private static readonly MOVE_INTERVAL = 120;

  /** Engagement range, in tiles. Must match the server's `ENGAGE_RANGE`
   *  in `server/src/ws/hub.ts`. */
  private static readonly ENGAGE_RANGE = 2;

  constructor() {
    super("WorldScene");
  }

  create() {
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.shutdown, this);

    this.cameras.main.setBackgroundColor("#0d0a08");
    this.buildMap();
    this.buildDecorations();
    this.buildPlayer();
    this.buildRangeRing();
    this.cameras.main.setBounds(0, 0, WORLD_W * TILE, WORLD_H * TILE);
    this.cameras.main.startFollow(this.playerSprite, true, 0.15, 0.15);
    // Snap the camera to the player immediately so the first frame is
    // already centered, not lerping in from (0, 0).
    this.cameras.main.centerOn(this.playerSprite.x, this.playerSprite.y);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd;

    // Spacebar attacks the nearest in-range monster.
    this.input.keyboard!.on("keydown-SPACE", () => this.spacebarAttack());

    // React to store updates. The session is the source of truth for when
    // a battle starts — we don't navigate to BattleScene on local click;
    // we wait for the server's `session.started` (which sets
    // currentSessionId) and then transition.
    this.storeUnsub = useStore.subscribe((state, prev) => {
      this.syncMonsters(state.monstersList());
      if (state.player && this.playerSprite) {
        const targetX = state.player.x * TILE + TILE / 2;
        const targetY = state.player.y * TILE + TILE / 2;
        const dist = Math.hypot(this.playerSprite.x - targetX, this.playerSprite.y - targetY);
        if (dist > TILE * 1.5 || !prev.player) {
          this.tweens.killTweensOf(this.playerSprite);
          this.playerSprite.setPosition(targetX, targetY);
          this.playerSprite.setDepth(targetY);
          this.cameras.main.centerOn(targetX, targetY);
        }
        this.refreshMonsterInteraction();
      }
      // BattleScene transition is driven by the server, not the click.
      // Guard against multiple subscribers (HMR / scene re-init) firing
      // the same transition twice — Phaser would otherwise start the
      // scene a second time mid-transition, leaving the world in limbo.
      if (
        !this.transitioning &&
        state.currentSessionId &&
        state.currentSessionId !== prev.currentSessionId
      ) {
        const session = state.sessions.get(state.currentSessionId);
        const monster = session ? state.monsters.get(session.monsterId) : undefined;
        if (monster) {
          this.transitioning = true;
          this.scene.start("BattleScene", { monster });
        }
      }
    });

    this.syncMonsters(useStore.getState().monstersList());
    this.refreshMonsterInteraction();
    this.drawRangeRing();
  }

  private buildRangeRing() {
    // Semi-transparent ring centered on the player showing the melee
    // engagement range. Tinted brighter when a monster is in range.
    this.rangeRing = this.add.graphics();
    this.rangeRing.setDepth(50);
  }

  private drawRangeRing() {
    const g = this.rangeRing;
    g.clear();
    if (!this.playerSprite) return;
    const inRange = this.anyMonsterInRange();
    const color = inRange ? 0xd44a3a : 0xd4a44a;
    const alpha = inRange ? 0.8 : 0.55;
    const px = this.playerSprite.x;
    const py = this.playerSprite.y;
    const r = (WorldScene.ENGAGE_RANGE + 0.5) * TILE;
    g.lineStyle(3, color, alpha);
    g.strokeCircle(px, py, r);
    // Soft inner glow so the engagement zone reads at a glance
    g.fillStyle(color, 0.12);
    g.fillCircle(px, py, r);
  }

  private anyMonsterInRange(): boolean {
    const player = useStore.getState().player;
    if (!player) return false;
    for (const m of useStore.getState().monsters.values()) {
      if (this.distance(player, m) <= WorldScene.ENGAGE_RANGE) return true;
    }
    return false;
  }

  private distance(player: { x: number; y: number }, m: { x: number; y: number }) {
    return Math.max(Math.abs(player.x - m.x), Math.abs(player.y - m.y));
  }

  shutdown() {
    this.storeUnsub?.();
    this.storeUnsub = null;
    this.transitioning = false;
    this.lastMoveTime = 0;
    this.input.keyboard?.off("keydown-SPACE");
    if (this.playerSprite) this.tweens.killTweensOf(this.playerSprite);
    // Destroy any lingering monster sprites so they don't survive a scene
    // restart (they're added to the scene's display list, and Phaser
    // doesn't always clear them on a stopped→started transition).
    for (const sprite of this.monsterSprites.values()) sprite.destroy();
    this.monsterSprites.clear();
    this.playerSprite?.destroy();
  }

  update(_time: number, _delta: number) {
    const player = useStore.getState().player;
    if (!player) return;
    // Independent checks so diagonals work. Each axis writes its own delta.
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;
    if (dx === 0 && dy === 0) {
      // Reset the throttle when no key is held so the first press after
      // a pause always moves immediately.
      this.lastMoveTime = 0;
      return;
    }
    // Throttle: one tile per MOVE_INTERVAL ms. `lastMoveTime === 0` is
    // the "ready" sentinel — the very first keypress is always accepted,
    // no special-case, no async, no race.
    const now = _time;
    if (this.lastMoveTime !== 0 && now - this.lastMoveTime < WorldScene.MOVE_INTERVAL) return;
    this.lastMoveTime = now;
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (!this.inBounds(nx, ny) || this.isWater(nx, ny)) return;

    this.tweenPlayerTo(nx, ny);
    useStore.setState((s) => ({
      player: s.player ? { ...s.player, x: nx, y: ny } : s.player,
    }));
    ws.send({ kind: "move", x: nx, y: ny });
  }

  private inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
  }

  /* ─── Map building ──────────────────────────────────────────────── */

  private buildMap() {
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const px = x * TILE;
        const py = y * TILE;
        const key = this.isWater(x, y)
          ? "tile.water"
          : this.isPath(x, y)
            ? "tile.sand.path"
            : "tile.sand";
        const tile = this.add.image(px, py, key).setOrigin(0);
        tile.setDepth(-1000 + py);
      }
    }
  }

  private isPath(x: number, y: number) {
    // Cross-shaped path through the center of the 200×100 world.
    const cx = WORLD_W / 2; // 100
    const cy = WORLD_H / 2; // 50
    return (
      (x >= 4 && x <= WORLD_W - 5 && y >= cy - 1 && y <= cy + 1) ||
      (y >= 4 && y <= WORLD_H - 5 && x >= cx - 1 && x <= cx + 1)
    );
  }

  private isWater(x: number, y: number) {
    // Bottom-right pond, near the SE corner of the map.
    return x >= WORLD_W - 14 && y >= WORLD_H - 8;
  }

  private buildDecorations() {
    // Spread across the large 200×100 world, not crammed into one corner.
    // Path runs through (100, 50); palms/cacti/rocks/chests/lanterns sit
    // in the sand around it. The exact coords don't matter — they just
    // need to populate the player's view and feel non-empty while walking.
    const placements: Array<{ x: number; y: number; key: string }> = [
      // palms (clustered in the four quadrants)
      { x: 12, y: 10, key: "deco.palm" },
      { x: 25, y: 18, key: "deco.palm" },
      { x: 40, y: 8, key: "deco.palm" },
      { x: 160, y: 12, key: "deco.palm" },
      { x: 180, y: 22, key: "deco.palm" },
      { x: 188, y: 8, key: "deco.palm" },
      { x: 15, y: 82, key: "deco.palm" },
      { x: 30, y: 90, key: "deco.palm" },
      { x: 170, y: 88, key: "deco.palm" },
      { x: 185, y: 80, key: "deco.palm" },
      // cacti (dotted around)
      { x: 8, y: 35, key: "deco.cactus" },
      { x: 22, y: 45, key: "deco.cactus" },
      { x: 45, y: 60, key: "deco.cactus" },
      { x: 8, y: 70, key: "deco.cactus" },
      { x: 155, y: 40, key: "deco.cactus" },
      { x: 175, y: 55, key: "deco.cactus" },
      { x: 160, y: 70, key: "deco.cactus" },
      { x: 190, y: 65, key: "deco.cactus" },
      // rocks
      { x: 50, y: 30, key: "deco.rock" },
      { x: 145, y: 30, key: "deco.rock" },
      { x: 50, y: 75, key: "deco.rock" },
      { x: 150, y: 75, key: "deco.rock" },
      // chests (at the four cardinal points near the path)
      { x: 85, y: 50, key: "deco.chest" },
      { x: 115, y: 50, key: "deco.chest" },
      { x: 100, y: 35, key: "deco.chest" },
      { x: 100, y: 65, key: "deco.chest" },
      // lanterns flanking the cross path at the center
      { x: 90, y: 50, key: "deco.lantern" },
      { x: 110, y: 50, key: "deco.lantern" },
      { x: 100, y: 40, key: "deco.lantern" },
      { x: 100, y: 60, key: "deco.lantern" },
    ];
    for (const p of placements) {
      const sprite = this.add.image(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2, p.key);
      sprite.setDepth(p.y * TILE);
    }
  }

  private buildPlayer() {
    const player = useStore.getState().player;
    const tx = player?.x ?? 100;
    const ty = player?.y ?? 50;
    this.playerSprite = this.add.sprite(tx * TILE + TILE / 2, ty * TILE + TILE / 2, "player");
    this.playerSprite.setOrigin(0.5, 0.5);
    this.playerSprite.setDepth(ty * TILE + TILE / 2);
  }

  private tweenPlayerTo(tx: number, ty: number) {
    const targetX = tx * TILE + TILE / 2;
    const targetY = ty * TILE + TILE / 2;
    this.playerSprite.setDepth(targetY);
    this.tweens.killTweensOf(this.playerSprite);
    this.tweens.add({
      targets: this.playerSprite,
      x: targetX,
      y: targetY,
      duration: 100,
      ease: "Linear",
      onUpdate: () => {
        this.drawRangeRing();
      },
      onComplete: () => {
        this.playerSprite.setPosition(targetX, targetY);
        this.drawRangeRing();
      },
    });
  }

  /* ─── Monsters ──────────────────────────────────────────────────── */

  private syncMonsters(monsters: Monster[]) {
    const seen = new Set<string>();
    for (const m of monsters) {
      seen.add(m.id);
      let sprite = this.monsterSprites.get(m.id);
      if (!sprite) {
        sprite = this.makeMonsterSprite(m);
        this.monsterSprites.set(m.id, sprite);
      }
      this.updateMonsterAppearance(sprite, m);
      this.tweenMonsterTo(sprite, m.x, m.y);
      this.updateMonsterLabel(sprite, m);
    }
    for (const [id, sprite] of this.monsterSprites) {
      if (!seen.has(id)) {
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          scale: 1.4,
          duration: 250,
          onComplete: () => sprite.destroy(),
        });
        this.monsterSprites.delete(id);
      }
    }
    this.refreshMonsterInteraction();
  }

  private updateMonsterAppearance(sprite: Phaser.GameObjects.Container, m: Monster) {
    const isDead = m.defeated || m.hp <= 0;
    const body = (sprite.getData("body") ?? sprite.list?.[1]) as Phaser.GameObjects.Sprite | undefined;
    const accent = sprite.list?.[2] as Phaser.GameObjects.Sprite | undefined;
    if (isDead) {
      if (body) {
        body.setTexture("monster.dead");
        body.clearTint();
        body.setAlpha(0.7);
        body.setScale(1);
      }
      accent?.setVisible(false);
      if (sprite.input) sprite.disableInteractive();
      sprite.setDepth(m.y * TILE);
    } else {
      if (body) {
        body.setTexture("monster");
        body.setTint(parseInt(m.palette.body.slice(1), 16));
      }
      if (accent) {
        accent.setVisible(true);
        accent.setTint(parseInt(m.palette.accent.slice(1), 16));
        accent.setAlpha(0.45);
        accent.setScale(0.8);
      }
      sprite.setDepth(m.y * TILE + TILE / 2);
    }
  }

  /**
   * Re-evaluate which monsters are in melee range and toggle their
   * interactive state. Called whenever the player or any monster moves.
   */
  private refreshMonsterInteraction() {
    const player = useStore.getState().player;
    if (!player) return;
    for (const [id, sprite] of this.monsterSprites) {
      if (!sprite || !sprite.active) continue;
      const m = useStore.getState().monsters.get(id);
      if (!m) continue;
      const isDead = m.defeated || m.hp <= 0;
      if (isDead) {
        if (sprite.input) sprite.disableInteractive();
        const body = (sprite.getData("body") ?? sprite.list?.[1]) as Phaser.GameObjects.Sprite | undefined;
        body?.setAlpha(0.7);
        continue;
      }
      const inRange = this.distance(player, m) <= WorldScene.ENGAGE_RANGE;
      const body = (sprite.getData("body") ?? sprite.list?.[1]) as Phaser.GameObjects.Sprite | undefined;
      if (inRange) {
        if (!sprite.input) this.attachMonsterInteraction(sprite, m);
        // Slight visual pulse on in-range monsters
        body?.setAlpha(1);
      } else {
        if (sprite.input) sprite.disableInteractive();
        body?.setAlpha(0.55);
      }
    }
    this.drawRangeRing();
  }

  private attachMonsterInteraction(sprite: Phaser.GameObjects.Container, m: Monster) {
    if (m.defeated || m.hp <= 0) return;
    sprite.setInteractive(
      new Phaser.Geom.Rectangle(-16, -16, 32, 32),
      Phaser.Geom.Rectangle.Contains,
    );
    sprite.on("pointerdown", () => this.tryEngage(m));
    sprite.on("pointerover", () => {
      const body = (sprite.getData("body") ?? sprite.list?.[1]) as Phaser.GameObjects.Sprite | undefined;
      const label = (sprite.getData("label") ?? sprite.list?.[3]) as Phaser.GameObjects.Text | undefined;
      body?.setScale(1.08);
      label?.setScale(1.1);
    });
    sprite.on("pointerout", () => {
      const body = (sprite.getData("body") ?? sprite.list?.[1]) as Phaser.GameObjects.Sprite | undefined;
      const label = (sprite.getData("label") ?? sprite.list?.[3]) as Phaser.GameObjects.Text | undefined;
      body?.setScale(1);
      label?.setScale(1);
    });
  }

  private tryEngage(m: Monster) {
    if (m.defeated || m.hp <= 0) return;
    const player = useStore.getState().player;
    if (!player) return;
    if (this.distance(player, m) > WorldScene.ENGAGE_RANGE) {
      // Belt-and-braces: the server will reject this too, but no point
      // even sending it. Bump the monster to give a "not yet" cue.
      const sprite = this.monsterSprites.get(m.id);
      const body = (sprite?.getData("body") ?? sprite?.list?.[1]) as Phaser.GameObjects.Sprite | undefined;
      if (body) {
        this.tweens.add({
          targets: body,
          x: body.x + 3,
          duration: 60,
          yoyo: true,
          repeat: 1,
        });
      }
      return;
    }
    const sprite = this.monsterSprites.get(m.id);
    const body = (sprite?.getData("body") ?? sprite?.list?.[1]) as Phaser.GameObjects.Sprite | undefined;
    if (body) {
      this.tweens.add({
        targets: body,
        scaleX: 1.2,
        scaleY: 0.85,
        yoyo: true,
        duration: 90,
      });
    }
    ws.send({ kind: "engage", issueId: m.issueId });
  }

  /** Spacebar: attack the nearest in-range monster. */
  private spacebarAttack() {
    const player = useStore.getState().player;
    if (!player) return;
    let nearest: Monster | null = null;
    let nearestDist = Infinity;
    for (const m of useStore.getState().monsters.values()) {
      if (m.defeated || m.hp <= 0) continue;
      const d = this.distance(player, m);
      if (d <= WorldScene.ENGAGE_RANGE && d < nearestDist) {
        nearest = m;
        nearestDist = d;
      }
    }
    if (nearest) this.tryEngage(nearest);
  }

  private makeMonsterSprite(m: Monster): Phaser.GameObjects.Container {
    const isDead = m.defeated || m.hp <= 0;
    const body = this.add.sprite(0, 0, isDead ? "monster.dead" : "monster");
    if (!isDead) {
      body.setTint(parseInt(m.palette.body.slice(1), 16));
    } else {
      body.setAlpha(0.7);
    }
    const accent = this.add.sprite(0, 0, "monster");
    if (!isDead) {
      accent.setTint(parseInt(m.palette.accent.slice(1), 16));
      accent.setAlpha(0.45);
      accent.setScale(0.8);
    } else {
      accent.setVisible(false);
    }
    const label = this.add.text(0, -28, isDead ? `${m.name}\n[DEFEATED]` : m.name, {
      fontFamily: "monospace",
      fontSize: "9px",
      color: isDead ? "#9a8a7a" : "#f1d4a3",
      stroke: "#0d0a08",
      strokeThickness: 3,
      align: "center",
    });
    label.setOrigin(0.5, 1);
    const shadow = this.add.ellipse(0, 16, 24, 6, 0x000000, 0.3);
    const container = this.add.container(m.x * TILE + TILE / 2, m.y * TILE + TILE / 2, [
      shadow,
      body,
      accent,
      label,
    ]);
    container.setData("body", body);
    container.setData("label", label);
    container.setSize(32, 32);
    container.setDepth(m.y * TILE + (isDead ? 0 : TILE / 2));
    return container;
  }

  private tweenMonsterTo(sprite: Phaser.GameObjects.Container, tx: number, ty: number) {
    const targetX = tx * TILE + TILE / 2;
    const targetY = ty * TILE + TILE / 2;
    if (Math.abs(sprite.x - targetX) < 1 && Math.abs(sprite.y - targetY) < 1) return;
    sprite.setDepth(targetY);
    this.tweens.add({
      targets: sprite,
      x: targetX,
      y: targetY,
      duration: 60,
      ease: "Quad.easeOut",
    });
  }

  private updateMonsterLabel(sprite: Phaser.GameObjects.Container, m: Monster) {
    const label = (sprite.getData("label") ?? sprite.list?.[3]) as Phaser.GameObjects.Text | undefined;
    if (label && typeof label.setText === "function") {
      if (m.defeated || m.hp <= 0) {
        label.setText(`${m.name}\n[DEFEATED]`);
        label.setColor("#9a8a7a");
      } else {
        label.setText(`${m.name}\nHP ${m.hp}/${m.maxHp}`);
        label.setColor("#f1d4a3");
      }
    }
  }
}
