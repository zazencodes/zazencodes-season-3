// Meal Helper Function: the REST API behind the web app's side pane and the
// streaming agent endpoint. The web app itself is hosted on Vercel (see vercel.json).

import { waitUntil } from "@neon/functions";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { runChat } from "./agent.ts";
import { authProxy, requireUser, type AuthVariables } from "./auth.ts";
import * as data from "./data.ts";
import { files, isSupportedUpload, MAX_UPLOAD_BYTES } from "./storage.ts";
import type { ChatEvent } from "../shared/types.ts";

const app = new Hono<{ Variables: AuthVariables }>();

app.onError((error, c) => {
  if (error instanceof data.NotFoundError) return c.json({ error: error.message }, 404);
  console.error(error);
  return c.json({ error: error.message }, 500);
});

app.all("/api/auth/*", authProxy);
app.use("/api/*", requireUser);

// ------------------------------------------------------------------- chat

app.get("/api/chat", async (c) => c.json(await data.loadChatSession(c.var.userId)));

app.post("/api/chat", async (c) => {
  const userId = c.var.userId;
  const body = await c.req.json<{ text: string; fileIds: string[]; timeZone: string }>();
  if (!body.text.trim() && body.fileIds.length === 0) return c.json({ error: "Empty message" }, 400);
  new Intl.DateTimeFormat("en-US", { timeZone: body.timeZone }); // throws on an unknown zone

  return streamSSE(c, async (stream) => {
    // Writes are chained so events reach the client in the order they were emitted.
    let writes = Promise.resolve();
    const emit = (event: ChatEvent) => {
      writes = writes.then(() => (stream.aborted ? undefined : stream.writeSSE({ data: JSON.stringify(event) })));
    };
    const ping = setInterval(() => {
      writes = writes.then(() => (stream.aborted ? undefined : stream.write(": ping\n\n").then(() => undefined)));
    }, 15_000);

    // The turn finishes and is saved even if the browser disconnects mid-stream.
    const run = runChat(userId, body, emit);
    waitUntil(run);
    try {
      await run;
      emit({ type: "done" });
    } catch (error) {
      console.error(error);
      emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      clearInterval(ping);
      await writes;
    }
  });
});

// ---------------------------------------------------------------- recipes

app.get("/api/recipes", async (c) => c.json(await data.listRecipes(c.var.userId, c.req.query("q"))));
app.post("/api/recipes", async (c) => c.json(await data.createRecipe(c.var.userId, await c.req.json()), 201));
app.get("/api/recipes/:id", async (c) => {
  const id = c.req.param("id");
  const [recipe, links] = await Promise.all([
    data.getRecipe(c.var.userId, id),
    data.getRecipeLinks(c.var.userId, id),
  ]);
  return c.json({ recipe, links });
});
app.patch("/api/recipes/:id", async (c) =>
  c.json(await data.updateRecipe(c.var.userId, c.req.param("id"), await c.req.json())),
);
app.delete("/api/recipes/:id", async (c) => {
  await data.deleteRecipe(c.var.userId, c.req.param("id"));
  return c.body(null, 204);
});

// -------------------------------------------------------------- meal plan

app.get("/api/meal-plan", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to) return c.json({ error: "from and to are required" }, 400);
  return c.json(await data.listMealPlan(c.var.userId, from, to));
});
app.post("/api/meal-plan", async (c) =>
  c.json(await data.createMealPlanEntries(c.var.userId, [await c.req.json()]), 201),
);
app.patch("/api/meal-plan/:id", async (c) =>
  c.json(await data.updateMealPlanEntry(c.var.userId, c.req.param("id"), await c.req.json())),
);
app.delete("/api/meal-plan/:id", async (c) => {
  await data.deleteMealPlanEntries(c.var.userId, [c.req.param("id")]);
  return c.body(null, 204);
});

// -------------------------------------------------------------- groceries

app.get("/api/grocery-lists", async (c) => c.json(await data.listGroceryLists(c.var.userId)));
app.post("/api/grocery-lists", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  return c.json(await data.createGroceryList(c.var.userId, name), 201);
});
app.get("/api/grocery-lists/:id", async (c) => c.json(await data.getGroceryList(c.var.userId, c.req.param("id"))));
app.patch("/api/grocery-lists/:id", async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  return c.json(await data.renameGroceryList(c.var.userId, c.req.param("id"), name));
});
app.delete("/api/grocery-lists/:id", async (c) => {
  await data.deleteGroceryList(c.var.userId, c.req.param("id"));
  return c.body(null, 204);
});
app.post("/api/grocery-lists/:id/items", async (c) =>
  c.json(await data.addGroceryItems(c.var.userId, c.req.param("id"), await c.req.json()), 201),
);
app.post("/api/grocery-lists/:id/recipes", async (c) => {
  const { recipeId, servings } = await c.req.json<{ recipeId: string; servings: number | null }>();
  return c.json(await data.addRecipeToGroceryList(c.var.userId, c.req.param("id"), recipeId, servings), 201);
});
app.patch("/api/grocery-items/:id", async (c) =>
  c.json(await data.updateGroceryItem(c.var.userId, c.req.param("id"), await c.req.json())),
);
app.delete("/api/grocery-items/:id", async (c) => {
  await data.deleteGroceryItems(c.var.userId, [c.req.param("id")]);
  return c.body(null, 204);
});

// ----------------------------------------------------------------- pantry

app.get("/api/pantry", async (c) => c.json(await data.listPantry(c.var.userId)));
app.post("/api/pantry", async (c) => c.json(await data.upsertPantryItems(c.var.userId, [await c.req.json()]), 201));
app.patch("/api/pantry/:id", async (c) =>
  c.json(await data.updatePantryItem(c.var.userId, c.req.param("id"), await c.req.json())),
);
app.delete("/api/pantry/:id", async (c) => {
  await data.deletePantryItems(c.var.userId, [c.req.param("id")]);
  return c.body(null, 204);
});

// ------------------------------------------------------------------ files

app.get("/api/files", async (c) => c.json(await data.listFiles(c.var.userId)));
app.post("/api/files", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "Expected a `file` field" }, 400);
  if (!isSupportedUpload(file.type)) return c.json({ error: `Unsupported file type ${file.type || "unknown"}` }, 415);
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "File is larger than 10 MB" }, 413);

  const id = crypto.randomUUID();
  const storageKey = `${c.var.userId}/${id}/${file.name.replace(/[^\w.-]+/g, "_")}`;
  await files.upload(storageKey, file, { contentType: file.type });
  const record = await data.createFile(c.var.userId, {
    id,
    name: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    storageKey,
  });
  return c.json(record, 201);
});
app.patch("/api/files/:id", async (c) => {
  const { recipeId } = await c.req.json<{ recipeId: string | null }>();
  return c.json(await data.linkFile(c.var.userId, c.req.param("id"), recipeId));
});
app.get("/api/files/:id/content", async (c) => {
  const file = await data.getFile(c.var.userId, c.req.param("id"));
  return c.redirect(await files.url(file.storageKey, { expiresIn: 300 }), 302);
});
app.delete("/api/files/:id", async (c) => {
  const file = await data.getFile(c.var.userId, c.req.param("id"));
  await files.delete(file.storageKey);
  await data.deleteFileRow(c.var.userId, file.id);
  return c.body(null, 204);
});

export default app;
