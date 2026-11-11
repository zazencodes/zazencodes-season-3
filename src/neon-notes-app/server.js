import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";
import { requireUser } from "./lib/auth.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const files = new Files({ adapter: neon({ bucket: "attachments" }) });
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const app = new Hono();

// Public: the browser needs the Auth URL before it can sign in.
app.get("/api/config", (c) => c.json({ authUrl: process.env.NEON_AUTH_BASE_URL }));

app.use("/api/*", requireUser);

app.get("/api/notes", async (c) => {
  const { rows } = await pool.query(
    `select n.id, n.title, n.body, n.created_at,
      coalesce(json_agg(json_build_object(
        'id', a.id, 'filename', a.filename, 'content_type', a.content_type, 'size', a.size
      ) order by a.created_at) filter (where a.id is not null), '[]') as attachments
    from notes n left join attachments a on a.note_id = n.id
    where n.user_id = $1
    group by n.id
    order by n.created_at desc`,
    [c.get("userId")],
  );
  return c.json(rows);
});

app.post("/api/notes", async (c) => {
  const { title, body = "" } = await c.req.json();
  if (typeof title !== "string" || !title.trim()) {
    return c.json({ error: "title is required" }, 400);
  }
  const { rows } = await pool.query(
    "insert into notes (title, body, user_id) values ($1, $2, $3) returning id, title, body, created_at",
    [title.trim(), body, c.get("userId")],
  );
  return c.json(rows[0], 201);
});

app.delete("/api/notes/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const { rows } = await pool.query(
    `select a.key from attachments a join notes n on n.id = a.note_id
     where a.note_id = $1 and n.user_id = $2`,
    [id, userId],
  );
  for (const { key } of rows) await files.delete(key);
  const { rowCount } = await pool.query("delete from notes where id = $1 and user_id = $2", [
    id,
    userId,
  ]);
  return rowCount ? c.body(null, 204) : c.json({ error: "not found" }, 404);
});

app.post("/api/notes/:id/attachments", async (c) => {
  const noteId = c.req.param("id");
  const { file } = await c.req.parseBody();
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "file exceeds 10 MB" }, 413);
  const { rowCount } = await pool.query("select 1 from notes where id = $1 and user_id = $2", [
    noteId,
    c.get("userId"),
  ]);
  if (!rowCount) return c.json({ error: "note not found" }, 404);

  const key = `${noteId}/${randomUUID()}`;
  const contentType = file.type || "application/octet-stream";
  await files.upload(key, file, { contentType });
  const { rows } = await pool.query(
    `insert into attachments (note_id, key, filename, content_type, size)
     values ($1, $2, $3, $4, $5)
     returning id, filename, content_type, size`,
    [noteId, key, file.name, contentType, file.size],
  );
  return c.json(rows[0], 201);
});

// Returns a presigned URL: <img> and <a> requests cannot carry the Authorization header.
app.get("/api/attachments/:id", async (c) => {
  const { rows } = await pool.query(
    `select a.key from attachments a join notes n on n.id = a.note_id
     where a.id = $1 and n.user_id = $2`,
    [c.req.param("id"), c.get("userId")],
  );
  if (!rows.length) return c.json({ error: "not found" }, 404);
  return c.json({ url: await files.url(rows[0].key, { expiresIn: 3600 }) });
});

app.delete("/api/attachments/:id", async (c) => {
  const id = c.req.param("id");
  const { rows } = await pool.query(
    `select a.key from attachments a join notes n on n.id = a.note_id
     where a.id = $1 and n.user_id = $2`,
    [id, c.get("userId")],
  );
  if (!rows.length) return c.json({ error: "not found" }, 404);
  await files.delete(rows[0].key);
  await pool.query("delete from attachments where id = $1", [id]);
  return c.body(null, 204);
});

// Always revalidate the page and its scripts so a fix is never hidden by a cached copy.
app.use("/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-cache");
});
app.use("/*", serveStatic({ root: "./public" }));

serve({ fetch: app.fetch, port: 3000 }, ({ port }) =>
  console.log(`http://localhost:${port}`),
);
