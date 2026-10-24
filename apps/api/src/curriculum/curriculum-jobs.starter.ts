import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { isDurableCourseJobsEnabled } from "../shared/durable-flags.js";
import {
  researchCurriculum,
  retryResearch,
  type ResearchCurriculumInput,
} from "./curriculum-parse.orchestrator.js";
import { curriculumResearchRequestedEvent } from "./curriculum-research-inngest.events.js";
import {
  clearResearchJobTouch,
  touchResearchJob,
} from "./curriculum-research-jobs.repo.js";
import { researchMarkerFor } from "./curriculum-research-marker.js";
import {
  deleteAllCurriculumSources,
  insertResearchSource,
  setCurriculumStatus,
} from "./curriculum.repo.js";

export interface ResearchStarterDeps {
  isDurable: () => boolean;
  writeMarker: (curriculumId: string, input: ResearchCurriculumInput) => Promise<void>;
  removeMarker: (curriculumId: string) => Promise<void>;
  claim: (curriculumId: string) => Promise<void>;
  release: (curriculumId: string) => Promise<void>;
  markFailed: (curriculumId: string) => Promise<void>;
  sendEvent: (curriculumId: string, retry: boolean) => Promise<void>;
  researchInProcess: (curriculumId: string, input: ResearchCurriculumInput) => Promise<void>;
  retryInProcess: (curriculumId: string) => Promise<void>;
}

function defaultDeps(): ResearchStarterDeps {
  const ownerToken = newId("run");

  return {
    isDurable: () => isDurableCourseJobsEnabled(),
    writeMarker: (curriculumId, input) =>
      insertResearchSource(curriculumId, researchMarkerFor(input), ""),
    removeMarker: (curriculumId) => deleteAllCurriculumSources(curriculumId),
    claim: async (curriculumId) => {
      await touchResearchJob(curriculumId);
    },
    release: (curriculumId) => clearResearchJobTouch(curriculumId),
    markFailed: (curriculumId) => setCurriculumStatus(curriculumId, "failed"),
    sendEvent: async (curriculumId, retry) => {
      await createInngestClient().send({
        name: curriculumResearchRequestedEvent.name,
        id: `research-${curriculumId}-${Date.now()}`,
        data: { curriculumId, retry, ownerToken },
      });
    },
    researchInProcess: researchCurriculum,
    retryInProcess: retryResearch,
  };
}

export async function startResearch(
  curriculumId: string,
  input: ResearchCurriculumInput,
  deps: ResearchStarterDeps = defaultDeps(),
): Promise<void> {
  if (!deps.isDurable()) {
    return deps.researchInProcess(curriculumId, input);
  }

  try {
    await deps.writeMarker(curriculumId, input);
    await deps.claim(curriculumId);
  } catch (err) {
    await deps.markFailed(curriculumId);

    throw err;
  }

  try {
    await deps.sendEvent(curriculumId, false);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_research_event_send_failed");

    try {
      await deps.removeMarker(curriculumId);
      await deps.release(curriculumId);
    } catch (cleanupErr) {
      log.error({ err: cleanupErr, curriculumId }, "curriculum_research_fallback_cleanup_failed");
      await deps.markFailed(curriculumId);

      return;
    }

    await deps.researchInProcess(curriculumId, input);
  }
}

export async function startRetryResearch(
  curriculumId: string,
  deps: ResearchStarterDeps = defaultDeps(),
): Promise<void> {
  if (!deps.isDurable()) {
    return deps.retryInProcess(curriculumId);
  }

  try {
    await deps.claim(curriculumId);
  } catch (err) {
    await deps.markFailed(curriculumId);

    throw err;
  }

  try {
    await deps.sendEvent(curriculumId, true);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_research_event_send_failed");

    try {
      await deps.release(curriculumId);
    } catch (cleanupErr) {
      log.error({ err: cleanupErr, curriculumId }, "curriculum_research_fallback_cleanup_failed");
      await deps.markFailed(curriculumId);

      return;
    }

    await deps.retryInProcess(curriculumId);
  }
}
