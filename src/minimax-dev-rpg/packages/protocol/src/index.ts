/**
 * @minimax-dev-rpg/protocol
 *
 * Single source of truth for the WebSocket protocol between the client and the
 * local Node server. Every event flowing in either direction is a discriminated
 * union keyed by `kind`, with a zod schema for runtime validation at the boundary.
 *
 * Add a new event:
 *   1. Add a zod schema in events.ts.
 *   2. Add it to the C2S or S2C union.
 *   3. Both client and server pick it up via type inference — no further changes.
 */

export * from "./domain.js";
export * from "./events.js";
export * from "./combat.js";
