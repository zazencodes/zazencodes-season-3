import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { useResource, useWorkspace } from "../workspace.tsx";
import { Empty, formatQuantity, isoDate, Loading, parseIsoDate, parseOptionalNumber, useAction } from "./common.tsx";
import type { PantryItem } from "../../shared/types.ts";

export function PantryView() {
  const { versions } = useWorkspace();
  const { data, error } = useResource(() => api.get<PantryItem[]>("/api/pantry"), [versions.pantry]);
  const groups = new Map<string, PantryItem[]>();
  for (const item of data ?? []) {
    const key = item.category || "Other";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <section>
      <div className="pane-head">
        <h2>Pantry</h2>
      </div>
      <PantryForm />
      {!data ? (
        <Loading error={error} />
      ) : data.length === 0 ? (
        <Empty>The pantry is empty. Tell the agent what you have, or add items here.</Empty>
      ) : (
        [...groups].map(([category, items]) => (
          <div key={category} className="grocery-group">
            <h3>{category}</h3>
            <ul className="pantry-list">
              {items.map((item) => (
                <PantryRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function expiryLabel(expiresOn: string) {
  const days = Math.round((parseIsoDate(expiresOn).getTime() - parseIsoDate(isoDate(new Date())).getTime()) / 86_400_000);
  if (days < 0) return { text: `expired ${-days}d ago`, urgent: true };
  if (days === 0) return { text: "use today", urgent: true };
  return { text: `use in ${days}d`, urgent: days <= 3 };
}

function PantryRow({ item }: { item: PantryItem }) {
  const { target, changed } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const { run, errorView } = useAction();
  const ref = useRef<HTMLLIElement>(null);
  const highlighted = target.id === item.id;
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted]);

  if (editing)
    return (
      <li>
        <PantryForm item={item} onDone={() => setEditing(false)} />
      </li>
    );
  const expiry = item.expiresOn ? expiryLabel(item.expiresOn) : null;
  return (
    <li ref={ref} className={highlighted ? "highlight" : ""}>
      <span className="item-name">{item.name}</span>
      <span className="qty">{formatQuantity(item.quantity, item.unit)}</span>
      {expiry && <span className={`expiry ${expiry.urgent ? "urgent" : ""}`}>{expiry.text}</span>}
      {item.notes && <span className="muted small">{item.notes}</span>}
      <span className="row-actions">
        <button className="icon" aria-label="Edit" onClick={() => setEditing(true)}>
          ✎
        </button>
        <button
          className="icon"
          aria-label={`Remove ${item.name}`}
          onClick={() =>
            run(async () => {
              await api.delete(`/api/pantry/${item.id}`);
              changed(["pantry"]);
            })
          }
        >
          ×
        </button>
      </span>
      {errorView}
    </li>
  );
}

function PantryForm({ item, onDone }: { item?: PantryItem; onDone?: () => void }) {
  const { changed } = useWorkspace();
  const [name, setName] = useState(item?.name ?? "");
  const [quantity, setQuantity] = useState(item?.quantity?.toString() ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [expiresOn, setExpiresOn] = useState(item?.expiresOn ?? "");
  const { run, busy, errorView } = useAction();
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const body = {
            name,
            quantity: parseOptionalNumber(quantity),
            unit,
            category,
            expiresOn: expiresOn || null,
          };
          if (item) await api.patch(`/api/pantry/${item.id}`, body);
          else await api.post("/api/pantry", body);
          changed(["pantry"]);
          if (onDone) onDone();
          else {
            setName("");
            setQuantity("");
            setUnit("");
            setExpiresOn("");
          }
        });
      }}
    >
      <input placeholder="Item" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="narrow" inputMode="decimal" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      <input className="narrow" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <input className="narrow" placeholder="Shelf" value={category} onChange={(e) => setCategory(e.target.value)} />
      <input type="date" aria-label="Use by" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
      <button className="btn small" disabled={busy}>
        {item ? "Save" : "Add"}
      </button>
      {onDone && (
        <button type="button" className="btn small ghost" onClick={onDone}>
          Cancel
        </button>
      )}
      {errorView}
    </form>
  );
}
