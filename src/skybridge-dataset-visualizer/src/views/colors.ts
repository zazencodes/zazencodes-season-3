import { MISSING } from "./use-explorer.js";

/** Three validated categorical hues; anything past them folds into "other". */
const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
export const OTHER_COLOR = "var(--series-other)";

export type ColorScale = (value: string) => string;

export function colorScale(values: string[]): ColorScale {
  const assigned = new Map<string, string>();

  for (const value of values) {
    if (value === MISSING || assigned.size >= SLOTS.length) continue;
    assigned.set(value, SLOTS[assigned.size]);
  }

  return (value) => assigned.get(value) ?? OTHER_COLOR;
}
