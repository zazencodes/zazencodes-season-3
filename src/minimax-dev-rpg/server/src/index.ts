import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { MockIssueProvider } from "./github/mock.js";
import { GhCliIssueProvider } from "./github/gh.js";
import { MockAgent } from "./agent/mock.js";
import { PiAgent } from "./agent/pi.js";
import { snapshot as logSnapshot, subscribe as logSubscribe, type LogEntry } from "./agent/log-store.js";
import { World } from "./state/world.js";
import { WsHub } from "./ws/hub.js";
import type { IssueProvider } from "./github/types.js";
import type { AgentAdapter } from "./agent/types.js";

const PORT = Number(process.env.PORT ?? 3001);

/**
 * Selection is opt-in via env vars so the existing v0.1 dev loop keeps
 * working unchanged:
 *   ISSUE_PROVIDER=mock|gh   (default: mock)
 *   AGENT_ADAPTER=mock|pi    (default: mock)
 *   GITHUB_REPO=owner/name   (default: zazencodes/habit-cli)
 *   AGENT_WORKDIR=/abs/path  (default: $HOME/pro/habit-cli)
 */
function makeIssueProvider(): IssueProvider {
  switch (process.env.ISSUE_PROVIDER ?? "mock") {
    case "gh":
      return new GhCliIssueProvider({
        repo: process.env.GITHUB_REPO ?? "zazencodes/habit-cli",
      });
    case "mock":
      return new MockIssueProvider();
    default:
      throw new Error(`Unknown ISSUE_PROVIDER: ${process.env.ISSUE_PROVIDER}`);
  }
}

function makeAgentAdapter(): AgentAdapter {
  switch (process.env.AGENT_ADAPTER ?? "mock") {
    case "pi":
      return new PiAgent({
        workdir: process.env.AGENT_WORKDIR ?? `${process.env.HOME}/pro/habit-cli`,
        timeoutMs: Number(process.env.AGENT_TIMEOUT_MS ?? 10 * 60 * 1000),
      });
    case "mock":
      return new MockAgent();
    default:
      throw new Error(`Unknown AGENT_ADAPTER: ${process.env.AGENT_ADAPTER}`);
  }
}

/* ────────────────────────  /agent-log viewer  ──────────────────────── */

/**
 * Persistent right-pane log viewer. Two routes:
 *   GET /agent-log         → HTML page that subscribes via EventSource
 *   GET /agent-log/stream  → text/event-stream; sends the current
 *                            ring-buffer snapshot on connect, then
 *                            streams new entries as they arrive
 *
 * Open the URL on server start so the user gets a permanent window
 * they can position on the right side of their screen. No kitty / no
 * terminal spawn — just a browser tab.
 */
function serveAgentLogPage(res: import("node:http").ServerResponse): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(AGENT_LOG_HTML);
}

function serveAgentLogStream(res: import("node:http").ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    "connection": "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write("retry: 2000\n\n");

  // 1) Replay the current buffer so reconnecting viewers see history.
  for (const e of logSnapshot()) {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  }

  // 2) Live-stream new entries.
  const unsub = logSubscribe((entry: LogEntry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  // 3) Heartbeat so proxies don't kill the idle connection.
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);

  const close = () => {
    clearInterval(heartbeat);
    unsub();
  };
  res.on("close", close);
  res.on("error", close);
}

const AGENT_LOG_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Pi Agent Log</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background: #0d0a08;
    color: #e8d8b8;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 13px;
    line-height: 1.55;
  }
  header {
    position: sticky; top: 0; z-index: 5;
    background: #1a0e06;
    border-bottom: 1px solid #3a2a1a;
    padding: 8px 12px;
    display: flex; align-items: center; gap: 12px;
    flex-wrap: wrap;
  }
  header h1 { margin: 0; font-size: 13px; font-weight: 600; color: #f1d4a3; }
  header .dot { width: 8px; height: 8px; border-radius: 50%; background: #d44a3a; }
  header .dot.live { background: #6ad44a; box-shadow: 0 0 6px #6ad44a; }
  header .stat { color: #c8a878; font-size: 11px; }
  header .filters { margin-left: auto; display: flex; gap: 4px; flex-wrap: wrap; }
  header .filters button {
    background: #2a1a0a; color: #f1d4a3; border: 1px solid #4a2a1a;
    padding: 3px 8px; border-radius: 3px; font: inherit; font-size: 11px; cursor: pointer;
  }
  header .filters button.active { background: #6a4a1a; border-color: #d4c43a; }
  header .filters button:hover { border-color: #d4c43a; }

  #log {
    padding: 12px 16px 80px;
    overflow-y: auto;
    height: calc(100% - 42px);
  }

  /* ── Card row: header strip + indented body ── */
  .card {
    border-left: 3px solid transparent;
    margin: 0 0 10px 0;
    padding: 6px 8px 8px 10px;
    border-radius: 0 4px 4px 0;
    background: rgba(255,255,255,0.015);
  }
  .card.session  { border-left-color: #d4c43a; }
  .card.thinking { border-left-color: #8a8ad4; background: rgba(138,138,212,0.06); }
  .card.text     { border-left-color: #6aa8d4; background: rgba(106,168,212,0.04); }
  .card.tool     { border-left-color: #d4a04a; background: rgba(212,160,74,0.05); }
  .card.test     { border-left-color: #6ad44a; background: rgba(106,212,74,0.06); }
  .card.file     { border-left-color: #d44a3a; background: rgba(212,74,58,0.05); }
  .card.pr       { border-left-color: #d44ad4; background: rgba(212,74,212,0.06); }
  .card.message  { border-left-color: #f1d4a3; }
  .card.error    { border-left-color: #ff6a6a; background: rgba(255,106,106,0.10); }
  .card.system   { border-left-color: #4a3a2a; background: transparent; }

  .card-head {
    display: flex; align-items: baseline; gap: 10px;
    font-size: 11px;
    color: #8a7a5a;
    margin-bottom: 4px;
  }
  .card-head .sid { font-family: ui-monospace, monospace; min-width: 50px; }
  .card-head .ts  { font-variant-numeric: tabular-nums; min-width: 80px; }
  .card-head .lvl {
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 1px 6px; border-radius: 3px; font-size: 10px;
    background: rgba(0,0,0,0.25);
  }
  .lvl.session  { color: #d4c43a; }
  .lvl.thinking { color: #b8b8f0; }
  .lvl.text     { color: #a8d4f0; }
  .lvl.tool     { color: #f0c878; }
  .lvl.test     { color: #88f088; }
  .lvl.file     { color: #f08878; }
  .lvl.pr       { color: #f088f0; }
  .lvl.message  { color: #f1d4a3; }
  .lvl.error    { color: #ff8888; }
  .lvl.system   { color: #8a8a8a; }

  .card-body {
    white-space: pre-wrap;
    word-wrap: break-word;
    color: #e8d8b8;
  }
  .card.thinking .card-body {
    color: #c8c8f0;
    font-style: italic;
  }
  .card.text .card-body {
    color: #d8e8f8;
  }
  .card.error .card-body {
    color: #ffaaaa;
  }
  .card.tool .card-body,
  .card.test .card-body,
  .card.file .card-body,
  .card.pr .card-body {
    color: #f0e0c0;
  }
  .card.session .card-body {
    color: #c8a878;
    font-size: 12px;
  }
  .card.system .card-body {
    color: #8a8a8a;
    font-size: 11px;
  }

  footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #1a0e06; border-top: 1px solid #3a2a1a;
    padding: 6px 12px; color: #8a7a5a; font-size: 11px;
    display: flex; gap: 12px; align-items: center;
  }
  footer input[type="text"] {
    background: #2a1a0a; color: #f1d4a3; border: 1px solid #4a2a1a;
    padding: 3px 6px; border-radius: 3px; font: inherit; width: 200px;
  }
  footer label { display: flex; gap: 4px; align-items: center; }
  footer button {
    background: #2a1a0a; color: #f1d4a3; border: 1px solid #4a2a1a;
    padding: 3px 8px; border-radius: 3px; font: inherit; cursor: pointer;
  }
  footer button:hover { border-color: #d4c43a; }
  .hidden { display: none !important; }
</style>
</head>
<body>
<header>
  <span class="dot" id="dot"></span>
  <h1>Pi Agent Log</h1>
  <span class="stat" id="stat">connecting…</span>
  <div class="filters" id="filters">
    <button data-level="all" class="active">all</button>
    <button data-level="session">session</button>
    <button data-level="thinking">thinking</button>
    <button data-level="text">text</button>
    <button data-level="tool">tools</button>
    <button data-level="file">files</button>
    <button data-level="test">tests</button>
    <button data-level="pr">pr</button>
    <button data-level="error">errors</button>
    <button data-level="system">system</button>
  </div>
</header>
<div id="log"></div>
<footer>
  <label><input type="checkbox" id="autoscroll" checked> auto-scroll</label>
  <input type="text" id="search" placeholder="filter (substring)">
  <span class="stat" id="count"></span>
  <button id="clear">clear view</button>
</footer>
<script>
  const logEl = document.getElementById("log");
  const dot = document.getElementById("dot");
  const stat = document.getElementById("stat");
  const count = document.getElementById("count");
  const filtersEl = document.getElementById("filters");
  const searchEl = document.getElementById("search");
  const autoscrollEl = document.getElementById("autoscroll");
  const clearEl = document.getElementById("clear");

  let activeLevel = "all";
  let searchTerm = "";
  let total = 0;

  function fmt(ms) {
    const d = new Date(ms);
    const p = (n, w=2) => String(n).padStart(w, "0");
    return p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds())+"."+p(d.getMilliseconds(),3);
  }

  function append(e) {
    total++;
    const card = document.createElement("div");
    card.className = "card " + e.level;
    card.dataset.level = e.level;
    card.dataset.text = e.text;
    card.dataset.sid = e.sessionId || "";

    const head = document.createElement("div");
    head.className = "card-head";
    const sidShort = e.sessionId ? e.sessionId.slice(0, 6) : "—";
    head.innerHTML =
      '<span class="sid">'+sidShort+'</span>' +
      '<span class="ts">'+fmt(e.ts)+'</span>' +
      '<span class="lvl '+e.level+'">'+e.level+'</span>';
    card.appendChild(head);

    const body = document.createElement("div");
    body.className = "card-body";
    body.textContent = e.text;
    card.appendChild(body);

    applyFilter(card);
    logEl.appendChild(card);
    count.textContent = total + " entries";
    if (autoscrollEl.checked) logEl.scrollTop = logEl.scrollHeight;
  }

  function applyFilter(card) {
    const lvl = card.dataset.level;
    const txt = card.dataset.text;
    const lvlOk = activeLevel === "all" || lvl === activeLevel;
    const txtOk = !searchTerm || txt.toLowerCase().includes(searchTerm);
    card.classList.toggle("hidden", !(lvlOk && txtOk));
  }

  function applyAllFilters() {
    for (const card of logEl.children) applyFilter(card);
  }

  filtersEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    for (const b of filtersEl.children) b.classList.remove("active");
    btn.classList.add("active");
    activeLevel = btn.dataset.level;
    applyAllFilters();
  });

  searchEl.addEventListener("input", () => {
    searchTerm = searchEl.value.trim().toLowerCase();
    applyAllFilters();
  });

  clearEl.addEventListener("click", () => {
    logEl.innerHTML = "";
    total = 0;
    count.textContent = "0 entries";
  });

  const es = new EventSource("/agent-log/stream");
  es.onopen = () => { dot.classList.add("live"); stat.textContent = "live"; };
  es.onerror = () => { dot.classList.remove("live"); stat.textContent = "disconnected — retrying"; };
  es.onmessage = (ev) => {
    try { append(JSON.parse(ev.data)); } catch {}
  };
</script>
</body>
</html>`;

/* ───────────────────────────────  main  ─────────────────────────────── */

async function main() {
  const world = new World();
  const provider = makeIssueProvider();
  const providerName = provider.name;
  const issues = await provider.listIssues();
  world.hydrate(issues);

  const agent = makeAgentAdapter();
  const agentName = agent.name;

  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          provider: providerName,
          agent: agentName,
          monsters: world.getMonsters().length,
        }),
      );
      return;
    }
    if (req.url === "/reset") {
      world.resetDemoData();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          message: "Demo data reset successfully",
          monsters: world.getMonsters().length,
        }),
      );
      return;
    }
    if (req.url === "/agent-log") {
      serveAgentLogPage(res);
      return;
    }
    if (req.url === "/agent-log/stream") {
      serveAgentLogStream(res);
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(
      `minimax-dev-rpg server. provider=${providerName} agent=${agentName}.\n` +
      `  WebSocket: ws://localhost:${PORT}/ws\n` +
      `  Agent log: http://localhost:${PORT}/agent-log\n`,
    );
  });

  // The hub is also the SessionEventSink.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hub = new WsHub(server, world, agent);

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[server] listening on http://localhost:${PORT} (ws: /ws) provider=${providerName} agent=${agentName}`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[server] loaded ${world.getMonsters().length} monsters from ${issues.length} issues`,
    );
    // eslint-disable-next-line no-console
    console.log(`[server] agent log viewer: http://localhost:${PORT}/agent-log`);
  });

  // Open the log viewer in the user's default browser. The window
  // appears at the default position; the user drags it to the right
  // side of their screen (or uses macOS Tile Window). It stays open
  // permanently and live-streams all agent activity.
  if (process.env.AGENT_LOG_AUTOOPEN !== "0") {
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    try {
      spawn(cmd, [`http://localhost:${PORT}/agent-log`], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } catch {
      /* opening the browser is best-effort */
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[server] fatal:", err);
  process.exit(1);
});
