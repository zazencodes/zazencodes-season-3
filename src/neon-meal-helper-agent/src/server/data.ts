// Data access shared by the REST API and the agent's tools. Every function is
// scoped to one user and throws NotFoundError for rows the user does not own.

import type pg from "pg";
import { pool } from "./db.ts";
import type {
  ChatMessage,
  ChatRow,
  FileRecord,
  GroceryItem,
  GroceryList,
  GroceryListSummary,
  Ingredient,
  Meal,
  MealPlanEntry,
  PantryItem,
  Recipe,
  RecipeLinks,
  RecipeSummary,
} from "../shared/types.ts";

export class NotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} ${id} not found`);
  }
}

type Row = Record<string, any>;

const iso = (value: Date) => value.toISOString();

/** Build `col = $n` assignments for the keys present in `patch`. */
function assignments(columns: Record<string, string>, patch: Record<string, unknown>, firstParam: number) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (patch[key] === undefined) continue;
    values.push(column === "ingredients" || column === "steps" ? JSON.stringify(patch[key]) : patch[key]);
    sets.push(`${column} = $${firstParam + values.length - 1}`);
  }
  return { sets, values };
}

// ---------------------------------------------------------------- recipes

export interface RecipeInput {
  title: string;
  description?: string;
  servings?: number | null;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  ingredients?: Ingredient[];
  steps?: string[];
  tags?: string[];
  source?: string;
  notes?: string;
}

const recipeColumns = {
  title: "title",
  description: "description",
  servings: "servings",
  prepMinutes: "prep_minutes",
  cookMinutes: "cook_minutes",
  ingredients: "ingredients",
  steps: "steps",
  tags: "tags",
  source: "source",
  notes: "notes",
};

const toRecipeSummary = (r: Row): RecipeSummary => ({
  id: r.id,
  title: r.title,
  description: r.description,
  servings: r.servings,
  tags: r.tags,
  updatedAt: iso(r.updated_at),
});

const toRecipe = (r: Row): Recipe => ({
  ...toRecipeSummary(r),
  prepMinutes: r.prep_minutes,
  cookMinutes: r.cook_minutes,
  ingredients: r.ingredients,
  steps: r.steps,
  source: r.source,
  notes: r.notes,
  createdAt: iso(r.created_at),
});

export async function listRecipes(userId: string, query?: string): Promise<RecipeSummary[]> {
  const { rows } = await pool.query(
    `select * from recipes
     where user_id = $1
       and ($2::text is null
            or title ilike '%' || $2 || '%'
            or description ilike '%' || $2 || '%'
            or exists (select 1 from unnest(tags) t where t ilike '%' || $2 || '%')
            or ingredients::text ilike '%' || $2 || '%')
     order by updated_at desc`,
    [userId, query?.trim() || null],
  );
  return rows.map(toRecipeSummary);
}

export async function getRecipe(userId: string, id: string): Promise<Recipe> {
  const { rows } = await pool.query(`select * from recipes where user_id = $1 and id = $2`, [userId, id]);
  if (!rows[0]) throw new NotFoundError("Recipe", id);
  return toRecipe(rows[0]);
}

export async function getRecipeLinks(userId: string, id: string): Promise<RecipeLinks> {
  await getRecipe(userId, id);
  const [meals, lists, files] = await Promise.all([
    pool.query(
      `select * from meal_plan_entries where user_id = $1 and recipe_id = $2 order by date, meal`,
      [userId, id],
    ),
    pool.query(
      `select l.id, l.name, count(*)::int as item_count
       from grocery_lists l join grocery_items i on i.list_id = l.id
       where l.user_id = $1 and i.recipe_id = $2
       group by l.id order by l.updated_at desc`,
      [userId, id],
    ),
    pool.query(`select * from files where user_id = $1 and recipe_id = $2 order by created_at desc`, [userId, id]),
  ]);
  return {
    mealPlanEntries: meals.rows.map(toMealPlanEntry),
    groceryLists: lists.rows.map((r) => ({ id: r.id, name: r.name, itemCount: r.item_count })),
    files: files.rows.map(toFile),
  };
}

export async function createRecipe(userId: string, input: RecipeInput): Promise<Recipe> {
  const { rows } = await pool.query(
    `insert into recipes (user_id, title, description, servings, prep_minutes, cook_minutes,
                          ingredients, steps, tags, source, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
    [
      userId,
      input.title,
      input.description ?? "",
      input.servings ?? null,
      input.prepMinutes ?? null,
      input.cookMinutes ?? null,
      JSON.stringify(input.ingredients ?? []),
      JSON.stringify(input.steps ?? []),
      input.tags ?? [],
      input.source ?? "",
      input.notes ?? "",
    ],
  );
  return toRecipe(rows[0]);
}

export async function updateRecipe(userId: string, id: string, patch: Partial<RecipeInput>): Promise<Recipe> {
  const { sets, values } = assignments(recipeColumns, patch, 3);
  const { rows } = await pool.query(
    `update recipes set ${[...sets, "updated_at = now()"].join(", ")}
     where user_id = $1 and id = $2 returning *`,
    [userId, id, ...values],
  );
  if (!rows[0]) throw new NotFoundError("Recipe", id);
  return toRecipe(rows[0]);
}

export async function deleteRecipe(userId: string, id: string): Promise<void> {
  const { rowCount } = await pool.query(`delete from recipes where user_id = $1 and id = $2`, [userId, id]);
  if (!rowCount) throw new NotFoundError("Recipe", id);
}

// -------------------------------------------------------------- meal plan

export interface MealPlanInput {
  date: string;
  meal: Meal;
  recipeId?: string | null;
  title?: string;
  servings?: number | null;
  notes?: string;
}

const toMealPlanEntry = (r: Row): MealPlanEntry => ({
  id: r.id,
  date: r.date,
  meal: r.meal,
  recipeId: r.recipe_id,
  title: r.title,
  servings: r.servings,
  notes: r.notes,
});

export async function listMealPlan(userId: string, from: string, to: string): Promise<MealPlanEntry[]> {
  const { rows } = await pool.query(
    `select * from meal_plan_entries
     where user_id = $1 and date between $2 and $3
     order by date, array_position(array['breakfast','lunch','dinner','snack'], meal), created_at`,
    [userId, from, to],
  );
  return rows.map(toMealPlanEntry);
}

export async function createMealPlanEntries(userId: string, entries: MealPlanInput[]): Promise<MealPlanEntry[]> {
  const created: MealPlanEntry[] = [];
  for (const entry of entries) {
    const recipe = entry.recipeId ? await getRecipe(userId, entry.recipeId) : null;
    const title = entry.title ?? recipe?.title;
    if (!title) throw new Error("A planned meal needs a recipeId or a title");
    const { rows } = await pool.query(
      `insert into meal_plan_entries (user_id, date, meal, recipe_id, title, servings, notes)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [userId, entry.date, entry.meal, recipe?.id ?? null, title, entry.servings ?? null, entry.notes ?? ""],
    );
    created.push(toMealPlanEntry(rows[0]));
  }
  return created;
}

export async function updateMealPlanEntry(
  userId: string,
  id: string,
  patch: Partial<MealPlanInput>,
): Promise<MealPlanEntry> {
  if (patch.recipeId) await getRecipe(userId, patch.recipeId);
  const { sets, values } = assignments(
    { date: "date", meal: "meal", recipeId: "recipe_id", title: "title", servings: "servings", notes: "notes" },
    patch,
    3,
  );
  if (sets.length === 0) throw new Error("Nothing to update");
  const { rows } = await pool.query(
    `update meal_plan_entries set ${sets.join(", ")} where user_id = $1 and id = $2 returning *`,
    [userId, id, ...values],
  );
  if (!rows[0]) throw new NotFoundError("Meal plan entry", id);
  return toMealPlanEntry(rows[0]);
}

export async function deleteMealPlanEntries(userId: string, ids: string[]): Promise<number> {
  const { rowCount } = await pool.query(`delete from meal_plan_entries where user_id = $1 and id = any($2)`, [
    userId,
    ids,
  ]);
  return rowCount ?? 0;
}

// -------------------------------------------------------------- groceries

export interface GroceryItemInput {
  name: string;
  quantity?: number | null;
  unit?: string;
  category?: string;
  recipeId?: string | null;
}

export interface GroceryItemPatch {
  name?: string;
  quantity?: number | null;
  unit?: string;
  category?: string;
  checked?: boolean;
}

const toGroceryListSummary = (r: Row): GroceryListSummary => ({
  id: r.id,
  name: r.name,
  itemCount: r.item_count,
  checkedCount: r.checked_count,
  updatedAt: iso(r.updated_at),
});

const toGroceryItem = (r: Row): GroceryItem => ({
  id: r.id,
  listId: r.list_id,
  name: r.name,
  quantity: r.quantity,
  unit: r.unit,
  category: r.category,
  checked: r.checked,
  recipeId: r.recipe_id,
  recipeTitle: r.recipe_title,
});

const listSummarySql = `
  select l.*, count(i.id)::int as item_count, count(i.id) filter (where i.checked)::int as checked_count
  from grocery_lists l left join grocery_items i on i.list_id = l.id`;

export async function listGroceryLists(userId: string): Promise<GroceryListSummary[]> {
  const { rows } = await pool.query(
    `${listSummarySql} where l.user_id = $1 group by l.id order by l.updated_at desc`,
    [userId],
  );
  return rows.map(toGroceryListSummary);
}

export async function getGroceryList(userId: string, id: string): Promise<GroceryList> {
  const { rows } = await pool.query(`${listSummarySql} where l.user_id = $1 and l.id = $2 group by l.id`, [
    userId,
    id,
  ]);
  if (!rows[0]) throw new NotFoundError("Grocery list", id);
  const items = await pool.query(
    `select i.*, r.title as recipe_title
     from grocery_items i left join recipes r on r.id = i.recipe_id
     where i.list_id = $1 order by i.checked, i.category, i.created_at`,
    [id],
  );
  return { ...toGroceryListSummary(rows[0]), items: items.rows.map(toGroceryItem) };
}

export async function createGroceryList(userId: string, name: string): Promise<GroceryList> {
  const { rows } = await pool.query(`insert into grocery_lists (user_id, name) values ($1, $2) returning id`, [
    userId,
    name,
  ]);
  return getGroceryList(userId, rows[0].id);
}

export async function renameGroceryList(userId: string, id: string, name: string): Promise<GroceryList> {
  const { rowCount } = await pool.query(
    `update grocery_lists set name = $3, updated_at = now() where user_id = $1 and id = $2`,
    [userId, id, name],
  );
  if (!rowCount) throw new NotFoundError("Grocery list", id);
  return getGroceryList(userId, id);
}

export async function deleteGroceryList(userId: string, id: string): Promise<void> {
  const { rowCount } = await pool.query(`delete from grocery_lists where user_id = $1 and id = $2`, [userId, id]);
  if (!rowCount) throw new NotFoundError("Grocery list", id);
}

async function touchGroceryList(client: pg.Pool | pg.PoolClient, userId: string, id: string) {
  const { rowCount } = await client.query(
    `update grocery_lists set updated_at = now() where user_id = $1 and id = $2`,
    [userId, id],
  );
  if (!rowCount) throw new NotFoundError("Grocery list", id);
}

export async function addGroceryItems(userId: string, listId: string, items: GroceryItemInput[]): Promise<GroceryItem[]> {
  for (const recipeId of new Set(items.map((i) => i.recipeId).filter((id) => id != null))) {
    await getRecipe(userId, recipeId);
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await touchGroceryList(client, userId, listId);
    const added: GroceryItem[] = [];
    for (const item of items) {
      const { rows } = await client.query(
        `with i as (
           insert into grocery_items (list_id, name, quantity, unit, category, recipe_id)
           values ($1, $2, $3, $4, $5, $6) returning *)
         select i.*, r.title as recipe_title from i left join recipes r on r.id = i.recipe_id`,
        [listId, item.name, item.quantity ?? null, item.unit ?? "", item.category ?? "", item.recipeId ?? null],
      );
      added.push(toGroceryItem(rows[0]));
    }
    await client.query("commit");
    return added;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Add a recipe's ingredients to a list, scaled to `servings` when both counts are known. */
export async function addRecipeToGroceryList(
  userId: string,
  listId: string,
  recipeId: string,
  servings?: number | null,
): Promise<GroceryItem[]> {
  const recipe = await getRecipe(userId, recipeId);
  const factor = servings && recipe.servings ? servings / recipe.servings : 1;
  return addGroceryItems(
    userId,
    listId,
    recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity == null ? null : Math.round(ingredient.quantity * factor * 100) / 100,
      unit: ingredient.unit,
      recipeId,
    })),
  );
}

export async function updateGroceryItem(userId: string, id: string, patch: GroceryItemPatch): Promise<GroceryItem> {
  const { sets, values } = assignments(
    { name: "name", quantity: "quantity", unit: "unit", category: "category", checked: "checked" },
    patch as Record<string, unknown>,
    3,
  );
  if (sets.length === 0) throw new Error("Nothing to update");
  const { rows } = await pool.query(
    `with i as (
       update grocery_items set ${sets.join(", ")}
       where id = $2 and list_id in (select id from grocery_lists where user_id = $1)
       returning *)
     select i.*, r.title as recipe_title from i left join recipes r on r.id = i.recipe_id`,
    [userId, id, ...values],
  );
  if (!rows[0]) throw new NotFoundError("Grocery item", id);
  await touchGroceryList(pool, userId, rows[0].list_id);
  return toGroceryItem(rows[0]);
}

export async function deleteGroceryItems(userId: string, ids: string[]): Promise<number> {
  const { rowCount } = await pool.query(
    `delete from grocery_items
     where id = any($2) and list_id in (select id from grocery_lists where user_id = $1)`,
    [userId, ids],
  );
  return rowCount ?? 0;
}

// ----------------------------------------------------------------- pantry

export interface PantryInput {
  name: string;
  quantity?: number | null;
  unit?: string;
  category?: string;
  expiresOn?: string | null;
  notes?: string;
}

const pantryColumns = {
  name: "name",
  quantity: "quantity",
  unit: "unit",
  category: "category",
  expiresOn: "expires_on",
  notes: "notes",
};

const toPantryItem = (r: Row): PantryItem => ({
  id: r.id,
  name: r.name,
  quantity: r.quantity,
  unit: r.unit,
  category: r.category,
  expiresOn: r.expires_on,
  notes: r.notes,
  updatedAt: iso(r.updated_at),
});

export async function listPantry(userId: string): Promise<PantryItem[]> {
  const { rows } = await pool.query(`select * from pantry_items where user_id = $1 order by category, name`, [
    userId,
  ]);
  return rows.map(toPantryItem);
}

/**
 * Insert items, or update the existing item with the same name (case-insensitive).
 * On update only the fields present in the input change.
 */
export async function upsertPantryItems(userId: string, items: PantryInput[]): Promise<PantryItem[]> {
  const saved: PantryItem[] = [];
  for (const item of items) {
    const updates = Object.entries(pantryColumns)
      .filter(([key]) => key !== "name" && item[key as keyof PantryInput] !== undefined)
      .map(([, column]) => `${column} = excluded.${column}`);
    const { rows } = await pool.query(
      `insert into pantry_items (user_id, name, quantity, unit, category, expires_on, notes)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id, lower(name)) do update set ${[...updates, "updated_at = now()"].join(", ")}
       returning *`,
      [
        userId,
        item.name,
        item.quantity ?? null,
        item.unit ?? "",
        item.category ?? "",
        item.expiresOn ?? null,
        item.notes ?? "",
      ],
    );
    saved.push(toPantryItem(rows[0]));
  }
  return saved;
}

export async function updatePantryItem(userId: string, id: string, patch: Partial<PantryInput>): Promise<PantryItem> {
  const { sets, values } = assignments(pantryColumns, patch, 3);
  const { rows } = await pool.query(
    `update pantry_items set ${[...sets, "updated_at = now()"].join(", ")}
     where user_id = $1 and id = $2 returning *`,
    [userId, id, ...values],
  );
  if (!rows[0]) throw new NotFoundError("Pantry item", id);
  return toPantryItem(rows[0]);
}

export async function deletePantryItems(userId: string, ids: string[]): Promise<number> {
  const { rowCount } = await pool.query(`delete from pantry_items where user_id = $1 and id = any($2)`, [
    userId,
    ids,
  ]);
  return rowCount ?? 0;
}

// ------------------------------------------------------------------ files

const toFile = (r: Row): FileRecord => ({
  id: r.id,
  recipeId: r.recipe_id,
  name: r.name,
  contentType: r.content_type,
  sizeBytes: r.size_bytes,
  createdAt: iso(r.created_at),
});

export async function listFiles(userId: string): Promise<FileRecord[]> {
  const { rows } = await pool.query(`select * from files where user_id = $1 order by created_at desc`, [userId]);
  return rows.map(toFile);
}

export async function getFile(userId: string, id: string): Promise<FileRecord & { storageKey: string }> {
  const { rows } = await pool.query(`select * from files where user_id = $1 and id = $2`, [userId, id]);
  if (!rows[0]) throw new NotFoundError("File", id);
  return { ...toFile(rows[0]), storageKey: rows[0].storage_key };
}

export async function createFile(
  userId: string,
  file: { id: string; name: string; contentType: string; sizeBytes: number; storageKey: string },
): Promise<FileRecord> {
  const { rows } = await pool.query(
    `insert into files (id, user_id, name, content_type, size_bytes, storage_key)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [file.id, userId, file.name, file.contentType, file.sizeBytes, file.storageKey],
  );
  return toFile(rows[0]);
}

export async function linkFile(userId: string, id: string, recipeId: string | null): Promise<FileRecord> {
  if (recipeId) await getRecipe(userId, recipeId);
  const { rows } = await pool.query(`update files set recipe_id = $3 where user_id = $1 and id = $2 returning *`, [
    userId,
    id,
    recipeId,
  ]);
  if (!rows[0]) throw new NotFoundError("File", id);
  return toFile(rows[0]);
}

export async function deleteFileRow(userId: string, id: string): Promise<void> {
  const { rowCount } = await pool.query(`delete from files where user_id = $1 and id = $2`, [userId, id]);
  if (!rowCount) throw new NotFoundError("File", id);
}

// ------------------------------------------------------------------- chat

/** A chat session ends after this much inactivity; the next message starts a fresh one. */
export const CHAT_SESSION_GAP = "6 hours";

const toChatRow = (r: Row): ChatRow => ({ id: String(r.id), createdAt: iso(r.created_at), message: r.message });

/**
 * Messages of the user's current chat session: the run of messages since the last
 * gap longer than CHAT_SESSION_GAP, or none if that gap has already passed.
 */
export async function loadChatSession(userId: string): Promise<ChatRow[]> {
  const { rows } = await pool.query(
    `with gaps as (
       select id, created_at, created_at - lag(created_at) over (order by id) as gap
       from chat_messages where user_id = $1),
     start as (
       select coalesce(max(id) filter (where gap > $2::interval), min(id)) as id,
              max(created_at) as last_at
       from gaps)
     select m.* from chat_messages m, start
     where m.user_id = $1 and m.id >= start.id and start.last_at > now() - $2::interval
     order by m.id`,
    [userId, CHAT_SESSION_GAP],
  );
  return rows.map(toChatRow);
}

export async function appendChatMessage(userId: string, message: ChatMessage): Promise<ChatRow> {
  const { rows } = await pool.query(
    `insert into chat_messages (user_id, message) values ($1, $2) returning *`,
    [userId, JSON.stringify(message)],
  );
  return toChatRow(rows[0]);
}
