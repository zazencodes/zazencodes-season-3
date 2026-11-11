import type { MonsterKind } from "@minimax-dev-rpg/protocol";

/**
 * Generate a coherent 3-color palette per monster kind. Procedural so the
 * client can render a unique-looking monster for every issue without art.
 */
export const paletteFor = (kind: MonsterKind, seed: number) => {
  const palettes: Record<MonsterKind, { body: string; accent: string; trim: string }> = {
    bug: { body: "#7a2a2a", accent: "#d44a3a", trim: "#f1d4a3" },
    feature: { body: "#2a4a7a", accent: "#3a8ad4", trim: "#cfe7ff" },
    docs: { body: "#4a4a2a", accent: "#d4c43a", trim: "#fff5c2" },
    chore: { body: "#3a3a3a", accent: "#8a8a8a", trim: "#dcdcdc" },
    epic: { body: "#3a1a4a", accent: "#a04ad4", trim: "#e2c2ff" },
  };
  // Slight hue shift by seed so multiple monsters of the same kind still vary.
  const base = palettes[kind];
  return {
    body: shift(base.body, seed * 7),
    accent: shift(base.accent, seed * 11),
    trim: base.trim,
  };
};

const shift = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + (amount % 20) - 10));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + ((amount * 3) % 20) - 10));
  const b = Math.max(0, Math.min(255, (n & 0xff) + ((amount * 5) % 20) - 10));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

export const kindFromLabels = (labels: string[]): MonsterKind => {
  const l = new Set(labels.map((x) => x.toLowerCase()));
  if (l.has("epic") || l.has("critical")) return "epic";
  if (l.has("bug")) return "bug";
  if (l.has("docs") || l.has("documentation")) return "docs";
  if (l.has("feature") || l.has("enhancement")) return "feature";
  return "chore";
};

export const hpFor = (kind: MonsterKind, difficulty: number) => {
  const base: Record<MonsterKind, number> = {
    bug: 50,
    feature: 70,
    docs: 25,
    chore: 35,
    epic: 120,
  };
  return base[kind] + difficulty * 10;
};
