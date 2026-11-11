// Types shared by the Function API and the browser client.

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string;
  note: string;
}

export interface RecipeSummary {
  id: string;
  title: string;
  description: string;
  servings: number | null;
  tags: string[];
  updatedAt: string;
}

export interface Recipe extends RecipeSummary {
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  source: string;
  notes: string;
  createdAt: string;
}

export interface RecipeLinks {
  mealPlanEntries: MealPlanEntry[];
  groceryLists: { id: string; name: string; itemCount: number }[];
  files: FileRecord[];
}

export interface MealPlanEntry {
  id: string;
  date: string; // YYYY-MM-DD
  meal: Meal;
  recipeId: string | null;
  title: string;
  servings: number | null;
  notes: string;
}

export interface GroceryListSummary {
  id: string;
  name: string;
  itemCount: number;
  checkedCount: number;
  updatedAt: string;
}

export interface GroceryItem {
  id: string;
  listId: string;
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
  checked: boolean;
  recipeId: string | null;
  recipeTitle: string | null;
}

export interface GroceryList extends GroceryListSummary {
  items: GroceryItem[];
}

export interface PantryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
  expiresOn: string | null;
  notes: string;
  updatedAt: string;
}

export interface FileRecord {
  id: string;
  recipeId: string | null;
  name: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

/** The collections shown in the left pane. Tool results name the ones they changed. */
export type Collection = "recipes" | "mealPlan" | "groceries" | "pantry" | "files";

/** A reference from a tool result to an object the left pane can open. */
export interface ObjectRef {
  kind: "recipe" | "groceryList" | "mealPlanEntry" | "pantryItem" | "file";
  id: string;
  label: string;
  /** Set on meal plan entries so the pane can open the right week. */
  date?: string;
}

/** `details` on every tool result produced by the meal agent. */
export interface ToolDetails {
  changed: Collection[];
  refs: ObjectRef[];
}

/**
 * Separates a user's typed text from the list of files attached to the message.
 * Lines after it look like `- name (file_id: <uuid>, <content type>)`.
 */
export const ATTACHMENTS_MARKER = "\n\nAttached files:\n";

/** Display names for the agent's tools. */
export const TOOL_LABELS = {
  search_recipes: "Search recipes",
  get_recipe: "Open recipe",
  create_recipe: "Create recipe",
  update_recipe: "Update recipe",
  delete_recipe: "Delete recipe",
  view_file: "View uploaded file",
  get_meal_plan: "Read meal plan",
  plan_meals: "Plan meals",
  update_planned_meal: "Update planned meal",
  remove_planned_meals: "Remove planned meals",
  list_grocery_lists: "List grocery lists",
  get_grocery_list: "Open grocery list",
  create_grocery_list: "Create grocery list",
  rename_grocery_list: "Rename grocery list",
  delete_grocery_list: "Delete grocery list",
  add_grocery_items: "Add grocery items",
  add_recipe_to_grocery_list: "Add recipe to grocery list",
  update_grocery_items: "Update grocery items",
  remove_grocery_items: "Remove grocery items",
  get_pantry: "Read pantry",
  set_pantry_items: "Update pantry",
  remove_pantry_items: "Remove pantry items",
} as const;

/** A persisted chat row. `message` is a Pi AgentMessage. */
export interface ChatRow {
  id: string;
  createdAt: string;
  message: ChatMessage;
}

// Minimal structural view of the Pi message shapes the client renders.
export type ChatMessage =
  | { role: "user"; content: string | ContentBlock[]; timestamp: number }
  | {
      role: "assistant";
      content: ContentBlock[];
      stopReason: string;
      errorMessage?: string;
      timestamp: number;
    }
  | {
      role: "toolResult";
      toolCallId: string;
      toolName: string;
      content: ContentBlock[];
      details?: ToolDetails;
      isError: boolean;
      timestamp: number;
    };

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "image"; data: string; mimeType: string };

/** Server-sent events on POST /api/chat. */
export type ChatEvent =
  | { type: "row"; row: ChatRow }
  | { type: "assistant_start" }
  | { type: "delta"; kind: "text" | "thinking"; contentIndex: number; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool_end"; toolCallId: string; isError: boolean; details: ToolDetails | null }
  | { type: "error"; message: string }
  | { type: "done" };
