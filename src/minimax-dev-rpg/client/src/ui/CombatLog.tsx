import { useEffect, useRef } from "react";
import { useStore } from "../store.js";

const fmt = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

export const CombatLog = () => {
  const log = useStore((s) => s.log);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [log.length]);

  return (
    <div ref={ref} className="hud hud-panel hud-log">
      <h3>Combat Log</h3>
      {log.slice(-80).map((e, i) => (
        <div key={i} className={`entry ${e.who}`}>
          <span className="ts">{fmt(e.ts)}</span>
          {e.text}
        </div>
      ))}
    </div>
  );
};
