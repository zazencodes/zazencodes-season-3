import { z } from "zod";
import {
  IssueSchema,
  MonsterSchema,
  PlayerStateSchema,
  SessionSummarySchema,
} from "./domain.js";
import { CombatActionSchema, CombatFxSchema, CombatSourceSchema } from "./combat.js";

/* ─────────────────────────────  Agent events  ─────────────────────────────
 * Raw events emitted by an AgentSession. These are domain-level (tool calls,
 * test results, file edits) — the combat translation happens in the server
 * and is emitted as a separate `combat.tick` event so Phaser can render
 * without re-implementing the mapping.
 */
export const AgentEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tool.start"),
    tool: z.string(),
    args: z.record(z.unknown()).default({}),
  }),
  z.object({
    kind: z.literal("tool.end"),
    tool: z.string(),
    result: z.enum(["ok", "error"]),
    summary: z.string().default(""),
  }),
  z.object({
    kind: z.literal("tests.run"),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("file.edited"),
    path: z.string(),
    linesAdded: z.number().int().nonnegative(),
    linesRemoved: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("message"),
    role: z.enum(["user", "assistant", "system"]),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("pr.opened"),
    url: z.string().url(),
    title: z.string(),
  }),
  z.object({
    kind: z.literal("pr.merged"),
    url: z.string().url(),
  }),
  z.object({
    kind: z.literal("issue.closed"),
    reason: z.enum(["completed", "not_planned"]),
  }),
  z.object({
    kind: z.literal("error"),
    message: z.string(),
  }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

/* ─────────────────────────────  Envelope  ───────────────────────────── */

const BaseEnvelope = {
  id: z.string(),
  ts: z.number(),
};

export const wrap = <T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
): z.ZodObject<T["shape"] & typeof BaseEnvelope> =>
  schema.extend(BaseEnvelope) as z.ZodObject<T["shape"] & typeof BaseEnvelope>;

/* ─────────────────────────────  C2S  ───────────────────────────── */

export const C2SEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("engage"), issueId: z.string() }),
  z.object({ kind: z.literal("retreat"), sessionId: z.string() }),
  z.object({ kind: z.literal("move"), x: z.number(), y: z.number() }),
  z.object({ kind: z.literal("ping"), ts: z.number() }),
]);
export type C2SEvent = z.infer<typeof C2SEventSchema>;

/* ─────────────────────────────  S2C  ───────────────────────────── */

export const S2CEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hello"),
    player: PlayerStateSchema,
    issues: z.array(IssueSchema),
    monsters: z.array(MonsterSchema),
    sessions: z.array(SessionSummarySchema),
  }),
  z.object({ kind: z.literal("issue.synced"), issues: z.array(IssueSchema) }),
  z.object({ kind: z.literal("monster.spawned"), monster: MonsterSchema }),
  z.object({
    kind: z.literal("monster.moved"),
    monsterId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    kind: z.literal("monster.despawned"),
    monsterId: z.string(),
    reason: z.enum(["defeated", "fled", "manual"]),
  }),
  z.object({ kind: z.literal("session.started"), session: SessionSummarySchema }),
  z.object({
    kind: z.literal("session.ended"),
    sessionId: z.string(),
    outcome: z.enum(["victory", "defeat", "abandoned"]),
    summary: z.string(),
  }),
  z.object({
    kind: z.literal("session.event"),
    sessionId: z.string(),
    event: AgentEventSchema,
  }),
  z.object({
    kind: z.literal("combat.tick"),
    sessionId: z.string(),
    source: CombatSourceSchema,
    target: z.enum(["player", "monster"]),
    action: CombatActionSchema,
    magnitude: z.number().int(),
    fx: CombatFxSchema.default("none"),
  }),
  z.object({ kind: z.literal("player.state"), player: PlayerStateSchema }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({ kind: z.literal("pong"), ts: z.number() }),
]);
export type S2CEvent = z.infer<typeof S2CEventSchema>;

/**
 * Parse a raw message (anything `JSON.parse`-able) into a typed C2S event.
 * Throws on malformed input — the WS layer is responsible for catching and
 * emitting an error back to the client.
 */
export const parseC2S = (raw: unknown): C2SEvent => C2SEventSchema.parse(raw);

/** Parse a server-side event before sending it on the wire. */
export const parseS2C = (raw: unknown): S2CEvent => S2CEventSchema.parse(raw);
