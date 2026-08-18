import { useEffect, useRef } from "react";
import { useStore } from "./store.js";
import { HUD } from "./ui/HUD.js";
import { QuestLog } from "./ui/QuestLog.js";
import { SessionPanel } from "./ui/SessionPanel.js";
import { CombatLog } from "./ui/CombatLog.js";
import { startGame } from "./game/main.js";

export const App = () => {
  const connected = useStore((s) => s.connected);
  const phaserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!phaserRef.current) return;
    const game = startGame(phaserRef.current);
    return () => game.destroy(true);
  }, []);

  return (
    <>
      <div id="phaser-root" ref={phaserRef} />
      <div className={`conn ${connected ? "ok" : "bad"}`}>
        {connected ? "● connected" : "○ offline"}
      </div>
      <HUD />
      <QuestLog />
      <SessionPanel />
      <CombatLog />
    </>
  );
};
