import { useStore } from "../store.js";
import { getShared } from "../ws/client.js";
import { useMemo, useState } from "react";

/**
 * Live list of every issue, with the monsters that haunt them. Clicking a
 * quest sends `engage` over the WS — but only when the player is within
 * melee range (the server enforces this authoritatively; we mirror the
 * check client-side so the panel reflects range and clicking a far quest
 * shows a hint instead of a server error).
 */
const ws = getShared();
const ENGAGE_RANGE = 2;

export const QuestLog = () => {
  const monsters = useStore((s) => s.monstersList)();
  const player = useStore((s) => s.player);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const sessions = useStore((s) => s.sessions);
  const [filter, setFilter] = useState<"" | "bug" | "feature" | "docs" | "chore" | "epic">("");

  const filtered = useMemo(
    () => (filter ? monsters.filter((m) => m.kind === filter) : monsters),
    [monsters, filter],
  );

  const activeMonsterId = currentSessionId ? sessions.get(currentSessionId)?.monsterId : undefined;

  const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
    Math.max(Math.abs(ax - bx), Math.abs(ay - by));

  const handleClick = (issueId: string) => {
    if (!player) return;
    const m = monsters.find((mm) => mm.issueId === issueId);
    if (!m) return;
    if (m.defeated) return;
    const d = chebyshev(player.x, player.y, m.x, m.y);
    if (d > ENGAGE_RANGE) return; // ignore — server would also reject
    ws.send({ kind: "engage", issueId });
  };

  return (
    <div className="hud hud-panel hud-quests">
      <h3>Quest Log</h3>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {(["", "bug", "feature", "docs", "chore", "epic"] as const).map((k) => (
          <button
            key={k || "all"}
            onClick={() => setFilter(k)}
            style={{
              background: filter === k ? "#d4a44a" : "#1a0e06",
              color: filter === k ? "#1a0e06" : "#d4a44a",
              border: "1px solid #6a4a1a",
              padding: "2px 6px",
              font: "inherit",
              fontSize: 9,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {k || "all"}
          </button>
        ))}
      </div>
      {filtered.length === 0 && <div style={{ opacity: 0.5, fontStyle: "italic" }}>No quests.</div>}
      {filtered.map((m) => {
        const active = activeMonsterId === m.id;
        const distance = player ? chebyshev(player.x, player.y, m.x, m.y) : Infinity;
        const inRange = distance <= ENGAGE_RANGE;
        return (
          <div
            key={m.id}
            className={`quest ${active ? "active" : ""} ${m.defeated ? "defeated" : ""} ${
              inRange ? "in-range" : "out-of-range"
            }`}
            onClick={() => handleClick(m.issueId)}
            title={inRange ? "Click to engage" : `Walk closer (${distance} tiles away)`}
          >
            <span className="kind" style={{ background: m.palette.accent }}>
              {m.kind}
            </span>
            {m.name}
            <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>
              HP {m.hp}/{m.maxHp} · {m.defeated ? "defeated" : inRange ? "in range" : `${distance} tiles`}
            </div>
          </div>
        );
      })}
    </div>
  );
};
