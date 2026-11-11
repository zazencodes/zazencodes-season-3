import { useStore } from "../store.js";

export const HUD = () => {
  const player = useStore((s) => s.player);
  if (!player) return null;
  const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
  const xpPct = Math.max(0, Math.min(100, (player.xp % 100)));
  return (
    <div className="hud hud-panel hud-player">
      <h3>{player.name}</h3>
      <div className="row">
        <span>HP</span>
        <span>
          {player.hp} / {player.maxHp}
        </span>
      </div>
      <div className="bar hp">
        <div className="fill" style={{ ["--pct" as never]: `${hpPct}%` }} />
      </div>
      <div className="row">
        <span>XP</span>
        <span>Lv {player.level} · {player.xp}</span>
      </div>
      <div className="bar xp">
        <div className="fill" style={{ ["--pct" as never]: `${xpPct}%` }} />
      </div>
      <div className="row" style={{ opacity: 0.6, marginTop: 4 }}>
        <span>Tile</span>
        <span>
          ({player.x}, {player.y})
        </span>
      </div>
    </div>
  );
};
