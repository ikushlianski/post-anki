import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { KNOWLEDGE_BIT_PIPELINE_PASSES } from "./knowledge-bit-pipeline-kick.orchestrator.js";
import { pipelineKickRequestedEvent } from "./pipeline-kick-inngest.events.js";

export const PIPELINE_KICK_RETRIES = 1;
export const PIPELINE_KICK_DEBOUNCE = { period: "5s", timeout: "30s" } as const;
export const PIPELINE_KICK_START_TIMEOUT = "30m";
export const PIPELINE_KICK_FINISH_TIMEOUT = "30m";

export const PIPELINE_KICK_FOLLOW_UP_RATE_LIMIT = { limit: 1, period: "1h" } as const;

const FUNCTION_CANCELLED_EVENT = "inngest/function.cancelled";
const KICK_FUNCTION_ID = "knowledge-bit-pipeline-kick";

const inngest = createInngestClient();

export const pipelineKickInngestFunction = inngest.createFunction(
  {
    id: KICK_FUNCTION_ID,
    retries: PIPELINE_KICK_RETRIES,
    triggers: [{ event: pipelineKickRequestedEvent }],
    concurrency: [{ limit: 1 }],
    debounce: PIPELINE_KICK_DEBOUNCE,
    timeouts: { start: PIPELINE_KICK_START_TIMEOUT, finish: PIPELINE_KICK_FINISH_TIMEOUT },
    onFailure: async ({ error, event, step }) => {
      log.error({ err: error }, "knowledge_bit_pipeline_kick_inngest_failed");

      if (event.data.event.data.followUp === true) {
        return;
      }

      await step.sendEvent("follow-up-kick", {
        name: pipelineKickRequestedEvent.name,
        data: { requestedAt: Date.now(), followUp: true },
      });
    },
  },
  async ({ step }) => {
    const results: Record<string, "done" | "failed"> = {};

    for (const pass of KNOWLEDGE_BIT_PIPELINE_PASSES) {
      results[pass.name] = await step.run(`pass-${pass.name}`, async () => {
        try {
          await pass.run();

          return "done" as const;
        } catch (err) {
          log.error({ err, pass: pass.name }, "knowledge_bit_pipeline_kick_pass_failed");

          return "failed" as const;
        }
      });
    }

    log.info(results, "knowledge_bit_pipeline_kick_run_done");

    return results;
  },
);

export const pipelineKickFollowUpFunction = inngest.createFunction(
  {
    id: "knowledge-bit-pipeline-kick-follow-up",
    retries: 1,
    rateLimit: PIPELINE_KICK_FOLLOW_UP_RATE_LIMIT,
    triggers: [
      {
        event: FUNCTION_CANCELLED_EVENT,
        if: `event.data.function_id == '${pipelineKickInngestFunction.id(inngest.id)}'`,
      },
    ],
  },
  async ({ step }) => {
    await step.sendEvent("follow-up-kick", {
      name: pipelineKickRequestedEvent.name,
      data: { requestedAt: Date.now(), followUp: true },
    });
  },
);
