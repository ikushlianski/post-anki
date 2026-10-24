import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { curriculumDraftRequestedEvent } from "./curriculum-draft-inngest.events.js";
import {
  DRAFT_CONCURRENCY,
  DRAFT_FINISH_TIMEOUT,
  DRAFT_RETRIES,
  DRAFT_START_TIMEOUT,
  DRAFT_SWEEP_CUTOFF_MS,
  DRAFT_SWEEP_DELAY,
  DRAFT_THROTTLE,
} from "./curriculum-draft-inngest.limits.js";
import { failDraftJob, failStaleDraftJobs } from "./curriculum-draft-jobs.repo.js";
import {
  approveDraftStep,
  beginDraftStep,
  draftStep,
  finalizeStaleDraftStep,
  placeholderDraftStep,
} from "./curriculum-draft.steps.js";

const FUNCTION_CANCELLED_EVENT = "inngest/function.cancelled";

const inngest = createInngestClient();

export const curriculumDraftFunction = inngest.createFunction(
  {
    id: "curriculum-draft",
    retries: DRAFT_RETRIES,
    triggers: [{ event: curriculumDraftRequestedEvent }],
    concurrency: [
      { limit: DRAFT_CONCURRENCY },
      { key: "event.data.curriculumId", limit: 1 },
    ],
    throttle: DRAFT_THROTTLE,
    singleton: { key: "event.data.curriculumId", mode: "skip" },
    timeouts: { start: DRAFT_START_TIMEOUT, finish: DRAFT_FINISH_TIMEOUT },
    onFailure: async ({ event }) => {
      const { curriculumId } = event.data.event.data;

      try {
        await failDraftJob(curriculumId, event.data.event.data.ownerToken);
      } catch (err) {
        log.error({ err, curriculumId }, "curriculum_draft_inngest_on_failure_failed");
      }
    },
  },
  async ({ event, step }) => {
    const { curriculumId, approve, retry, ownerToken } = event.data;

    await step.run("begin", async () => {
      await beginDraftStep(curriculumId, ownerToken);

      return "done" as const;
    });

    if (approve) {
      await step.run("approve", async () => {
        await approveDraftStep(curriculumId);

        return "done" as const;
      });
    }

    if (retry) {
      await step.run("finalize-stale", async () => {
        await finalizeStaleDraftStep(curriculumId);

        return "done" as const;
      });
    }

    const placeholderId = await step.run("placeholder", () => placeholderDraftStep(curriculumId));
    const drafted = await step.run("draft", () => draftStep(curriculumId, placeholderId, ownerToken));

    return drafted;
  },
);

export const curriculumDraftTimeoutHandler = inngest.createFunction(
  {
    id: "curriculum-draft-timeout",
    retries: 1,
    triggers: [
      {
        event: FUNCTION_CANCELLED_EVENT,
        if: `event.data.function_id == '${curriculumDraftFunction.id(inngest.id)}'`,
      },
    ],
  },
  async ({ step }) => {
    await step.sleep("wait-for-owners", DRAFT_SWEEP_DELAY);

    const failed = await step.run("fail-stale-drafts", () => failStaleDraftJobs(DRAFT_SWEEP_CUTOFF_MS));

    return { failed };
  },
);
