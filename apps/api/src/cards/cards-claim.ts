import { withSubjectLock } from "../shared/merge-lock.js";
import { hasCardsGeneratedOrInProgress, startGeneratingCards } from "./cards.repo.js";

export async function claimCardsGeneration(topicId: string): Promise<boolean> {
  return withSubjectLock(topicId, async (tx) => {
    if (await hasCardsGeneratedOrInProgress(topicId, tx)) {
      return true;
    }

    await startGeneratingCards(topicId, tx);
    return false;
  });
}
