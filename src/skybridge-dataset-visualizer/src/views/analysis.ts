import type { Field } from "@/datasets.js";
import {
  categoryOf,
  type IndexedRow,
  numberOf,
} from "@/views/use-explorer.js";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
}

function quantitativeSummary(values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, values.length - 1);

  return `n=${values.length}, mean=${round(mean)}, sd=${round(Math.sqrt(variance))}, min=${round(sorted[0]!)}, p25=${round(quantile(sorted, 0.25))}, median=${round(quantile(sorted, 0.5))}, p75=${round(quantile(sorted, 0.75))}, max=${round(sorted.at(-1)!)}`;
}

/** Pearson correlation over the pairs where both values are present. */
function correlation(pairs: [number, number][]): number | null {
  if (pairs.length < 3) return null;

  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (const [x, y] of pairs) {
    covariance += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  }

  const denominator = Math.sqrt(varianceX * varianceY);
  return denominator === 0 ? null : round(covariance / denominator);
}

/**
 * A compact, text-only digest of the rows currently on screen. The rows never
 * reach the model, so the analysis prompt has to carry the numbers itself.
 */
export function summarize({
  label,
  fields,
  filtered,
  total,
  x,
  y,
  color,
  filterSummary,
}: {
  label: string;
  fields: Field[];
  filtered: IndexedRow[];
  total: number;
  x: string;
  y: string;
  color: string;
  filterSummary: string;
}): string {
  const rows = filtered.map((item) => item.row);
  const labelOf = (key: string) =>
    fields.find((field) => field.key === key)?.label ?? key;

  const lines = [
    `Dataset: ${label}. ${rows.length} of ${total} rows pass the current filters.`,
    `Filters: ${filterSummary}`,
    `Chart: ${labelOf(y)} against ${labelOf(x)}, colored by ${labelOf(color)}.`,
    "",
    "Numeric fields (filtered rows only):",
  ];

  for (const field of fields) {
    if (field.kind !== "quantitative") continue;

    const values = rows
      .map((row) => numberOf(row, field.key))
      .filter((value): value is number => value !== null);

    lines.push(
      `- ${field.label}: ${values.length ? quantitativeSummary(values) : "no values"}`,
    );
  }

  lines.push("", "Categorical fields (counts over filtered rows):");

  for (const field of fields) {
    if (field.kind !== "categorical") continue;

    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = categoryOf(row, field.key);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    const breakdown = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => `${value} ${count}`)
      .join(", ");

    lines.push(`- ${field.label}: ${breakdown || "no values"}`);
  }

  const pairs: [number, number][] = [];
  for (const row of rows) {
    const a = numberOf(row, x);
    const b = numberOf(row, y);
    if (a !== null && b !== null) pairs.push([a, b]);
  }

  const overall = correlation(pairs);

  lines.push(
    "",
    `Correlation of ${labelOf(x)} and ${labelOf(y)}: ${overall ?? "not enough data"}`,
  );

  // Per-group correlations are where Simpson's paradox shows up, so spell them out.
  const groups = new Map<string, [number, number][]>();
  for (const row of rows) {
    const a = numberOf(row, x);
    const b = numberOf(row, y);
    if (a === null || b === null) continue;
    const key = categoryOf(row, color);
    const group = groups.get(key) ?? [];
    group.push([a, b]);
    groups.set(key, group);
  }

  for (const [key, groupPairs] of [...groups.entries()].sort()) {
    lines.push(
      `- within ${key} (n=${groupPairs.length}): ${correlation(groupPairs) ?? "not enough data"}`,
    );
  }

  return lines.join("\n");
}
