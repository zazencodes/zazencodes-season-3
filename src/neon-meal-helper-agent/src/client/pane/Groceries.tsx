import { useState } from "react";
import { api } from "../api.ts";
import { useResource, useWorkspace } from "../workspace.tsx";
import { BackButton, Empty, formatQuantity, Loading, parseOptionalNumber, useAction } from "./common.tsx";
import type { GroceryItem, GroceryList, GroceryListSummary, RecipeSummary } from "../../shared/types.ts";

export function GroceriesView() {
  const { target } = useWorkspace();
  return target.id ? <GroceryListDetail id={target.id} /> : <GroceryLists />;
}

function GroceryLists() {
  const { versions, navigate, changed } = useWorkspace();
  const { data, error } = useResource(() => api.get<GroceryListSummary[]>("/api/grocery-lists"), [versions.groceries]);
  const [name, setName] = useState("");
  const { run, busy, errorView } = useAction();
  return (
    <section>
      <div className="pane-head">
        <h2>Grocery lists</h2>
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const list = await api.post<GroceryList>("/api/grocery-lists", { name });
            setName("");
            changed(["groceries"]);
            navigate({ tab: "groceries", id: list.id });
          });
        }}
      >
        <input placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn small" disabled={busy}>
          Create
        </button>
      </form>
      {errorView}
      {!data ? (
        <Loading error={error} />
      ) : data.length === 0 ? (
        <Empty>No grocery lists yet.</Empty>
      ) : (
        <ul className="cards">
          {data.map((l) => (
            <li key={l.id}>
              <button className="card" onClick={() => navigate({ tab: "groceries", id: l.id })}>
                <span className="card-title">{l.name}</span>
                <span className="card-sub">
                  {l.checkedCount}/{l.itemCount} in the basket
                </span>
                <span className="progress">
                  <span style={{ width: `${l.itemCount ? (100 * l.checkedCount) / l.itemCount : 0}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GroceryListDetail({ id }: { id: string }) {
  const { versions, navigate, changed } = useWorkspace();
  const { data, error } = useResource(() => api.get<GroceryList>(`/api/grocery-lists/${id}`), [id, versions.groceries]);
  const recipes = useResource(() => api.get<RecipeSummary[]>("/api/recipes"), [versions.recipes]);
  const { run, busy, errorView } = useAction();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState("");

  if (!data) return <Loading error={error} />;
  const groups = new Map<string, GroceryItem[]>();
  for (const item of data.items.filter((i) => !i.checked)) {
    const key = item.category || "Other";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const checked = data.items.filter((i) => i.checked);

  return (
    <section>
      <BackButton onClick={() => navigate({ tab: "groceries" })}>All lists</BackButton>
      {renaming === null ? (
        <div className="pane-head">
          <h2>{data.name}</h2>
          <div className="actions">
            <button className="btn small ghost" onClick={() => setRenaming(data.name)}>
              Rename
            </button>
            <button
              className="btn small ghost danger"
              disabled={busy}
              onClick={() =>
                confirm(`Delete “${data.name}”?`) &&
                run(async () => {
                  await api.delete(`/api/grocery-lists/${id}`);
                  changed(["groceries", "recipes"]);
                  navigate({ tab: "groceries" });
                })
              }
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.patch(`/api/grocery-lists/${id}`, { name: renaming });
              setRenaming(null);
              changed(["groceries"]);
            });
          }}
        >
          <input value={renaming} onChange={(e) => setRenaming(e.target.value)} required />
          <button className="btn small primary">Save</button>
          <button type="button" className="btn small ghost" onClick={() => setRenaming(null)}>
            Cancel
          </button>
        </form>
      )}
      {errorView}

      <AddItem listId={id} />
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api.post(`/api/grocery-lists/${id}/recipes`, { recipeId, servings: null });
            setRecipeId("");
            changed(["groceries", "recipes"]);
          });
        }}
      >
        <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} required>
          <option value="">Add a recipe's ingredients…</option>
          {recipes.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <button className="btn small" disabled={busy || !recipeId}>
          Add
        </button>
      </form>

      {data.items.length === 0 && <Empty>This list is empty.</Empty>}
      {[...groups].map(([category, items]) => (
        <div key={category} className="grocery-group">
          <h3>{category}</h3>
          <ul className="checklist">
            {items.map((item) => (
              <GroceryRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      ))}
      {checked.length > 0 && (
        <div className="grocery-group done">
          <div className="pane-head">
            <h3>In the basket</h3>
            <button
              className="btn small ghost"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  for (const item of checked) await api.delete(`/api/grocery-items/${item.id}`);
                  changed(["groceries", "recipes"]);
                })
              }
            >
              Clear
            </button>
          </div>
          <ul className="checklist">
            {checked.map((item) => (
              <GroceryRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function GroceryRow({ item }: { item: GroceryItem }) {
  const { navigate, changed } = useWorkspace();
  const { run, errorView } = useAction();
  return (
    <li className={item.checked ? "checked" : ""}>
      <label className="check">
        <input
          type="checkbox"
          checked={item.checked}
          onChange={(e) =>
            run(async () => {
              await api.patch(`/api/grocery-items/${item.id}`, { checked: e.target.checked });
              changed(["groceries"]);
            })
          }
        />
        <span className="item-name">{item.name}</span>
        {(item.quantity != null || item.unit) && <span className="qty">{formatQuantity(item.quantity, item.unit)}</span>}
      </label>
      {item.recipeId && (
        <button className="ref recipe mini" onClick={() => navigate({ tab: "recipes", id: item.recipeId! })}>
          {item.recipeTitle}
        </button>
      )}
      <button
        className="icon"
        aria-label={`Remove ${item.name}`}
        onClick={() =>
          run(async () => {
            await api.delete(`/api/grocery-items/${item.id}`);
            changed(["groceries", "recipes"]);
          })
        }
      >
        ×
      </button>
      {errorView}
    </li>
  );
}

function AddItem({ listId }: { listId: string }) {
  const { changed } = useWorkspace();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");
  const { run, busy, errorView } = useAction();
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api.post(`/api/grocery-lists/${listId}/items`, [
            { name, quantity: parseOptionalNumber(quantity), unit, category },
          ]);
          setName("");
          setQuantity("");
          setUnit("");
          changed(["groceries"]);
        });
      }}
    >
      <input placeholder="Add item" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="narrow" inputMode="decimal" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      <input className="narrow" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <input className="narrow" placeholder="Aisle" value={category} onChange={(e) => setCategory(e.target.value)} />
      <button className="btn small" disabled={busy}>
        Add
      </button>
      {errorView}
    </form>
  );
}
