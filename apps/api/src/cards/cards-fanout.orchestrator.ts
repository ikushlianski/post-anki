import { log } from "../shared/log.js";
import { claimCardsGeneration } from "./cards-claim.js";
import { compileCards } from "./cards-compile.orchestrator.js";

// Same claim as maybeStartCardsInBackground, but awaits compileCards so a fan-out caller can cap concurrency.
export async function startCardsInBackgroundAndWait(topicId: string): Promise<void> {
  const alreadyClaimed = await claimCardsGeneration(topicId);

  if (alreadyClaimed) {
    return;
  }

  await compileCards(topicId);
}

// Caps concurrent card-generation LLM calls when many topics flip on at once.
export const CARDS_FANOUT_CONCURRENCY = 3;

// In-process fan-out; one topic's failure never stalls the rest.
export async function startCardsForTopicsWithConcurrencyCap(topicIds: string[]): Promise<void> {
  for (let i = 0; i < topicIds.length; i += CARDS_FANOUT_CONCURRENCY) {
    const batch = topicIds.slice(i, i + CARDS_FANOUT_CONCURRENCY);

    await Promise.all(
      batch.map((topicId) =>
        startCardsInBackgroundAndWait(topicId).catch((err) =>
          log.error({ err, topicId }, "cards_fanout_trigger_failed"),
        ),
      ),
    );
  }
}
