import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "./api.ts";
import { uploadFile } from "./upload.ts";
import { useWorkspace } from "./workspace.tsx";
import {
  ATTACHMENTS_MARKER,
  TOOL_LABELS,
  type ChatEvent,
  type ChatMessage,
  type ChatRow,
  type ContentBlock,
  type FileRecord,
  type ToolDetails,
} from "../shared/types.ts";

type ToolResultMessage = Extract<ChatMessage, { role: "toolResult" }>;
type DraftBlock = { type: "text"; text: string } | { type: "thinking"; thinking: string };
type LiveTool = { status: "running" | "done" | "error" };

interface Attachment {
  localId: string;
  name: string;
  status: "uploading" | "ready" | "error";
  record?: FileRecord;
  error?: string;
}

const SUGGESTIONS = [
  "Plan dinners for this week using what's in my pantry",
  "Save my grandmother's lasagna recipe — I'll paste it",
  "Make a grocery list for everything I've planned",
  "I just bought eggs, milk, and spinach",
];

export function Chat() {
  const { changed } = useWorkspace();
  const [rows, setRows] = useState<ChatRow[] | null>(null);
  const [draft, setDraft] = useState<DraftBlock[] | null>(null);
  const [liveTools, setLiveTools] = useState<Record<string, LiveTool>>({});
  const [sending, setSending] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    api.get<ChatRow[]>("/api/chat").then(setRows);
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [rows, draft, liveTools]);

  const toolResults = new Map<string, ToolResultMessage>();
  for (const row of rows ?? []) {
    if (row.message.role === "toolResult") toolResults.set(row.message.toolCallId, row.message);
  }

  function handle(event: ChatEvent) {
    switch (event.type) {
      case "row":
        setRows((r) => [...(r ?? []), event.row]);
        if (event.row.message.role === "assistant") setDraft(null);
        break;
      case "assistant_start":
        setDraft([]);
        break;
      case "delta":
        setDraft((blocks) => {
          const next = [...(blocks ?? [])];
          const current = next[event.contentIndex];
          next[event.contentIndex] =
            event.kind === "text"
              ? { type: "text", text: (current?.type === "text" ? current.text : "") + event.delta }
              : { type: "thinking", thinking: (current?.type === "thinking" ? current.thinking : "") + event.delta };
          return next;
        });
        break;
      case "tool_start":
        setLiveTools((t) => ({ ...t, [event.toolCallId]: { status: "running" } }));
        break;
      case "tool_end":
        setLiveTools((t) => ({ ...t, [event.toolCallId]: { status: event.isError ? "error" : "done" } }));
        if (event.details) changed(event.details.changed);
        break;
      case "error":
        setStreamError(event.message);
        break;
      case "done":
        break;
    }
  }

  async function send(messageText: string) {
    const ready = attachments.filter((a) => a.status === "ready");
    if (sending || attachments.some((a) => a.status === "uploading")) return;
    if (!messageText.trim() && ready.length === 0) return;

    setSending(true);
    setStreamError(null);
    setText("");
    setAttachments([]);
    stickToBottom.current = true;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: messageText,
          fileIds: ready.map((a) => a.record!.id),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!response.ok || !response.body) throw new Error(`Chat failed: ${response.status} ${await response.text()}`);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (data) handle(JSON.parse(data) as ChatEvent);
        }
      }
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
      setDraft(null);
    }
  }

  async function attach(fileList: FileList) {
    for (const file of Array.from(fileList)) {
      const localId = crypto.randomUUID();
      setAttachments((a) => [...a, { localId, name: file.name, status: "uploading" }]);
      try {
        const record = await uploadFile(file);
        setAttachments((a) => a.map((x) => (x.localId === localId ? { ...x, status: "ready", record } : x)));
        changed(["files"]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAttachments((a) => a.map((x) => (x.localId === localId ? { ...x, status: "error", error: message } : x)));
      }
    }
  }

  return (
    <div className="chat">
      <div
        className="transcript"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="transcript-inner">
          {rows?.length === 0 && !sending && (
            <div className="empty-chat">
              <h2>What are we cooking?</h2>
              <p>Ask me to save recipes, plan the week, keep the pantry honest, or build the shopping list.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {rows?.map((row) => {
            const m = row.message;
            if (m.role === "user") return <UserMessage key={row.id} content={m.content} />;
            if (m.role === "assistant")
              return (
                <AssistantMessage
                  key={row.id}
                  blocks={m.content}
                  errorMessage={m.stopReason === "error" ? (m.errorMessage ?? "The model returned an error") : null}
                  toolResults={toolResults}
                  liveTools={liveTools}
                  streaming={false}
                />
              );
            return null;
          })}
          {draft && (
            <AssistantMessage
              blocks={draft.filter(Boolean)}
              errorMessage={null}
              toolResults={toolResults}
              liveTools={liveTools}
              streaming
            />
          )}
          {sending && !draft && <div className="working">Working…</div>}
          {streamError && <div className="stream-error">{streamError}</div>}
        </div>
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {attachments.length > 0 && (
          <div className="attachments">
            {attachments.map((a) => (
              <span key={a.localId} className={`attachment ${a.status}`} title={a.error}>
                {a.status === "uploading" ? "↑ " : a.status === "error" ? "⚠ " : "📎 "}
                {a.name}
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => setAttachments((list) => list.filter((x) => x.localId !== a.localId))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="composer-row">
          <label className="btn ghost attach" aria-label="Attach recipe files">
            +
            <input
              type="file"
              multiple
              accept="image/*,text/*,.md"
              onChange={(e) => {
                if (e.target.files) attach(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <textarea
            value={text}
            rows={1}
            placeholder="Ask about recipes, plans, groceries, pantry…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              const touch = window.matchMedia("(pointer: coarse)").matches;
              if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(text);
              }
            }}
          />
          <button className="btn primary send" disabled={sending}>
            {sending ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function UserMessage({ content }: { content: string | ContentBlock[] }) {
  const raw = typeof content === "string" ? content : content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const [typed, attachmentList] = raw.split(ATTACHMENTS_MARKER);
  const files = (attachmentList ?? "")
    .split("\n")
    .map((line) => /^- (.*) \(file_id: ([\w-]+), .*\)$/.exec(line))
    .filter((match) => match !== null);
  const { openRef } = useWorkspace();
  return (
    <div className="msg user">
      <div className="bubble">
        {typed && <p>{typed}</p>}
        {files.length > 0 && (
          <div className="refs">
            {files.map(([, name, id]) => (
              <button key={id} className="ref" onClick={() => openRef({ kind: "file", id, label: name })}>
                📎 {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({
  blocks,
  errorMessage,
  toolResults,
  liveTools,
  streaming,
}: {
  blocks: (ContentBlock | DraftBlock)[];
  errorMessage: string | null;
  toolResults: Map<string, ToolResultMessage>;
  liveTools: Record<string, LiveTool>;
  streaming: boolean;
}) {
  return (
    <div className="msg assistant">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "thinking":
            return block.thinking.trim() ? (
              <Thinking key={i} text={block.thinking} live={streaming && i === blocks.length - 1} />
            ) : null;
          case "text":
            return (
              <div key={i} className="prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
              </div>
            );
          case "toolCall":
            return (
              <ToolCall
                key={block.id}
                name={block.name}
                args={block.arguments}
                result={toolResults.get(block.id)}
                live={liveTools[block.id]}
              />
            );
          default:
            return null;
        }
      })}
      {errorMessage && <div className="stream-error">{errorMessage}</div>}
    </div>
  );
}

function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(live);
  useEffect(() => setOpen(live), [live]);
  return (
    <details className={`thinking ${live ? "live" : ""}`} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{live ? "Thinking…" : "Thought process"}</summary>
      <div className="prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </details>
  );
}

function summarizeArgs(args: Record<string, unknown>): string {
  for (const key of ["title", "name", "query"]) {
    if (typeof args[key] === "string" && args[key]) return String(args[key]);
  }
  for (const key of ["entries", "items", "updates", "entry_ids", "item_ids"]) {
    if (Array.isArray(args[key])) return `${args[key].length} item${args[key].length === 1 ? "" : "s"}`;
  }
  if (args.from && args.to) return `${args.from} → ${args.to}`;
  return "";
}

function ToolCall({
  name,
  args,
  result,
  live,
}: {
  name: string;
  args: Record<string, unknown>;
  result?: ToolResultMessage;
  live?: LiveTool;
}) {
  const { openRef } = useWorkspace();
  const status = result ? (result.isError ? "error" : "done") : (live?.status ?? "pending");
  const details = result?.details as ToolDetails | undefined;
  const summary = summarizeArgs(args);
  const resultText = result?.content.map((b) => (b.type === "text" ? b.text : `[${b.type}]`)).join("\n");
  return (
    <div className={`tool ${status}`}>
      <details>
        <summary>
          <span className="tool-status" aria-label={status} />
          <span className="tool-name">{TOOL_LABELS[name as keyof typeof TOOL_LABELS] ?? name}</span>
          {summary && <span className="tool-arg">{summary}</span>}
        </summary>
        <div className="tool-body">
          <div className="tool-section">Input</div>
          <pre>{JSON.stringify(args, null, 2)}</pre>
          {resultText !== undefined && (
            <>
              <div className="tool-section">{result!.isError ? "Error" : "Result"}</div>
              <pre>{prettyJson(resultText)}</pre>
            </>
          )}
        </div>
      </details>
      {details && details.refs.length > 0 && (
        <div className="refs">
          {details.refs.map((ref) => (
            <button key={`${ref.kind}:${ref.id}`} className={`ref ${ref.kind}`} onClick={() => openRef(ref)}>
              {ref.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

