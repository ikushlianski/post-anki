import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { embedVariantsForTopic } from "./cards-embedding.orchestrator.js";
import { generateAndStoreCards } from "./cards-compile.orchestrator.js";
import { cardsCompileRequestedEvent } from "./cards-inngest.events.js";
import {
  CARDS_COMPILE_CONCURRENCY,
  CARDS_COMPILE_FINISH_TIMEOUT,
  CARDS_COMPILE_RETRIES,
  CARDS_COMPILE_START_TIMEOUT,
  CARDS_COMPILE_THROTTLE,
  CARDS_TIMEOUT_SWEEP_DELAY,
} from "./cards-inngest.limits.js";
import {
  failStaleGeneratingCards,
  GENERATING_STALE_THRESHOLD_MS,
  setCardsStatus,
  touchGeneratingCards,
} from "./cards.repo.js";

export const CARDS_TIMEOUT_SWEEP_CUTOFF_MS = GENERATING_STALE_THRESHOLD_MS;

const FUNCTION_CANCELLED_EVENT = "inngest/function.cancelled";

const inngest = createInngestClient();

export const cardsCompileFunction = inngest.createFunction(
  {
    id: "cards-compile",
    retries: CARDS_COMPILE_RETRIES,
    triggers: [{ event: cardsCompileRequestedEvent }],
    concurrency: [
      { limit: CARDS_COMPILE_CONCURRENCY },
      { key: "event.data.topicId", limit: 1 },
    ],
    throttle: CARDS_COMPILE_THROTTLE,
    singleton: { key: "event.data.topicId", mode: "skip" },
    timeouts: { start: CARDS_COMPILE_START_TIMEOUT, finish: CARDS_COMPILE_FINISH_TIMEOUT },
    onFailure: async ({ event }) => {
      const { topicId } = event.data.event.data;

      try {
        await setCardsStatus(topicId, "failed");
      } catch (err) {
        log.error({ err, topicId }, "cards_compile_inngest_on_failure_failed");
      }
    },
  },
  async ({ event, step }) => {
    const { topicId } = event.data;

    const begun = await step.run("begin", async () =>
      (await touchGeneratingCards(topicId)) ? ("started" as const) : ("skipped" as const),
    );

    if (begun === "skipped") {
      return { status: "skipped" as const, cards: 0 };
    }

    const compiled = await step.run("compile", async () => ({
      cards: await generateAndStoreCards(topicId),
    }));

    await step.run("embed", async () => {
      try {
        await embedVariantsForTopic(topicId);

        return "done" as const;
      } catch (err) {
        log.error({ err, topicId }, "cards_embedding_failed");

        return "failed" as const;
      }
    });

    return { status: "done" as const, cards: compiled.cards };
  },
);

export const cardsCompileTimeoutHandler = inngest.createFunction(
  {
    id: "cards-compile-timeout",
    retries: 1,
    triggers: [
      {
        event: FUNCTION_CANCELLED_EVENT,
        if: `event.data.function_id == '${cardsCompileFunction.id(inngest.id)}'`,
      },
    ],
  },
  async ({ step }) => {
    await step.sleep("wait-for-owners", CARDS_TIMEOUT_SWEEP_DELAY);

    const failed = await step.run("fail-stale-generating", () =>
      failStaleGeneratingCards(CARDS_TIMEOUT_SWEEP_CUTOFF_MS),
    );

    return { failed };
  },
);
