import { useState } from "react";
import { api } from "../api.ts";
import { useResource, useWorkspace } from "../workspace.tsx";
import {
  BackButton,
  Empty,
  formatQuantity,
  isoDate,
  Loading,
  parseIsoDate,
  parseOptionalNumber,
  useAction,
} from "./common.tsx";
import {
  MEALS,
  type GroceryList,
  type GroceryListSummary,
  type Ingredient,
  type Meal,
  type Recipe,
  type RecipeLinks,
  type RecipeSummary,
} from "../../shared/types.ts";

export function RecipesView() {
  const { target, navigate } = useWorkspace();
  const [creating, setCreating] = useState(false);
  if (creating)
    return (
      <RecipeEditor
        onCancel={() => setCreating(false)}
        onSaved={(recipe) => {
          setCreating(false);
          navigate({ tab: "recipes", id: recipe.id });
        }}
      />
    );
  if (target.id) return <RecipeDetail id={target.id} />;
  return <RecipeList onNew={() => setCreating(true)} />;
}

function RecipeList({ onNew }: { onNew: () => void }) {
  const { versions, navigate } = useWorkspace();
  const [query, setQuery] = useState("");
  const { data, error } = useResource(
    () => api.get<RecipeSummary[]>(`/api/recipes${query ? `?q=${encodeURIComponent(query)}` : ""}`),
    [versions.recipes, query],
  );
  return (
    <section>
      <div className="pane-head">
        <h2>Recipes</h2>
        <button className="btn small" onClick={onNew}>
          + New
        </button>
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search title, tag, ingredient…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!data ? (
        <Loading error={error} />
      ) : data.length === 0 ? (
        <Empty>{query ? "No matches." : "No recipes yet. Ask the agent to save one, or upload a photo of a recipe card."}</Empty>
      ) : (
        <ul className="cards">
          {data.map((r) => (
            <li key={r.id}>
              <button className="card" onClick={() => navigate({ tab: "recipes", id: r.id })}>
                <span className="card-title">{r.title}</span>
                {r.description && <span className="card-sub">{r.description}</span>}
                {r.tags.length > 0 && (
                  <span className="tags">
                    {r.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecipeDetail({ id }: { id: string }) {
  const { versions, navigate, changed } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<"plan" | "groceries" | null>(null);
  const { run, busy, errorView } = useAction();
  const { data, error } = useResource(
    () => api.get<{ recipe: Recipe; links: RecipeLinks }>(`/api/recipes/${id}`),
    [id, versions.recipes, versions.mealPlan, versions.groceries, versions.files],
  );

  if (!data) return <Loading error={error} />;
  const { recipe, links } = data;
  if (editing)
    return (
      <RecipeEditor
        recipe={recipe}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          changed(["recipes"]);
        }}
      />
    );

  return (
    <article className="recipe">
      <BackButton onClick={() => navigate({ tab: "recipes" })}>All recipes</BackButton>
      <h2 className="recipe-title">{recipe.title}</h2>
      {recipe.description && <p className="lede">{recipe.description}</p>}
      <dl className="stats">
        {recipe.servings != null && (
          <div>
            <dt>Serves</dt>
            <dd>{recipe.servings}</dd>
          </div>
        )}
        {recipe.prepMinutes != null && (
          <div>
            <dt>Prep</dt>
            <dd>{recipe.prepMinutes} min</dd>
          </div>
        )}
        {recipe.cookMinutes != null && (
          <div>
            <dt>Cook</dt>
            <dd>{recipe.cookMinutes} min</dd>
          </div>
        )}
      </dl>
      {recipe.tags.length > 0 && (
        <div className="tags">
          {recipe.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="actions">
        <button className="btn small" onClick={() => setPanel(panel === "plan" ? null : "plan")}>
          Plan it
        </button>
        <button className="btn small" onClick={() => setPanel(panel === "groceries" ? null : "groceries")}>
          Add to grocery list
        </button>
        <button className="btn small ghost" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          className="btn small ghost danger"
          disabled={busy}
          onClick={() =>
            confirm(`Delete “${recipe.title}”?`) &&
            run(async () => {
              await api.delete(`/api/recipes/${id}`);
              changed(["recipes", "mealPlan", "groceries", "files"]);
              navigate({ tab: "recipes" });
            })
          }
        >
          Delete
        </button>
      </div>
      {errorView}
      {panel === "plan" && <PlanRecipeForm recipe={recipe} onDone={() => setPanel(null)} />}
      {panel === "groceries" && <AddToListForm recipe={recipe} onDone={() => setPanel(null)} />}

      <h3>Ingredients</h3>
      {recipe.ingredients.length === 0 ? (
        <Empty>No ingredients recorded.</Empty>
      ) : (
        <ul className="ingredients">
          {recipe.ingredients.map((ing, i) => (
            <li key={i}>
              <span className="qty">{formatQuantity(ing.quantity, ing.unit)}</span>
              <span>
                {ing.name}
                {ing.note && <span className="muted">, {ing.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3>Method</h3>
      {recipe.steps.length === 0 ? (
        <Empty>No steps recorded.</Empty>
      ) : (
        <ol className="steps">
          {recipe.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      {recipe.notes && (
        <>
          <h3>Notes</h3>
          <p className="notes">{recipe.notes}</p>
        </>
      )}
      {recipe.source && (
        <p className="source">
          Source:{" "}
          {/^https?:\/\//.test(recipe.source) ? (
            <a href={recipe.source} target="_blank" rel="noreferrer">
              {recipe.source}
            </a>
          ) : (
            recipe.source
          )}
        </p>
      )}

      <h3>Linked</h3>
      <div className="links">
        {links.mealPlanEntries.map((m) => (
          <button key={m.id} className="ref mealPlanEntry" onClick={() => navigate({ tab: "plan", id: m.id, date: m.date })}>
            {parseIsoDate(m.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
            {m.meal}
          </button>
        ))}
        {links.groceryLists.map((l) => (
          <button key={l.id} className="ref groceryList" onClick={() => navigate({ tab: "groceries", id: l.id })}>
            {l.name} ({l.itemCount})
          </button>
        ))}
        {links.files.map((f) => (
          <button key={f.id} className="ref file" onClick={() => navigate({ tab: "files", id: f.id })}>
            📎 {f.name}
          </button>
        ))}
        {links.mealPlanEntries.length + links.groceryLists.length + links.files.length === 0 && (
          <span className="muted">Not planned, on a grocery list, or linked to a file yet.</span>
        )}
      </div>
    </article>
  );
}

function PlanRecipeForm({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const { changed } = useWorkspace();
  const [date, setDate] = useState(isoDate(new Date()));
  const [meal, setMeal] = useState<Meal>("dinner");
  const [servings, setServings] = useState(recipe.servings?.toString() ?? "");
  const { run, busy, errorView } = useAction();
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api.post("/api/meal-plan", {
            date,
            meal,
            recipeId: recipe.id,
            servings: parseOptionalNumber(servings),
          });
          changed(["mealPlan", "recipes"]);
          onDone();
        });
      }}
    >
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
        {MEALS.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <input
        className="narrow"
        inputMode="numeric"
        placeholder="Serves"
        value={servings}
        onChange={(e) => setServings(e.target.value)}
      />
      <button className="btn small primary" disabled={busy}>
        Add to plan
      </button>
      {errorView}
    </form>
  );
}

function AddToListForm({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const { changed, versions } = useWorkspace();
  const lists = useResource(() => api.get<GroceryListSummary[]>("/api/grocery-lists"), [versions.groceries]);
  const [listId, setListId] = useState("new");
  const [newName, setNewName] = useState("Shopping");
  const [servings, setServings] = useState(recipe.servings?.toString() ?? "");
  const { run, busy, errorView } = useAction();
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const id =
            listId === "new" ? (await api.post<GroceryList>("/api/grocery-lists", { name: newName })).id : listId;
          await api.post(`/api/grocery-lists/${id}/recipes`, {
            recipeId: recipe.id,
            servings: parseOptionalNumber(servings),
          });
          changed(["groceries", "recipes"]);
          onDone();
        });
      }}
    >
      <select value={listId} onChange={(e) => setListId(e.target.value)}>
        <option value="new">New list…</option>
        {lists.data?.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {listId === "new" && <input value={newName} onChange={(e) => setNewName(e.target.value)} required />}
      <input
        className="narrow"
        inputMode="numeric"
        placeholder="Serves"
        value={servings}
        onChange={(e) => setServings(e.target.value)}
      />
      <button className="btn small primary" disabled={busy}>
        Add ingredients
      </button>
      {errorView}
    </form>
  );
}

const emptyIngredient = (): Ingredient => ({ name: "", quantity: null, unit: "", note: "" });

function RecipeEditor({
  recipe,
  onCancel,
  onSaved,
}: {
  recipe?: Recipe;
  onCancel: () => void;
  onSaved: (recipe: Recipe) => void;
}) {
  const [title, setTitle] = useState(recipe?.title ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [servings, setServings] = useState(recipe?.servings?.toString() ?? "");
  const [prep, setPrep] = useState(recipe?.prepMinutes?.toString() ?? "");
  const [cook, setCook] = useState(recipe?.cookMinutes?.toString() ?? "");
  const [ingredients, setIngredients] = useState(
    (recipe?.ingredients ?? []).map((i) => ({ ...i, quantityText: i.quantity?.toString() ?? "" })),
  );
  const [steps, setSteps] = useState((recipe?.steps ?? []).join("\n"));
  const [tags, setTags] = useState((recipe?.tags ?? []).join(", "));
  const [source, setSource] = useState(recipe?.source ?? "");
  const [notes, setNotes] = useState(recipe?.notes ?? "");
  const { run, busy, errorView } = useAction();

  function save() {
    run(async () => {
      const body = {
        title,
        description,
        servings: parseOptionalNumber(servings),
        prepMinutes: parseOptionalNumber(prep),
        cookMinutes: parseOptionalNumber(cook),
        ingredients: ingredients
          .filter((i) => i.name.trim())
          .map(({ quantityText, ...i }) => ({ ...i, quantity: parseOptionalNumber(quantityText) })),
        steps: steps
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        source,
        notes,
      };
      onSaved(
        recipe
          ? await api.patch<Recipe>(`/api/recipes/${recipe.id}`, body)
          : await api.post<Recipe>("/api/recipes", body),
      );
    });
  }

  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <BackButton onClick={onCancel}>Cancel</BackButton>
      <h2>{recipe ? "Edit recipe" : "New recipe"}</h2>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Description
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="row3">
        <label>
          Serves
          <input inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
        </label>
        <label>
          Prep min
          <input inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} />
        </label>
        <label>
          Cook min
          <input inputMode="numeric" value={cook} onChange={(e) => setCook(e.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend>Ingredients</legend>
        {ingredients.map((ing, i) => {
          const update = (patch: Partial<typeof ing>) =>
            setIngredients((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="ingredient-row">
              <input
                className="narrow"
                inputMode="decimal"
                placeholder="Qty"
                value={ing.quantityText}
                onChange={(e) => update({ quantityText: e.target.value })}
              />
              <input className="narrow" placeholder="Unit" value={ing.unit} onChange={(e) => update({ unit: e.target.value })} />
              <input placeholder="Ingredient" value={ing.name} onChange={(e) => update({ name: e.target.value })} />
              <input placeholder="Note" value={ing.note} onChange={(e) => update({ note: e.target.value })} />
              <button
                type="button"
                className="icon"
                aria-label="Remove ingredient"
                onClick={() => setIngredients((list) => list.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="btn small ghost"
          onClick={() => setIngredients((list) => [...list, { ...emptyIngredient(), quantityText: "" }])}
        >
          + Ingredient
        </button>
      </fieldset>
      <label>
        Method (one step per line)
        <textarea rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>
      <label>
        Tags (comma separated)
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <label>
        Source
        <input value={source} onChange={(e) => setSource(e.target.value)} />
      </label>
      <label>
        Notes
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {errorView}
      <button className="btn primary" disabled={busy}>
        {busy ? "Saving…" : "Save recipe"}
      </button>
    </form>
  );
}
