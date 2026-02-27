import Phaser from "phaser";
import { ProChessScene, gameHeight, gameWidth } from "./game/ProChessScene";

export function startGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    width: gameWidth,
    height: gameHeight,
    scene: [ProChessScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    backgroundColor: "#11141c"
  });
}
