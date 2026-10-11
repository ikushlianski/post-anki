import type { KnowledgeBitFeedbackReason, KnowledgeBitFeedbackVerdict } from "@post-anki/shared";

export const FEEDBACK_SNAPSHOT_MAX_CHARS = 600;
export const FEEDBACK_RECENT_WINDOW = 50;
export const FEEDBACK_REJECTION_LIMIT = 8;
export const FEEDBACK_APPROVAL_LIMIT = 5;

export interface FeedbackRow {
  verdict: KnowledgeBitFeedbackVerdict;
  reasonCode: KnowledgeBitFeedbackReason | null;
  statement: string;
  front: string | null;
  back: string | null;
}

export interface RecentFeedback {
  recent: FeedbackRow[];
  approved: FeedbackRow[];
}
