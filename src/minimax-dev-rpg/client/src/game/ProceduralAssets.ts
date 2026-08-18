import Phaser from "phaser";

/**
 * Procedural texture generation. The MVP ships without any binary assets;
 * swap in real pixel art by adding files under /public/assets and loading
 * them in BootScene before/after these generators run.
 *
 * Convention: every texture is generated as a square at a fixed size
 * (TILE for tiles, larger for sprites) and is pixel-art crisp (no AA).
 */

const TILE = 32;

export const buildProceduralAssets = (scene: Phaser.Scene) => {
  addSandTextures(scene);
  addStoneTextures(scene);
  addWaterTextures(scene);
  addPlayerTexture(scene);
  addMonsterTexture(scene);
  addMonsterDeadTexture(scene);
  addFxTextures(scene);
  addDecorationTextures(scene);
  addUiTextures(scene);
};

const fillRect = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number) => {
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, h);
};

const noise = (g: Phaser.GameObjects.Graphics, n: number, color: number, alpha = 0.25) => {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(Math.random() * TILE);
    const y = Math.floor(Math.random() * TILE);
    g.fillStyle(color, alpha);
    g.fillRect(x, y, 1, 1);
  }
};

/* ─── Tiles ───────────────────────────────────────────────────────── */

const addSandTextures = (scene: Phaser.Scene) => {
  const g = scene.add.graphics();
  g.setVisible(false);
  // Base sand
  fillRect(g, 0, 0, TILE, TILE, 0xd4a44a);
  // Subtle gradient via stripes
  for (let y = 0; y < TILE; y += 4) {
    g.fillStyle(y % 8 === 0 ? 0xc89040 : 0xe0b060, 0.5);
    g.fillRect(0, y, TILE, 1);
  }
  noise(g, 80, 0xa07030, 0.4);
  noise(g, 30, 0xfff0c0, 0.3);
  g.generateTexture("tile.sand", TILE, TILE);
  g.destroy();

  // Sand path variant (slightly lighter, less noise)
  const g2 = scene.add.graphics();
  g2.setVisible(false);
  fillRect(g2, 0, 0, TILE, TILE, 0xe0b46a);
  for (let y = 0; y < TILE; y += 8) {
    g2.fillStyle(0xd0a050, 0.3);
    g2.fillRect(0, y, TILE, 1);
  }
  noise(g2, 20, 0xa07030, 0.3);
  g2.generateTexture("tile.sand.path", TILE, TILE);
  g2.destroy();
};

const addStoneTextures = (scene: Phaser.Scene) => {
  const g = scene.add.graphics();
  g.setVisible(false);
  fillRect(g, 0, 0, TILE, TILE, 0x6a4a1a);
  // Brick pattern
  for (let y = 0; y < TILE; y += 8) {
    g.fillStyle(0x4a2a0a, 0.6);
    g.fillRect(0, y, TILE, 1);
  }
  for (let y = 0; y < TILE; y += 16) {
    const offset = (y / 8) % 2 === 0 ? 0 : 16;
    g.fillStyle(0x4a2a0a, 0.6);
    for (let x = offset; x < TILE; x += 32) {
      g.fillRect(x, y, 1, 8);
    }
  }
  noise(g, 30, 0x2a1a0a, 0.4);
  g.generateTexture("tile.stone", TILE, TILE);
  g.destroy();
};

const addWaterTextures = (scene: Phaser.Scene) => {
  const g = scene.add.graphics();
  g.setVisible(false);
  fillRect(g, 0, 0, TILE, TILE, 0x3a8ad4);
  for (let y = 0; y < TILE; y += 6) {
    g.fillStyle(0x5aaae4, 0.5);
    g.fillRect(0, y, TILE, 1);
  }
  // Sparkles
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(Math.random() * TILE);
    const y = Math.floor(Math.random() * TILE);
    g.fillStyle(0xcfe7ff, 0.9);
    g.fillRect(x, y, 2, 1);
  }
  g.generateTexture("tile.water", TILE, TILE);
  g.destroy();
};

/* ─── Player sprite ───────────────────────────────────────────────── */

const addPlayerTexture = (scene: Phaser.Scene) => {
  const W = 16;
  const H = 24;
  const g = scene.add.graphics();
  g.setVisible(false);
  // Body
  fillRect(g, 4, 8, 8, 8, 0x3a8ad4); // tunic
  fillRect(g, 4, 4, 8, 4, 0xf1d4a3); // face
  fillRect(g, 5, 5, 1, 1, 0x1a0e06);
  fillRect(g, 10, 5, 1, 1, 0x1a0e06);
  fillRect(g, 4, 16, 3, 6, 0x3a4a6a);
  fillRect(g, 9, 16, 3, 6, 0x3a4a6a);
  fillRect(g, 5, 22, 2, 2, 0x6a4a1a);
  fillRect(g, 10, 22, 2, 2, 0x6a4a1a);
  // Hat
  fillRect(g, 3, 0, 10, 3, 0xd44a3a);
  fillRect(g, 2, 2, 12, 2, 0xd44a3a);
  // Sword
  fillRect(g, 13, 8, 1, 8, 0xcfe7ff);
  fillRect(g, 12, 16, 3, 1, 0x6a4a1a);
  g.generateTexture("player", W, H);
  g.destroy();
};

/* ─── Monster sprite (base, tinted at spawn) ──────────────────────── */

const addMonsterTexture = (scene: Phaser.Scene) => {
  const W = 28;
  const H = 32;
  const g = scene.add.graphics();
  g.setVisible(false);
  // Body — round blob
  fillRect(g, 4, 6, 20, 20, 0xffffff);
  // Top tuft
  fillRect(g, 10, 0, 8, 6, 0xffffff);
  // Eyes
  fillRect(g, 8, 12, 4, 4, 0xffffff);
  fillRect(g, 16, 12, 4, 4, 0xffffff);
  fillRect(g, 9, 13, 2, 2, 0x000000);
  fillRect(g, 17, 13, 2, 2, 0x000000);
  // Mouth
  fillRect(g, 10, 20, 8, 2, 0x000000);
  // Feet
  fillRect(g, 6, 26, 6, 4, 0xffffff);
  fillRect(g, 16, 26, 6, 4, 0xffffff);
  // Horns/spikes
  fillRect(g, 6, 2, 2, 6, 0xffffff);
  fillRect(g, 20, 2, 2, 6, 0xffffff);
  // Generate as white; we tint at spawn time.
  g.generateTexture("monster", W, H);
  g.destroy();
};

const addMonsterDeadTexture = (scene: Phaser.Scene) => {
  const W = 28;
  const H = 28;
  const g = scene.add.graphics();
  g.setVisible(false);
  // Tombstone arch
  fillRect(g, 6, 4, 16, 20, 0x6a6560);
  fillRect(g, 8, 2, 12, 4, 0x7a7570);
  fillRect(g, 4, 22, 20, 4, 0x4a4540);
  // Carved cross
  fillRect(g, 13, 8, 2, 8, 0x9a9590);
  fillRect(g, 10, 10, 8, 2, 0x9a9590);
  // Cracks
  fillRect(g, 8, 17, 3, 1, 0x3a3530);
  fillRect(g, 10, 18, 2, 2, 0x3a3530);
  // Base mound
  fillRect(g, 2, 26, 24, 2, 0x4a3a2a);
  g.generateTexture("monster.dead", W, H);
  g.destroy();
};

/* ─── Decorations ─────────────────────────────────────────────────── */

const addDecorationTextures = (scene: Phaser.Scene) => {
  // Palm tree
  const g = scene.add.graphics();
  g.setVisible(false);
  fillRect(g, 14, 16, 4, 32, 0x6a4a1a);
  // Trunk segments
  for (let y = 16; y < 48; y += 4) {
    g.fillStyle(0x4a2a0a, 0.6);
    g.fillRect(14, y, 4, 1);
  }
  // Fronds
  const fronds: Array<[number, number, number, number]> = [
    [-12, 4, 16, 4],
    [20, 4, 16, 4],
    [-16, 0, 12, 4],
    [20, 0, 12, 4],
    [-8, 12, 8, 4],
    [16, 12, 8, 4],
  ];
  for (const [dx, dy, w, h] of fronds) {
    fillRect(g, 16 + dx, dy, w, h, 0x2a8a2a);
  }
  g.generateTexture("deco.palm", 48, 48);
  g.destroy();

  // Cactus
  const g2 = scene.add.graphics();
  g2.setVisible(false);
  fillRect(g2, 12, 8, 8, 24, 0x2a8a2a);
  fillRect(g2, 4, 12, 8, 8, 0x2a8a2a);
  fillRect(g2, 4, 16, 4, 8, 0x2a8a2a);
  fillRect(g2, 20, 18, 8, 6, 0x2a8a2a);
  fillRect(g2, 24, 22, 4, 8, 0x2a8a2a);
  // Spines
  for (let i = 0; i < 6; i++) {
    g2.fillStyle(0xf1d4a3, 0.7);
    g2.fillRect(12 + Math.floor(Math.random() * 8), 8 + i * 4, 1, 1);
  }
  g2.generateTexture("deco.cactus", 32, 32);
  g2.destroy();

  // Lantern
  const g3 = scene.add.graphics();
  g3.setVisible(false);
  fillRect(g3, 6, 0, 4, 16, 0x6a4a1a);
  fillRect(g3, 2, 16, 12, 10, 0xd44a3a);
  fillRect(g3, 4, 18, 8, 6, 0xffd060);
  fillRect(g3, 6, 20, 4, 2, 0xffe080);
  // Glow
  g3.fillStyle(0xffd060, 0.18);
  g3.fillCircle(8, 21, 10);
  g3.generateTexture("deco.lantern", 16, 32);
  g3.destroy();

  // Rock
  const g4 = scene.add.graphics();
  g4.setVisible(false);
  fillRect(g4, 4, 12, 24, 16, 0x6a5a4a);
  fillRect(g4, 2, 16, 28, 12, 0x8a7a6a);
  fillRect(g4, 6, 8, 20, 8, 0x8a7a6a);
  // Highlights
  fillRect(g4, 8, 10, 6, 2, 0xa08a7a);
  g4.generateTexture("deco.rock", 32, 32);
  g4.destroy();

  // Chest
  const g5 = scene.add.graphics();
  g5.setVisible(false);
  fillRect(g5, 0, 12, 32, 20, 0x6a4a1a);
  fillRect(g5, 0, 8, 32, 4, 0x4a2a0a);
  fillRect(g5, 14, 14, 4, 6, 0xd4a44a);
  g5.generateTexture("deco.chest", 32, 32);
  g5.destroy();
};

/* ─── FX ──────────────────────────────────────────────────────────── */

const addFxTextures = (scene: Phaser.Scene) => {
  // Slash arc
  const g = scene.add.graphics();
  g.setVisible(false);
  g.lineStyle(3, 0xffffff, 1);
  g.beginPath();
  g.arc(16, 16, 12, Phaser.Math.DegToRad(-80), Phaser.Math.DegToRad(20), false);
  g.strokePath();
  g.generateTexture("fx.slash", 32, 32);
  g.destroy();

  // Projectile (orb)
  const g2 = scene.add.graphics();
  g2.setVisible(false);
  g2.fillStyle(0xffffff, 1);
  g2.fillCircle(8, 8, 6);
  g2.fillStyle(0xffffff, 0.5);
  g2.fillCircle(8, 8, 8);
  g2.generateTexture("fx.orb", 16, 16);
  g2.destroy();

  // Particle (single pixel)
  const g3 = scene.add.graphics();
  g3.setVisible(false);
  fillRect(g3, 0, 0, 4, 4, 0xffffff);
  g3.generateTexture("fx.particle", 4, 4);
  g3.destroy();
};

/* ─── UI ──────────────────────────────────────────────────────────── */

const addUiTextures = (scene: Phaser.Scene) => {
  // Health potion icon for top decoration
  const g = scene.add.graphics();
  g.setVisible(false);
  fillRect(g, 4, 4, 8, 12, 0xd44a3a);
  fillRect(g, 6, 2, 4, 2, 0x6a4a1a);
  fillRect(g, 5, 8, 2, 4, 0xff8080);
  g.generateTexture("ui.potion", 16, 16);
  g.destroy();
};
