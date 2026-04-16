import { Piece, PieceColor, PieceType } from '../types';

/**
 * Piece placement for training positions
 */
export interface PiecePlacement {
  id: string;
  type: PieceType;
  color: PieceColor;
  nodeId: string;
}

/**
 * Highlight type for board nodes
 */
export type HighlightType = 'move' | 'capture' | 'strategic' | 'blocked';

/**
 * Individual highlighted node with type
 */
export interface HighlightedNode {
  nodeId: string;
  type: HighlightType;
}

/**
 * Single step in a training lesson
 */
export interface TrainingStep {
  stepId: number;
  title: string;
  instruction: string; // Short text shown to player
  explanation: string; // Shown after correct move
  position: PiecePlacement[]; // Initial board state for this step
  highlightedNodes: HighlightedNode[];
  correctMoves: string[]; // Node IDs that are accepted as solution
  bestContinuation?: string[]; // Move sequence for "Show Best Play"
  bestContinuationWithExplanation?: Array<{
    move_from: string;
    move_to: string;
    explanation?: string;
  }>;
  hint?: string;
  mistakeFeedback?: string;
  expectedColor?: PieceColor;
  withWhiteButton?: boolean;
}

/**
 * Complete training lesson with metadata
 */
export interface TrainingLesson {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  steps: TrainingStep[];
  estimatedTime: number; // in minutes
}

/**
 * Result of player move in training
 */
export interface FeedbackResult {
  success: boolean;
  message: string;
  explanation?: string;
  canAdvance?: boolean;
}

/**
 * Training mode state
 */
export interface TrainingState {
  lessonId: string | null;
  currentStepIndex: number;
  isActive: boolean;
  completed: boolean;
}
