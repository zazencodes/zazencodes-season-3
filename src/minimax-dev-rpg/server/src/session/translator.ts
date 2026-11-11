import type {
  AgentEvent,
  CombatFx,
  CombatTick,
} from "@minimax-dev-rpg/protocol";

/**
 * Translates a stream of AgentEvent values into pre-shaped CombatTick values
 * that Phaser can render without knowing anything about agents. This is the
 * single gameplay knob — change the rules here to retune combat feel without
 * touching either the agent or the client renderer.
 *
 * Conventions:
 *   - Reading code = no combat effect (preparation).
 *   - Editing a file = a small player attack (slashing at the monster).
 *   - Tests pass = a big ranged attack (spell).
 *   - Tests fail = the monster retaliates.
 *   - PR opened/merged = a finishing blow.
 *   - Errors = monster retaliates with a heavier hit.
 *
 * The translator is stateful enough to ignore late events after a session
 * ends — without that, the mock agent's `pr.merged` followed by
 * `issue.closed` would fire two death animations.
 */
export class CombatTranslator {
  private readonly sessionId: string;
  private readonly seed: number;
  private ended = false;

  constructor(sessionId: string, seed = 0) {
    this.sessionId = sessionId;
    this.seed = seed;
  }

  translate(event: AgentEvent): CombatTick[] {
    if (this.ended) return [];
    const out: CombatTick[] = [];
    const t = (overrides: Partial<CombatTick>): CombatTick => ({
      sessionId: this.sessionId,
      source: "player",
      target: "monster",
      action: "slash",
      magnitude: 5,
      fx: "none",
      ...overrides,
    });

    switch (event.kind) {
      case "file.edited": {
        const mag = Math.min(12, 2 + Math.floor((event.linesAdded + event.linesRemoved) / 2));
        out.push(t({ action: "slash", magnitude: mag, fx: "spark" }));
        break;
      }
      case "tests.run": {
        if (event.passed > 0 && event.failed === 0) {
          out.push(t({ action: "spell", magnitude: 6 + event.passed * 2, fx: "light" }));
        } else if (event.failed > 0) {
          out.push({
            sessionId: this.sessionId,
            source: "monster",
            target: "player",
            action: "hit",
            magnitude: 4 + event.failed * 3,
            fx: "shadow",
          });
        }
        break;
      }
      case "pr.opened": {
        out.push(t({ action: "spell", magnitude: 15, fx: "light" }));
        break;
      }
      case "pr.merged":
      case "issue.closed": {
        out.push(
          t({ action: "death", magnitude: 0, fx: "light" }),
          {
            sessionId: this.sessionId,
            source: "system",
            target: "monster",
            action: "victory",
            magnitude: 0,
            fx: "light",
          },
        );
        this.ended = true;
        break;
      }
      case "error": {
        out.push({
          sessionId: this.sessionId,
          source: "monster",
          target: "player",
          action: "hit",
          magnitude: 8 + (this.seed % 4),
          fx: "shadow",
        });
        break;
      }
      // tool.start, tool.end (non-error), message = no combat effect
      default:
        break;
    }
    return out;
  }
}

/** Test helper. Kept for the unit tests we will add in v0.2. */
export const _internals = { fxFor: (_e: AgentEvent): CombatFx => "none" };
