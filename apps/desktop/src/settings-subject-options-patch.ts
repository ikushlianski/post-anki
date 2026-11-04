import type {
  DetailLevel,
  StudyIntent,
  SubjectStudyOptions,
  SubjectStudyOptionsPatch,
} from "@/api/settings-commands";
import {
  formatSteps,
  NEW_CARDS_RANGE,
  parseExamDate,
  parseRetentionPercent,
  parseSteps,
  parseWholeInRange,
  retentionToPercent,
  type ParseResult,
} from "@/settings-values";

export type IntentChoice = StudyIntent | "inherit";

export type SubjectOptionsDraft = {
  intent: IntentChoice;
  examDate: string;
  retention: string;
  newCards: string;
  learningSteps: string;
  relearningSteps: string;
  detailLevel: DetailLevel;
  hinting: boolean;
};

const DEFAULT_DETAIL_LEVEL: DetailLevel = "standard";
const DEFAULT_HINTING = true;

export function draftFromOptions(options: SubjectStudyOptions): SubjectOptionsDraft {
  return {
    intent: options.own.studyIntent ?? "inherit",
    examDate: options.own.examDate ?? options.intent.examDate ?? "",
    retention: retentionToPercent(options.effective.desiredRetention),
    newCards: String(options.effective.newCardsPerDay),
    learningSteps: formatSteps(options.effective.learningStepsMinutes),
    relearningSteps: formatSteps(options.effective.relearningStepsMinutes),
    detailLevel: options.own.detailLevel ?? DEFAULT_DETAIL_LEVEL,
    hinting: options.own.hintingEnabled ?? DEFAULT_HINTING,
  };
}

export function buildSubjectOptionsPatch(
  draft: SubjectOptionsDraft,
  options: SubjectStudyOptions,
): ParseResult<SubjectStudyOptionsPatch> {
  const patch: SubjectStudyOptionsPatch = {};
  const intent = draft.intent === "inherit" ? null : draft.intent;

  if (intent !== options.own.studyIntent) {
    patch.studyIntent = intent;
  }

  if (intent === "exam") {
    const examDate = parseExamDate(draft.examDate);

    if (!examDate.ok) {
      return examDate;
    }

    if (examDate.value !== options.own.examDate) {
      patch.examDate = examDate.value;
    }
  } else if (options.own.examDate !== null) {
    patch.examDate = null;
  }

  const retention = parseRetentionPercent(draft.retention);

  if (!retention.ok) {
    return retention;
  }

  if (retentionToPercent(retention.value) !== retentionToPercent(options.effective.desiredRetention)) {
    patch.desiredRetention = retention.value;
  }

  const newCards = parseWholeInRange(
    draft.newCards,
    NEW_CARDS_RANGE,
    `New cards per day must be a whole number from ${NEW_CARDS_RANGE.min} to ${NEW_CARDS_RANGE.max}.`,
  );

  if (!newCards.ok) {
    return newCards;
  }

  if (newCards.value !== options.effective.newCardsPerDay) {
    patch.newCardsPerDay = newCards.value;
  }

  const learning = parseSteps(draft.learningSteps);

  if (!learning.ok) {
    return learning;
  }

  if (formatSteps(learning.value) !== formatSteps(options.effective.learningStepsMinutes)) {
    patch.learningStepsMinutes = learning.value;
  }

  const relearning = parseSteps(draft.relearningSteps);

  if (!relearning.ok) {
    return relearning;
  }

  if (formatSteps(relearning.value) !== formatSteps(options.effective.relearningStepsMinutes)) {
    patch.relearningStepsMinutes = relearning.value;
  }

  if (draft.detailLevel !== (options.own.detailLevel ?? DEFAULT_DETAIL_LEVEL)) {
    patch.detailLevel = draft.detailLevel;
  }

  if (draft.hinting !== (options.own.hintingEnabled ?? DEFAULT_HINTING)) {
    patch.hintingEnabled = draft.hinting;
  }

  return { ok: true, value: patch };
}
