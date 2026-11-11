import Phaser from "phaser";
import type { Monster } from "@minimax-dev-rpg/protocol";
import { useStore } from "../../store.js";
import { bus } from "../../ws/bus.js";
import { getShared } from "../../ws/client.js";

const ws = getShared();

/**
 * The battle screen. Receives a monster via launch data, waits for combat
 * ticks on the bus, animates them, and returns to the world when the session
 * ends.
 *
 * Layout (1280×720 baseline, scales with viewport):
 *   - Top: monster name + health bar
 *   - Mid: player on the left, monster on the right
 *   - Bottom: floating combat log + retreat button
 */
export class BattleScene extends Phaser.Scene {
  private monster!: Monster;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private monsterSprite!: Phaser.GameObjects.Container;
  private monsterBody!: Phaser.GameObjects.Sprite;
  private monsterBar!: Phaser.GameObjects.Graphics;
  private playerBar!: Phaser.GameObjects.Graphics;
  private logText!: Phaser.GameObjects.Text;
  private currentSessionId: string | null = null;
  private busUnsub: (() => void) | null = null;
  private endUnsub: (() => void) | null = null;
  private subscriptionsBound = false;
  private ending = false;
  private cleanupEndingListeners: (() => void) | null = null;

  constructor() {
    super("BattleScene");
  }

  init(data: { monster: Monster }) {
    this.monster = data.monster;
    this.ending = false;
  }

  create() {
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.shutdown, this);

    this.ending = false;
    this.cameras.main.setBackgroundColor("#1a0e06");
    this.cameras.main.flash(300, 0, 0, 0);

    this.drawArena();
    this.drawCharacters();
    this.drawUi();

    // The session was started by the click handler in the WorldScene; the
    // currentSessionId is already in the store. We snapshot it.
    this.currentSessionId = useStore.getState().currentSessionId;

    // Listen for combat ticks + session end. Track every subscription so
    // shutdown() can clean them up — otherwise a leaky BattleScene
    // accumulates handlers on the global bus. Guard against create()
    // being re-invoked when scene.start() restarts a stopped scene.
    if (!this.subscriptionsBound) {
      this.busUnsub = bus.on("combat.tick", (raw) => this.onCombatTick(raw as never));
      this.endUnsub = bus.on("session.ended", (raw) => this.onSessionEnded(raw as never));
      this.subscriptionsBound = true;
    }

    this.updateBars();
  }

  shutdown() {
    this.cleanupEndingListeners?.();
    this.cleanupEndingListeners = null;
    this.busUnsub?.();
    this.endUnsub?.();
    this.busUnsub = null;
    this.endUnsub = null;
    this.subscriptionsBound = false;
    this.ending = false;
  }

  /* ─── Arena & UI ──────────────────────────────────────────────── */

  private drawArena() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    // Sky gradient
    const sky = this.add.graphics();
    for (let y = 0; y < h * 0.7; y += 2) {
      const t = y / (h * 0.7);
      const c = Phaser.Display.Color.GetColor(
        Math.round(60 + 40 * (1 - t)),
        Math.round(20 + 30 * (1 - t)),
        Math.round(80 - 40 * (1 - t)),
      );
      sky.fillStyle(c, 1);
      sky.fillRect(0, y, w, 2);
    }
    // Ground
    const ground = this.add.graphics();
    ground.fillStyle(0x6a4a1a, 1);
    ground.fillRect(0, h * 0.7, w, h * 0.3);
    for (let x = 0; x < w; x += 8) {
      ground.fillStyle(0x4a2a0a, 0.4);
      ground.fillRect(x, h * 0.7, 1, h * 0.3);
    }
    // Decorative banner
    const banner = this.add.graphics();
    banner.fillStyle(0xd44a3a, 1);
    banner.fillRect(w / 2 - 80, 12, 160, 24);
    banner.fillStyle(0xf1d4a3, 1);
    banner.fillRect(w / 2 - 76, 16, 152, 16);
  }

  private drawCharacters() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    this.playerSprite = this.add.sprite(w * 0.25, h * 0.75, "player");
    this.playerSprite.setScale(2);
    this.playerSprite.setDepth(100);

    const shadow = this.add.ellipse(this.playerSprite.x, this.playerSprite.y + 28, 36, 8, 0, 0.3);
    shadow.setDepth(99);

    this.monsterBody = this.add.sprite(w * 0.75, h * 0.7, "monster");
    this.monsterBody.setTint(parseInt(this.monster.palette.body.slice(1), 16));
    this.monsterBody.setScale(2.2);
    this.monsterBody.setDepth(100);

    const mShadow = this.add.ellipse(this.monsterBody.x, this.monsterBody.y + 36, 50, 10, 0, 0.3);
    mShadow.setDepth(99);

    this.monsterSprite = this.add.container(0, 0, [mShadow, this.monsterBody]);
  }

  private drawUi() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    // Monster name + bar
    this.add
      .text(w / 2, 60, this.monster.name, {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#f1d4a3",
        stroke: "#0d0a08",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.monsterBar = this.add.graphics();
    this.monsterBar.setDepth(200);

    // Player bar (top-left)
    this.playerBar = this.add.graphics();
    this.playerBar.setDepth(200);

    // Combat log
    this.logText = this.add.text(20, h - 90, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#f1d4a3",
      stroke: "#0d0a08",
      strokeThickness: 2,
      wordWrap: { width: w - 200 },
    });
    this.logText.setDepth(200);

    // Retreat button
    const btn = this.add
      .text(w - 100, h - 40, "[ Retreat ]", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#f1d4a3",
        backgroundColor: "#2a1a0a",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(1, 1)
      .setInteractive({ useHandCursor: true });
    btn.setDepth(200);
    btn.on("pointerdown", () => {
      if (this.ending) return;
      if (this.currentSessionId) ws.send({ kind: "retreat", sessionId: this.currentSessionId });
    });
  }

  private updateBars() {
    const w = this.cameras.main.width;
    const player = useStore.getState().player;

    // Monster bar (top center)
    this.monsterBar.clear();
    this.monsterBar.fillStyle(0x1a0e06, 1);
    this.monsterBar.fillRect(w / 2 - 150, 80, 300, 14);
    this.monsterBar.fillStyle(0x6a4a1a, 1);
    this.monsterBar.fillRect(w / 2 - 148, 82, 296, 10);
    const pct = Math.max(0, this.monster.hp / this.monster.maxHp);
    this.monsterBar.fillStyle(0xd44a3a, 1);
    this.monsterBar.fillRect(w / 2 - 148, 82, 296 * pct, 10);

    // Player bar (top-left)
    this.playerBar.clear();
    if (!player) return;
    this.playerBar.fillStyle(0x1a0e06, 1);
    this.playerBar.fillRect(20, 20, 220, 12);
    this.playerBar.fillStyle(0x6a4a1a, 1);
    this.playerBar.fillRect(22, 22, 216, 8);
    const ppct = Math.max(0, player.hp / player.maxHp);
    this.playerBar.fillStyle(0x6ad44a, 1);
    this.playerBar.fillRect(22, 22, 216 * ppct, 8);
  }

  /* ─── Combat tick handling ───────────────────────────────────── */

  private onCombatTick(event: { kind: string; sessionId: string; [k: string]: unknown }) {
    if (event.sessionId !== this.currentSessionId) return;
    const action = event.action as string;
    const target = event.target as "player" | "monster";
    const source = event.source as "player" | "monster" | "system";
    const magnitude = event.magnitude as number;
    const fx = event.fx as string;

    // Refresh from the latest store values.
    const m = useStore.getState().monsters.get(this.monster.id);
    if (m) this.monster = m;
    this.updateBars();

    if (action === "death" || action === "victory" || action === "defeat") {
      if (target === "monster") this.playDeath();
      return;
    }
    if (action === "spawn" || action === "flee") return;

    if (source === "player" && target === "monster") {
      if (action === "slash") this.playPlayerSlash(magnitude);
      else if (action === "spell") this.playPlayerSpell(magnitude, fx);
    } else if (source === "monster" && target === "player") {
      this.playMonsterHit(magnitude);
    }
  }

  private onSessionEnded(event: { kind: string; sessionId: string; outcome: string; summary: string }) {
    if (event.sessionId !== this.currentSessionId) return;
    if (this.ending) return;
    this.ending = true;
    this.cameras.main.flash(400, 255, 255, 255);

    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    const color = event.outcome === "victory" ? "#6ad44a" : "#d44a3a";

    this.add
      .text(w / 2, h / 2 - 20, event.outcome.toUpperCase(), {
        fontFamily: "monospace",
        fontSize: "48px",
        color,
        stroke: "#0d0a08",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(300);

    this.add
      .text(w / 2, h / 2 + 40, "click or press space", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f1d4a3",
        stroke: "#0d0a08",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(301);

    let finished = false;
    const cleanup = () => {
      this.cleanupEndingListeners = null;
      document.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      this.input.off("pointerdown", onPointerDown);
      this.input.keyboard?.off("keydown-SPACE", onPhaserKey);
      this.input.keyboard?.off("keydown-ENTER", onPhaserKey);
      this.input.keyboard?.off("keydown-ESC", onPhaserKey);
    };
    this.cleanupEndingListeners = cleanup;
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      // Tell the server to reap the session (it was held open after
      // Pi finished so the player could review the logs). The server
      // treats retreat as the universal "close engagement screen"
      // signal — works for both active and terminal sessions.
      if (this.currentSessionId) {
        ws.send({ kind: "retreat", sessionId: this.currentSessionId });
      }
      this.scene.start("WorldScene");
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest(".hud")) return;
      e.preventDefault();
      finish();
    };
    const onPointerDown = () => {
      finish();
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        e.code === "Space" ||
        e.code === "Enter" ||
        e.code === "Escape" ||
        e.key === " " ||
        e.key === "Enter" ||
        e.key === "Escape"
      ) {
        e.preventDefault();
        finish();
      }
    };
    const onPhaserKey = () => {
      finish();
    };

    document.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    this.input.once("pointerdown", onPointerDown);
    this.input.keyboard?.once("keydown-SPACE", onPhaserKey);
    this.input.keyboard?.once("keydown-ENTER", onPhaserKey);
    this.input.keyboard?.once("keydown-ESC", onPhaserKey);
  }

  /* ─── Animations ─────────────────────────────────────────────── */

  private playPlayerSlash(damage: number) {
    this.appendLog("You slash the monster.");
    const startX = this.playerSprite.x;
    const targetX = this.monsterBody.x - 40;
    this.tweens.add({
      targets: this.playerSprite,
      x: targetX,
      duration: 120,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.playerSprite.x = startX;
      },
    });
    // Slash arc
    const slash = this.add.image(this.monsterBody.x, this.monsterBody.y, "fx.slash");
    slash.setTint(0xffffff);
    slash.setAlpha(0.9);
    slash.setScale(1.6);
    slash.setDepth(150);
    slash.setAngle(Phaser.Math.Between(-30, 30));
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: 2.2,
      scaleY: 2.2,
      angle: slash.angle + 60,
      duration: 250,
      onComplete: () => slash.destroy(),
    });
    this.shakeMonster();
    this.popDamage(this.monsterBody.x, this.monsterBody.y - 40, damage, "#ffdd66");
  }

  private playPlayerSpell(damage: number, fx: string) {
    this.appendLog(`You cast a spell (${fx}).`);
    const orb = this.add.image(this.playerSprite.x + 16, this.playerSprite.y - 20, "fx.orb");
    const tint = fx === "light" ? 0xffe080 : fx === "shadow" ? 0xa04ad4 : fx === "fire" ? 0xff6020 : 0x80c0ff;
    orb.setTint(tint);
    orb.setDepth(150);
    orb.setScale(1.2);
    this.tweens.add({
      targets: orb,
      x: this.monsterBody.x,
      y: this.monsterBody.y,
      duration: 380,
      ease: "Quad.easeIn",
      onComplete: () => {
        // Burst
        for (let i = 0; i < 8; i++) {
          const p = this.add.image(this.monsterBody.x, this.monsterBody.y, "fx.particle");
          p.setTint(tint);
          p.setDepth(150);
          this.tweens.add({
            targets: p,
            x: this.monsterBody.x + Phaser.Math.Between(-40, 40),
            y: this.monsterBody.y + Phaser.Math.Between(-40, 40),
            alpha: 0,
            duration: 400,
            onComplete: () => p.destroy(),
          });
        }
        orb.destroy();
        this.shakeMonster();
        this.popDamage(this.monsterBody.x, this.monsterBody.y - 40, damage, "#ffe080");
      },
    });
  }

  private playMonsterHit(damage: number) {
    this.appendLog("The monster strikes you!");
    this.cameras.main.shake(200, 0.01);
    this.tweens.add({
      targets: this.playerSprite,
      x: this.playerSprite.x + 10,
      duration: 80,
      yoyo: true,
      repeat: 2,
    });
    this.popDamage(this.playerSprite.x, this.playerSprite.y - 40, damage, "#ff6060");
  }

  private shakeMonster() {
    this.tweens.add({
      targets: this.monsterBody,
      x: this.monsterBody.x + 4,
      duration: 60,
      yoyo: true,
      repeat: 3,
    });
  }

  private playDeath() {
    this.appendLog("The monster falls!");
    this.cameras.main.flash(400, 255, 255, 255);
    for (let i = 0; i < 18; i++) {
      const p = this.add.image(this.monsterBody.x, this.monsterBody.y, "fx.particle");
      p.setTint(parseInt(this.monster.palette.accent.slice(1), 16));
      p.setDepth(200);
      this.tweens.add({
        targets: p,
        x: this.monsterBody.x + Phaser.Math.Between(-60, 60),
        y: this.monsterBody.y + Phaser.Math.Between(-60, 60),
        alpha: 0,
        scale: 0,
        duration: 700,
        onComplete: () => p.destroy(),
      });
    }
    this.tweens.add({
      targets: this.monsterBody,
      alpha: 0,
      scale: 2.5,
      duration: 500,
    });
  }

  private popDamage(x: number, y: number, amount: number, color: string) {
    const t = this.add.text(x, y, `-${amount}`, {
      fontFamily: "monospace",
      fontSize: "24px",
      color,
      stroke: "#0d0a08",
      strokeThickness: 4,
    });
    t.setOrigin(0.5);
    t.setDepth(200);
    this.tweens.add({
      targets: t,
      y: y - 30,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  private appendLog(line: string) {
    const prev = this.logText.text ? this.logText.text + "\n" : "";
    this.logText.setText(prev + line);
  }
}
