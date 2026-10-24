import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { dispatchBackground } from "../shared/background-dispatch.js";
import { isDurableBackgroundJobsEnabled } from "../shared/durable-flags.js";
import { backgroundJobRequestedEvent, type BackgroundJob } from "./background-job.events.js";

export interface BackgroundJobDeps {
  isDurable: () => boolean;
  send: (job: BackgroundJob) => Promise<void>;
}

function defaultDeps(): BackgroundJobDeps {
  return {
    isDurable: () => isDurableBackgroundJobsEnabled(),
    send: async (job) => {
      await createInngestClient().send({ name: backgroundJobRequestedEvent.name, data: job });
    },
  };
}

async function startJob(
  job: BackgroundJob,
  inProcess: () => Promise<unknown>,
  deps: BackgroundJobDeps,
): Promise<void> {
  if (!deps.isDurable()) {
    await inProcess();

    return;
  }

  try {
    await deps.send(job);
  } catch (err) {
    log.error({ err, kind: job.kind }, "background_job_event_send_failed");
    await inProcess();
  }
}

export function dispatchBackgroundJob(
  job: BackgroundJob,
  inProcess: () => Promise<unknown>,
  onError: (err: unknown) => void | Promise<void>,
  deps: BackgroundJobDeps = defaultDeps(),
): Promise<void> {
  return dispatchBackground({
    durable: deps.isDurable(),
    start: () => startJob(job, inProcess, deps),
    onError,
  });
}
