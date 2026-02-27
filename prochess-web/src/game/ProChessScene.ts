import Phaser from "phaser";
import { GameState } from "./logic";
import { loadParityData } from "./parityLoader";
import { ThreeBoard } from "./ThreeBoard";

export class ProChessScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private menuLayer: Phaser.GameObjects.Container | null = null;
  private hudLayer: Phaser.GameObjects.Container | null = null;
  private mobileLayer: Phaser.GameObjects.Container | null = null;
  private pageLayer: Phaser.GameObjects.Container | null = null;
  private pageTitleText: Phaser.GameObjects.Text | null = null;
  private pageContentLayer: Phaser.GameObjects.Container | null = null;
  private settingsState = {
    music: true,
    sfx: true,
    vibration: false,
    hints: true,
    highContrast: false
  };
  private profileState = {
    playerName: "Player One",
    wins: 128,
    losses: 47,
    rating: 1642,
    streak: 6
  };
  private isPlaying = false;
  private isLoadingBattle = false;
  private dragging = false;
  private dragLast = new Phaser.Math.Vector2();
  private state: GameState | null = null;
  private threeBoard = new ThreeBoard();
  private boardContainer: HTMLDivElement | null = null;

  constructor() {
    super("ProChessScene");
  }

  create(): void {
    this.drawBackground();
    this.initThreeLayer();
    this.statusText = this.add
      .text(24, 18, "Home | Ready", {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "22px",
        color: "#f5f8ff"
      })
      .setDepth(200)
      .setScrollFactor(0);

    this.setupCameraControls();
    this.createUiLayers();
    this.createMobileControls();

    this.scale.on("resize", (size: Phaser.Structs.Size) => {
      this.threeBoard.resize({ w: size.width, h: size.height });
    });
  }

  update(_time: number, delta: number): void {
    this.threeBoard.update(delta);
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x102030, 0x102030, 0x080b12, 0x080b12, 1);
    g.fillRect(0, 0, gameWidth, gameHeight);
    g.fillStyle(0x1e2f42, 0.25);
    g.fillEllipse(1050, 110, 540, 260);
    g.fillStyle(0x4a6b90, 0.08);
    g.fillEllipse(190, 740, 520, 300);
    g.setDepth(-50);
  }

  private initThreeLayer(): void {
    const parent = this.game.canvas?.parentElement;
    if (!parent) {
      return;
    }
    parent.style.position = "relative";
    if (this.game.canvas) {
      this.game.canvas.style.position = "relative";
      this.game.canvas.style.zIndex = "2";
    }

    const layer = document.createElement("div");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    layer.style.zIndex = "1";
    layer.style.pointerEvents = "none";
    parent.insertBefore(layer, this.game.canvas ?? null);
    this.boardContainer = layer;
    this.threeBoard.init(layer, { w: gameWidth, h: gameHeight });
  }

  private setupCameraControls(): void {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.isPlaying || p.rightButtonDown()) return;
      this.dragging = true;
      this.dragLast.set(p.x, p.y);

      const nodeId = this.threeBoard.raycast(
        { x: p.x, y: p.y },
        { w: this.scale.width, h: this.scale.height }
      );
      if (!nodeId || !this.state) return;
      this.handleNodeClick(nodeId);
    });

    this.input.on("pointerup", () => {
      this.dragging = false;
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.isPlaying || !this.dragging) return;
      const dx = p.x - this.dragLast.x;
      const dy = p.y - this.dragLast.y;
      this.threeBoard.panBy(dx, dy);
      this.dragLast.set(p.x, p.y);
    });

    this.input.on(
      "wheel",
      (_pointer: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
        if (!this.isPlaying) return;
        this.threeBoard.zoomBy(-dy * 0.0008);
      }
    );
  }

  private handleNodeClick(nodeId: string): void {
    if (!this.state) return;
    const move = this.state.tryMoveSelected(nodeId);
    if (move) {
      this.playTone(420, 0.09);
      this.threeBoard.animateMove(move.pieceId, move.toNodeId);
      this.syncBoardHighlights();
      this.refreshStatus();
      return;
    }

    this.state.selectPieceAtNode(nodeId);
    const selected = this.state.getSelectedPiece();
    if (selected) this.playTone(720, 0.04);
    this.syncBoardHighlights();
    this.refreshStatus();
  }

  private refreshStatus(): void {
    if (!this.isPlaying) {
      this.statusText.setText("Home | Profile, Tournament, Settings, Training, Leaderboard, Others");
      return;
    }
    if (!this.state) {
      this.statusText.setText("Loading battle...");
      return;
    }

    const selected = this.state.getSelectedPiece();
    if (!selected) {
      this.statusText.setText(
        `Unity parity mode | Pieces: ${this.state.getPieces().length} | Drag to pan, wheel to zoom`
      );
      return;
    }
    const legalCount = this.state.getMovesForSelected().length;
    this.statusText.setText(
      `Selected: ${selected.type.toUpperCase()} ${selected.color} | Legal moves: ${legalCount}`
    );
  }

  private createUiLayers(): void {
    const makeButton = (
      x: number,
      y: number,
      text: string,
      onClick: () => void,
      width = 220
    ): Phaser.GameObjects.Container => {
      const bg = this.add
        .rectangle(0, 0, width, 52, 0x15283c, 0.95)
        .setStrokeStyle(1.4, 0x87c8ff, 0.8);
      const label = this.add
        .text(0, 0, text, {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "24px",
          color: "#f4f8ff",
          fontStyle: "bold"
        })
        .setOrigin(0.5);
      const c = this.add.container(x, y, [bg, label]).setDepth(240);
      bg.setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
      return c;
    };

    const menuBg = this.add.rectangle(680, 430, 1360, 860, 0x070b12, 0.55).setDepth(230);
    const title = this.add
      .text(680, 250, "ProChess", {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "74px",
        color: "#eaf3ff",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(240);
    const subtitle = this.add
      .text(680, 310, "Hybrid three.js board + Phaser HUD", {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "22px",
        color: "#9fb6d0"
      })
      .setOrigin(0.5)
      .setDepth(240);
    const buttonDefs: Array<{ label: string; x: number; y: number; action: () => void }> = [
      { label: "Profile", x: 550, y: 390, action: () => this.openMenuPage("Profile") },
      { label: "Battle", x: 810, y: 390, action: () => void this.startBattle() },
      { label: "Tournament", x: 550, y: 455, action: () => this.openMenuPage("Tournament") },
      { label: "Settings", x: 810, y: 455, action: () => this.openMenuPage("Settings") },
      { label: "Training", x: 550, y: 520, action: () => this.openMenuPage("Training") },
      { label: "Leaderboard", x: 810, y: 520, action: () => this.openMenuPage("Leaderboard") },
      { label: "Others", x: 680, y: 585, action: () => this.openMenuPage("Others") }
    ];
    const buttons = buttonDefs.map((b) => makeButton(b.x, b.y, b.label, b.action, 230));
    this.menuLayer = this.add
      .container(0, 0, [menuBg, title, subtitle, ...buttons])
      .setDepth(230)
      .setScrollFactor(0);

    const pageBg = this.add.rectangle(680, 430, 760, 420, 0x0d1724, 0.95).setDepth(245);
    pageBg.setStrokeStyle(1.6, 0x7dbbf3, 0.7);
    this.pageTitleText = this.add
      .text(680, 285, "", {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "44px",
        color: "#eef6ff",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(246);
    this.pageContentLayer = this.add.container(0, 0).setDepth(246);
    const pageClose = makeButton(680, 560, "Back", () => this.closeMenuPage(), 190);
    this.pageLayer = this.add
      .container(0, 0, [pageBg, this.pageTitleText, this.pageContentLayer, pageClose])
      .setDepth(245)
      .setScrollFactor(0);
    this.pageLayer.setVisible(false);

    const homeBtn = makeButton(1220, 34, "Home", () => this.goHome(), 190);
    this.hudLayer = this.add.container(0, 0, [homeBtn]).setDepth(240).setScrollFactor(0);
    this.hudLayer.setVisible(false);
  }

  private createMobileControls(): void {
    const makeSmall = (
      x: number,
      y: number,
      label: string,
      onClick: () => void
    ): Phaser.GameObjects.Container => {
      const bg = this.add
        .rectangle(0, 0, 54, 54, 0x18293d, 0.9)
        .setStrokeStyle(1, 0x90c6ff, 0.7)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", onClick);
      const text = this.add
        .text(0, 0, label, {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "26px",
          color: "#eff5ff"
        })
        .setOrigin(0.5);
      return this.add.container(x, y, [bg, text]).setDepth(240);
    };

    const zoomIn = makeSmall(52, 745, "+", () => this.threeBoard.zoomBy(0.12));
    const zoomOut = makeSmall(52, 805, "-", () => this.threeBoard.zoomBy(-0.12));
    const reset = makeSmall(115, 805, "R", () => this.threeBoard.resetCamera());
    this.mobileLayer = this.add
      .container(0, 0, [zoomIn, zoomOut, reset])
      .setDepth(240)
      .setScrollFactor(0);
    this.mobileLayer.setVisible(false);
  }

  private async startBattle(): Promise<void> {
    if (this.isLoadingBattle) return;
    this.isLoadingBattle = true;
    this.statusText.setText("Loading battle...");

    if (!this.state) {
      const parity = await loadParityData();
      this.state = new GameState(parity);
      this.threeBoard.setBoardTopology(this.state.getNodes());
      this.threeBoard.setPieces(this.state.getPieces());
      this.syncBoardHighlights();
    }

    this.isPlaying = true;
    this.menuLayer?.setVisible(false);
    this.pageLayer?.setVisible(false);
    this.hudLayer?.setVisible(true);
    this.mobileLayer?.setVisible(true);
    this.threeBoard.resetCamera();
    this.playTone(330, 0.12);
    this.refreshStatus();
    this.isLoadingBattle = false;
  }

  private goHome(): void {
    this.isPlaying = false;
    this.state?.selectPieceAtNode("");
    this.threeBoard.setHighlightedNodes(null, []);
    this.menuLayer?.setVisible(true);
    this.pageLayer?.setVisible(false);
    this.hudLayer?.setVisible(false);
    this.mobileLayer?.setVisible(false);
    this.threeBoard.resetCamera();
    this.playTone(250, 0.09);
    this.refreshStatus();
  }

  private openMenuPage(pageName: string): void {
    if (!this.pageLayer || !this.pageTitleText || !this.pageContentLayer) return;
    this.pageTitleText.setText(pageName);
    this.renderPageContent(pageName);
    this.pageLayer.setVisible(true);
    this.playTone(300, 0.06);
  }

  private closeMenuPage(): void {
    this.pageLayer?.setVisible(false);
    this.playTone(260, 0.04);
  }

  private renderPageContent(pageName: string): void {
    if (!this.pageContentLayer) return;
    this.pageContentLayer.removeAll(true);
    switch (pageName) {
      case "Profile":
        this.renderProfilePage();
        break;
      case "Settings":
        this.renderSettingsPage();
        break;
      case "Leaderboard":
        this.renderLeaderboardPage();
        break;
      case "Tournament":
        this.renderTournamentPage();
        break;
      case "Training":
        this.renderTrainingPage();
        break;
      case "Others":
        this.renderOthersPage();
        break;
      default:
        this.renderTextBlock("No content yet.");
    }
  }

  private renderTextBlock(text: string): void {
    if (!this.pageContentLayer) return;
    const t = this.add
      .text(680, 400, text, {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "24px",
        color: "#bdd3ea",
        align: "center",
        wordWrap: { width: 640 }
      })
      .setOrigin(0.5);
    this.pageContentLayer.add(t);
  }

  private renderProfilePage(): void {
    if (!this.pageContentLayer) return;
    const p = this.profileState;
    const left = 470;
    const top = 335;
    const lineGap = 44;
    const rows: Array<[string, string]> = [
      ["Player", p.playerName],
      ["Rating", `${p.rating}`],
      ["Wins", `${p.wins}`],
      ["Losses", `${p.losses}`],
      ["Win Rate", `${Math.round((p.wins / (p.wins + p.losses)) * 100)}%`],
      ["Current Streak", `${p.streak}`]
    ];
    rows.forEach(([k, v], i) => {
      const y = top + i * lineGap;
      const key = this.add
        .text(left, y, k, {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "26px",
          color: "#8fb2d4"
        })
        .setOrigin(0, 0.5);
      const value = this.add
        .text(left + 270, y, v, {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "26px",
          color: "#f0f7ff",
          fontStyle: "bold"
        })
        .setOrigin(0, 0.5);
      this.pageContentLayer?.add([key, value]);
    });
  }

  private renderSettingsPage(): void {
    if (!this.pageContentLayer) return;
    const toggles: Array<{
      key: "music" | "sfx" | "vibration" | "hints" | "highContrast";
      label: string;
      y: number;
    }> = [
      { key: "music", label: "Music", y: 332 },
      { key: "sfx", label: "SFX", y: 382 },
      { key: "vibration", label: "Vibration", y: 432 },
      { key: "hints", label: "Hints", y: 482 },
      { key: "highContrast", label: "High Contrast", y: 532 }
    ];
    toggles.forEach((item) => {
      const label = this.add
        .text(500, item.y, item.label, {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "26px",
          color: "#d8e8f9"
        })
        .setOrigin(0, 0.5);
      const buttonBg = this.add
        .rectangle(875, item.y, 118, 40, 0x1b2a3a, 0.95)
        .setStrokeStyle(1.2, 0x8cbef0, 0.8)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.settingsState[item.key] = !this.settingsState[item.key];
          this.renderPageContent("Settings");
          this.playTone(360, 0.04);
        });
      const value = this.add
        .text(875, item.y, this.settingsState[item.key] ? "ON" : "OFF", {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "22px",
          color: this.settingsState[item.key] ? "#8dffb2" : "#ff9a9a",
          fontStyle: "bold"
        })
        .setOrigin(0.5);
      this.pageContentLayer?.add([label, buttonBg, value]);
    });
  }

  private renderLeaderboardPage(): void {
    if (!this.pageContentLayer) return;
    const rows = [
      ["1", "RookMaster", "1878", "214"],
      ["2", "HexaQueen", "1812", "198"],
      ["3", "KnightPulse", "1764", "173"],
      ["4", this.profileState.playerName, `${this.profileState.rating}`, `${this.profileState.wins}`],
      ["5", "VizierStorm", "1623", "141"]
    ];
    const headers = ["Rank", "Player", "Rating", "Wins"];
    const x = [460, 560, 810, 970];
    headers.forEach((h, i) => {
      this.pageContentLayer?.add(
        this.add
          .text(x[i], 330, h, {
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "23px",
            color: "#8fb4d8",
            fontStyle: "bold"
          })
          .setOrigin(0, 0.5)
      );
    });
    rows.forEach((r, rowIndex) => {
      const y = 372 + rowIndex * 44;
      r.forEach((cell, colIndex) => {
        this.pageContentLayer?.add(
          this.add
            .text(x[colIndex], y, cell, {
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "22px",
              color: rowIndex === 3 ? "#ffe19f" : "#eaf3ff"
            })
            .setOrigin(0, 0.5)
        );
      });
    });
  }

  private renderTournamentPage(): void {
    if (!this.pageContentLayer) return;
    const events = [
      ["Weekend Cup", "Sat 20:00", "Open"],
      ["Rapid Clash", "Sun 17:30", "Open"],
      ["Pro Arena", "Tue 21:00", "Locked"]
    ];
    events.forEach((event, i) => {
      const y = 350 + i * 72;
      const card = this.add
        .rectangle(680, y, 610, 58, 0x132131, 0.88)
        .setStrokeStyle(1.2, 0x7ab2e6, 0.6);
      const name = this.add
        .text(420, y, event[0], {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "24px",
          color: "#f0f7ff"
        })
        .setOrigin(0, 0.5);
      const time = this.add
        .text(730, y, event[1], {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "20px",
          color: "#9fc1df"
        })
        .setOrigin(0, 0.5);
      const status = this.add
        .text(930, y, event[2], {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "20px",
          color: event[2] === "Open" ? "#8dffb2" : "#ffb3a4"
        })
        .setOrigin(0, 0.5);
      this.pageContentLayer?.add([card, name, time, status]);
    });
  }

  private renderTrainingPage(): void {
    if (!this.pageContentLayer) return;
    const items = ["Opening Drills", "Middle Game Puzzles", "Endgame Tactics", "Speed Calculation"];
    items.forEach((name, i) => {
      const x = i % 2 === 0 ? 510 : 850;
      const y = i < 2 ? 390 : 485;
      const card = this.add
        .rectangle(x, y, 280, 76, 0x162637, 0.9)
        .setStrokeStyle(1.1, 0x8cbef0, 0.75)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.playTone(430, 0.05);
          this.statusText.setText(`${name} selected`);
        });
      const text = this.add
        .text(x, y, name, {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "22px",
          color: "#edf6ff"
        })
        .setOrigin(0.5);
      this.pageContentLayer?.add([card, text]);
    });
  }

  private renderOthersPage(): void {
    if (!this.pageContentLayer) return;
    const actions: Array<{ label: string; run: () => void }> = [
      { label: "Reset Stats", run: () => this.resetProfileStats() },
      { label: "Export Snapshot", run: () => this.exportStateSnapshot() },
      { label: "Toggle Demo Audio", run: () => this.playTone(520, 0.12) }
    ];
    actions.forEach((action, i) => {
      const y = 370 + i * 78;
      const btn = this.add
        .rectangle(680, y, 360, 58, 0x132131, 0.9)
        .setStrokeStyle(1.1, 0x86bde8, 0.75)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", action.run);
      const text = this.add
        .text(680, y, action.label, {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "24px",
          color: "#edf6ff"
        })
        .setOrigin(0.5);
      this.pageContentLayer?.add([btn, text]);
    });
  }

  private resetProfileStats(): void {
    this.profileState = { ...this.profileState, wins: 0, losses: 0, rating: 1200, streak: 0 };
    this.renderPageContent("Profile");
    this.playTone(300, 0.08);
  }

  private exportStateSnapshot(): void {
    const snapshot = {
      settings: this.settingsState,
      profile: this.profileState,
      pieces: this.state?.getPieces().length ?? 0
    };
    console.log("ProChess snapshot:", snapshot);
    this.statusText.setText("Snapshot exported to browser console");
    this.playTone(380, 0.06);
  }

  private playTone(freq: number, durationSeconds: number): void {
    if (!this.settingsState.sfx) return;
    const soundManager = this.sound as Phaser.Sound.BaseSoundManager & { context?: AudioContext };
    const ctx = soundManager.context;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.value = 0.01;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSeconds);
    osc.start(now);
    osc.stop(now + durationSeconds + 0.02);
  }

  private syncBoardHighlights(): void {
    if (!this.state) return;
    const selected = this.state.getSelectedPiece();
    if (!selected) {
      this.threeBoard.setHighlightedNodes(null, []);
      return;
    }
    this.threeBoard.setHighlightedNodes(
      selected.nodeId,
      this.state.getMovesForSelected().map((m) => m.nodeId)
    );
  }

  shutdown(): void {
    this.threeBoard.dispose();
    if (this.boardContainer?.parentElement) {
      this.boardContainer.parentElement.removeChild(this.boardContainer);
    }
    this.boardContainer = null;
  }
}

export const gameWidth = 1360;
export const gameHeight = 860;
