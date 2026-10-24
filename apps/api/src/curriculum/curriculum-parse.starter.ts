import type { SourceDraft } from "@post-anki/shared";
import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { isDurableCourseJobsEnabled } from "../shared/durable-flags.js";
import { parseCurriculum, reparseCurriculum } from "./curriculum-parse.orchestrator.js";
import { mergeSourcesIntoCurriculum, mergeSynthesize } from "./curriculum-merge.orchestrator.js";
import { curriculumParseRequestedEvent } from "./curriculum-parse-inngest.events.js";
import { clearResearchJobTouch, touchResearchJob } from "./curriculum-research-jobs.repo.js";
import { addCurriculumSources, setCurriculumStatus } from "./curriculum.repo.js";
import type { ParseMode } from "./curriculum-parse.steps.js";

export interface ParseStarterDeps {
  isDurable: () => boolean;
  addSources: (curriculumId: string, drafts: SourceDraft[]) => Promise<void>;
  claim: (curriculumId: string) => Promise<void>;
  release: (curriculumId: string) => Promise<void>;
  markFailed: (curriculumId: string) => Promise<void>;
  sendEvent: (curriculumId: string, mode: ParseMode) => Promise<void>;
  parseInProcess: (curriculumId: string) => Promise<void>;
  reparseInProcess: (curriculumId: string) => Promise<void>;
  mergeInProcess: (curriculumId: string, drafts: SourceDraft[]) => Promise<void>;
  mergeSynthesizeInProcess: (curriculumId: string) => Promise<void>;
}

function defaultDeps(): ParseStarterDeps {
  const ownerToken = newId("run");

  return {
    isDurable: () => isDurableCourseJobsEnabled(),
    addSources: addCurriculumSources,
    claim: async (curriculumId) => {
      await touchResearchJob(curriculumId);
    },
    release: (curriculumId) => clearResearchJobTouch(curriculumId),
    markFailed: (curriculumId) => setCurriculumStatus(curriculumId, "failed"),
    sendEvent: async (curriculumId, mode) => {
      await createInngestClient().send({
        name: curriculumParseRequestedEvent.name,
        id: `parse-${curriculumId}-${Date.now()}`,
        data: { curriculumId, mode, ownerToken },
      });
    },
    parseInProcess: parseCurriculum,
    reparseInProcess: reparseCurriculum,
    mergeInProcess: mergeSourcesIntoCurriculum,
    mergeSynthesizeInProcess: mergeSynthesize,
  };
}

async function dispatchDurable(
  curriculumId: string,
  mode: ParseMode,
  inProcess: () => Promise<void>,
  deps: ParseStarterDeps,
): Promise<void> {
  try {
    await deps.claim(curriculumId);
  } catch (err) {
    await deps.markFailed(curriculumId);

    throw err;
  }

  try {
    await deps.sendEvent(curriculumId, mode);
  } catch (err) {
    log.error({ err, curriculumId, mode }, "curriculum_parse_event_send_failed");

    try {
      await deps.release(curriculumId);
    } catch (cleanupErr) {
      log.error({ err: cleanupErr, curriculumId }, "curriculum_parse_fallback_cleanup_failed");
      await deps.markFailed(curriculumId);

      return;
    }

    await inProcess();
  }
}

export async function startParse(
  curriculumId: string,
  deps: ParseStarterDeps = defaultDeps(),
): Promise<void> {
  if (!deps.isDurable()) {
    return deps.parseInProcess(curriculumId);
  }

  await dispatchDurable(curriculumId, "parse", () => deps.parseInProcess(curriculumId), deps);
}

export async function startReparse(
  curriculumId: string,
  deps: ParseStarterDeps = defaultDeps(),
): Promise<void> {
  if (!deps.isDurable()) {
    return deps.reparseInProcess(curriculumId);
  }

  await dispatchDurable(curriculumId, "reparse", () => deps.reparseInProcess(curriculumId), deps);
}

export async function startMerge(
  curriculumId: string,
  drafts: SourceDraft[],
  deps: ParseStarterDeps = defaultDeps(),
): Promise<void> {
  if (!deps.isDurable()) {
    return deps.mergeInProcess(curriculumId, drafts);
  }

  try {
    await deps.addSources(curriculumId, drafts);
  } catch (err) {
    await deps.markFailed(curriculumId);

    throw err;
  }

  await dispatchDurable(
    curriculumId,
    "merge",
    () => deps.mergeSynthesizeInProcess(curriculumId),
    deps,
  );
}
