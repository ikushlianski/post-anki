import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { backgroundJobRequestedEvent } from "./background-job.events.js";
import { runBackgroundJob } from "./background-job.handlers.js";
import {
  BACKGROUND_JOB_CONCURRENCY,
  BACKGROUND_JOB_FINISH_TIMEOUT,
  BACKGROUND_JOB_RETRIES,
  BACKGROUND_JOB_START_TIMEOUT,
  BACKGROUND_JOB_THROTTLE,
} from "./background-job.limits.js";

const inngest = createInngestClient();

export const backgroundJobFunction = inngest.createFunction(
  {
    id: "background-job",
    retries: BACKGROUND_JOB_RETRIES,
    triggers: [{ event: backgroundJobRequestedEvent }],
    concurrency: [{ limit: BACKGROUND_JOB_CONCURRENCY }],
    throttle: BACKGROUND_JOB_THROTTLE,
    timeouts: { start: BACKGROUND_JOB_START_TIMEOUT, finish: BACKGROUND_JOB_FINISH_TIMEOUT },
  },
  async ({ event, step }) => {
    const job = event.data;

    return step.run(job.kind, async () => {
      try {
        await runBackgroundJob(job);

        return "done" as const;
      } catch (err) {
        log.error({ err, kind: job.kind }, "background_job_failed");

        return "failed" as const;
      }
    });
  },
);
