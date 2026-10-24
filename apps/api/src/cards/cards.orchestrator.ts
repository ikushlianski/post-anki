import type { TopicCardSet } from "@post-anki/shared";
import { withSubjectLock } from "../shared/merge-lock.js";
import { claimCardsGeneration } from "./cards-claim.js";
import { startCardsBackground, startCardsManuallyDurable } from "./cards.starter.js";
import { getCardsByTopic, hasCardsGeneratedOrInProgress, startGeneratingCards } from "./cards.repo.js";

export { buildCardsPrompt, compileCards } from "./cards-compile.orchestrator.js";
export {
  startCardsForTopicsWithConcurrencyCap,
  startCardsInBackgroundAndWait,
} from "./cards-fanout.orchestrator.js";

// Unlike the explicit "Generate cards" button, a background trigger must
// never queue a duplicate generation on top of one already ready or in flight.
// Serialized per topic via withSubjectLock.
export async function maybeStartCardsInBackground(topicId: string): Promise<void> {
  const alreadyClaimed = await claimCardsGeneration(topicId);

  if (alreadyClaimed) {
    return;
  }

  await startCardsBackground(topicId);
}

export interface StartCardsManuallyResult {
  cardSet: TopicCardSet;
  alreadyInProgress: boolean;
}

// Same per-topic lock as the background trigger, but unlike it, a manual
// click against a "ready" set is a deliberate regenerate, not a duplicate.
export async function startCardsManually(topicId: string): Promise<StartCardsManuallyResult> {
  const result = await withSubjectLock(topicId, async (tx) => {
    const existing = await getCardsByTopic(topicId, tx);

    if (existing?.status === "generating" && (await hasCardsGeneratedOrInProgress(topicId, tx))) {
      return { cardSet: existing, alreadyInProgress: true };
    }

    const cardSet = await startGeneratingCards(topicId, tx);
    return { cardSet, alreadyInProgress: false };
  });

  if (!result.alreadyInProgress) {
    await startCardsManuallyDurable(topicId);
  }

  return result;
}
