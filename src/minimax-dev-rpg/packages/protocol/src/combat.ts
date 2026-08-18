import { z } from "zod";

/**
 * Pre-translated combat events emitted by the server alongside the raw agent
 * event stream. Phaser consumes these directly; React can ignore them.
 */
export const CombatActionSchema = z.enum([
  "spawn", // monster / player enter battle
  "slash", // melee attack animation
  "spell", // ranged/projectile attack animation
  "heal", // regen or buff
  "hit", // damage number pop
  "death", // entity dies
  "flee", // entity runs away
  "victory", // battle won
  "defeat", // battle lost
]);
export type CombatAction = z.infer<typeof CombatActionSchema>;

export const CombatSourceSchema = z.enum(["player", "monster", "system"]);
export type CombatSource = z.infer<typeof CombatSourceSchema>;

/**
 * Optional cue for the client to pick a VFX variant. Server-driven so the
 * gameplay designer can iterate without touching Phaser.
 */
export const CombatFxSchema = z.enum([
  "spark",
  "fire",
  "ice",
  "shadow",
  "light",
  "none",
]);
export type CombatFx = z.infer<typeof CombatFxSchema>;

/**
 * Full combat tick emitted by the server and consumed by Phaser.
 */
export const CombatTickSchema = z.object({
  sessionId: z.string(),
  source: CombatSourceSchema,
  target: z.enum(["player", "monster"]),
  action: CombatActionSchema,
  magnitude: z.number().int(),
  fx: CombatFxSchema.default("none"),
});
export type CombatTick = z.infer<typeof CombatTickSchema>;
