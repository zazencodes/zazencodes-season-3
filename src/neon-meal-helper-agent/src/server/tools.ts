// The meal agent's tools. Each one wraps a data function for a single user and
// returns `ToolDetails` so the client can refresh and link to what changed.

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type, type Static, type TSchema } from "@earendil-works/pi-ai";
import * as data from "./data.ts";
import { files } from "./storage.ts";
import { MEALS, TOOL_LABELS, type Collection, type ObjectRef, type ToolDetails } from "../shared/types.ts";

function result(payload: unknown, changed: Collection[], refs: ObjectRef[] = []): AgentToolResult<ToolDetails> {
  return { content: [{ type: "text", text: JSON.stringify(payload) }], details: { changed, refs } };
}

function tool<P extends TSchema>(
  name: keyof typeof TOOL_LABELS,
  description: string,
  parameters: P,
  execute: (params: Static<P>) => Promise<AgentToolResult<ToolDetails>>,
): AgentTool<P, ToolDetails> {
  return { name, label: TOOL_LABELS[name], description, parameters, execute: (_id, params) => execute(params) };
}

const Id = (what: string) => Type.String({ description: `${what} id (uuid)` });
const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const DateString = Type.String({ description: "Date as YYYY-MM-DD" });
const MealSchema = Type.Union(MEALS.map((meal) => Type.Literal(meal)));

const IngredientSchema = Type.Object({
  name: Type.String(),
  quantity: Nullable(Type.Number({ description: "Amount as a number, null when unspecified (e.g. 'to taste')" })),
  unit: Type.String({ description: "e.g. g, ml, cup, tbsp, clove; empty string for countable items" }),
  note: Type.String({ description: "Preparation note such as 'finely chopped'; may be empty" }),
});

const RecipeFields = {
  description: Type.Optional(Type.String()),
  servings: Type.Optional(Nullable(Type.Integer())),
  prep_minutes: Type.Optional(Nullable(Type.Integer())),
  cook_minutes: Type.Optional(Nullable(Type.Integer())),
  ingredients: Type.Optional(Type.Array(IngredientSchema)),
  steps: Type.Optional(Type.Array(Type.String(), { description: "One instruction per entry, in order" })),
  tags: Type.Optional(Type.Array(Type.String())),
  source: Type.Optional(Type.String({ description: "URL, book, or person the recipe came from" })),
  notes: Type.Optional(Type.String()),
};

type RecipeFieldParams = { [K in keyof typeof RecipeFields]?: Static<(typeof RecipeFields)[K]> };

const recipeInput = (p: RecipeFieldParams) => ({
  description: p.description,
  servings: p.servings,
  prepMinutes: p.prep_minutes,
  cookMinutes: p.cook_minutes,
  ingredients: p.ingredients,
  steps: p.steps,
  tags: p.tags,
  source: p.source,
  notes: p.notes,
});

const recipeRef = (r: { id: string; title: string }): ObjectRef => ({ kind: "recipe", id: r.id, label: r.title });
const listRef = (l: { id: string; name: string }): ObjectRef => ({ kind: "groceryList", id: l.id, label: l.name });
const mealRef = (m: { id: string; title: string; date: string; meal: string }): ObjectRef => ({
  kind: "mealPlanEntry",
  id: m.id,
  label: `${m.title} · ${m.date} ${m.meal}`,
  date: m.date,
});

export function createTools(userId: string): AgentTool<any, ToolDetails>[] {
  return [
    // ------------------------------------------------------------ recipes
    tool(
      "search_recipes",
      "List saved recipes, newest first. Optionally filter by text matching title, description, tags, or ingredients.",
      Type.Object({ query: Type.Optional(Type.String()) }),
      async ({ query }) => {
        const recipes = await data.listRecipes(userId, query);
        return result(recipes, [], recipes.slice(0, 8).map(recipeRef));
      },
    ),
    tool(
      "get_recipe",
      "Get a recipe's full ingredients and steps, plus the planned meals, grocery lists, and files linked to it.",
      Type.Object({ recipe_id: Id("Recipe") }),
      async ({ recipe_id }) => {
        const recipe = await data.getRecipe(userId, recipe_id);
        const links = await data.getRecipeLinks(userId, recipe_id);
        return result({ ...recipe, links }, [], [recipeRef(recipe)]);
      },
    ),
    tool(
      "create_recipe",
      "Save a new recipe. Pass file_id when the recipe was transcribed from an uploaded file, to link them.",
      Type.Object({ title: Type.String(), ...RecipeFields, file_id: Type.Optional(Id("Uploaded file")) }),
      async (p) => {
        const recipe = await data.createRecipe(userId, { title: p.title, ...recipeInput(p) });
        if (p.file_id) await data.linkFile(userId, p.file_id, recipe.id);
        return result(recipe, p.file_id ? ["recipes", "files"] : ["recipes"], [recipeRef(recipe)]);
      },
    ),
    tool(
      "update_recipe",
      "Change fields of a recipe. Only the fields you pass change; ingredients and steps are replaced as a whole.",
      Type.Object({ recipe_id: Id("Recipe"), title: Type.Optional(Type.String()), ...RecipeFields }),
      async (p) => {
        const recipe = await data.updateRecipe(userId, p.recipe_id, { title: p.title, ...recipeInput(p) });
        return result(recipe, ["recipes", "mealPlan", "groceries"], [recipeRef(recipe)]);
      },
    ),
    tool(
      "delete_recipe",
      "Delete a recipe. Planned meals and grocery items that used it stay but lose the link.",
      Type.Object({ recipe_id: Id("Recipe") }),
      async ({ recipe_id }) => {
        await data.deleteRecipe(userId, recipe_id);
        return result({ deleted: recipe_id }, ["recipes", "mealPlan", "groceries", "files"]);
      },
    ),
    tool(
      "view_file",
      "Read a file the user uploaded: images are shown to you, text files return their contents.",
      Type.Object({ file_id: Id("Uploaded file") }),
      async ({ file_id }) => {
        const file = await data.getFile(userId, file_id);
        const bytes = Buffer.from(await (await files.download(file.storageKey)).arrayBuffer());
        const ref: ObjectRef = { kind: "file", id: file.id, label: file.name };
        const details: ToolDetails = { changed: [], refs: [ref] };
        if (file.contentType.startsWith("image/")) {
          return {
            content: [
              { type: "text", text: `Image ${file.name} (${file.contentType})` },
              { type: "image", data: bytes.toString("base64"), mimeType: file.contentType },
            ],
            details,
          };
        }
        return { content: [{ type: "text", text: bytes.toString("utf8") }], details };
      },
    ),

    // ---------------------------------------------------------- meal plan
    tool(
      "get_meal_plan",
      "List planned meals between two dates, inclusive.",
      Type.Object({ from: DateString, to: DateString }),
      async ({ from, to }) => {
        const entries = await data.listMealPlan(userId, from, to);
        return result(entries, [], entries.map(mealRef));
      },
    ),
    tool(
      "plan_meals",
      "Add meals to the plan. Link a saved recipe with recipe_id (the title defaults to the recipe's), or give just a title for a meal without a recipe.",
      Type.Object({
        entries: Type.Array(
          Type.Object({
            date: DateString,
            meal: MealSchema,
            recipe_id: Type.Optional(Id("Recipe")),
            title: Type.Optional(Type.String()),
            servings: Type.Optional(Nullable(Type.Integer())),
            notes: Type.Optional(Type.String()),
          }),
        ),
      }),
      async ({ entries }) => {
        const created = await data.createMealPlanEntries(
          userId,
          entries.map((e) => ({ ...e, recipeId: e.recipe_id })),
        );
        return result(created, ["mealPlan", "recipes"], created.map(mealRef));
      },
    ),
    tool(
      "update_planned_meal",
      "Move or change a planned meal. Only the fields you pass change; recipe_id null unlinks the recipe.",
      Type.Object({
        entry_id: Id("Meal plan entry"),
        date: Type.Optional(DateString),
        meal: Type.Optional(MealSchema),
        recipe_id: Type.Optional(Nullable(Id("Recipe"))),
        title: Type.Optional(Type.String()),
        servings: Type.Optional(Nullable(Type.Integer())),
        notes: Type.Optional(Type.String()),
      }),
      async ({ entry_id, recipe_id, ...patch }) => {
        const entry = await data.updateMealPlanEntry(userId, entry_id, { ...patch, recipeId: recipe_id });
        return result(entry, ["mealPlan", "recipes"], [mealRef(entry)]);
      },
    ),
    tool(
      "remove_planned_meals",
      "Remove meals from the plan.",
      Type.Object({ entry_ids: Type.Array(Id("Meal plan entry")) }),
      async ({ entry_ids }) => result({ removed: await data.deleteMealPlanEntries(userId, entry_ids) }, ["mealPlan", "recipes"]),
    ),

    // ---------------------------------------------------------- groceries
    tool(
      "list_grocery_lists",
      "List grocery lists with item counts, most recently updated first.",
      Type.Object({}),
      async () => {
        const lists = await data.listGroceryLists(userId);
        return result(lists, [], lists.map(listRef));
      },
    ),
    tool(
      "get_grocery_list",
      "Get a grocery list with all its items.",
      Type.Object({ list_id: Id("Grocery list") }),
      async ({ list_id }) => {
        const list = await data.getGroceryList(userId, list_id);
        return result(list, [], [listRef(list)]);
      },
    ),
    tool(
      "create_grocery_list",
      "Create an empty grocery list.",
      Type.Object({ name: Type.String() }),
      async ({ name }) => {
        const list = await data.createGroceryList(userId, name);
        return result(list, ["groceries"], [listRef(list)]);
      },
    ),
    tool(
      "rename_grocery_list",
      "Rename a grocery list.",
      Type.Object({ list_id: Id("Grocery list"), name: Type.String() }),
      async ({ list_id, name }) => {
        const list = await data.renameGroceryList(userId, list_id, name);
        return result(list, ["groceries"], [listRef(list)]);
      },
    ),
    tool(
      "delete_grocery_list",
      "Delete a grocery list and all its items.",
      Type.Object({ list_id: Id("Grocery list") }),
      async ({ list_id }) => {
        await data.deleteGroceryList(userId, list_id);
        return result({ deleted: list_id }, ["groceries", "recipes"]);
      },
    ),
    tool(
      "add_grocery_items",
      "Add items to a grocery list. Set recipe_id on items needed for a saved recipe so they link back to it.",
      Type.Object({
        list_id: Id("Grocery list"),
        items: Type.Array(
          Type.Object({
            name: Type.String(),
            quantity: Type.Optional(Nullable(Type.Number())),
            unit: Type.Optional(Type.String()),
            category: Type.Optional(Type.String({ description: "Store section, e.g. Produce, Dairy, Pantry" })),
            recipe_id: Type.Optional(Id("Recipe")),
          }),
        ),
      }),
      async ({ list_id, items }) => {
        const added = await data.addGroceryItems(
          userId,
          list_id,
          items.map((i) => ({ ...i, recipeId: i.recipe_id })),
        );
        const list = await data.getGroceryList(userId, list_id);
        return result(added, ["groceries", "recipes"], [listRef(list)]);
      },
    ),
    tool(
      "add_recipe_to_grocery_list",
      "Add every ingredient of a saved recipe to a grocery list, scaled to `servings` when given. Check the pantry first if the user wants to skip what they have, and use add_grocery_items for a filtered set instead.",
      Type.Object({
        list_id: Id("Grocery list"),
        recipe_id: Id("Recipe"),
        servings: Type.Optional(Type.Integer()),
      }),
      async ({ list_id, recipe_id, servings }) => {
        const added = await data.addRecipeToGroceryList(userId, list_id, recipe_id, servings);
        const [list, recipe] = await Promise.all([
          data.getGroceryList(userId, list_id),
          data.getRecipe(userId, recipe_id),
        ]);
        return result(added, ["groceries", "recipes"], [listRef(list), recipeRef(recipe)]);
      },
    ),
    tool(
      "update_grocery_items",
      "Edit or check off grocery items. Only the fields you pass change.",
      Type.Object({
        updates: Type.Array(
          Type.Object({
            item_id: Id("Grocery item"),
            name: Type.Optional(Type.String()),
            quantity: Type.Optional(Nullable(Type.Number())),
            unit: Type.Optional(Type.String()),
            category: Type.Optional(Type.String()),
            checked: Type.Optional(Type.Boolean()),
          }),
        ),
      }),
      async ({ updates }) => {
        const items = [];
        for (const { item_id, ...patch } of updates) items.push(await data.updateGroceryItem(userId, item_id, patch));
        return result(items, ["groceries"]);
      },
    ),
    tool(
      "remove_grocery_items",
      "Remove items from grocery lists.",
      Type.Object({ item_ids: Type.Array(Id("Grocery item")) }),
      async ({ item_ids }) =>
        result({ removed: await data.deleteGroceryItems(userId, item_ids) }, ["groceries", "recipes"]),
    ),

    // ------------------------------------------------------------- pantry
    tool(
      "get_pantry",
      "List everything in the pantry.",
      Type.Object({}),
      async () => result(await data.listPantry(userId), []),
    ),
    tool(
      "set_pantry_items",
      "Add pantry items, or update items with the same name (case-insensitive). Quantity is the new total, not a change; on an existing item only the fields you pass change.",
      Type.Object({
        items: Type.Array(
          Type.Object({
            name: Type.String(),
            quantity: Type.Optional(Nullable(Type.Number())),
            unit: Type.Optional(Type.String()),
            category: Type.Optional(Type.String()),
            expires_on: Type.Optional(Nullable(DateString)),
            notes: Type.Optional(Type.String()),
          }),
        ),
      }),
      async ({ items }) => {
        const saved = await data.upsertPantryItems(
          userId,
          items.map(({ expires_on, ...i }) => ({ ...i, expiresOn: expires_on })),
        );
        return result(
          saved,
          ["pantry"],
          saved.map((i) => ({ kind: "pantryItem", id: i.id, label: i.name })),
        );
      },
    ),
    tool(
      "remove_pantry_items",
      "Remove items from the pantry, e.g. when used up.",
      Type.Object({ item_ids: Type.Array(Id("Pantry item")) }),
      async ({ item_ids }) => result({ removed: await data.deletePantryItems(userId, item_ids) }, ["pantry"]),
    ),
  ];
}
