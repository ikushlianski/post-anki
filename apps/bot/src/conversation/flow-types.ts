import type { QuestionKind } from "@post-anki/shared";

export interface Pending {
  topicId: string;
  gapId: string | null;
  mode: QuestionKind;
}

export interface SubmitAnswerInput {
  topicId: string;
  gapId: string | null;
  mode: QuestionKind;
  answer: string;
}
