import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { WorldScene } from "./scenes/WorldScene.js";
import { BattleScene } from "./scenes/BattleScene.js";

const TILE = 32;

export const startGame = (container: HTMLElement) => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: "#0d0a08",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: w,
      height: h,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: false,
      pixelArt: true,
    },
    scene: [BootScene, WorldScene, BattleScene],
    fps: { target: 60, forceSetTimeOut: false },
  });
};

export { TILE };
