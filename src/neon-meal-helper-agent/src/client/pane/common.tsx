// Small building blocks shared by the pane views.

import { useState } from "react";

export function formatQuantity(quantity: number | null, unit: string) {
  if (quantity == null) return unit;
  const q = Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 100) / 100);
  return unit ? `${q} ${unit}` : q;
}

/** Parse an optional number input: empty means null. */
export function parseOptionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error(`"${value}" is not a number`);
  return n;
}

export function Loading({ error }: { error?: Error }) {
  return error ? <p className="pane-error">{error.message}</p> : <p className="muted">Loading…</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Run an async action, surfacing its error inline. */
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const errorView = error ? <p className="pane-error">{error}</p> : null;
  return { run, busy, errorView };
}

export function BackButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="back" onClick={onClick}>
      ← {children}
    </button>
  );
}

/** A Date as YYYY-MM-DD in the browser's time zone. */
export function isoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parse YYYY-MM-DD as a local date. */
export function parseIsoDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}
