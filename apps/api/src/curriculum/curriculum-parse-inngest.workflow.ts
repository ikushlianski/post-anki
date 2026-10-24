import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { curriculumParseRequestedEvent } from "./curriculum-parse-inngest.events.js";
import {
  PARSE_CONCURRENCY,
  PARSE_FINISH_TIMEOUT,
  PARSE_RETRIES,
  PARSE_START_TIMEOUT,
  PARSE_SWEEP_DELAY,
  PARSE_THROTTLE,
} from "./curriculum-parse-inngest.limits.js";
import { RESEARCH_SWEEP_CUTOFF_MS } from "./curriculum-research-inngest.limits.js";
import { failResearchJob, failStaleResearchJobs } from "./curriculum-research-jobs.repo.js";
import { prepareParseStep, synthesizeParseStep } from "./curriculum-parse.steps.js";

const FUNCTION_CANCELLED_EVENT = "inngest/function.cancelled";

const inngest = createInngestClient();

export const curriculumParseFunction = inngest.createFunction(
  {
    id: "curriculum-parse",
    retries: PARSE_RETRIES,
    triggers: [{ event: curriculumParseRequestedEvent }],
    concurrency: [
      { limit: PARSE_CONCURRENCY },
      { key: "event.data.curriculumId", limit: 1 },
    ],
    throttle: PARSE_THROTTLE,
    singleton: { key: "event.data.curriculumId", mode: "skip" },
    timeouts: { start: PARSE_START_TIMEOUT, finish: PARSE_FINISH_TIMEOUT },
    onFailure: async ({ event }) => {
      const { curriculumId } = event.data.event.data;

      try {
        await failResearchJob(curriculumId, event.data.event.data.ownerToken);
      } catch (err) {
        log.error({ err, curriculumId }, "curriculum_parse_inngest_on_failure_failed");
      }
    },
  },
  async ({ event, step }) => {
    const { curriculumId, mode, ownerToken } = event.data;

    await step.run("prepare", async () => {
      await prepareParseStep(curriculumId, mode, ownerToken);

      return "done" as const;
    });

    const synthesized = await step.run("synthesize", () => synthesizeParseStep(curriculumId, mode, ownerToken));

    return { status: "done" as const, modules: synthesized.modules };
  },
);

export const curriculumParseTimeoutHandler = inngest.createFunction(
  {
    id: "curriculum-parse-timeout",
    retries: 1,
    triggers: [
      {
        event: FUNCTION_CANCELLED_EVENT,
        if: `event.data.function_id == '${curriculumParseFunction.id(inngest.id)}'`,
      },
    ],
  },
  async ({ step }) => {
    await step.sleep("wait-for-owners", PARSE_SWEEP_DELAY);

    const failed = await step.run("fail-stale-parse", () =>
      failStaleResearchJobs(RESEARCH_SWEEP_CUTOFF_MS),
    );

    return { failed };
  },
);
