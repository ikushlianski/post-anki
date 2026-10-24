import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { isDurableCardsEnabled } from "../shared/durable-flags.js";
import { mapWithConcurrency } from "../shared/map-with-concurrency.js";
import { claimCardsGeneration } from "./cards-claim.js";
import { compileCards } from "./cards-compile.orchestrator.js";
import {
  CARDS_FANOUT_CONCURRENCY,
  startCardsForTopicsWithConcurrencyCap,
} from "./cards-fanout.orchestrator.js";
import { cardsCompileRequestedEvent } from "./cards-inngest.events.js";

export interface CardsStarterDeps {
  isDurable: () => boolean;
  sendEvents: (topicIds: string[]) => Promise<void>;
  runInProcess: (topicId: string) => Promise<void>;
  claim: (topicId: string) => Promise<boolean>;
  fanoutInProcess: (topicIds: string[]) => Promise<void>;
}

function defaultDeps(): CardsStarterDeps {
  return {
    isDurable: () => isDurableCardsEnabled(),
    sendEvents: async (topicIds) => {
      const claimMs = Date.now();

      await createInngestClient().send(
        topicIds.map((topicId) => ({
          name: cardsCompileRequestedEvent.name,
          id: `cards-${topicId}-${claimMs}`,
          data: { topicId },
        })),
      );
    },
    runInProcess: compileCards,
    claim: claimCardsGeneration,
    fanoutInProcess: startCardsForTopicsWithConcurrencyCap,
  };
}

function runDetached(topicId: string, deps: CardsStarterDeps): void {
  void deps
    .runInProcess(topicId)
    .catch((err) => log.error({ err, topicId }, "cards_compile_dispatch_failed"));
}

// The caller has already claimed the topic; this only dispatches the compile.
export async function startCardsBackground(
  topicId: string,
  deps: CardsStarterDeps = defaultDeps(),
): Promise<void> {
  if (!deps.isDurable()) {
    runDetached(topicId, deps);

    return;
  }

  try {
    await deps.sendEvents([topicId]);
  } catch (err) {
    log.error({ err, topicId }, "cards_compile_event_send_failed");
    await deps
      .runInProcess(topicId)
      .catch((runErr) => log.error({ err: runErr, topicId }, "cards_compile_dispatch_failed"));
  }
}

export const startCardsManuallyDurable = startCardsBackground;

export async function startCardsForTopics(
  topicIds: string[],
  deps: CardsStarterDeps = defaultDeps(),
): Promise<void> {
  if (!deps.isDurable()) {
    return deps.fanoutInProcess(topicIds);
  }

  const claims = await mapWithConcurrency(topicIds, CARDS_FANOUT_CONCURRENCY, async (topicId) => ({
    topicId,
    alreadyClaimed: await deps.claim(topicId),
  }));
  const claimed: string[] = [];

  claims.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      log.error({ err: outcome.reason, topicId: topicIds[index] }, "cards_fanout_trigger_failed");

      return;
    }

    if (!outcome.value.alreadyClaimed) {
      claimed.push(outcome.value.topicId);
    }
  });

  if (claimed.length === 0) {
    return;
  }

  try {
    await deps.sendEvents(claimed);
  } catch (err) {
    log.error({ err }, "cards_compile_event_send_failed");
    await mapWithConcurrency(claimed, CARDS_FANOUT_CONCURRENCY, deps.runInProcess);
  }
}
