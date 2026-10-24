import { NonRetriableError } from "inngest";
import { z } from "zod";
import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { GENERIC_FAILURE_REASON, safeFailureReason } from "./durable-extraction.config.js";
import {
  claimStep,
  failStep,
  planStep,
  type DurableSourceSnapshot,
  type DurableStepDeps,
} from "./durable-extraction.steps.js";
import {
  claimOrLoadSourceForExtraction,
  failSourceByEngineRunId,
  failSourceOwnedByWorkflow,
  getKnowledgeSourceRawText,
} from "./knowledge-bit.repo.js";
import { runKnowledgeBitSourceItems } from "../mastra/knowledge-bit-source-items.agent.js";
import { defaultGenerateItemsDeps } from "./detect-knowledge-bits.orchestrator.js";
import {
  extractionCancelRequestedEvent,
  extractionRequestedEvent,
} from "./extraction-inngest.events.js";
import { toChunkError } from "./extraction-inngest.errors.js";
import {
  EXTRACTION_FINISH_TIMEOUT,
  EXTRACTION_RETRIES,
  EXTRACTION_START_TIMEOUT,
  EXTRACTION_THROTTLE,
} from "./extraction-inngest.limits.js";
import { chunkInsertStep, finishCountsStep } from "./extraction-inngest.steps.js";

const FUNCTION_CANCELLED_EVENT = "inngest/function.cancelled";
const cancelledRunSchema = z.object({ run_id: z.string().min(1) });

const inngest = createInngestClient();

function stepDeps(engineRunId: string): DurableStepDeps {
  return {
    ...defaultGenerateItemsDeps(),
    writeItems: (chunk, options) =>
      runKnowledgeBitSourceItems(chunk, { ...options, retryRateLimit: false }),
    claimOrLoad: (sourceId, options) => claimOrLoadSourceForExtraction(sourceId, { ...options, engineRunId }),
    loadRawText: getKnowledgeSourceRawText,
  };
}

export const extractionInngestFunction = inngest.createFunction(
  {
    id: "extract-knowledge-source",
    retries: EXTRACTION_RETRIES,
    idempotency: "event.id",
    triggers: [{ event: extractionRequestedEvent }],
    concurrency: [
      { limit: 2 },
      { key: "event.data.sourceId", limit: 1 },
    ],
    throttle: EXTRACTION_THROTTLE,
    singleton: { key: "event.data.sourceId", mode: "cancel" },
    timeouts: { start: EXTRACTION_START_TIMEOUT, finish: EXTRACTION_FINISH_TIMEOUT },
    cancelOn: [
      {
        event: extractionCancelRequestedEvent,
        if: "async.data.sourceId == event.data.sourceId && async.data.run == event.data.run",
      },
    ],
    onFailure: async ({ event }) => {
      const { sourceId, run } = event.data.event.data;
      const workflowId = `${sourceId}:${run}`;

      try {
        await failSourceOwnedByWorkflow(sourceId, workflowId, GENERIC_FAILURE_REASON);
      } catch (err) {
        log.error({ err }, "extraction_inngest_on_failure_failed");
      }
    },
  },
  async ({ event, step, runId }) => {
    const { sourceId, run, regeneration } = event.data;
    const workflowId = `${sourceId}:${run}`;
    const deps = stepDeps(runId);
    let snapshot: DurableSourceSnapshot | null = null;

    try {
      snapshot = await step.run("claim", () =>
        claimStep({ sourceId, regeneration }, workflowId, deps),
      );

      if (!snapshot) {
        return { status: "skipped", inserted: 0, failureReason: null };
      }

      const claimed = snapshot;
      const plan = await step.run("plan", () => planStep(claimed, deps));

      if (plan.status === "failed") {
        return await step.run("fail", () => failStep(claimed, plan.reason, deps));
      }

      let accepted = 0;
      let inserted = 0;
      let failureReason: string | null = null;

      for (let index = 0; index < plan.chunkCount; index += 1) {
        try {
          const counts = await step.run(`chunk-${index}`, async () => {
            try {
              return await chunkInsertStep(claimed, index, plan.firstOrdinal, accepted, deps);
            } catch (err) {
              throw toChunkError(err);
            }
          });

          accepted += counts.accepted;
          inserted += counts.inserted;
        } catch (err) {
          failureReason ??= safeFailureReason(err);
          log.error({ err, knowledgeSourceId: claimed.id }, "knowledge_bit_source_items_chunk_failed");
        }
      }

      return await step.run("finish", () =>
        finishCountsStep(claimed, inserted, failureReason, deps),
      );
    } catch (err) {
      const reason = safeFailureReason(err);

      try {
        if (snapshot) {
          await step.run("guard", () => failStep(snapshot!, reason, deps));
        } else {
          await step.run("release", () => failSourceOwnedByWorkflow(sourceId, workflowId, reason));
        }
      } catch (guardErr) {
        log.error({ err: guardErr }, "extraction_inngest_guard_failed");
      }

      throw new NonRetriableError(reason);
    }
  },
);

export const extractionCancelHandler = inngest.createFunction(
  {
    id: "handle-extraction-cancel",
    retries: 1,
    triggers: [
      { event: extractionCancelRequestedEvent },
      {
        event: FUNCTION_CANCELLED_EVENT,
        if: `event.data.function_id == '${extractionInngestFunction.id(inngest.id)}'`,
      },
    ],
  },
  async ({ event, step }) => {
    if (event.name === FUNCTION_CANCELLED_EVENT) {
      const cancelled = cancelledRunSchema.safeParse(event.data);

      if (!cancelled.success) {
        log.warn({ eventName: event.name }, "extraction_cancelled_event_without_run_id");

        return;
      }

      await step.run("fail-timed-out-source", () =>
        failSourceByEngineRunId(cancelled.data.run_id, GENERIC_FAILURE_REASON),
      );

      return;
    }

    const { sourceId, run } = event.data;
    const workflowId = `${sourceId}:${run}`;

    await step.run("fail-cancelled-source", () =>
      failSourceOwnedByWorkflow(sourceId, workflowId, GENERIC_FAILURE_REASON),
    );
  },
);
