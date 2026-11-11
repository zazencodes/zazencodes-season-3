import express, { type Request, type Response } from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_HOME = path.join(__dirname, "agent-home");
const IMAGES_DIR = path.join(AGENT_HOME, "memory", "images");
const SESSION_FILE = path.join(AGENT_HOME, ".current-session-id");

const PORT = Number(process.env.PORT ?? 3000);
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "application/pdf",
]);

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdir(IMAGES_DIR, { recursive: true }).then(() => cb(null, IMAGES_DIR), cb);
    },
    filename: (_req, file, cb) => {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = path.extname(file.originalname) || "";
      const base = slugify(path.basename(file.originalname, ext));
      cb(null, `${ts}-${base}${ext.toLowerCase()}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`unsupported file type: ${file.mimetype}`));
  },
});

const app = express();

const AUTH_USER = process.env.BASIC_AUTH_USER ?? "";
const AUTH_PASS = process.env.BASIC_AUTH_PASS ?? "";
if (AUTH_USER && AUTH_PASS) {
  const expected = "Basic " + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString("base64");
  app.use((req, res, next) => {
    const got = req.headers.authorization ?? "";
    if (got.length === expected.length) {
      let mismatch = 0;
      for (let i = 0; i < expected.length; i++) mismatch |= got.charCodeAt(i) ^ expected.charCodeAt(i);
      if (mismatch === 0) return next();
    }
    res.setHeader("WWW-Authenticate", 'Basic realm="bookkeeping", charset="UTF-8"');
    res.status(401).send("authentication required");
  });
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/memory/images", express.static(IMAGES_DIR, { fallthrough: false, maxAge: 0 }));

async function readSessionId(): Promise<string | null> {
  try {
    const id = (await fs.readFile(SESSION_FILE, "utf8")).trim();
    return id || null;
  } catch {
    return null;
  }
}

async function writeSessionId(id: string): Promise<void> {
  await fs.writeFile(SESSION_FILE, id + "\n", "utf8");
}

app.post("/api/chat", upload.array("attachments", 8), async (req: Request, res: Response) => {
  const rawMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!rawMessage && files.length === 0) {
    res.status(400).json({ error: "message or attachment required" });
    return;
  }

  let message = rawMessage;
  if (files.length > 0) {
    const lines = files.map((f) => `- memory/images/${f.filename} (${f.mimetype}, ${f.size} bytes, original: ${f.originalname})`);
    const note = `\n\n[attached ${files.length === 1 ? "receipt" : "receipts"} — please \`read\` and process per AGENTS.md]:\n${lines.join("\n")}`;
    message = (rawMessage || "Please process the attached receipt(s).") + note;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const sessionId = await readSessionId();
  const args = ["-p", "--mode", "json"];
  if (sessionId) args.push("--session", sessionId);

  const localBin = path.join(__dirname, "node_modules", ".bin");
  const child = spawn("pi", args, {
    cwd: AGENT_HOME,
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: AGENT_HOME,
      PATH: `${localBin}${path.delimiter}${process.env.PATH ?? ""}`,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.write(message);
  child.stdin.end();

  let stdoutBuf = "";
  let stderrBuf = "";
  let capturedSessionId: string | null = sessionId;

  const handleEvent = (evt: any) => {
    switch (evt.type) {
      case "session": {
        if (typeof evt.id === "string" && !capturedSessionId) {
          capturedSessionId = evt.id;
          writeSessionId(evt.id).catch(() => {});
        }
        send("session", { id: evt.id });
        break;
      }
      case "message_update": {
        const ev = evt.assistantMessageEvent;
        if (ev?.type === "text_delta" && typeof ev.delta === "string") {
          send("delta", { text: ev.delta });
        } else if (ev?.type === "tool_start") {
          send("tool_start", { name: ev.name, input: ev.input });
        } else if (ev?.type === "tool_end") {
          send("tool_end", { name: ev.name });
        }
        break;
      }
      case "turn_end": {
        send("turn_end", { usage: evt.message?.usage });
        break;
      }
      case "agent_end": {
        send("done", {});
        break;
      }
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString("utf8");
    let nl: number;
    while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (!line) continue;
      try {
        handleEvent(JSON.parse(line));
      } catch {
        // ignore malformed lines
      }
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString("utf8");
  });

  child.on("error", (err) => {
    send("error", { message: `failed to spawn pi: ${err.message}` });
    res.end();
  });

  child.on("close", (code) => {
    if (stdoutBuf.trim()) {
      try {
        handleEvent(JSON.parse(stdoutBuf.trim()));
      } catch {}
    }
    if (code !== 0) {
      send("error", { message: `pi exited with code ${code}`, stderr: stderrBuf.slice(0, 4000) });
    }
    send("done", {});
    res.end();
  });

  req.on("close", () => {
    if (!child.killed) child.kill("SIGTERM");
  });
});

app.post("/api/reset", async (_req, res) => {
  await fs.rm(SESSION_FILE, { force: true });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`bookkeeping agent listening on http://localhost:${PORT}`);
  console.log(`agent-home: ${AGENT_HOME}`);
});
