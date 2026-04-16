import newGameSetup from './beginner/new-game-setup.json';
import turnOrderEnforcement from './beginner/turn-order-enforcement.json';
import { TrainingLesson } from '../types/training';

// Import beginner lessons
import areaBarrier101 from './beginner/01-area-barrier-101.json';
import warriorMovement from './beginner/02-warrior-movement.json';
import kingOfficerIntro from './beginner/03-king-officer-intro.json';
import vizierIntro from './beginner/04-vizier-intro.json';
import princessJump from './beginner/05-princess-jump.json';

// Import intermediate lessons
import zoneControl from './intermediate/06-zone-control.json';
import tenCaptureRule from './intermediate/07-10-capture-threat.json';
import kingSafety from './intermediate/08-king-safety.json';
import coordinatedAttack from './intermediate/09-coordinated-attack.json';
import endgameConversion from './intermediate/10-endgame-conversion.json';
import advancedTacticsForks from './intermediate/11-advanced-tactics-forks.json';

// Import advanced lessons
import advancedTactics from './advanced/11-advanced-tactics.json';
import sacrificeBreakthrough from './advanced/12-sacrifice-and-breakthrough.json';

/**
 * All available training lessons
 */
const LESSONS: Record<string, TrainingLesson> = {
  '01-area-barrier-101': areaBarrier101 as TrainingLesson,
  '02-warrior-movement': warriorMovement as TrainingLesson,
  '03-king-officer-intro': kingOfficerIntro as TrainingLesson,
  '04-vizier-intro': vizierIntro as TrainingLesson,
  '05-princess-jump': princessJump as TrainingLesson,
  'new-game-setup': newGameSetup as TrainingLesson,
  'turn-order-enforcement': turnOrderEnforcement as TrainingLesson,
  '06-zone-control': zoneControl as TrainingLesson,
  '07-10-capture-threat': tenCaptureRule as TrainingLesson,
  '08-king-safety': kingSafety as TrainingLesson,
  '09-coordinated-attack': coordinatedAttack as TrainingLesson,
  '10-endgame-conversion': endgameConversion as TrainingLesson,
  '11-advanced-tactics-forks': advancedTacticsForks as TrainingLesson,
  '11-advanced-tactics': advancedTactics as TrainingLesson,
  '12-sacrifice-and-breakthrough': sacrificeBreakthrough as TrainingLesson,
};

export type TrainingLessonStatus = 'ready' | 'coming-soon';

export interface TrainingLessonCatalogEntry extends TrainingLesson {
  registryId: string;
  status: TrainingLessonStatus;
}

function isLessonReady(lesson: TrainingLesson): boolean {
  return lesson.steps.length > 0 && lesson.steps.every((step) => step.position.length > 0);
}

/**
 * Get a lesson by ID
 */
export function getLesson(lessonId: string): TrainingLesson | null {
  if (LESSONS[lessonId]) {
    return LESSONS[lessonId];
  }
  return Object.values(LESSONS).find((lesson) => lesson.id === lessonId) || null;
}

/**
 * Get all available lessons
 */
export function getAllLessons(): TrainingLesson[] {
  return Object.values(LESSONS);
}

/**
 * Get all lessons with readiness metadata
 */
export function getLessonCatalog(): TrainingLessonCatalogEntry[] {
  const difficultyOrder: Record<TrainingLesson['difficulty'], number> = {
    beginner: 0,
    intermediate: 1,
    advanced: 2
  };

  return Object.entries(LESSONS)
    .map(([registryId, lesson]) => {
      const status: TrainingLessonStatus = isLessonReady(lesson) ? 'ready' : 'coming-soon';
      return {
        registryId,
        ...lesson,
        status
      };
    })
    .sort((left, right) => {
      const diff = difficultyOrder[left.difficulty] - difficultyOrder[right.difficulty];
      if (diff !== 0) return diff;
      return left.id.localeCompare(right.id);
    });
}

/**
 * Check whether a lesson is fully playable.
 */
export function isLessonPlayable(lessonId: string): boolean {
  const lesson = getLesson(lessonId);
  return !!lesson && isLessonReady(lesson);
}

/**
 * Get lessons by difficulty
 */
export function getLessonsByDifficulty(difficulty: 'beginner' | 'intermediate' | 'advanced'): TrainingLesson[] {
  return Object.values(LESSONS).filter(lesson => lesson.difficulty === difficulty);
}

/**
 * Get beginner lessons
 */
export function getBeginnerLessons(): TrainingLesson[] {
  return getLessonsByDifficulty('beginner');
}

/**
 * Get intermediate lessons
 */
export function getIntermediateLessons(): TrainingLesson[] {
  return getLessonsByDifficulty('intermediate');
}

/**
 * Get advanced lessons
 */
export function getAdvancedLessons(): TrainingLesson[] {
  return getLessonsByDifficulty('advanced');
}

export default LESSONS;
