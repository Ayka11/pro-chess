import Phaser from "phaser";
import { GameState } from "./logic";
import { loadParityData } from "./parityLoader";
import { getLessonCatalog } from "./lessons";
import { ThreeBoard } from "./ThreeBoard";
import { TrainingEngine } from "./TrainingEngine";
import { TrainingPanel } from "./TrainingPanel";
import { COLOR, GLASS_ALPHA, BORDER, hexToRgba } from "./colorPalette";
import { FONT_FAMILY, TEXT_STYLE, FONT_SIZE } from "./typography";
import {
  connect, createGame, joinGame, startGame,
  onRoomCreated, onJoinedRoom, onGameStart, onBoardUpdate, onSocketError,
  makeMove, isMyTurn, getCurrentTurn, getMyColor, getMyRoomId
} from "../network/socket";

export class ProChessScene extends Phaser.Scene {
  private readonly engagementZoneDebugEnabled = false;
  private threeBoard_initPromise: Promise<void> | null = null;
  private readonly theme = {
    // Simple, classic palette
    bgBase: 0x181c22,
    hudText: "#eaf3ff",
    hudTextDim: "#b9cee5",
    panel: 0x232a33,
    button: 0x232a33,
    buttonStroke: 0x3a4a5a,
    accentSoft: 0x278dff,
    fontUI: "Arial, sans-serif",
    fontSerif: "Georgia, 'Times New Roman', serif"
  };
  private statusText!: Phaser.GameObjects.Text;
  private turnStateText: Phaser.GameObjects.Text | null = null;
  private menuLayer: Phaser.GameObjects.Container | null = null;
  private hudLayer: Phaser.GameObjects.Container | null = null;
  private mobileLayer: Phaser.GameObjects.Container | null = null;
  private pageLayer: Phaser.GameObjects.Container | null = null;
  private pageDimmer: Phaser.GameObjects.Rectangle | null = null;
  private pageBackdrop: Phaser.GameObjects.Rectangle | null = null;
  private pageTitleText: Phaser.GameObjects.Text | null = null;
  private pageChromeLayer: Phaser.GameObjects.Container | null = null;
  private pageContentLayer: Phaser.GameObjects.Container | null = null;
  private pageCloseButton: Phaser.GameObjects.Container | null = null;
  private pageCurrentName: string | null = null;
  private pageScrollY = 0;
  private pageScrollMax = 0;
  private trainingSectionTargets: Record<"beginner" | "intermediate" | "advanced", number> = {
    beginner: 0,
    intermediate: 0,
    advanced: 0
  };
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
  private dragMode: "pan" | "orbit" | null = null;
  private movedDuringDrag = false;
  private dragLast = new Phaser.Math.Vector2();
  private screenState: "menu" | "loading" | "playing" = "menu";
  private readonly isMobile =
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
  private state: GameState | null = null;
  private readonly useCustomGrid = false;
  private threeBoard = new ThreeBoard();
  private boardContainer: HTMLDivElement | null = null;
  private resizeHandler: ((size: Phaser.Structs.Size) => void) | null = null;
  private backgroundLayer: Phaser.GameObjects.Graphics[] = [];
  private isShutdown = false;
  private isOnlineGame = false;
  private isTournamentArena = false;
  private myOnlineColor: string | null = null;
  private onlineRoomId: string | null = null;
  private tournamentPortalActive = false;
  private tournamentPortalButton: Phaser.GameObjects.Container | null = null;

  // Training mode properties
  private isInTrainingMode = false;
  private trainingEngine: TrainingEngine | null = null;
  private trainingPanel: TrainingPanel | null = null;
  private conflictZoneTutorialShown = false;
  private conflictZoneTutorialTimer: number | null = null;

  constructor() {
    super("ProChessScene");
  }

  create(): void {
    this.isShutdown = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.cameras.main.setBackgroundColor(0x000000);
    this.drawBackground();
    this.setupAudioUnlock();
    this.statusText = this.add
      .text(32, 24, "ProChess | Ready", {
        fontFamily: this.theme.fontUI,
        fontSize: "28px",
        color: this.theme.hudText,
        fontStyle: "500",
        shadow: { offsetX: 1, offsetY: 1, blur: 3, color: "#00000088", fill: true }
      })
      .setDepth(300)
      .setScrollFactor(0);

    this.setupCameraControls();
    this.createUiLayers();
    this.createMobileControls();
    this.registerSocketHandlers();

    // Initialize ThreeBoard with DOM container
    this.boardContainer = document.createElement("div");
    Object.assign(this.boardContainer.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "0px",
      height: "0px",
      pointerEvents: "none"
    });
    const appContainer = document.getElementById("app");
    if (appContainer) {
      appContainer.appendChild(this.boardContainer);
    }
    this.syncBoardOverlayBounds();
    // @ts-ignore - init() returns Promise<void> despite type inference issue
    this.threeBoard_initPromise = Promise.resolve(this.threeBoard.init(this.boardContainer, this.getBoardViewportSize())).catch((error: any) => {
      console.error('Failed to initialize ThreeBoard:', error);
    });

    this.resizeHandler = (size: Phaser.Structs.Size) => {
      this.drawBackground();
      this.syncBoardOverlayBounds();
      this.threeBoard.resize(this.getBoardViewportSize());
      if (this.screenState === "menu" && this.pageCurrentName && this.pageLayer?.visible) {
        this.renderPageContent(this.pageCurrentName);
      }
    };
    this.scale.on("resize", this.resizeHandler);
  }

  update(_time: number, delta: number): void {
    this.threeBoard.update(delta);
  }

  private drawBackground(): void {
    this.backgroundLayer.forEach((obj) => obj.destroy());
    this.backgroundLayer = [];

    const width = this.scale.width;
    const height = this.scale.height;

    const isGameplayBackdrop = this.screenState === "playing";

    if (isGameplayBackdrop) {
      const bgBase = this.add.graphics();
      bgBase.fillStyle(0x0c1420, 1);
      bgBase.fillRect(0, 0, width, height);
      bgBase.setDepth(-80);
      this.backgroundLayer.push(bgBase);

      const bgLift = this.add.graphics();
      bgLift.fillStyle(0x132033, 0.24);
      bgLift.fillRect(0, 0, width, height * 0.52);
      bgLift.setDepth(-79);
      this.backgroundLayer.push(bgLift);

      const bgHorizon = this.add.graphics();
      bgHorizon.fillStyle(0x1a2a40, 0.12);
      bgHorizon.fillRect(0, height * 0.18, width, height * 0.36);
      bgHorizon.setDepth(-78);
      this.backgroundLayer.push(bgHorizon);
      return;
    }

    // Create layered background with spec gradient: deep blacks fading from top
    // Layer 1: Bottom/deepest (0x07090f)
    const bgDeep = this.add.graphics();
    bgDeep.fillStyle(COLOR.bgBase, 1);
    bgDeep.fillRect(0, 0, width, height);
    bgDeep.setDepth(-80);
    this.backgroundLayer.push(bgDeep);

    // Layer 2: Mid-tone overlay (0x0b1020) with gradient effect
    const bgMid = this.add.graphics();
    bgMid.fillStyle(COLOR.bgMid, 0.6);
    bgMid.fillRect(0, 0, width, height * 0.7);
    bgMid.setDepth(-79);
    this.backgroundLayer.push(bgMid);

    // Layer 3: Top gradient area (0x111827) for radial effect
    const bgTop = this.add.graphics();
    bgTop.fillStyle(COLOR.bgTopGradient, 0.4);
    bgTop.fillRect(0, 0, width, height * 0.3);
    bgTop.setDepth(-78);
    this.backgroundLayer.push(bgTop);
  }

  private makeButton(
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    width = 240
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    
    // Glass-metal button: semi-transparent backdrop with cyan edge lighting
    const bg = this.add
      .rectangle(0, 0, width, 64, COLOR.surfaceGlassPrimary, GLASS_ALPHA.buttonBase)
      .setStrokeStyle(2.25, COLOR.cyan, BORDER.cyanDefault.opacity)
      .setAlpha(0.92);
    
    const label = this.add
      .text(0, 0, text.toUpperCase(), {
        fontFamily: this.theme.fontUI,
        fontSize: "25px",
        color: this.theme.hudText,
        fontStyle: "600"
      })
      .setOrigin(0.5);

    // Premium hover effects: lift + glow + specular sweep
    bg.setInteractive({ useHandCursor: true })
      .on("pointerover", () => {
        // Lift effect: move up slightly
        this.tweens.add({ targets: bg, y: -8, duration: 200, ease: "Quad.out" });
        // Brighter border glow
        bg.setStrokeStyle(2.5, COLOR.cyan, BORDER.cyanHover.opacity);
        bg.setAlpha(0.98);
        
        // Specular sweep across button (white shimmer)
        const sweep = this.add.graphics();
        sweep.fillStyle(0xffffff, 0.15);
        const sweepWidth = 60;
        sweep.fillRect(-width / 2 - sweepWidth, -32, sweepWidth, 64);
        sweep.setDepth(241);
        container.add(sweep);
        
        this.tweens.add({
          targets: sweep,
          x: width / 2 + sweepWidth,
          duration: 220,
          ease: "Linear",
          onComplete: () => sweep.destroy()
        });
      })
      .on("pointerout", () => {
        // Return to idle state
        this.tweens.add({ targets: bg, y: 0, duration: 150, ease: "Quad.out" });
        bg.setStrokeStyle(2.25, COLOR.cyan, BORDER.cyanDefault.opacity);
        bg.setAlpha(0.92);
      })
      .on("pointerdown", () => {
        // Press-in animation
        bg.setScale(0.97);
        this.tweens.add({ targets: bg, scale: 1, duration: 120, ease: "Back.out" });
        onClick();
      });

    container.add([bg, label]);
    container.setDepth(240);
    return container;
  }

  private createUiLayers(): void {
    // Simple classic menu: flat background, centered title, grid of buttons
    const menuBg = this.add.rectangle(680, 430, 1360, 860, 0x181c22, 1).setDepth(230);
    const title = this.add
      .text(680, 200, "PROCHESS", {
        fontFamily: this.theme.fontSerif,
        fontSize: "54px",
        color: this.theme.hudText,
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(240);
    // Simple grid of flat buttons
    const buttonLabels = [
      { label: "Battle", y: 320, action: () => this.startBattle() },
      { label: "Tournament", y: 390, action: () => this.openMenuPage("Tournament") },
      { label: "Training", y: 460, action: () => this.openMenuPage("Training") },
      { label: "Profile", y: 530, action: () => this.openMenuPage("Profile") },
      { label: "Leaderboard", y: 600, action: () => this.openMenuPage("Leaderboard") },
      { label: "Settings", y: 670, action: () => this.openMenuPage("Settings") },
      { label: "Others", y: 740, action: () => this.openMenuPage("Others") }
    ];
    const buttons = buttonLabels.map((b, i) => {
      const btn = this.add.rectangle(680, b.y, 320, 54, this.theme.button, 1)
        .setStrokeStyle(2, this.theme.buttonStroke, 0.7)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", b.action)
        .setDepth(231);
      const txt = this.add.text(680, b.y, b.label.toUpperCase(), {
        fontFamily: this.theme.fontUI,
        fontSize: "22px",
        color: this.theme.hudText,
        fontStyle: "bold"
      }).setOrigin(0.5).setDepth(232);
      return [btn, txt];
    }).flat();
    this.menuLayer = this.add
      .container(0, 0, [menuBg, title, ...buttons])
      .setDepth(230)
      .setScrollFactor(0);

    // Initialize page title text
    this.pageTitleText = this.add
      .text(680, 180, "", {
        fontFamily: this.theme.fontSerif,
        fontSize: "48px",
        color: this.theme.hudText,
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(221)
      .setScrollFactor(0);

    this.pageChromeLayer = this.add
      .container(0, 0)
      .setDepth(221)
      .setScrollFactor(0);

    // Initialize page content layer
    this.pageContentLayer = this.add
      .container(0, 0)
      .setDepth(220)
      .setScrollFactor(0);

    // Initialize page layer container
    this.pageLayer = this.add
      .container(0, 0, [this.pageTitleText, this.pageChromeLayer, this.pageContentLayer])
      .setDepth(220)
      .setScrollFactor(0)
      .setVisible(false);

    // Initialize HUD layer
    this.hudLayer = this.add
      .container(0, 0)
      .setDepth(240)
      .setScrollFactor(0)
      .setVisible(false);
  }


  private setupCameraControls(): void {
    this.input.mouse?.disableContextMenu();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.isPlaying) return;
      this.dragging = true;
      this.movedDuringDrag = false;
      this.dragLast.set(p.x, p.y);
      const button = (p.event as MouseEvent | undefined)?.button ?? 0;
      this.dragMode = button === 2 ? "pan" : "orbit";
    });

    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (this.isPlaying && !this.movedDuringDrag && this.dragMode === "orbit") {
        const nodeId = this.threeBoard.raycast(
          { x: p.x, y: p.y },
          { w: this.scale.width, h: this.scale.height }
        );
        if (nodeId && this.state) {
          this.handleNodeClick(nodeId);
        }
      }
      this.dragging = false;
      this.dragMode = null;
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.isPlaying || !this.dragging) return;
      const dx = p.x - this.dragLast.x;
      const dy = p.y - this.dragLast.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        this.movedDuringDrag = true;
      }
      if (this.dragMode === "orbit") {
        this.threeBoard.orbitBy(dx, dy);
      } else {
        this.threeBoard.panBy(dx, dy);
      }
      this.dragLast.set(p.x, p.y);
    });

    this.input.on(
      "wheel",
      (_pointer: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
        if (this.screenState === "menu" && this.pageCurrentName === "Training") {
          this.scrollTrainingPage(dy);
          return;
        }
        if (!this.isPlaying) return;
        this.threeBoard.zoomBy(-dy * 0.0018);
      }
    );

    this.input.keyboard?.on("keydown-ONE", () => this.threeBoard.setViewPreset("top"));
    this.input.keyboard?.on("keydown-TWO", () => this.threeBoard.setViewPreset("side"));
    this.input.keyboard?.on("keydown-THREE", () => this.threeBoard.setViewPreset("iso"));
    this.input.mouse?.disableContextMenu();
  }

  private setupAudioUnlock(): void {
    const unlock = () => {
      const soundManager = this.sound as Phaser.Sound.BaseSoundManager & { context?: AudioContext };
      if (!soundManager.context) return;
      if (soundManager.context.state === "running") return;
      void soundManager.context.resume();
    };

    this.input.once("pointerdown", unlock);
    this.input.keyboard?.once("keydown", unlock);
  }

  private handleNodeClick(nodeId: string): void {
    if (!this.state) return;

    // Handle training mode
    if (this.isInTrainingMode && this.trainingEngine) {
      this.handleTrainingModeClick(nodeId);
      return;
    }

    if (this.isOnlineGame && !isMyTurn()) {
      const waiting = getCurrentTurn();
      this.statusText.setText(`Not your turn — waiting for ${waiting ?? "opponent"}`);
      return;
    }
    const move = this.state.tryMoveSelected(nodeId);
    if (move) {
      this.playTone(move.moveKind === "capture" ? 510 : 420, move.moveKind === "capture" ? 0.12 : 0.09);
      if (move.moveKind === "capture") {
        this.threeBoard.setPieces(this.state.getPieces());
      } else {
        this.threeBoard.animateMove(move.pieceId, move.toNodeId);
      }
      if (
        !this.isInTrainingMode &&
        !this.conflictZoneTutorialShown &&
        !this.state.isNodeInEngagementZone(move.fromNodeId) &&
        this.state.isNodeInEngagementZone(move.toNodeId)
      ) {
        this.conflictZoneTutorialShown = true;
        this.showConflictZoneTutorial(
          "Gateway to the Horn: combat is color-coded. Pieces fight inside the same area type; Kings can cross the barrier."
        );
      }
      if (this.isOnlineGame && this.onlineRoomId) {
        makeMove(this.onlineRoomId, {
          pieces: this.state.getPieces(),
          move: { pieceId: move.pieceId, toNodeId: move.toNodeId, kind: move.moveKind }
        });
      }
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
    // If HUD is active, update the HUD bar center text only
    if (this.isPlaying && this.turnStateText) {
      if (!this.state) {
        this.turnStateText.setText("Loading battle...");
        return;
      }
      if (this.isInTrainingMode && this.trainingEngine?.getCurrentLesson()) {
        const lesson = this.trainingEngine.getCurrentLesson()!;
        const stepNumber = this.trainingEngine.getCurrentStepIndex() + 1;
        const totalSteps = this.trainingEngine.getTotalSteps();
        this.turnStateText.setText(`Training | ${lesson.title} | Step ${stepNumber}/${totalSteps}`);
        return;
      }
      const selected = this.state.getSelectedPiece();
      if (!selected) {
        const modeLabel = this.useCustomGrid ? "Custom triangular mode" : "Unity parity mode";
        this.turnStateText.setText(
          `${modeLabel} | Pieces: ${this.state.getPieces().length} | Area barrier active | Drag to pan, wheel to zoom`
        );
        return;
      }
      const preview = this.state.getInteractionHintsForSelected();
      const captureCount = preview.legalMoves.filter((move) => move.kind === "capture").length;
      const moveCount = preview.legalMoves.length - captureCount;
      const modeLabel = preview.mode === "combat" ? "Combat Mode" : "Movement Mode";
      this.turnStateText.setText(
        `Selected: ${this.getPieceLabel(selected.type)} ${selected.color} | ${modeLabel} | Moves: ${moveCount} | Captures: ${captureCount} | Restricted: ${preview.restrictedNodeIds.length}`
      );
      return;
    }
    // Otherwise, update the old statusText (menu/loading)
    if (this.statusText) {
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
        const modeLabel = this.useCustomGrid ? "Custom triangular mode" : "Unity parity mode";
        this.statusText.setText(
          `${modeLabel} | Pieces: ${this.state.getPieces().length} | Area barrier active | Drag to pan, wheel to zoom`
        );
        return;
      }
      const preview = this.state.getInteractionHintsForSelected();
      const captureCount = preview.legalMoves.filter((move) => move.kind === "capture").length;
      const moveCount = preview.legalMoves.length - captureCount;
      const modeLabel = preview.mode === "combat" ? "Combat Mode" : "Movement Mode";
      this.statusText.setText(
        `Selected: ${this.getPieceLabel(selected.type)} ${selected.color} | ${modeLabel} | Moves: ${moveCount} | Captures: ${captureCount} | Restricted: ${preview.restrictedNodeIds.length}`
      );
    }
  }

  private createMobileControls(): void {
    if (!this.isMobile) {
      this.mobileLayer = this.add.container(0, 0).setDepth(240).setScrollFactor(0);
      this.mobileLayer.setVisible(false);
      return;
    }

    const size = 72;
    const gap = 78;
    const makeSmall = (
      x: number,
      y: number,
      label: string,
      onClick: () => void
    ): Phaser.GameObjects.Container => {
      const bg = this.add
        .rectangle(0, 0, size, size, 0x18293d, 0.9)
        .setStrokeStyle(1, 0x90c6ff, 0.7)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", onClick);
      const text = this.add
        .text(0, 0, label, {
          fontFamily: this.theme.fontUI,
          fontSize: "30px",
          color: "#eff5ff"
        })
        .setOrigin(0.5);
      return this.add.container(x, y, [bg, text]).setDepth(240);
    };

    const zoomIn = makeSmall(62, 732, "+", () => this.threeBoard.zoomBy(0.12));
    const zoomOut = makeSmall(62, 732 + gap, "-", () => this.threeBoard.zoomBy(-0.12));
    const reset = makeSmall(62 + gap, 732 + gap, "R", () => this.threeBoard.resetCamera());
    const top = makeSmall(62 + gap, 732, "T", () => this.threeBoard.setViewPreset("top"));
    const side = makeSmall(62 + gap * 2, 732, "S", () => this.threeBoard.setViewPreset("side"));
    const iso = makeSmall(62 + gap * 2, 732 + gap, "I", () => this.threeBoard.setViewPreset("iso"));
    this.mobileLayer = this.add
      .container(0, 0, [zoomIn, zoomOut, reset, top, side, iso])
      .setDepth(240)
      .setScrollFactor(0);
    this.mobileLayer.setVisible(false);
  }

  private async startBattle(): Promise<void> {
    if (this.isLoadingBattle) return;
    this.isLoadingBattle = true;
    this.conflictZoneTutorialShown = false;
    this.screenState = "loading";
    this.statusText.setText("Loading battle...");

    if (!this.state) {
      const parity = await loadParityData();
      this.state = new GameState(parity);
      if (this.threeBoard_initPromise) {
        await this.threeBoard_initPromise;
      }
      this.threeBoard.setBoardTopology(this.state.getNodes());
      this.threeBoard.setPieces(this.state.getPieces());
      this.syncBoardHighlights();
    }

    this.isPlaying = true;
    this.isTournamentArena = false;
    this.screenState = "playing";
    this.drawBackground();
    this.menuLayer?.setVisible(false);
    this.pageLayer?.setVisible(false);
    this.hudLayer?.setVisible(true);
    this.mobileLayer?.setVisible(this.isMobile);
    this.tournamentPortalActive = false;
    this.updateTournamentPortalButton();
    this.threeBoard.clearPortals();
    this.threeBoard.setTournamentMode(false);
    this.threeBoard.setVisible(true);
    this.threeBoard.resetCamera();
    this.threeBoard.setViewPreset("top");
    this.playTone(330, 0.12);
    this.refreshStatus();
    this.isLoadingBattle = false;
  }

  private async startTournamentArena(): Promise<void> {
    if (this.isLoadingBattle) return;
    this.isLoadingBattle = true;
    this.screenState = "loading";
    this.statusText.setText("Preparing tournament arena...");

    if (!this.state) {
      const parity = await loadParityData();
      this.state = new GameState(parity);
      this.threeBoard.setBoardTopology(this.state.getNodes());
      this.threeBoard.setPieces(this.state.getPieces());
    }

    this.isPlaying = true;
    this.isTournamentArena = true;
    this.screenState = "playing";
    this.drawBackground();
    this.menuLayer?.setVisible(false);
    this.pageLayer?.setVisible(false);
    this.hudLayer?.setVisible(true);
    this.mobileLayer?.setVisible(this.isMobile);
    this.tournamentPortalActive = false;
    this.threeBoard.setVisible(true);
    this.threeBoard.setTournamentMode(true);
    this.seedTournamentPortals();
    this.updateTournamentPortalButton();
    this.syncBoardHighlights();
    this.threeBoard.resetCamera();
    this.threeBoard.setViewPreset("top");
    this.playTone(410, 0.14);
    this.statusText.setText("Tournament arena live | Navigate the portal lanes and control the center");
    this.isLoadingBattle = false;
  }

  private async startAIDuel(): Promise<void> {
    await this.startBattle();
    this.statusText.setText("AI duel ready | Solo tactical table active");
    this.playTone(470, 0.1);
  }

  private async startTrainingMode(lessonId: string): Promise<void> {
    if (this.isLoadingBattle) return;
    this.isLoadingBattle = true;
    this.screenState = "loading";
    this.statusText.setText("Loading training lesson...");

    // Load game state if not already loaded
    if (!this.state) {
      const parity = await loadParityData();
      this.state = new GameState(parity);
      this.threeBoard.setBoardTopology(this.state.getNodes());
    }

    // Create training engine and panel
    if (!this.trainingEngine) {
      this.trainingEngine = new TrainingEngine(this.threeBoard, this.state);
    }
    this.trainingEngine.onInstructionUpdate = (instruction) => {
      this.trainingPanel?.setInstruction(instruction);
    };
    this.trainingEngine.onSuccess = (message) => {
      this.statusText.setText(message);
    };
    this.trainingEngine.onMistake = (message) => {
      this.statusText.setText(message);
    };
    this.trainingEngine.onLessonComplete = () => {
      this.trainingPanel?.setNextButtonEnabled(false);
      this.statusText.setText("Training lesson complete!");
      this.playTone(680, 0.08);
    };
    if (!this.trainingPanel) {
      this.trainingPanel = new TrainingPanel();
      this.trainingPanel.mount('body');

      // Setup panel callbacks
      this.trainingPanel.onHint(() => {
        const hint = this.trainingEngine?.getHint();
        if (hint) {
          this.statusText.setText(`Hint: ${hint}`);
          this.playTone(640, 0.08);
        }
      });

      this.trainingPanel.onBestPlay(() => {
        void this.trainingEngine?.showBestPlay();
        this.playTone(550, 0.1);
      });

      this.trainingPanel.onNext(() => {
        this.trainingEngine?.nextStep();
        this.trainingPanel?.setNextButtonEnabled(false);
        this.syncBoardHighlights();
        this.playTone(520, 0.1);
        this.trainingPanel?.updateProgress(
          this.trainingEngine?.getCurrentStepIndex() ?? 0,
          this.trainingEngine?.getTotalSteps() ?? 1
        );
      });

      this.trainingPanel.onReset(() => {
        this.trainingEngine?.resetLesson();
        this.trainingPanel?.setNextButtonEnabled(false);
        this.syncBoardHighlights();
        this.playTone(620, 0.08);
      });

      this.trainingPanel.onExit(() => {
        this.exitTrainingMode();
      });
    }

    this.trainingEngine.onStepStart = () => {
      this.trainingPanel?.setNextButtonEnabled(false);
      this.trainingPanel?.updateProgress(
        this.trainingEngine?.getCurrentStepIndex() ?? 0,
        this.trainingEngine?.getTotalSteps() ?? 1
      );
    };

    // Load the lesson
    await this.trainingEngine.loadLesson(lessonId);
    const lesson = this.trainingEngine.getCurrentLesson();
    if (!lesson) {
      this.screenState = "menu";
      this.refreshLayerVisibility();
      this.statusText.setText(`Training lesson not found: ${lessonId}`);
      this.isLoadingBattle = false;
      return;
    }

    // Update training panel with current step
    this.trainingPanel.updateProgress(
      this.trainingEngine.getCurrentStepIndex(),
      this.trainingEngine.getTotalSteps()
    );
    this.trainingPanel.setNextButtonEnabled(false);

    this.isPlaying = true;
    this.isInTrainingMode = true;
    this.isTournamentArena = false;
    this.screenState = "playing";
    this.drawBackground();
    this.menuLayer?.setVisible(false);
    this.pageLayer?.setVisible(false);
    this.hudLayer?.setVisible(true);
    this.mobileLayer?.setVisible(this.isMobile);
    this.trainingPanel?.show();

    this.threeBoard.clearPortals();
    this.threeBoard.setTournamentMode(false);
    this.threeBoard.setVisible(true);
    this.threeBoard.resetCamera();
    this.threeBoard.setViewPreset("top");

    this.statusText.setText(`Training | ${lesson.title}`);
    this.syncBoardHighlights();
    this.playTone(330, 0.12);
    this.isLoadingBattle = false;
  }

  private handleTrainingModeClick(nodeId: string): void {
    if (!this.trainingEngine || !this.state) return;

    const selectedPiece = this.state.getSelectedPiece();
    if (!selectedPiece) {
      const selectionFeedback = this.trainingEngine.handleSelectionClick(nodeId);
      if (selectionFeedback.success) {
        this.playTone(550, 0.15);
        this.trainingPanel?.showFeedback(selectionFeedback);
        this.trainingPanel?.setNextButtonEnabled(true);
        this.syncBoardHighlights();
        return;
      }

      // Enforce turn order: reject selecting a piece of the wrong color
      const step = this.trainingEngine.getCurrentStep();
      if (step?.expectedColor) {
        const pieceAtNode = this.state.getPieceAtNode(nodeId);
        if (pieceAtNode && pieceAtNode.color !== step.expectedColor) {
          const expectedColorName = step.expectedColor.replace(/\d/, '');
          this.trainingPanel?.showFeedback({ success: false, message: `You must move a ${expectedColorName} piece.` });
          this.playTone(300, 0.1);
          return;
        }
      }

      // Try to select a piece
      this.state.selectPieceAtNode(nodeId);
      if (this.state.getSelectedPiece()) {
        this.playTone(720, 0.04);
        this.syncBoardHighlights();
      }
      return;
    }

    // If the user clicks on another piece (not the selected one), switch selection
    const clickedPiece = this.state.getPieceAtNode(nodeId);
    if (clickedPiece && clickedPiece.id !== selectedPiece.id) {
      this.state.selectPieceAtNode(nodeId);
      this.playTone(720, 0.04);
      this.syncBoardHighlights();
      return;
    }

    // Validate move with training engine
    const feedback = this.trainingEngine.handlePlayerMove(selectedPiece.nodeId, nodeId);

    if (feedback.success) {
      // Play success sound
      this.playTone(550, 0.15);

      // Update game state and animate the actual lesson piece.
      const move = this.state.tryMoveSelected(nodeId);
      if (move) {
        if (move.moveKind === "capture") {
          this.threeBoard.setPieces(this.state.getPieces());
        } else {
          this.threeBoard.animateMove(move.pieceId, move.toNodeId);
        }
      } else {
        this.threeBoard.setPieces(this.state.getPieces());
      }
      this.trainingPanel?.showFeedback(feedback);
      this.trainingPanel?.setNextButtonEnabled(true);
    } else {
      // Play error sound
      this.playTone(300, 0.1);
      this.trainingPanel?.showFeedback(feedback);
    }

    this.syncBoardHighlights();
  }

  private exitTrainingMode(): void {
    this.isInTrainingMode = false;
    this.trainingEngine?.exit();
    this.trainingPanel?.hide();
    this.state?.selectPieceAtNode("");
    this.syncBoardHighlights();
    this.menuLayer?.setVisible(true);
    this.hudLayer?.setVisible(false);
    this.threeBoard.setVisible(false);
    this.screenState = "menu";
    this.statusText.setText("ProChess | Ready");
  }

  private seedTournamentPortals(): void {
    const center = this.threeBoard.getBoardCenter();
    this.threeBoard.clearPortals();
    this.threeBoard.addPortal(
      "center-portal",
      new Phaser.Math.Vector3(center.x, 0, center.y) as unknown as any,
      0xbfd6f5
    );
    this.setCenterPortalActive(this.tournamentPortalActive);
  }

  private setCenterPortalActive(active: boolean): void {
    const board = this.threeBoard as ThreeBoard & {
      setPortalActive(id: string, isActive: boolean): void;
    };
    board.setPortalActive("center-portal", active);
  }

  private toggleTournamentPortal(): void {
    if (!this.isPlaying) return;
    this.tournamentPortalActive = !this.tournamentPortalActive;
    this.setCenterPortalActive(this.tournamentPortalActive);
    this.updateTournamentPortalButton();
    this.statusText.setText(
      this.tournamentPortalActive
        ? "Tournament arena | Center portal activated"
        : "Tournament arena | Center portal on standby"
    );
    this.playTone(this.tournamentPortalActive ? 520 : 300, 0.06);
  }

  private updateTournamentPortalButton(): void {
    if (!this.tournamentPortalButton) return;
    const isTournament = this.isPlaying && this.isTournamentArena && this.screenState === "playing";
    this.tournamentPortalButton.setVisible(isTournament);
    const label = this.tournamentPortalButton.list[1];
    if (label instanceof Phaser.GameObjects.Text) {
      label.setText(this.tournamentPortalActive ? "PORTAL ON" : "PORTAL OFF");
    }
    if (!isTournament) {
      this.tournamentPortalButton.setVisible(false);
    }
  }

  private goHome(): void {
    this.isPlaying = false;
    this.isOnlineGame = false;
    this.isTournamentArena = false;
    this.onlineRoomId = null;
    this.myOnlineColor = null;
    this.screenState = "menu";
    this.drawBackground();
    this.tournamentPortalActive = false;
    this.state?.selectPieceAtNode("");
    this.threeBoard.clearPortals();
    this.threeBoard.setTournamentMode(false);
    this.updateTournamentPortalButton();
    this.threeBoard.setHighlightedNodes(null, []);
    this.menuLayer?.setVisible(true);
    this.pageLayer?.setVisible(false);
    this.hudLayer?.setVisible(false);
    this.mobileLayer?.setVisible(false);
    this.pageCurrentName = null;
    this.threeBoard.setVisible(false);
    this.threeBoard.resetCamera();
    this.playTone(250, 0.09);
    this.refreshStatus();
  }

  private openMenuPage(pageName: string): void {
    if (!this.pageLayer || !this.pageTitleText || !this.pageContentLayer) return;
    this.pageCurrentName = pageName;
    this.pageScrollY = 0;
    this.pageScrollMax = 0;
    this.pageTitleText.setText(pageName);
    this.renderPageContent(pageName);
    this.pageLayer.setVisible(true);
    this.refreshLayerVisibility();
    this.playTone(300, 0.06);
  }

  private closeMenuPage(): void {
    this.pageLayer?.setVisible(false);
    this.pageCurrentName = null;
    this.refreshLayerVisibility();
    this.playTone(260, 0.04);
  }

  private renderPageContent(pageName: string): void {
    if (!this.pageContentLayer) return;
    this.pageContentLayer.removeAll(true);
    this.pageChromeLayer?.removeAll(true);
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
    this.syncPageScrollOffset();
  }

  private renderTextBlock(text: string): void {
    if (!this.pageContentLayer) return;
    const bounds = this.getPageContentBounds();
    const t = this.add
      .text(bounds.centerX, bounds.centerY, text, {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "24px",
        color: "#bdd3ea",
        align: "center",
        wordWrap: { width: Math.max(320, bounds.width - 40) }
      })
      .setOrigin(0.5);
    this.pageContentLayer.add(t);
  }

  private renderProfilePage(): void {
    if (!this.pageContentLayer) return;
    const bounds = this.getPageContentBounds();
    const p = this.profileState;
    const splitColumns = bounds.width >= 760;
    const rowHeight = splitColumns ? 54 : 50;
    const columnGap = 24;
    const columnWidth = splitColumns ? (bounds.width - columnGap) * 0.5 : bounds.width;
    const sectionTop = bounds.top + 74;
    const rows: Array<[string, string]> = [
      ["Player", p.playerName],
      ["Rating", `${p.rating}`],
      ["Wins", `${p.wins}`],
      ["Losses", `${p.losses}`],
      ["Win Rate", `${Math.round((p.wins / (p.wins + p.losses)) * 100)}%`],
      ["Current Streak", `${p.streak}`]
    ];

    const hero = this.add.rectangle(bounds.centerX, bounds.top + 24, bounds.width, 62, 0x101a28, 0.98)
      .setStrokeStyle(1.1, 0x456381, 0.55);
    const heroText = this.add.text(bounds.centerX, bounds.top + 24, "Player record, rating, and current form in one responsive panel.", {
      fontFamily: this.theme.fontUI,
      fontSize: bounds.width < 720 ? "16px" : "17px",
      color: "#cfe1f5",
      align: "center",
      wordWrap: { width: bounds.width - 50 }
    }).setOrigin(0.5);

    this.pageContentLayer.add([hero, heroText]);

    rows.forEach(([k, v], i) => {
      const column = splitColumns ? Math.floor(i / 3) : 0;
      const row = splitColumns ? i % 3 : i;
      const cardX = bounds.left + columnWidth * 0.5 + column * (columnWidth + columnGap);
      const y = sectionTop + row * rowHeight;
      const card = this.add.rectangle(cardX, y, columnWidth, 42, 0x121b29, 0.96)
        .setStrokeStyle(1, 0x3e5a77, 0.44);
      const key = this.add
        .text(cardX - columnWidth * 0.5 + 22, y, k, {
          fontFamily: this.theme.fontUI,
          fontSize: "19px",
          color: "#8fb2d4"
        })
        .setOrigin(0, 0.5);
      const value = this.add
        .text(cardX + columnWidth * 0.5 - 22, y, v, {
          fontFamily: this.theme.fontUI,
          fontSize: "20px",
          color: "#f0f7ff",
          fontStyle: "bold"
        })
        .setOrigin(1, 0.5);
      this.pageContentLayer?.add([card, key, value]);
    });
  }

  private renderSettingsPage(): void {
    if (!this.pageContentLayer) return;
    const bounds = this.getPageContentBounds();
    const toggles: Array<{
      key: "music" | "sfx" | "vibration" | "hints" | "highContrast";
      label: string;
    }> = [
      { key: "music", label: "Music" },
      { key: "sfx", label: "SFX" },
      { key: "vibration", label: "Vibration" },
      { key: "hints", label: "Hints" },
      { key: "highContrast", label: "High Contrast" }
    ];

    const hero = this.add.rectangle(bounds.centerX, bounds.top + 22, bounds.width, 58, 0x101a28, 0.98)
      .setStrokeStyle(1.1, 0x456381, 0.55);
    const heroText = this.add.text(bounds.centerX, bounds.top + 22, "Toggle presentation, feedback, and accessibility settings without leaving the menu.", {
      fontFamily: this.theme.fontUI,
      fontSize: bounds.width < 720 ? "15px" : "16px",
      color: "#cfe1f5",
      align: "center",
      wordWrap: { width: bounds.width - 48 }
    }).setOrigin(0.5);
    this.pageContentLayer.add([hero, heroText]);

    const rowStart = bounds.top + 84;
    const rowGap = bounds.width < 720 ? 56 : 60;
    toggles.forEach((item, index) => {
      const y = rowStart + index * rowGap;
      const row = this.add.rectangle(bounds.centerX, y, bounds.width, 46, 0x121b29, 0.96)
        .setStrokeStyle(1, 0x3e5a77, 0.44);
      const label = this.add
        .text(bounds.left + 22, y, item.label, {
          fontFamily: this.theme.fontUI,
          fontSize: "20px",
          color: "#d8e8f9"
        })
        .setOrigin(0, 0.5);
      const buttonBg = this.add
        .rectangle(bounds.right - 70, y, 118, 34, 0x1b2a3a, 0.95)
        .setStrokeStyle(1.2, 0x8cbef0, 0.8)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.settingsState[item.key] = !this.settingsState[item.key];
          this.renderPageContent("Settings");
          this.playTone(360, 0.04);
        });
      const value = this.add
        .text(bounds.right - 70, y, this.settingsState[item.key] ? "ON" : "OFF", {
          fontFamily: this.theme.fontUI,
          fontSize: "18px",
          color: this.settingsState[item.key] ? "#8dffb2" : "#ff9a9a",
          fontStyle: "bold"
        })
        .setOrigin(0.5);
      this.pageContentLayer?.add([row, label, buttonBg, value]);
    });
  }

  private renderLeaderboardPage(): void {
    if (!this.pageContentLayer) return;
    const bounds = this.getPageContentBounds();
    const compact = bounds.width < 760;
    const rows = [
      ["1", "RookMaster", "1878", "214"],
      ["2", "HexaQueen", "1812", "198"],
      ["3", "KnightPulse", "1764", "173"],
      ["4", this.profileState.playerName, `${this.profileState.rating}`, `${this.profileState.wins}`],
      ["5", "VizierStorm", "1623", "141"]
    ];
    const headers = ["Rank", "Player", "Rating", "Wins"];

    const hero = this.add.rectangle(bounds.centerX, bounds.top + 22, bounds.width, 58, 0x101a28, 0.98)
      .setStrokeStyle(1.1, 0x456381, 0.55);
    const heroText = this.add.text(bounds.centerX, bounds.top + 22, "Season standings with your current placement highlighted in the field.", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "15px" : "16px",
      color: "#cfe1f5",
      align: "center",
      wordWrap: { width: bounds.width - 48 }
    }).setOrigin(0.5);
    const tableY = bounds.top + 92;
    const table = this.add.rectangle(bounds.centerX, tableY + 136, bounds.width, 314, 0x121b29, 0.96)
      .setStrokeStyle(1.1, 0x3e5a77, 0.44);
    const x = [
      bounds.left + 22,
      bounds.left + bounds.width * (compact ? 0.22 : 0.18),
      bounds.left + bounds.width * (compact ? 0.66 : 0.7),
      bounds.left + bounds.width * (compact ? 0.84 : 0.87)
    ];
    this.pageContentLayer.add([hero, heroText, table]);

    headers.forEach((h, i) => {
      this.pageContentLayer?.add(
        this.add
          .text(x[i], tableY, h, {
            fontFamily: this.theme.fontUI,
            fontSize: compact ? "17px" : "18px",
            color: "#8fb4d8",
            fontStyle: "bold"
          })
          .setOrigin(0, 0.5)
      );
    });
    rows.forEach((r, rowIndex) => {
      const y = tableY + 42 + rowIndex * 50;
      const rowBg = this.add.rectangle(bounds.centerX, y, bounds.width - 26, 40, rowIndex === 3 ? 0x2a2d20 : 0x151f2d, rowIndex === 3 ? 0.42 : 0.62)
        .setStrokeStyle(rowIndex === 3 ? 1.1 : 0.8, rowIndex === 3 ? 0xe0bf72 : 0x31475f, rowIndex === 3 ? 0.8 : 0.36);
      this.pageContentLayer?.add(rowBg);
      r.forEach((cell, colIndex) => {
        this.pageContentLayer?.add(
          this.add
            .text(x[colIndex], y, cell, {
              fontFamily: this.theme.fontUI,
              fontSize: compact ? "17px" : "18px",
              color: rowIndex === 3 ? "#ffe19f" : "#eaf3ff"
            })
            .setOrigin(0, 0.5)
        );
      });
    });
  }

  private renderTournamentPage(): void {
    if (!this.pageContentLayer) return;
    const bounds = this.getPageContentBounds();
    const centerX = bounds.centerX;
    const contentLeft = bounds.left;
    const contentRight = bounds.right;
    const contentWidth = bounds.width;
    const compact = contentWidth < 760;
    const cardGap = compact ? 14 : 18;
    const infoTop = bounds.top + 8;
    const infoHeight = compact ? 84 : 70;
      const footerHeight = compact ? 198 : 170;
    const footerTop = infoTop + infoHeight + 18;
      const cardsHeaderY = footerTop + footerHeight + 16;
      const cardsTop = footerTop + footerHeight + 34;
    const cardsBottom = bounds.bottom - 8;
    const availableCardHeight = Math.max(140, cardsBottom - cardsTop);
    const useStackedCards = compact;
    const cardWidth = useStackedCards ? contentWidth : Math.floor((contentWidth - cardGap) * 0.5);
    const cardHeight = useStackedCards
      ? Math.max(108, Math.floor((availableCardHeight - cardGap) * 0.5))
      : Math.min(166, availableCardHeight);
    const footerCenterY = footerTop + footerHeight * 0.5;
    const roomId = getMyRoomId();
    const seat = getMyColor() ?? "-";
    const connectionLabel = roomId ? "Room Linked" : "Offline";
    const roomStatus = roomId ? `Room ${roomId}` : "No room yet";

    const reopen = () => {
      if (this.pageCurrentName === "Tournament") {
        this.renderPageContent("Tournament");
      }
    };

    const topPanel = this.add.rectangle(centerX, infoTop + infoHeight * 0.5, contentWidth, infoHeight, 0x0f1724, 0.98)
      .setStrokeStyle(1.2, 0x446483, 0.55);
    const leftMetric = this.add.text(contentLeft + 18, infoTop + 22, "Format: Portal Arena", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "14px" : "16px",
      color: "#edf6ff",
      fontStyle: "600"
    }).setOrigin(0, 0.5);
    const middleMetric = this.add.text(compact ? contentLeft + 18 : contentLeft + 220, compact ? infoTop + 46 : infoTop + 22, "Portal: Shared Center", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "14px" : "16px",
      color: "#f0c7d6",
      fontStyle: "600"
    }).setOrigin(0, 0.5);
    const rightMetric = this.add.text(contentRight - 18, compact ? infoTop + 46 : infoTop + 22, connectionLabel, {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "13px" : "15px",
      color: roomId ? "#99f2ba" : "#93abc5",
      fontStyle: "700"
    }).setOrigin(1, 0.5);
    const cardsHeader = this.add.text(contentLeft + 16, cardsHeaderY, "PLAY MODES", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "12px" : "13px",
      color: this.theme.hudTextDim,
      fontStyle: "700",
      letterSpacing: 2
    }).setOrigin(0, 0.5);

    const addModeCard = (
      x: number,
      y: number,
      width: number,
      height: number,
      accent: number,
      title: string,
      body: string,
      cta: string,
      badge: string,
      onClick: () => void
    ) => {
      const shell = this.add.rectangle(x, y, width, height, 0x121b29, 0.98)
        .setStrokeStyle(1.2, accent, 0.72);
      const accentBar = this.add.rectangle(x, y - height * 0.5 + 7, width, 6, accent, 0.95);
      const badgeBg = this.add.rectangle(x + width * 0.5 - 72, y - height * 0.5 + 28, 82, 24, accent, 0.16)
        .setStrokeStyle(1, accent, 0.7);
      const badgeText = this.add.text(x + width * 0.5 - 72, y - height * 0.5 + 28, badge, {
        fontFamily: this.theme.fontUI,
        fontSize: "12px",
        color: "#edf7ff",
        fontStyle: "700"
      }).setOrigin(0.5);
      const titleText = this.add.text(x - width * 0.5 + 32, y - height * 0.5 + 48, title, {
        fontFamily: this.theme.fontUI,
        fontSize: width < 320 ? "24px" : "28px",
        color: "#eef6ff",
        fontStyle: "700"
      }).setOrigin(0, 0.5);
      const bodyText = this.add.text(x - width * 0.5 + 32, y - height * 0.5 + 84, body, {
        fontFamily: this.theme.fontUI,
        fontSize: width < 320 ? "15px" : "16px",
        color: "#9db5ce",
        wordWrap: { width: width - 64 }
      }).setOrigin(0, 0);
      const actionBg = this.add.rectangle(x, y + height * 0.5 - 28, Math.min(width - 64, 260), 36, accent, 0.16)
        .setStrokeStyle(1, accent, 0.75)
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => actionBg.setAlpha(0.86))
        .on("pointerout", () => actionBg.setAlpha(1))
        .on("pointerdown", onClick);
      const actionText = this.add.text(x, y + height * 0.5 - 28, cta, {
        fontFamily: this.theme.fontUI,
        fontSize: "15px",
        color: "#eef7ff",
        fontStyle: "700"
      }).setOrigin(0.5);
      this.pageContentLayer?.add([
        shell,
        accentBar,
        badgeBg,
        badgeText,
        titleText,
        bodyText,
        actionBg,
        actionText
      ]);
    };

    const firstCardX = useStackedCards
      ? centerX
      : contentLeft + cardWidth * 0.5;
    const secondCardX = useStackedCards
      ? centerX
      : contentRight - cardWidth * 0.5;
    const firstCardY = useStackedCards
      ? cardsTop + cardHeight * 0.5
      : cardsTop + cardHeight * 0.5;
    const secondCardY = useStackedCards
      ? firstCardY + cardHeight + 18
      : firstCardY;

    addModeCard(
      firstCardX,
      firstCardY,
      cardWidth,
      cardHeight,
      0xff96b2,
      "Arena",
      "Enter the live tournament board with the shared center portal and streamlined match flow.",
      "Play Arena",
      "LIVE",
      () => {
        void this.startTournamentArena();
        this.playTone(450, 0.08);
      }
    );

    addModeCard(
      secondCardX,
      secondCardY,
      cardWidth,
      cardHeight,
      0x89d4ff,
      "AI Duel",
      "Practice against AI on the same streamlined board used for tournament play.",
      "Play AI Duel",
      "SOLO",
      () => {
        void this.startAIDuel();
        this.closeMenuPage();
      }
    );

    const footerPanel = this.add.rectangle(centerX, footerCenterY, contentWidth, footerHeight, 0x0f1724, 0.98)
      .setStrokeStyle(1.1, 0x486885, 0.5);
    const footerHeader = this.add.text(contentLeft + 16, footerTop + 18, "ROOM LOBBY", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "12px" : "13px",
      color: this.theme.hudTextDim,
      fontStyle: "700",
      letterSpacing: 2
    }).setOrigin(0, 0.5);
    const footerSubheading = this.add.text(contentLeft + 16, footerTop + 36, "Create or join a room, then launch when both seats are ready.", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "11px" : "12px",
      color: "#8ea8c3"
    }).setOrigin(0, 0.5);

    const footerInnerWidth = contentWidth - 24;
    const infoPaneWidth = compact ? footerInnerWidth : Math.floor(footerInnerWidth * 0.46);
    const actionPaneWidth = compact ? footerInnerWidth : footerInnerWidth - infoPaneWidth - 18;
    const infoPaneLeft = contentLeft + 12;
    const actionPaneLeft = compact ? contentLeft + 12 : infoPaneLeft + infoPaneWidth + 18;
    const infoPaneHeight = compact ? 54 : footerHeight - 54;
    const actionPaneHeight = compact ? 82 : footerHeight - 54;
    const infoPaneCenterY = compact ? footerTop + 78 : footerTop + 45 + infoPaneHeight * 0.5;
    const actionPaneCenterY = compact ? footerTop + 144 : footerTop + 45 + actionPaneHeight * 0.5;
    const infoPaneTop = infoPaneCenterY - infoPaneHeight * 0.5;
    const actionPaneTop = actionPaneCenterY - actionPaneHeight * 0.5;

    const infoPane = this.add.rectangle(
      infoPaneLeft + infoPaneWidth * 0.5,
      infoPaneCenterY,
      infoPaneWidth,
      infoPaneHeight,
      0x111a28,
      0.94
    ).setStrokeStyle(1, 0x39556f, 0.5);
    const actionPane = this.add.rectangle(
      actionPaneLeft + actionPaneWidth * 0.5,
      actionPaneCenterY,
      actionPaneWidth,
      actionPaneHeight,
      0x111a28,
      0.94
    ).setStrokeStyle(1, 0x39556f, 0.5);

    const roomTitle = this.add.text(infoPaneLeft + 14, compact ? infoPaneTop + 16 : infoPaneTop + 18, roomStatus, {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "14px" : "15px",
      color: "#9fb8d2",
      fontStyle: "700",
      wordWrap: { width: infoPaneWidth - 28 }
    }).setOrigin(0, 0.5);
    const roomMetaObjects: Phaser.GameObjects.GameObject[] = [];
    if (compact) {
      roomMetaObjects.push(
        this.add.text(infoPaneLeft + 14, infoPaneTop + 31, `Seat ${seat}  |  ${connectionLabel}`, {
          fontFamily: this.theme.fontUI,
          fontSize: "12px",
          color: roomId ? "#a5efc0" : "#8ea8c3",
          wordWrap: { width: infoPaneWidth - 28 }
        }).setOrigin(0, 0.5)
      );
    } else {
      const chipY = infoPaneTop + 50;
      const chipHeight = 24;
      const chipGap = 8;
      const chipFont = "12px";
      const makeInfoChip = (left: number, label: string, accent: number) => {
        const chipWidth = Math.max(86, Math.min(infoPaneWidth - 28, 24 + label.length * 7));
        const chipBg = this.add.rectangle(left + chipWidth * 0.5, chipY, chipWidth, chipHeight, accent, 0.16)
          .setStrokeStyle(1, accent, 0.72);
        const chipText = this.add.text(left + chipWidth * 0.5, chipY, label, {
          fontFamily: this.theme.fontUI,
          fontSize: chipFont,
          color: "#edf7ff",
          fontStyle: "700"
        }).setOrigin(0.5);
        roomMetaObjects.push(chipBg, chipText);
        return chipWidth;
      };

      let chipLeft = infoPaneLeft + 14;
      chipLeft += makeInfoChip(chipLeft, `Code ${roomId ?? "----"}`, 0x6aadff) + chipGap;
      chipLeft += makeInfoChip(chipLeft, `Seat ${seat}`, 0xff96b2) + chipGap;
      makeInfoChip(chipLeft, `Status ${connectionLabel}`, roomId ? 0x63d690 : 0x667b91);
    }
    const footerHint = this.add.text(infoPaneLeft + 14, compact ? infoPaneTop + 46 : infoPaneTop + 78, "Create a room, join with a code, then start when both seats are ready.", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "12px" : "13px",
      color: "#8ea8c3",
      wordWrap: { width: infoPaneWidth - 28 }
    }).setOrigin(0, 0.5);
    const actionHeader = this.add.text(actionPaneLeft + 14, compact ? actionPaneTop + 14 : actionPaneTop + 16, "Create, join, or launch a room", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "11px" : "12px",
      color: "#94adc7",
      wordWrap: { width: actionPaneWidth - 28 }
    }).setOrigin(0, 0.5);

    const roomControls: Phaser.GameObjects.GameObject[] = [];

    const makeMiniCta = (
      x: number,
      y: number,
      width: number,
      height: number,
      label: string,
      accent: number,
      onClick: () => void
    ) => {
      const bg = this.add.rectangle(x, y, width, height, accent, 0.16)
        .setStrokeStyle(1, accent, 0.72)
        .setInteractive({ useHandCursor: true })
        .on("pointerover", () => bg.setAlpha(0.84))
        .on("pointerout", () => bg.setAlpha(1))
        .on("pointerdown", onClick);
      const text = this.add.text(x, y, label, {
        fontFamily: this.theme.fontUI,
        fontSize: compact ? "12px" : "13px",
        color: "#edf7ff",
        fontStyle: "700"
      }).setOrigin(0.5);
      roomControls.push(bg, text);
    };

    const actionGapX = 10;
    const actionGapY = 10;
    const actionButtonHeight = 28;
    const twoColumn = actionPaneWidth >= 270;
    const actionButtonWidth = twoColumn
      ? Math.floor((actionPaneWidth - 28 - actionGapX) * 0.5)
      : actionPaneWidth - 28;
    const actionStartX = actionPaneLeft + 14 + actionButtonWidth * 0.5;
    const secondColumnX = twoColumn
      ? actionPaneLeft + 14 + actionButtonWidth + actionGapX + actionButtonWidth * 0.5
      : actionStartX;
    const firstRowY = compact ? actionPaneTop + 34 : actionPaneTop + 46;
    const secondRowY = firstRowY + actionButtonHeight + actionGapY;

    makeMiniCta(actionStartX, firstRowY, actionButtonWidth, actionButtonHeight, "Create Room", 0x6aadff, () => {
      connect();
      createGame(this.profileState.playerName);
      this.playTone(340, 0.06);
      reopen();
    });
    makeMiniCta(secondColumnX, firstRowY, actionButtonWidth, actionButtonHeight, "Join Room", 0x6aadff, () => {
      const code = window.prompt("Enter room code:");
      if (!code) return;
      connect();
      joinGame(code.trim().toUpperCase(), this.profileState.playerName);
      this.playTone(320, 0.06);
      reopen();
    });
    makeMiniCta(actionStartX, secondRowY, actionButtonWidth, actionButtonHeight, "Start Match", 0x63d690, () => {
      const rid = getMyRoomId();
      if (!rid) {
        this.statusText.setText("Create or join a room first.");
        return;
      }
      startGame(rid);
      this.playTone(380, 0.08);
      this.closeMenuPage();
    });
    makeMiniCta(secondColumnX, secondRowY, actionButtonWidth, actionButtonHeight, "Copy Code", 0xf2b76b, () => {
      const rid = getMyRoomId();
      if (!rid) {
        this.statusText.setText("Create or join a room before copying a code.");
        return;
      }
      void navigator.clipboard.writeText(rid)
        .then(() => {
          this.statusText.setText(`Room code copied: ${rid}`);
          this.playTone(500, 0.05);
        })
        .catch(() => {
          this.statusText.setText("Could not copy the room code.");
        });
    });

    this.pageContentLayer.add([
      topPanel,
      leftMetric,
      middleMetric,
      rightMetric,
      cardsHeader,
      footerPanel,
      footerHeader,
      footerSubheading,
      infoPane,
      actionPane,
      roomTitle,
      ...roomMetaObjects,
      footerHint,
      actionHeader,
      ...roomControls
    ]);
  }

  private renderTrainingPage(): void {
    if (!this.pageContentLayer) return;
    const bounds = this.getPageContentBounds();
    const compact = bounds.width < 760;
    const catalog = getLessonCatalog();
    const groups: Array<{
      difficulty: "beginner" | "intermediate" | "advanced";
      title: string;
      subtitle: string;
    }> = [
      { difficulty: "beginner", title: "Beginner", subtitle: "Learn the rules and basic piece patterns." },
      { difficulty: "intermediate", title: "Intermediate", subtitle: "Build tactical awareness and board control." },
      { difficulty: "advanced", title: "Advanced", subtitle: "Practice deeper combinations and conversion." }
    ];

    const intro = this.add.rectangle(bounds.centerX, bounds.top + 24, bounds.width, 60, 0x101a28, 0.98)
      .setStrokeStyle(1.1, 0x456381, 0.55);
    const introText = this.add.text(bounds.centerX, bounds.top + 24, "Training lessons are grouped by difficulty. Ready lessons launch immediately; unfinished ones stay visible as coming soon. Use the tabs to jump to a section.", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "15px" : "16px",
      color: "#cfe1f5",
      align: "center",
      wordWrap: { width: bounds.width - 48 }
    }).setOrigin(0.5);
    this.pageContentLayer.add([intro, introText]);

    const tabY = bounds.top + 78;
    const tabHeight = 34;
    const tabGap = 10;
    const tabWidth = compact
      ? Math.floor((bounds.width - tabGap * 2 - 16) / 3)
      : Math.floor((bounds.width - tabGap * 2 - 24) / 3);
    const tabLeft = bounds.left + 12;
    const tabSpecs: Array<{
      difficulty: "beginner" | "intermediate" | "advanced";
      label: string;
      fill: number;
    }> = [
      { difficulty: "beginner", label: "Beginner", fill: 0x6aadff },
      { difficulty: "intermediate", label: "Intermediate", fill: 0x89d4ff },
      { difficulty: "advanced", label: "Advanced", fill: 0xf2b76b }
    ];

    const tabTitle = this.add.text(bounds.left + 16, tabY - 18, "Jump to section", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "11px" : "12px",
      color: "#8fb2d4",
      fontStyle: "700",
      letterSpacing: 1.5
    }).setOrigin(0, 0.5);
    this.pageChromeLayer?.add(tabTitle);

    const tabButtons: Phaser.GameObjects.Rectangle[] = [];
    const tabLabels: Phaser.GameObjects.Text[] = [];
    tabSpecs.forEach((spec, index) => {
      const x = tabLeft + tabWidth * 0.5 + index * (tabWidth + tabGap);
      const button = this.add.rectangle(x, tabY, tabWidth, tabHeight, spec.fill, 0.14)
        .setStrokeStyle(1.2, spec.fill, 0.85)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.scrollTrainingToSection(spec.difficulty);
          this.playTone(360 + index * 35, 0.05);
        });
      const label = this.add.text(x, tabY, spec.label, {
        fontFamily: this.theme.fontUI,
        fontSize: compact ? "13px" : "14px",
        color: "#edf6ff",
        fontStyle: "700"
      }).setOrigin(0.5);
      tabButtons.push(button);
      tabLabels.push(label);
      this.pageChromeLayer?.add([button, label]);
    });

    const columns = compact ? 1 : bounds.width >= 1040 ? 3 : 2;
    const cardGap = 14;
    const rowGap = 12;
    const sectionGap = 18;
    const cardWidth = compact
      ? bounds.width
      : Math.floor((bounds.width - cardGap * (columns - 1)) / columns);
    const cardHeight = compact ? 74 : 72;
    const headerHeight = compact ? 42 : 46;
    const statusStyles: Record<"ready" | "coming-soon", { label: string; fill: number; text: string }> = {
      ready: { label: "READY", fill: 0x63d690, text: "#d9fff0" },
      "coming-soon": { label: "SOON", fill: 0xf2b76b, text: "#fff0cf" }
    };
    const difficultyColors: Record<string, number> = {
      beginner: 0x6aadff,
      intermediate: 0x89d4ff,
      advanced: 0xf2b76b
    };

    let cursorY = bounds.top + 126;
    let contentBottom = cursorY;

    for (const group of groups) {
      const lessons = catalog.filter((lesson) => lesson.difficulty === group.difficulty);
      const sectionTop = cursorY;
      this.trainingSectionTargets[group.difficulty] = sectionTop;
      const sectionHeader = this.add.rectangle(bounds.centerX, sectionTop + 16, bounds.width, headerHeight, 0x101a28, 0.96)
        .setStrokeStyle(1, difficultyColors[group.difficulty], 0.42);
      const sectionTitle = this.add.text(bounds.left + 18, sectionTop + 16, group.title, {
        fontFamily: this.theme.fontUI,
        fontSize: compact ? "17px" : "18px",
        color: "#edf6ff",
        fontStyle: "700"
      }).setOrigin(0, 0.5);
      const sectionSubtitle = this.add.text(bounds.right - 18, sectionTop + 16, group.subtitle, {
        fontFamily: this.theme.fontUI,
        fontSize: compact ? "12px" : "13px",
        color: "#95aeca"
      }).setOrigin(1, 0.5);
      this.pageContentLayer.add([sectionHeader, sectionTitle, sectionSubtitle]);

      lessons.forEach((lesson, index) => {
        const column = compact ? 0 : index % columns;
        const row = compact ? index : Math.floor(index / columns);
        const x = compact
          ? bounds.centerX
          : bounds.left + cardWidth * 0.5 + column * (cardWidth + cardGap);
        const y = sectionTop + headerHeight + 26 + row * (cardHeight + rowGap);
        const status = statusStyles[lesson.status];
        const isReady = lesson.status === "ready";
        const cardAlpha = isReady ? 0.94 : 0.74;
        const card = this.add.rectangle(x, y, cardWidth, cardHeight, 0x162637, cardAlpha)
          .setStrokeStyle(1.1, difficultyColors[group.difficulty], isReady ? 0.72 : 0.42);
        if (isReady) {
          card.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
            this.playTone(430, 0.05);
            this.closeMenuPage();
            void this.startTrainingMode(lesson.registryId);
          });
        } else {
          card.setAlpha(0.68);
        }

        const title = this.add.text(x - cardWidth * 0.5 + 18, y - 14, lesson.title, {
          fontFamily: this.theme.fontUI,
          fontSize: compact ? "18px" : "19px",
          color: "#edf6ff",
          fontStyle: "700"
        }).setOrigin(0, 0.5);
        const description = this.add.text(x - cardWidth * 0.5 + 18, y + 8, lesson.description, {
          fontFamily: this.theme.fontUI,
          fontSize: compact ? "12px" : "13px",
          color: "#c3d8ec",
          wordWrap: { width: cardWidth - 132 }
        }).setOrigin(0, 0.5);
        const meta = this.add.text(x + cardWidth * 0.5 - 18, y - 14, `${lesson.estimatedTime}m`, {
          fontFamily: this.theme.fontUI,
          fontSize: "12px",
          color: "#8fb2d4",
          fontStyle: "700"
        }).setOrigin(1, 0.5);
        const badgeWidth = status.label.length * 8 + 20;
        const badge = this.add.rectangle(x + cardWidth * 0.5 - 54, y + 15, badgeWidth, 22, status.fill, isReady ? 0.2 : 0.14)
          .setStrokeStyle(1, status.fill, 0.72);
        const badgeText = this.add.text(x + cardWidth * 0.5 - 54, y + 15, status.label, {
          fontFamily: this.theme.fontUI,
          fontSize: "11px",
          color: status.text,
          fontStyle: "700"
        }).setOrigin(0.5);

        this.pageContentLayer?.add([card, title, description, meta, badge, badgeText]);
      });

      const rows = Math.max(1, Math.ceil(lessons.length / columns));
      contentBottom = Math.max(contentBottom, sectionTop + headerHeight + 26 + rows * cardHeight + (rows - 1) * rowGap);
      cursorY = contentBottom + sectionGap;
    }

    const viewportBottom = bounds.bottom - 18;
    this.pageScrollMax = Math.max(0, contentBottom - viewportBottom);
    this.syncPageScrollOffset();
    this.applyTrainingTabState(tabSpecs, tabButtons, tabLabels);
  }

  private renderOthersPage(): void {
    if (!this.pageContentLayer) return;
    const bounds = this.getPageContentBounds();
    const compact = bounds.width < 760;
    const intro = this.add.rectangle(bounds.centerX, bounds.top + 24, bounds.width, 60, 0x101a28, 0.98)
      .setStrokeStyle(1.1, 0x456381, 0.55);
    const introText = this.add.text(bounds.centerX, bounds.top + 24, "Utility actions, profile maintenance, and quick project tools live here.", {
      fontFamily: this.theme.fontUI,
      fontSize: compact ? "15px" : "16px",
      color: "#cfe1f5",
      align: "center",
      wordWrap: { width: bounds.width - 48 }
    }).setOrigin(0.5);
    const actions: Array<{ label: string; run: () => void }> = [
      { label: "Reset Stats", run: () => this.resetProfileStats() },
      { label: "Export Snapshot", run: () => this.exportStateSnapshot() },
      { label: "Toggle Demo Audio", run: () => this.playTone(520, 0.12) }
    ];
    this.pageContentLayer.add([intro, introText]);
    actions.forEach((action, i) => {
      const y = bounds.top + 114 + i * 70;
      const btn = this.add
        .rectangle(bounds.centerX, y, bounds.width, 50, 0x132131, 0.92)
        .setStrokeStyle(1.1, 0x86bde8, 0.75)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", action.run);
      const text = this.add
        .text(bounds.left + 22, y, action.label, {
          fontFamily: this.theme.fontUI,
          fontSize: compact ? "19px" : "20px",
          color: "#edf6ff"
        })
        .setOrigin(0, 0.5);
      const suffix = this.add
        .text(bounds.right - 22, y, "OPEN", {
          fontFamily: this.theme.fontUI,
          fontSize: compact ? "13px" : "14px",
          color: "#9fd0ff",
          fontStyle: "700"
        })
        .setOrigin(1, 0.5);
      this.pageContentLayer?.add([btn, text, suffix]);
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

  private showConflictZoneTutorial(message: string): void {
    if (this.conflictZoneTutorialTimer !== null) {
      window.clearTimeout(this.conflictZoneTutorialTimer);
      this.conflictZoneTutorialTimer = null;
    }

    this.turnStateText?.setText(message);
    this.statusText.setText(message);
    this.conflictZoneTutorialTimer = window.setTimeout(() => {
      this.conflictZoneTutorialTimer = null;
      this.refreshStatus();
    }, 4500);
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
      if (!this.engagementZoneDebugEnabled) {
        this.threeBoard.setEngagementZoneNodes(this.state.getEngagementZoneNodeIds(), false);
      }
      this.threeBoard.setHighlightedNodes(null, []);
      this.threeBoard.setSelectedPieceIds([]);
      return;
    }
    const preview = this.state.getInteractionHintsForSelected();
    if (!this.engagementZoneDebugEnabled) {
      this.threeBoard.setEngagementZoneNodes(this.state.getEngagementZoneNodeIds(), preview.mode === "combat");
    }
    // Never highlight the selected piece's own node - only show legal move targets
    this.threeBoard.setHighlightedNodes(
      null,
      preview.legalMoves.map((move) => move.nodeId)
    );
    this.threeBoard.setSelectedPieceIds([selected.id]);
  }

  private getPieceLabel(type: string): string {
    switch (type) {
      case "horse":
        return "PRINCESS";
      case "castle":
        return "CASTLE";
      case "officer":
        return "OFFICER";
      case "vizier":
        return "VIZIER";
      case "warrior":
        return "WARRIOR";
      case "king":
      default:
        return "KING";
    }
  }

  private registerSocketHandlers(): void {
    onRoomCreated((roomId, color) => {
      this.onlineRoomId = roomId;
      this.myOnlineColor = color;
      this.statusText.setText(`Room created: ${roomId} | You are ${color} | Share this code to invite opponents`);
    });

    onJoinedRoom((roomId, color, allColors) => {
      this.onlineRoomId = roomId;
      this.myOnlineColor = color;
      this.statusText.setText(`Joined room ${roomId} | ${color} | Players: ${allColors.join(", ")}`);
    });

    onGameStart(({ playerCount, currentPlayer }) => {
      this.isOnlineGame = true;
      void this.startBattle();
      this.statusText.setText(`Online game! ${playerCount} players | ${currentPlayer} moves first`);
    });

    onBoardUpdate((board, currentPlayer) => {
      if (!this.state || !this.isOnlineGame) return;
      if (board?.pieces && Array.isArray(board.pieces)) {
        this.threeBoard.setPieces(board.pieces);
      }
      this.statusText.setText(`${currentPlayer}'s turn | You are ${this.myOnlineColor ?? "?"}`);
      this.syncBoardHighlights();
    });

    onSocketError((msg) => {
      this.statusText.setText(`Server error: ${msg}`);
    });
  }

  shutdown(): void {
    if (this.isShutdown) {
      return;
    }
    this.isShutdown = true;
    if (this.resizeHandler) {
      this.scale.off("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    this.backgroundLayer.forEach((obj) => obj.destroy());
    this.backgroundLayer = [];
    this.threeBoard.dispose();
    if (this.boardContainer?.parentElement) {
      this.boardContainer.parentElement.removeChild(this.boardContainer);
    }
    this.boardContainer = null;
  }

  private refreshLayerVisibility(): void {
    const isPlaying = this.screenState === "playing";
    const isPageOpen = this.screenState === "menu" && !!this.pageLayer?.visible;
    this.menuLayer?.setVisible(this.screenState === "menu" && !isPageOpen);
    this.pageLayer?.setVisible(isPageOpen);
    this.hudLayer?.setVisible(isPlaying);
    this.mobileLayer?.setVisible(isPlaying && this.isMobile);
  }

  private scrollTrainingPage(deltaY: number): void {
    if (this.pageCurrentName !== "Training" || !this.pageContentLayer) return;
    if (this.pageScrollMax <= 0) return;
    this.pageScrollY = Phaser.Math.Clamp(this.pageScrollY + deltaY * 0.85, 0, this.pageScrollMax);
    this.renderPageContent("Training");
  }

  private scrollTrainingToSection(difficulty: "beginner" | "intermediate" | "advanced"): void {
    if (this.pageCurrentName !== "Training" || !this.pageContentLayer) return;
    const bounds = this.getPageContentBounds();
    const anchorY = bounds.top + 118;
    const target = this.trainingSectionTargets[difficulty] - anchorY;
    this.pageScrollY = Phaser.Math.Clamp(target, 0, this.pageScrollMax);
    this.renderPageContent("Training");
  }

  private syncPageScrollOffset(): void {
    if (!this.pageContentLayer) return;
    this.pageContentLayer.y = this.pageCurrentName === "Training" ? -this.pageScrollY : 0;
  }

  private getTrainingActiveSection(): "beginner" | "intermediate" | "advanced" {
    const advancedCutoff = this.trainingSectionTargets.advanced - 8;
    const intermediateCutoff = this.trainingSectionTargets.intermediate - 8;
    if (this.pageScrollY >= advancedCutoff) return "advanced";
    if (this.pageScrollY >= intermediateCutoff) return "intermediate";
    return "beginner";
  }

  private applyTrainingTabState(
    tabSpecs: Array<{ difficulty: "beginner" | "intermediate" | "advanced"; label: string; fill: number }>,
    tabButtons: Phaser.GameObjects.Rectangle[],
    tabLabels: Phaser.GameObjects.Text[]
  ): void {
    const active = this.getTrainingActiveSection();
    tabSpecs.forEach((spec, index) => {
      const isActive = spec.difficulty === active;
      tabButtons[index]?.setFillStyle(spec.fill, isActive ? 0.32 : 0.14);
      tabButtons[index]?.setStrokeStyle(isActive ? 2 : 1.2, spec.fill, isActive ? 1 : 0.85);
      tabLabels[index]?.setColor(isActive ? "#ffffff" : "#edf6ff");
      tabLabels[index]?.setScale(isActive ? 1.03 : 1);
    });
  }

  private getPageContentBounds(): { centerX: number; centerY: number; width: number; height: number; left: number; right: number; top: number; bottom: number } {
    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height * 0.5;
    const width = Phaser.Math.Clamp(this.scale.width - 120, 640, 980);
    const height = Phaser.Math.Clamp(this.scale.height - 120, 560, 700);
    const left = centerX - width * 0.5;
    const right = centerX + width * 0.5;
    const top = centerY - height * 0.5;
    const bottom = centerY + height * 0.5;
    return { centerX, centerY, width, height, left, right, top, bottom };
  }

  private getPageFrame(): { centerX: number; centerY: number; width: number; height: number; left: number; right: number; top: number; bottom: number } {
    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height * 0.5;
    const width = Phaser.Math.Clamp(this.scale.width - 120, 640, 980);
    const height = Phaser.Math.Clamp(this.scale.height - 120, 560, 700);
    return { centerX, centerY, width, height, left: centerX - width * 0.5, right: centerX + width * 0.5, top: centerY - height * 0.5, bottom: centerY + height * 0.5 };
  }

  private getBoardViewportSize(): { w: number; h: number } {
    const rect = this.scale.canvas?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return { w: rect.width, h: rect.height };
    }
    return { w: this.scale.width, h: this.scale.height };
  }

  private syncBoardOverlayBounds(): void {
    if (!this.boardContainer || !this.scale.canvas) return;
    const canvasRect = this.scale.canvas.getBoundingClientRect();
    const appRect = this.boardContainer.parentElement?.getBoundingClientRect();
    if (!appRect) return;

    Object.assign(this.boardContainer.style, {
      left: `${canvasRect.left - appRect.left}px`,
      top: `${canvasRect.top - appRect.top}px`,
      width: `${canvasRect.width}px`,
      height: `${canvasRect.height}px`
    });
  }
}

export const gameWidth = 1360;
export const gameHeight = 860;
