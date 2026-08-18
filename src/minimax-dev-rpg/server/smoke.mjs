// Smoke test: connect to /ws, receive `hello`, send `engage`, observe
// the full combat sequence, and print a transcript. Exits when the session
// ends (or after 30s).
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3001/ws");
let sessionId = null;
const start = Date.now();

ws.on("open", () => {
  console.log(">> connected");
});

ws.on("message", (raw) => {
  const e = JSON.parse(raw.toString());
  if (e.kind === "hello") {
    console.log(`>> hello: ${e.issues.length} issues, ${e.monsters.length} monsters`);
    // Engage the first monster.
    ws.send(JSON.stringify({ kind: "engage", issueId: e.monsters[0].issueId }));
    return;
  }
  if (e.kind === "session.started") {
    sessionId = e.session.id;
    console.log(`>> session.started: ${sessionId.slice(0, 8)} (${e.session.monsterId.slice(0, 8)})`);
    return;
  }
  if (e.kind === "session.event") {
    const ev = e.event;
    if (ev.kind === "message") console.log(`   💬 ${ev.text}`);
    else if (ev.kind === "tool.start") console.log(`   🔧 ${ev.tool}(${JSON.stringify(ev.args).slice(0, 60)})`);
    else if (ev.kind === "tool.end") console.log(`   ${ev.result === "ok" ? "✓" : "✗"} ${ev.tool}`);
    else if (ev.kind === "tests.run") console.log(`   📊 tests: ${ev.passed} pass, ${ev.failed} fail`);
    else if (ev.kind === "file.edited") console.log(`   ✎ ${ev.path} (+${ev.linesAdded} -${ev.linesRemoved})`);
    else if (ev.kind === "pr.opened") console.log(`   🔗 PR: ${ev.title}`);
    else if (ev.kind === "pr.merged") console.log(`   ✅ PR merged`);
    else if (ev.kind === "issue.closed") console.log(`   🏁 issue closed (${ev.reason})`);
    return;
  }
  if (e.kind === "combat.tick") {
    const sym = e.source === "player" ? "⚔️" : e.source === "monster" ? "💢" : "✨";
    console.log(`   ${sym} ${e.action} ${e.target} (${e.magnitude} ${e.fx})`);
    return;
  }
  if (e.kind === "session.ended") {
    console.log(`>> session.ended: ${e.outcome} — ${e.summary}`);
    console.log(`>> total ${Date.now() - start}ms`);
    process.exit(0);
  }
  if (e.kind === "monster.despawned") {
    console.log(`>> monster.despawned: ${e.reason}`);
    return;
  }
  if (e.kind === "player.state") {
    console.log(`>> player: HP=${e.player.hp}/${e.player.maxHp} XP=${e.player.xp}`);
    return;
  }
  if (e.kind === "error") {
    console.log(`!! error: ${e.message}`);
    return;
  }
  console.log(`? ${e.kind}`);
});

ws.on("error", (e) => console.error("!! ws error", e.message));

setTimeout(() => {
  console.log("!! timeout");
  process.exit(1);
}, 30000);
