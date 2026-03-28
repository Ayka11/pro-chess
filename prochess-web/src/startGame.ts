import Phaser from "phaser";
import { ProChessScene, gameHeight, gameWidth } from "./game/ProChessScene";

export function startGame(): Phaser.Game {
  const existing = (window as typeof window & { __prochessGame?: Phaser.Game }).__prochessGame;
  if (existing) {
    existing.destroy(true);
    (window as typeof window & { __prochessGame?: Phaser.Game }).__prochessGame = undefined;
  }

  const app = document.getElementById("app");
  if (app) {
    app.querySelectorAll("canvas, [data-prochess-board-layer='true']").forEach((node) => node.remove());
  }

  return new Phaser.Game({
    type: Phaser.AUTO,
    transparent: true,
    parent: "app",
    width: gameWidth,
    height: gameHeight,
    scene: [ProChessScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    }
  });
}
