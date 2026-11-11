import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_HOME = path.join(__dirname, "agent-home");
const RECEIPTS_DIR = path.join(AGENT_HOME, "memory", "receipts");
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

let session: AgentSession | null = null;

async function getSession(): Promise<AgentSession> {
  if (session) return session;

  const authStorage = AuthStorage.create(path.join(AGENT_HOME, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage);

  const { session: s } = await createAgentSession({
    cwd: AGENT_HOME,
    agentDir: AGENT_HOME,
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(),
  });

  session = s;
  return session;
}

// Serialize prompts so concurrent requests don't interleave
let promptQueue: Promise<void> = Promise.resolve();

type FilePayload = { name: string; type: string; data: string };

app.post("/api/chat", (req, res) => {
  const { message, file } = req.body as { message?: string; file?: FilePayload };

  const text = message?.trim() ?? "";
  if (!text && !file) {
    res.status(400).json({ error: "Message or file required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  promptQueue = promptQueue.then(async () => {
    let unsubscribe: (() => void) | null = null;
    try {
      const s = await getSession();

      unsubscribe = s.subscribe((event) => {
        if (
          event.type === "message_update" &&
          event.assistantMessageEvent.type === "text_delta"
        ) {
          send({ type: "text", delta: event.assistantMessageEvent.delta });
        }
      });

      let savedReceiptPath: string | null = null;
      if (file) {
        const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `receipt-${timestamp}.${ext}`;
        const filepath = path.join(RECEIPTS_DIR, filename);
        fs.writeFileSync(filepath, Buffer.from(file.data, "base64"));
        savedReceiptPath = path.relative(AGENT_HOME, filepath);
      }

      const receiptNote = savedReceiptPath
        ? `\n\n[Receipt image saved to memory/${savedReceiptPath.replace(/^memory\//, "")}]`
        : "";
      const promptText =
        (text || (file ? "Please analyze this receipt and log the expense." : "")) +
        receiptNote;

      if (file) {
        await s.prompt(promptText, {
          images: [{ type: "image" as const, data: file.data, mimeType: file.type }],
        });
      } else {
        await s.prompt(promptText);
      }
    } catch (err) {
      send({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      unsubscribe?.();
      send({ type: "done" });
      res.end();
    }
  });
});

app.post("/api/session/reset", (_req, res) => {
  session?.dispose();
  session = null;
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Bookkeeping agent → http://localhost:${PORT}`);
});
