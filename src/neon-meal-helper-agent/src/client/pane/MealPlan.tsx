import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { useResource, useWorkspace } from "../workspace.tsx";
import { isoDate, Loading, parseIsoDate, parseOptionalNumber, useAction } from "./common.tsx";
import { MEALS, type GroceryList, type Meal, type MealPlanEntry, type RecipeSummary } from "../../shared/types.ts";

function mondayOf(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function MealPlanView() {
  const { target, versions, changed } = useWorkspace();
  const [weekStart, setWeekStart] = useState(() =>
    mondayOf(target.date ? parseIsoDate(target.date) : new Date()),
  );
  useEffect(() => {
    if (target.date) setWeekStart(mondayOf(parseIsoDate(target.date)));
  }, [target.date]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = isoDate(days[0]);
  const to = isoDate(days[6]);
  const { data, error } = useResource(
    () => api.get<MealPlanEntry[]>(`/api/meal-plan?from=${from}&to=${to}`),
    [from, versions.mealPlan],
  );
  const recipes = useResource(() => api.get<RecipeSummary[]>("/api/recipes"), [versions.recipes]);
  const { run, busy, errorView } = useAction();
  const today = isoDate(new Date());
  const withRecipes = (data ?? []).filter((e) => e.recipeId);

  return (
    <section>
      <div className="pane-head">
        <h2>Meal plan</h2>
        <div className="week-nav">
          <button className="btn small ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
            ‹
          </button>
          <button className="btn small ghost" onClick={() => setWeekStart(mondayOf(new Date()))}>
            This week
          </button>
          <button className="btn small ghost" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
            ›
          </button>
        </div>
      </div>
      <p className="muted week-label">
        {days[0].toLocaleDateString(undefined, { month: "long", day: "numeric" })} –{" "}
        {days[6].toLocaleDateString(undefined, { month: "long", day: "numeric" })}
      </p>
      {withRecipes.length > 0 && (
        <button
          className="btn small"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const list = await api.post<GroceryList>("/api/grocery-lists", {
                name: `Week of ${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
              });
              for (const entry of withRecipes) {
                await api.post(`/api/grocery-lists/${list.id}/recipes`, {
                  recipeId: entry.recipeId,
                  servings: entry.servings,
                });
              }
              changed(["groceries", "recipes"]);
            })
          }
        >
          Make a grocery list from this week
        </button>
      )}
      {errorView}
      {!data ? (
        <Loading error={error} />
      ) : (
        <ol className="week">
          {days.map((day) => {
            const date = isoDate(day);
            const entries = data.filter((e) => e.date === date);
            return (
              <li key={date} className={`day ${date === today ? "today" : ""}`}>
                <div className="day-head">
                  <span className="day-name">{day.toLocaleDateString(undefined, { weekday: "long" })}</span>
                  <span className="day-date">{day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>
                {entries.map((entry) => (
                  <PlannedMeal key={entry.id} entry={entry} highlighted={entry.id === target.id} />
                ))}
                <AddMeal date={date} recipes={recipes.data ?? []} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function PlannedMeal({ entry, highlighted }: { entry: MealPlanEntry; highlighted: boolean }) {
  const { navigate, changed } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const { run, busy, errorView } = useAction();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted]);

  if (editing) return <EditMeal entry={entry} onDone={() => setEditing(false)} />;
  return (
    <div ref={ref} className={`planned ${highlighted ? "highlight" : ""}`}>
      <span className={`meal-tag ${entry.meal}`}>{entry.meal}</span>
      <div className="planned-main">
        {entry.recipeId ? (
          <button className="linkish" onClick={() => navigate({ tab: "recipes", id: entry.recipeId! })}>
            {entry.title}
          </button>
        ) : (
          <span>{entry.title}</span>
        )}
        {(entry.servings != null || entry.notes) && (
          <span className="muted small">
            {entry.servings != null && `serves ${entry.servings}`}
            {entry.servings != null && entry.notes && " · "}
            {entry.notes}
          </span>
        )}
      </div>
      <button className="icon" aria-label="Edit" onClick={() => setEditing(true)}>
        ✎
      </button>
      <button
        className="icon"
        aria-label="Remove"
        disabled={busy}
        onClick={() =>
          run(async () => {
            await api.delete(`/api/meal-plan/${entry.id}`);
            changed(["mealPlan", "recipes"]);
          })
        }
      >
        ×
      </button>
      {errorView}
    </div>
  );
}

function EditMeal({ entry, onDone }: { entry: MealPlanEntry; onDone: () => void }) {
  const { changed } = useWorkspace();
  const [date, setDate] = useState(entry.date);
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [title, setTitle] = useState(entry.title);
  const [servings, setServings] = useState(entry.servings?.toString() ?? "");
  const [notes, setNotes] = useState(entry.notes);
  const { run, busy, errorView } = useAction();
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api.patch(`/api/meal-plan/${entry.id}`, {
            date,
            meal,
            title,
            servings: parseOptionalNumber(servings),
            notes,
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
      <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      <input className="narrow" inputMode="numeric" placeholder="Serves" value={servings} onChange={(e) => setServings(e.target.value)} />
      <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn small primary" disabled={busy}>
        Save
      </button>
      <button type="button" className="btn small ghost" onClick={onDone}>
        Cancel
      </button>
      {errorView}
    </form>
  );
}

function AddMeal({ date, recipes }: { date: string; recipes: RecipeSummary[] }) {
  const { changed } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [meal, setMeal] = useState<Meal>("dinner");
  const [recipeId, setRecipeId] = useState("");
  const [title, setTitle] = useState("");
  const { run, busy, errorView } = useAction();
  if (!open)
    return (
      <button className="add-meal" onClick={() => setOpen(true)}>
        + add meal
      </button>
    );
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api.post("/api/meal-plan", recipeId ? { date, meal, recipeId } : { date, meal, title });
          changed(["mealPlan", "recipes"]);
          setOpen(false);
          setRecipeId("");
          setTitle("");
        });
      }}
    >
      <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
        {MEALS.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
        <option value="">No recipe — type a title</option>
        {recipes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </select>
      {!recipeId && <input placeholder="e.g. Leftovers" value={title} onChange={(e) => setTitle(e.target.value)} required />}
      <button className="btn small primary" disabled={busy}>
        Add
      </button>
      <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {errorView}
    </form>
  );
}
