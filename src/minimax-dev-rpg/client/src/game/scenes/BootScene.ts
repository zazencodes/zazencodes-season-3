import Phaser from "phaser";
import { buildProceduralAssets } from "../ProceduralAssets.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create() {
    buildProceduralAssets(this);
    this.scene.start("WorldScene");
  }
}
