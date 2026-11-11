import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";
import { neon } from "@neon/ai-sdk-provider";
import { streamText, type ModelMessage } from "ai";
import { requireUser } from "../lib/auth.ts";

const MODEL = "glm-5-3-flash";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

const app = new Hono<{ Variables: { userId: string } }>();
app.use("*", cors({ origin: "http://localhost:3000", exposeHeaders: ["X-Chat-Id"] }));
app.use("*", requireUser);

app.get("/chats", async (c) => {
  const { rows } = await pool.query(
    "select id, title, updated_at from chats where user_id = $1 order by updated_at desc",
    [c.get("userId")],
  );
  return c.json(rows);
});

app.get("/chats/:id", async (c) => {
  const id = c.req.param("id");
  const chat = await pool.query("select 1 from chats where id = $1 and user_id = $2", [
    id,
    c.get("userId"),
  ]);
  if (!chat.rowCount) return c.json({ error: "chat not found" }, 404);
  const { rows } = await pool.query(
    "select role, content from messages where chat_id = $1 order by id",
    [id],
  );
  return c.json(rows);
});

app.delete("/chats/:id", async (c) => {
  const { rowCount } = await pool.query("delete from chats where id = $1 and user_id = $2", [
    c.req.param("id"),
    c.get("userId"),
  ]);
  return rowCount ? c.body(null, 204) : c.json({ error: "chat not found" }, 404);
});

app.post("/", async (c) => {
  const userId = c.get("userId");
  const { chatId, message } = await c.req.json<{ chatId?: string; message: string }>();
  if (typeof message !== "string" || !message.trim()) {
    return c.json({ error: "message is required" }, 400);
  }

  let history: ModelMessage[] = [];
  if (chatId) {
    const chat = await pool.query("select 1 from chats where id = $1 and user_id = $2", [
      chatId,
      userId,
    ]);
    if (!chat.rowCount) return c.json({ error: "chat not found" }, 404);
    const { rows } = await pool.query(
      "select role, content from messages where chat_id = $1 order by id",
      [chatId],
    );
    history = rows;
  }
  const id = chatId ?? randomUUID();

  const { rows: noteRows } = await pool.query(
    "select title, body, created_at from notes where user_id = $1 order by created_at",
    [userId],
  );
  const notes = noteRows
    .map((n) => `## ${n.title} (${n.created_at.toISOString().slice(0, 10)})\n${n.body}`)
    .join("\n\n");

  const result = streamText({
    model: neon(MODEL),
    system:
      "You answer questions about the user's personal notes. Use only the notes below. " +
      "If the answer is not in them, say so.\n\n# Notes\n\n" +
      (notes || "(no notes yet)"),
    messages: [...history, { role: "user", content: message }],
    onError: ({ error }) => {
      throw error;
    },
    // Both messages are saved together once the answer is complete, so a failed
    // or aborted response leaves no dangling question in the history.
    onFinish: async ({ text }) => {
      if (!text) throw new Error("The model returned an empty response.");
      const db = await pool.connect();
      try {
        await db.query("begin");
        await db.query(
          `insert into chats (id, title, user_id) values ($1, $2, $3)
           on conflict (id) do update set updated_at = now()`,
          [id, message.trim().slice(0, 60), userId],
        );
        await db.query(
          "insert into messages (chat_id, role, content) values ($1, 'user', $2)",
          [id, message],
        );
        await db.query(
          "insert into messages (chat_id, role, content) values ($1, 'assistant', $2)",
          [id, text],
        );
        await db.query("commit");
      } catch (err) {
        await db.query("rollback");
        throw err;
      } finally {
        db.release();
      }
    },
  });
  return result.toTextStreamResponse({ headers: { "X-Chat-Id": id } });
});

export default app;
