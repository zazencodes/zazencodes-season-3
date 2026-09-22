import { useMemo } from "react";
import { useViewState } from "skybridge/web";
import type { DatasetId, Field, Row } from "@/datasets.js";

export type ExplorerData = {
  dataset: DatasetId;
  label: string;
  description: string;
  fields: Field[];
  defaults: { x: string; y: string; color: string };
  /** Rows in the source dataset, which may exceed the loaded sample. */
  total: number;
};

export type Sort = { key: string; direction: "asc" | "desc" };

export type ExplorerState = {
  x?: string;
  y?: string;
  color?: string;
  /** Category values hidden per field. Absent means "show everything". */
  excluded?: Record<string, string[]>;
  /** Numeric range applied to the x field, ignored if `rangeField` is stale. */
  rangeField?: string;
  range?: [number, number];
  sort?: Sort;
  /** Index into the unfiltered rows. */
  selected?: number;
};

/** A row paired with its index in the unfiltered dataset. */
export type IndexedRow = { index: number; row: Row };

export const MISSING = "Unknown";

export function categoryOf(row: Row, key: string): string {
  const value = row[key];
  // Penguins encodes an unknown sex as "." — fold every blank into one label.
  return value === null || value === undefined || value === "" || value === "."
    ? MISSING
    : String(value);
}

export function numberOf(row: Row, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extent(rows: Row[], key: string): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const value = numberOf(row, key);
    if (value === null) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return min <= max ? [min, max] : [0, 1];
}

export function useExplorer(data: ExplorerData | undefined, rows: Row[]) {
  // useViewState: persists the exploration on the host and shows it to the model.
  const [state, setState] = useViewState<ExplorerState>({});

  const fields = data?.fields ?? [];
  const quantitative = fields.filter((f) => f.kind === "quantitative");
  const categorical = fields.filter((f) => f.kind === "categorical");

  const x = state.x ?? data?.defaults.x ?? quantitative[0]?.key ?? "";
  const y = state.y ?? data?.defaults.y ?? quantitative[1]?.key ?? "";
  const color = state.color ?? data?.defaults.color ?? categorical[0]?.key ?? "";
  const sort = state.sort;

  const domain = useMemo(() => extent(rows, x), [rows, x]);
  const range = state.rangeField === x && state.range ? state.range : domain;
  const isRangeFiltered = range[0] > domain[0] || range[1] < domain[1];

  /** Every value each categorical field takes, in first-seen order. */
  const categories = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const field of categorical) {
      const seen = new Set<string>();
      for (const row of rows) seen.add(categoryOf(row, field.key));
      map.set(field.key, [...seen].sort());
    }

    return map;
  }, [rows, categorical]);

  const excluded = state.excluded ?? {};

  const filtered = useMemo(() => {
    const result: IndexedRow[] = [];

    rows.forEach((row, index) => {
      for (const [key, values] of Object.entries(excluded)) {
        if (values.includes(categoryOf(row, key))) return;
      }

      const value = numberOf(row, x);
      if (value !== null && (value < range[0] || value > range[1])) return;

      result.push({ index, row });
    });

    return result;
  }, [rows, excluded, x, range]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;

    const field = fields.find((f) => f.key === sort.key);
    const sign = sort.direction === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (field?.kind === "quantitative") {
        const left = numberOf(a.row, sort.key);
        const right = numberOf(b.row, sort.key);
        // Missing values always sink to the bottom.
        if (left === null) return right === null ? 0 : 1;
        if (right === null) return -1;
        return (left - right) * sign;
      }

      return (
        categoryOf(a.row, sort.key).localeCompare(categoryOf(b.row, sort.key)) *
        sign
      );
    });
  }, [filtered, sort, fields]);

  const selected =
    state.selected !== undefined &&
    filtered.some((item) => item.index === state.selected)
      ? state.selected
      : undefined;

  return {
    fields,
    quantitative,
    categorical,
    categories,
    rows,
    filtered,
    sorted,
    x,
    y,
    color,
    sort,
    domain,
    range,
    isRangeFiltered,
    excluded,
    selected,
    selectedRow: selected === undefined ? undefined : rows[selected],
    setEncoding: (encoding: "x" | "y" | "color", key: string) =>
      setState((prev) => ({ ...prev, [encoding]: key, selected: undefined })),
    setRange: (next: [number, number]) =>
      setState((prev) => ({ ...prev, rangeField: x, range: next })),
    toggleCategory: (key: string, value: string) =>
      setState((prev) => {
        const current = prev.excluded?.[key] ?? [];
        const next = current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value];

        return {
          ...prev,
          excluded: { ...prev.excluded, [key]: next },
          selected: undefined,
        };
      }),
    toggleSort: (key: string) =>
      setState((prev) => ({
        ...prev,
        sort:
          prev.sort?.key === key && prev.sort.direction === "asc"
            ? { key, direction: "desc" }
            : { key, direction: "asc" },
      })),
    select: (index: number | undefined) =>
      setState((prev) => ({
        ...prev,
        selected: prev.selected === index ? undefined : index,
      })),
    reset: () => setState({}),
  };
}

export type Explorer = ReturnType<typeof useExplorer>;
