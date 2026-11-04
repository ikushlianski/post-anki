import { invoke } from "@tauri-apps/api/core";

export type ReviewGrade = "again" | "hard" | "good" | "easy";

export const REVIEW_GRADES: readonly ReviewGrade[] = ["again", "hard", "good", "easy"];

export type CardPhase = "new" | "learning" | "review" | "relearning";

export type IntervalPreview = Record<ReviewGrade, number>;

export type ReviewCard = {
  id: string;
  knowledgeBitId: string;
  question: string;
  answer: string;
  phase: CardPhase | string;
  cardKey: unknown | null;
  intervals: IntervalPreview | null;
};

export type ReviewCounts = { new: number; learning: number; review: number };

export type ReviewBatch = {
  cards: ReviewCard[];
  offline: boolean;
  pending: number;
  counts: ReviewCounts | null;
};

export type ReviewScope = { subjectId: string | null; aheadDays: number };

export type SyncStatus = { pending: number };

export type UndoOutcome = { card: ReviewCard; pending: number };

export type SubjectDueCount = { subjectId: string; dueCount: number; newCount: number };

export type SubjectDueCounts = {
  subjects: SubjectDueCount[];
  unsorted: { dueCount: number; newCount: number };
  newRemainingToday: number;
};

export type ControlAction = "bury" | "suspend";

export function getDueCards(scope: ReviewScope): Promise<ReviewBatch> {
  return invoke<ReviewBatch>("get_due_cards", { scope });
}

export function gradeCard(card: ReviewCard, grade: ReviewGrade, scope: ReviewScope): Promise<SyncStatus> {
  return invoke<SyncStatus>("grade_card", { cardId: card.id, grade, scope, card });
}

export function syncPendingGrades(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_pending_grades");
}

export function undoLastGrade(scope: ReviewScope): Promise<UndoOutcome> {
  return invoke<UndoOutcome>("undo_last_grade", { scope });
}

export function controlCard(card: ReviewCard, action: ControlAction): Promise<void> {
  const variantId = card.cardKey === null ? null : card.id;

  return invoke<void>("control_card", {
    knowledgeBitId: card.knowledgeBitId,
    variantId,
    action,
  });
}

export function editCard(variantId: string, question: string, answer: string): Promise<{ prompt: string; answer: string }> {
  return invoke<{ prompt: string; answer: string }>("edit_card", { variantId, question, answer });
}

export function getReviewDueCounts(): Promise<SubjectDueCounts> {
  return invoke<SubjectDueCounts>("get_review_due_counts");
}
