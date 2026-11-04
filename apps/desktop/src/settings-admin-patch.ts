import type { AdminSettings, AdminSettingsPatch, ModelTier } from "@/api/settings-commands";
import {
  formatSteps,
  NEW_CARDS_RANGE,
  parseRetentionPercent,
  parseSteps,
  parseWholeInRange,
  retentionToPercent,
  type ParseResult,
} from "@/settings-values";

export type AdminDraft = {
  modelTier: ModelTier;
  newCards: string;
  learningSteps: string;
  relearningSteps: string;
  retention: string;
};

export function draftFromAdminSettings(settings: AdminSettings): AdminDraft {
  return {
    modelTier: settings.modelTier ?? "cheap",
    newCards: String(settings.newCardsPerDay ?? NEW_CARDS_RANGE.min),
    learningSteps: formatSteps(settings.learningStepsMinutes ?? []),
    relearningSteps: formatSteps(settings.relearningStepsMinutes ?? []),
    retention: retentionToPercent(settings.desiredRetention ?? 0.9),
  };
}

export function buildAdminPatch(
  draft: AdminDraft,
  saved: AdminSettings,
): ParseResult<AdminSettingsPatch> {
  const patch: AdminSettingsPatch = {};

  if (saved.modelTier !== null && draft.modelTier !== saved.modelTier) {
    patch.modelTier = draft.modelTier;
  }

  if (saved.newCardsPerDay !== null) {
    const newCards = parseWholeInRange(
      draft.newCards,
      NEW_CARDS_RANGE,
      `New cards per day must be a whole number from ${NEW_CARDS_RANGE.min} to ${NEW_CARDS_RANGE.max}.`,
    );

    if (!newCards.ok) {
      return newCards;
    }

    if (newCards.value !== saved.newCardsPerDay) {
      patch.newCardsPerDay = newCards.value;
    }
  }

  if (saved.learningStepsMinutes !== null) {
    const learning = parseSteps(draft.learningSteps);

    if (!learning.ok) {
      return learning;
    }

    if (formatSteps(learning.value) !== formatSteps(saved.learningStepsMinutes)) {
      patch.learningStepsMinutes = learning.value;
    }
  }

  if (saved.relearningStepsMinutes !== null) {
    const relearning = parseSteps(draft.relearningSteps);

    if (!relearning.ok) {
      return relearning;
    }

    if (formatSteps(relearning.value) !== formatSteps(saved.relearningStepsMinutes)) {
      patch.relearningStepsMinutes = relearning.value;
    }
  }

  if (saved.desiredRetention !== null) {
    const retention = parseRetentionPercent(draft.retention);

    if (!retention.ok) {
      return retention;
    }

    if (retentionToPercent(retention.value) !== retentionToPercent(saved.desiredRetention)) {
      patch.desiredRetention = retention.value;
    }
  }

  return { ok: true, value: patch };
}
