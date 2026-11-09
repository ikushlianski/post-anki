import { log } from "../shared/log.js";
import { listStalePendingSourceIds } from "../knowledge-source/pending-sources.repo.js";
import { reconcileDurableSources } from "./durable-extraction.reconcile.js";
import {
  isDurableExtractionEnabled,
  startDurableExtraction,
} from "./durable-extraction.starter.js";
import { kickKnowledgeBitPipeline } from "./knowledge-bit-pipeline-kick.orchestrator.js";
import { hasPendingBitWork } from "./pipeline-pending-work.js";
import { startKnowledgeBitPipelineKick } from "./pipeline-kick.starter.js";

export const SWEEP_MIN_AGE_MS = 5 * 60 * 1000;
export const SWEEP_MAX_SOURCES = 20;

export interface PipelineSweepResult {
  requeued: number;
  deferred: number;
  kickSent: boolean;
}

export interface PipelineSweepDeps {
  isDurable: () => boolean;
  reconcile: () => Promise<string[]>;
  listStalePending: (minAgeMs: number, limit: number) => Promise<string[]>;
  startExtraction: (ids: string[]) => Promise<{ started: string[]; deferredIds: string[] }>;
  hasPendingBitWork: () => Promise<boolean>;
  sendKick: () => Promise<void>;
  kickInProcess: () => Promise<void>;
}

function defaultDeps(): PipelineSweepDeps {
  return {
    isDurable: () => isDurableExtractionEnabled(),
    reconcile: reconcileDurableSources,
    listStalePending: listStalePendingSourceIds,
    startExtraction: (ids) => startDurableExtraction(ids, { regeneration: false }),
    hasPendingBitWork,
    sendKick: () => startKnowledgeBitPipelineKick(),
    kickInProcess: kickKnowledgeBitPipeline,
  };
}

async function pendingWorkOrFalse(deps: PipelineSweepDeps): Promise<boolean> {
  try {
    return await deps.hasPendingBitWork();
  } catch (err) {
    log.error({ err }, "pipeline_sweep_pending_work_check_failed");

    return false;
  }
}

export async function runPipelineSweep(
  deps: PipelineSweepDeps = defaultDeps(),
): Promise<PipelineSweepResult> {
  if (!deps.isDurable()) {
    await deps.kickInProcess();

    return { requeued: 0, deferred: 0, kickSent: false };
  }

  await deps.reconcile();

  const ids = await deps.listStalePending(SWEEP_MIN_AGE_MS, SWEEP_MAX_SOURCES);
  let requeued = 0;
  let deferred = 0;

  if (ids.length > 0) {
    const result = await deps.startExtraction(ids);

    requeued = result.started.length;
    deferred = result.deferredIds.length;
  }

  const kickSent = await pendingWorkOrFalse(deps);

  if (kickSent) {
    await deps.sendKick();
  }

  return { requeued, deferred, kickSent };
}
