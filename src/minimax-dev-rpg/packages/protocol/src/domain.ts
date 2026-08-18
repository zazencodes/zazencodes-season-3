import { z } from "zod";

/* ─────────────────────────────  Domain  ───────────────────────────── */

/** Difficulty bucket a Monster derives from issue labels. */
export const MonsterKindSchema = z.enum(["bug", "feature", "docs", "chore", "epic"]);
export type MonsterKind = z.infer<typeof MonsterKindSchema>;

export const IssueSchema = z.object({
  id: z.string(), // provider-local id, e.g. "github:owner/repo#42"
  provider: z.literal("github"),
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().default(""),
  labels: z.array(z.string()).default([]),
  state: z.enum(["open", "closed"]),
  url: z.string().url(),
  difficulty: z.number().int().min(1).max(5),
});
export type Issue = z.infer<typeof IssueSchema>;

export const MonsterSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  name: z.string(), // derived from issue title
  kind: MonsterKindSchema,
  hp: z.number().int().nonnegative(),
  maxHp: z.number().int().positive(),
  /** World tile coordinates (not pixels). */
  x: z.number(),
  y: z.number(),
  /** Tileset palette hint for the client. */
  palette: z.object({
    body: z.string(),
    accent: z.string(),
    trim: z.string(),
  }),
  defeated: z.boolean().default(false),
});
export type Monster = z.infer<typeof MonsterSchema>;

export const PlayerStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number().int().nonnegative(),
  maxHp: z.number().int().positive(),
  xp: z.number().int().nonnegative(),
  level: z.number().int().min(1),
  /** World tile coordinates. */
  x: z.number(),
  y: z.number(),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

export const SessionStatusSchema = z.enum([
  "active",
  "victory",
  "defeat",
  "abandoned",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/** Narrow type for terminal states — used in the `session.ended` event. */
export const SessionOutcomeSchema = z.enum(["victory", "defeat", "abandoned"]);
export type SessionOutcome = z.infer<typeof SessionOutcomeSchema>;

export const SessionSummarySchema = z.object({
  id: z.string(),
  issueId: z.string(),
  monsterId: z.string(),
  status: SessionStatusSchema,
  startedAt: z.number(), // epoch ms
  endedAt: z.number().optional(),
  /** Recent agent events for the in-flight log (capped at the source). */
  log: z.array(z.any()),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
