import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { isDurableCourseJobsEnabled } from "../shared/durable-flags.js";
import { generateCurriculumFromApprovedSources } from "./curriculum-parse.orchestrator.js";
import { curriculumDraftRequestedEvent } from "./curriculum-draft-inngest.events.js";
import { clearResearchJobTouch } from "./curriculum-research-jobs.repo.js";
import { claimDraftJob } from "./curriculum-draft-jobs.repo.js";
import { DRAFT_SWEEP_CUTOFF_MS } from "./curriculum-draft-inngest.limits.js";
import { generateDraftStructure, retryDraftStructure } from "./curriculum-structure.js";
import { insertApprovedTextSource, setCurriculumStatus } from "./curriculum.repo.js";

export interface DraftStarterDeps {
  isDurable: () => boolean;
  insertPastedText: (curriculumId: string, text: string) => Promise<void>;
  claim: (curriculumId: string) => Promise<{ liveRunActive: boolean }>;
  release: (curriculumId: string) => Promise<void>;
  markFailed: (curriculumId: string) => Promise<void>;
  sendEvent: (curriculumId: string, approve: boolean, retry: boolean) => Promise<void>;
  approvedInProcess: (curriculumId: string) => Promise<void>;
  retryInProcess: (curriculumId: string) => Promise<void>;
  pastedInProcess: (curriculumId: string) => Promise<void>;
}

function defaultDeps(): DraftStarterDeps {
  const ownerToken = newId("run");

  return {
    isDurable: () => isDurableCourseJobsEnabled(),
    insertPastedText: insertApprovedTextSource,
    claim: (curriculumId) => claimDraftJob(curriculumId, DRAFT_SWEEP_CUTOFF_MS),
    release: (curriculumId) => clearResearchJobTouch(curriculumId),
    markFailed: (curriculumId) => setCurriculumStatus(curriculumId, "failed"),
    sendEvent: async (curriculumId, approve, retry) => {
      await createInngestClient().send({
        name: curriculumDraftRequestedEvent.name,
        id: `draft-${curriculumId}-${Date.now()}`,
        data: { curriculumId, approve, retry, ownerToken },
      });
    },
    approvedInProcess: generateCurriculumFromApprovedSources,
    retryInProcess: retryDraftStructure,
    pastedInProcess: generateDraftStructure,
  };
}

async function dispatchDurable(
  curriculumId: string,
  mode: { approve: boolean; retry: boolean },
  inProcess: (curriculumId: string) => Promise<void>,
  deps: DraftStarterDeps,
): Promise<void> {
  let liveRunActive = false;

  try {
    ({ liveRunActive } = await deps.claim(curriculumId));
  } catch (err) {
    await deps.markFailed(curriculumId);

    throw err;
  }

  try {
    await deps.sendEvent(curriculumId, mode.approve, mode.retry);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_draft_event_send_failed");

    if (liveRunActive) {
      log.warn({ curriculumId }, "curriculum_draft_fallback_skipped_live_run");

      return;
    }

    try {
      await deps.release(curriculumId);
    } catch (cleanupErr) {
      log.error({ err: cleanupErr, curriculumId }, "curriculum_draft_fallback_cleanup_failed");
      await deps.markFailed(curriculumId);

      return;
    }

    await inProcess(curriculumId);
  }
}

export async function startDraftFromApprovedSources(
  curriculumId: string,
  deps: DraftStarterDeps = defaultDeps(),
): Promise<void> {
  if (!deps.isDurable()) {
    return deps.approvedInProcess(curriculumId);
  }

  await dispatchDurable(curriculumId, { approve: true, retry: false }, deps.approvedInProcess, deps);
}

export async function startRetryDraft(
  curriculumId: string,
  deps: DraftStarterDeps = defaultDeps(),
): Promise<void> {
  if (!deps.isDurable()) {
    return deps.retryInProcess(curriculumId);
  }

  await dispatchDurable(curriculumId, { approve: false, retry: true }, deps.retryInProcess, deps);
}

// Runs before the 202 when the flag is on; false means the caller keeps the in-process path.
export async function insertPastedMaterialEarly(
  curriculumId: string,
  text: string,
  deps: DraftStarterDeps = defaultDeps(),
): Promise<boolean> {
  if (!deps.isDurable()) {
    return false;
  }

  try {
    await deps.insertPastedText(curriculumId, text);

    return true;
  } catch (err) {
    log.error({ err, curriculumId }, "pasted_material_early_insert_failed");

    return false;
  }
}

export async function startPastedDraft(
  curriculumId: string,
  text: string,
  alreadyInserted: boolean,
  deps: DraftStarterDeps = defaultDeps(),
): Promise<void> {
  if (!alreadyInserted) {
    await deps.insertPastedText(curriculumId, text);
    await deps.pastedInProcess(curriculumId);

    return;
  }

  if (!deps.isDurable()) {
    return deps.pastedInProcess(curriculumId);
  }

  await dispatchDurable(curriculumId, { approve: false, retry: false }, deps.pastedInProcess, deps);
}
