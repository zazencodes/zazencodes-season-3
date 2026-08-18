import { useStore } from "../store.js";

export const SessionPanel = () => {
  const session = useStore((s) => s.activeSession());
  const monster = useStore((s) =>
    session ? s.monsters.get(session.monsterId) : undefined,
  );

  if (!session || !monster) {
    return (
      <div className="hud hud-panel hud-session">
        <h3>Current Battle</h3>
        <div className="empty">No active session. Click a quest.</div>
      </div>
    );
  }

  const steps = session.log.length;
  const max = Math.max(steps, 12);

  return (
    <div className="hud hud-panel hud-session">
      <h3>Current Battle</h3>
      <div style={{ fontSize: 11, marginBottom: 6 }}>
        <span
          className="kind"
          style={{ background: monster.palette.accent, color: "#1a0e06", padding: "0 4px", borderRadius: 2 }}
        >
          {monster.kind}
        </span>{" "}
        {monster.name}
      </div>
      <div className="row">
        <span>Status</span>
        <span style={{ color: session.status === "active" ? "#d4c43a" : "#6ad44a" }}>{session.status}</span>
      </div>
      <div className="row">
        <span>Monster HP</span>
        <span>
          {monster.hp} / {monster.maxHp}
        </span>
      </div>
      <div className="bar hp">
        <div
          className="fill"
          style={{ ["--pct" as never]: `${(monster.hp / monster.maxHp) * 100}%` }}
        />
      </div>
      <div className="progress" aria-label="agent steps">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={`dot ${i < steps ? (session.status === "active" ? "active" : "done") : ""}`}
          />
        ))}
      </div>
    </div>
  );
};
