import { GameState } from './logic';
import { ThreeBoard } from './ThreeBoard';
import { getLesson } from './lessons';
import { HighlightedNode, TrainingLesson, TrainingStep } from './types/training';

export interface FeedbackResult {
  success: boolean;
  message: string;
  nextStep?: boolean;
}

type ResolvedBestPlayMove = {
  from: string;
  to: string;
  explanation?: string;
};

type ResolvedBestPlayContinuation = {
  move_from: string;
  move_to: string;
  explanation?: string;
};

export class TrainingEngine {
  private currentLesson: TrainingLesson | null = null;
  private currentStepIndex: number = 0;
  private currentResolvedStep: TrainingStep | null = null;

  private board: ThreeBoard;
  private gameState: GameState;

  // UI Callbacks
  public onInstructionUpdate?: (instruction: string, current: number, total: number) => void;
  public onStepStart?: (current: number, total: number) => void;
  public onSuccess?: (message: string) => void;
  public onMistake?: (message: string) => void;
  public onLessonComplete?: () => void;

  constructor(board: ThreeBoard, gameState: GameState) {
    this.board = board;
    this.gameState = gameState;
  }

  /**
   * Load a lesson by ID and start from step 0
   */
  async loadLesson(lessonId: string): Promise<void> {
    const lesson = getLesson(lessonId);
    if (!lesson) {
      this.currentLesson = null;
      this.currentStepIndex = 0;
      console.error(`[Training] Failed to load lesson ${lessonId}`);
      return;
    }

    this.currentLesson = lesson;
    this.currentStepIndex = 0;
    console.log(`[Training] Loaded lesson: ${this.currentLesson.title}`);
    this.startCurrentStep();
  }

  public isCurrentStepSelectionOnly(): boolean {
    if (!this.currentLesson) {
      return false;
    }

    const step = this.currentResolvedStep ?? this.currentLesson.steps[this.currentStepIndex];
    if (!step) {
      return false;
    }

    const correctMoves = new Set(step.correctMoves);
    if (correctMoves.size === 0) {
      return false;
    }

    const occupiedCorrectMoves = step.correctMoves.filter((nodeId) => this.gameState.getPieceAtNode(nodeId) !== null);
    if (occupiedCorrectMoves.length !== correctMoves.size) {
      return false;
    }

    const legalCorrectMoves = step.correctMoves.filter((nodeId) =>
      this.gameState.getPieces().some((piece) =>
        this.gameState.getMovesForPieceId(piece.id).some((move) => move.nodeId === nodeId)
      )
    );
    return legalCorrectMoves.length === 0;
  }

  public handleSelectionClick(nodeId: string): FeedbackResult {
    if (!this.currentLesson) {
      return { success: false, message: "No lesson is loaded." };
    }

    const step = this.currentResolvedStep ?? this.currentLesson.steps[this.currentStepIndex];
    const isSelectionOnly = this.isCurrentStepSelectionOnly();
    const isCorrectSelection = step.correctMoves.includes(nodeId) && this.gameState.getPieceAtNode(nodeId) !== null;

    if (!isSelectionOnly || !isCorrectSelection) {
      return { success: false, message: "Select one of the highlighted pieces first." };
    }

    this.onSuccess?.(step.explanation || "Good choice!");
    setTimeout(() => {
      if (this.currentStepIndex < this.currentLesson!.steps.length - 1) {
        this.nextStep();
      } else {
        this.onLessonComplete?.();
      }
    }, 650);

    return { success: true, message: "Correct selection!", nextStep: true };
  }

  private startCurrentStep(): void {
    if (!this.currentLesson) return;

    const step = this.currentLesson.steps[this.currentStepIndex];
    if (!step) return;
    this.currentResolvedStep = this.resolveStep(step);

    // Load the exact lesson position before showing highlights or instructions.
    this.gameState.loadTrainingPosition(this.currentResolvedStep.position);

    // Update board visuals
    this.board.setPieces(this.gameState.getPieces());

    // Apply highlights for this step
    this.applyHighlights(this.currentResolvedStep.highlightedNodes);

    this.onStepStart?.(this.currentStepIndex + 1, this.currentLesson.steps.length);

    // Notify UI
    this.onInstructionUpdate?.(
      step.instruction,
      this.currentStepIndex + 1,
      this.currentLesson.steps.length
    );
  }

  private applyHighlights(highlights: HighlightedNode[]): void {
    this.board.setTrainingHighlights(highlights.map((highlight) => ({
      nodeId: highlight.nodeId,
      type: highlight.type
    })));
  }

  /**
   * Called when player makes a move on the board
   */
  public handlePlayerMove(fromNodeId: string, toNodeId: string): FeedbackResult {
    if (!this.currentLesson) {
      return { success: false, message: "No lesson is loaded." };
    }

    const step = this.currentResolvedStep ?? this.currentLesson.steps[this.currentStepIndex];

    // Stricter enforcement: check expectedColor
    if (step.expectedColor) {
      const piece = this.gameState.getPieceAtNode(fromNodeId);
      if (!piece || piece.color !== step.expectedColor) {
        this.onMistake?.(`You must move a ${step.expectedColor?.replace(/\d/, '')} piece.`);
        return { success: false, message: `You must move a ${step.expectedColor?.replace(/\d/, '')} piece.` };
      }
    }

    // `withWhiteButton` is currently instructional metadata. The board has no
    // white-button input state yet, so color and target validation remain the
    // enforceable checks for these lesson steps.

    if (step.correctMoves.includes(toNodeId)) {
      // Success!
      this.onSuccess?.(step.explanation || "Well done!");

      // Auto advance after success (with small delay for feedback)
      setTimeout(() => {
        if (this.currentStepIndex < this.currentLesson!.steps.length - 1) {
          this.nextStep();
        } else {
          this.onLessonComplete?.();
        }
      }, 900);

      return { success: true, message: "Correct move!", nextStep: true };
    } else {
      // Mistake
      this.onMistake?.(step.mistakeFeedback || "That's not the correct move. Try again.");
      return { success: false, message: step.mistakeFeedback || "Not the correct move. Try again." };
    }
  }

  /**
   * Show the best continuation for current step
   */
  public async showBestPlay(): Promise<void> {
    if (!this.currentLesson) return;

    const step = this.currentResolvedStep ?? this.currentLesson.steps[this.currentStepIndex];
    const sequence = this.getBestPlaySequence(step);
    if (sequence.length === 0) {
      this.onMistake?.("No best play sequence available for this step.");
      return;
    }

    for (const move of sequence) {
      this.gameState.selectPieceAtNode(move.from);
      const result = this.gameState.tryMoveSelected(move.to);
      if (!result) {
        break;
      }

      this.board.animateMove(result.pieceId, result.toNodeId, 320);
      if (move.explanation) {
        this.onSuccess?.(move.explanation);
      }
      await this.sleep(360);
      this.board.setPieces(this.gameState.getPieces());
      await this.sleep(160);
    }

    this.startCurrentStep();
  }

  /**
   * Go to next step
   */
  public nextStep(): void {
    if (!this.currentLesson) return;

    if (this.currentStepIndex < this.currentLesson.steps.length - 1) {
      this.currentStepIndex++;
      this.startCurrentStep();
    } else {
      this.onLessonComplete?.();
    }
  }

  public getCurrentStep(): TrainingStep | null {
    return this.currentLesson?.steps[this.currentStepIndex] || null;
  }

  public getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  public getTotalSteps(): number {
    return this.currentLesson?.steps.length ?? 0;
  }

  public resetLesson(): void {
    this.currentStepIndex = 0;
    this.startCurrentStep();
  }

  public getHint(): string {
    const step = this.getCurrentStep();
    return step?.hint || "Look at the highlighted positions.";
  }

  public isLessonComplete(): boolean {
    return this.currentLesson !== null &&
           this.currentStepIndex >= this.currentLesson.steps.length - 1;
  }

  public exit(): void {
    this.currentLesson = null;
    this.currentStepIndex = 0;
    this.currentResolvedStep = null;
  }

  public getCurrentLesson(): TrainingLesson | null {
    return this.currentLesson;
  }

  private getBestPlaySequence(step: TrainingStep): ResolvedBestPlayMove[] {
    if (step.bestContinuationWithExplanation?.length) {
      return step.bestContinuationWithExplanation.map((move) => ({
        from: move.move_from,
        to: move.move_to,
        ...(move.explanation ? { explanation: move.explanation } : {})
      }));
    }

    if (!step.bestContinuation || step.bestContinuation.length < 2) {
      return [];
    }

    const sequence: ResolvedBestPlayMove[] = [];
    for (let index = 0; index < step.bestContinuation.length - 1; index += 2) {
      const from = step.bestContinuation[index];
      const to = step.bestContinuation[index + 1];
      sequence.push({ from, to });
    }
    return sequence;
  }

  private resolveStep(step: TrainingStep): TrainingStep {
    return {
      ...step,
      position: step.position
        .map((piece) => {
          const nodeId = this.gameState.resolveNodeId(piece.nodeId);
          if (!nodeId) return null;
          return { ...piece, nodeId };
        })
        .filter((piece): piece is typeof step.position[number] => piece !== null),
      highlightedNodes: step.highlightedNodes
        .map((highlight) => {
          const nodeId = this.gameState.resolveNodeId(highlight.nodeId);
          if (!nodeId) return null;
          return { ...highlight, nodeId };
        })
        .filter((highlight): highlight is typeof step.highlightedNodes[number] => highlight !== null),
      correctMoves: step.correctMoves
        .map((nodeId) => this.gameState.resolveNodeId(nodeId))
        .filter((nodeId): nodeId is string => nodeId !== null),
      bestContinuation: step.bestContinuation
        ? step.bestContinuation
            .map((nodeId) => this.gameState.resolveNodeId(nodeId))
            .filter((nodeId): nodeId is string => nodeId !== null)
        : undefined,
      bestContinuationWithExplanation: step.bestContinuationWithExplanation
        ? step.bestContinuationWithExplanation
            .map((move) => {
              const moveFrom = this.gameState.resolveNodeId(move.move_from);
              const moveTo = this.gameState.resolveNodeId(move.move_to);
              if (!moveFrom || !moveTo) return null;
              return {
                move_from: moveFrom,
                move_to: moveTo,
                ...(move.explanation ? { explanation: move.explanation } : {})
              };
            })
            .filter((move): move is ResolvedBestPlayContinuation => move !== null)
        : undefined
    };
  }

  private sleep(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, durationMs);
    });
  }
}
