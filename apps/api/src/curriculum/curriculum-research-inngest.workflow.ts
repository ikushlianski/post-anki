import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { curriculumResearchRequestedEvent } from "./curriculum-research-inngest.events.js";
import {
  RESEARCH_CONCURRENCY,
  RESEARCH_FINISH_TIMEOUT,
  RESEARCH_RETRIES,
  RESEARCH_START_TIMEOUT,
  RESEARCH_SWEEP_CUTOFF_MS,
  RESEARCH_SWEEP_DELAY,
  RESEARCH_THROTTLE,
} from "./curriculum-research-inngest.limits.js";
import {
  failResearchJob,
  failStaleResearchJobs,
} from "./curriculum-research-jobs.repo.js";
import {
  finalizeResearchStep,
  gatherResearchStep,
  prepareResearchStep,
} from "./curriculum-research.steps.js";

const FUNCTION_CANCELLED_EVENT = "inngest/function.cancelled";

const inngest = createInngestClient();

export const curriculumResearchFunction = inngest.createFunction(
  {
    id: "curriculum-research",
    retries: RESEARCH_RETRIES,
    triggers: [{ event: curriculumResearchRequestedEvent }],
    concurrency: [
      { limit: RESEARCH_CONCURRENCY },
      { key: "event.data.curriculumId", limit: 1 },
    ],
    throttle: RESEARCH_THROTTLE,
    singleton: { key: "event.data.curriculumId", mode: "skip" },
    timeouts: { start: RESEARCH_START_TIMEOUT, finish: RESEARCH_FINISH_TIMEOUT },
    onFailure: async ({ event }) => {
      const { curriculumId } = event.data.event.data;

      try {
        await failResearchJob(curriculumId, event.data.event.data.ownerToken);
      } catch (err) {
        log.error({ err, curriculumId }, "curriculum_research_inngest_on_failure_failed");
      }
    },
  },
  async ({ event, step }) => {
    const { curriculumId, retry, ownerToken } = event.data;

    await step.run("prepare", async () => {
      await prepareResearchStep(curriculumId, retry, ownerToken);

      return "done" as const;
    });

    const gathered = await step.run("gather", () => gatherResearchStep(curriculumId));

    await step.run("finalize", async () => {
      await finalizeResearchStep(curriculumId, ownerToken);

      return "done" as const;
    });

    return { status: "done" as const, candidates: gathered.candidates };
  },
);

export const curriculumResearchTimeoutHandler = inngest.createFunction(
  {
    id: "curriculum-research-timeout",
    retries: 1,
    triggers: [
      {
        event: FUNCTION_CANCELLED_EVENT,
        if: `event.data.function_id == '${curriculumResearchFunction.id(inngest.id)}'`,
      },
    ],
  },
  async ({ step }) => {
    await step.sleep("wait-for-owners", RESEARCH_SWEEP_DELAY);

    const failed = await step.run("fail-stale-research", () =>
      failStaleResearchJobs(RESEARCH_SWEEP_CUTOFF_MS),
    );

    return { failed };
  },
);
