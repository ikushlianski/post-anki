import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { isDurableExtractionEnabled } from "./durable-extraction.flag.js";
import {
  DEFAULT_DURABLE_TIMEOUT_MS,
  durableTimeoutMs,
} from "./durable-extraction.config.js";
import {
  failProcessingSourcesWithEndedWorkflows,
  getKnowledgeSourceClaimToken,
  type KnowledgeSourceClaimToken,
  markSourceOwnedByDurable,
  releaseDurableOwner,
} from "./knowledge-bit.repo.js";
import type { DurableExtractionInput } from "./durable-extraction.steps.js";

export { DEFAULT_DURABLE_TIMEOUT_MS, durableTimeoutMs };

export interface ExtractionExtras {
  forceAtLeastOne?: boolean;
  modelId?: string;
}

export interface WorkflowAdapter {
  launchDurableExtraction(): Promise<void>;
  startExtractionWorkflow(input: DurableExtractionInput, run: number, extras?: ExtractionExtras): Promise<string>;
  reconcileEndedWorkflows(): Promise<string[]>;
}

export interface StarterDeps {
  loadWorkflow: () => Promise<WorkflowAdapter>;
  getClaim: (sourceId: string) => Promise<KnowledgeSourceClaimToken>;
  workflowExists: (workflowId: string) => Promise<boolean>;
  markOwner: (sourceId: string, workflowId: string, token: KnowledgeSourceClaimToken) => Promise<boolean>;
  releaseOwner: (sourceId: string, workflowId: string) => Promise<void>;
}

export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_timed_out_after_${ms}ms`)), ms);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface StartResult {
  started: string[];
  deferredIds: string[];
  unknownIds: string[];
}

let loadedWorkflow: WorkflowAdapter | null = null;

export { isDurableExtractionEnabled };

export function loadInngestWorkflow(): WorkflowAdapter {
  const inngest = createInngestClient();

  return {
    launchDurableExtraction: async () => undefined,
    startExtractionWorkflow: async (
      input: DurableExtractionInput,
      run: number,
      extras?: ExtractionExtras,
    ): Promise<string> => {
      const id = `${input.sourceId}:${run}`;

      await inngest.send({
        name: "knowledge-source/extraction.requested",
        id,
        data: {
          sourceId: input.sourceId,
          run,
          regeneration: input.regeneration,
          ...(extras?.forceAtLeastOne === undefined ? {} : { forceAtLeastOne: extras.forceAtLeastOne }),
          ...(extras?.modelId === undefined ? {} : { modelId: extras.modelId }),
        },
      });

      return id;
    },
    reconcileEndedWorkflows: async (): Promise<string[]> => {
      try {
        const failed = await failProcessingSourcesWithEndedWorkflows();

        if (failed.length > 0) {
          log.warn({ failed }, "durable_extraction_ended_workflows_marked_failed");
        }

        return failed;
      } catch (err) {
        log.error({ err }, "durable_extraction_reconcile_failed");

        return [];
      }
    },
  };
}

export async function loadWorkflow(): Promise<WorkflowAdapter> {
  loadedWorkflow ??= loadInngestWorkflow();

  return loadedWorkflow;
}

function makeInngestWorkflowExists(inngest: ReturnType<typeof createInngestClient>) {
  return async (workflowId: string): Promise<boolean> => {
    const colonIdx = workflowId.lastIndexOf(":");
    const sourceId = workflowId.slice(0, colonIdx);
    const run = Number(workflowId.slice(colonIdx + 1));

    try {
      await inngest.send({
        name: "knowledge-source/extraction.requested",
        id: workflowId,
        data: { sourceId, run, regeneration: false },
      });

      return true;
    } catch {
      return false;
    }
  };
}

function defaultDeps(): StarterDeps {
  return {
    loadWorkflow,
    getClaim: getKnowledgeSourceClaimToken,
    workflowExists: makeInngestWorkflowExists(createInngestClient()),
    markOwner: markSourceOwnedByDurable,
    releaseOwner: releaseDurableOwner,
  };
}

// "Unknown" outcomes (existence check or marker release failed) are not deferred: the event may
// exist already. The scheduled reconcile settles them.
async function settleFailedStart(
  sourceId: string,
  workflowId: string,
  regeneration: boolean,
  err: unknown,
  deps: StarterDeps,
  result: StartResult,
): Promise<void> {
  let exists: boolean;

  try {
    exists = await deps.workflowExists(workflowId);
  } catch (checkErr) {
    log.error({ err, checkErr, workflowId }, "durable_extraction_start_outcome_unknown_left_to_reconcile");
    result.unknownIds.push(sourceId);

    return;
  }

  if (exists) {
    log.warn({ err, workflowId }, "durable_extraction_start_slow_but_workflow_exists");
    result.started.push(workflowId);

    return;
  }

  if (regeneration) {
    try {
      await deps.releaseOwner(sourceId, workflowId);
    } catch (releaseErr) {
      log.error({ err, releaseErr, workflowId }, "durable_extraction_owner_release_failed_left_to_reconcile");
      result.unknownIds.push(sourceId);

      return;
    }
  }

  log.error({ err, sourceId }, "extraction_enqueue_failed_left_for_sweep");
  result.deferredIds.push(sourceId);
}

export async function startDurableExtraction(
  sourceIds: readonly string[],
  options: { regeneration: boolean; timeoutMs?: number; extras?: ExtractionExtras },
  deps: StarterDeps = defaultDeps(),
): Promise<StartResult> {
  const timeoutMs = options.timeoutMs ?? durableTimeoutMs();
  const result: StartResult = { started: [], deferredIds: [], unknownIds: [] };
  let workflow: WorkflowAdapter;

  try {
    workflow = await withTimeout(deps.loadWorkflow(), timeoutMs, "durable_extraction_load");
    await withTimeout(workflow.launchDurableExtraction(), timeoutMs, "durable_extraction_launch");
    await withTimeout(workflow.reconcileEndedWorkflows(), timeoutMs, "durable_extraction_reconcile");
  } catch (err) {
    log.error({ err }, "durable_extraction_launch_failed_left_for_sweep");

    return { started: [], deferredIds: [...sourceIds], unknownIds: [] };
  }

  for (const sourceId of sourceIds) {
    let token: KnowledgeSourceClaimToken;

    try {
      token = await deps.getClaim(sourceId);
    } catch (err) {
      log.error({ err, sourceId }, "durable_extraction_run_lookup_failed_left_for_sweep");
      result.deferredIds.push(sourceId);

      continue;
    }

    const workflowId = `${sourceId}:${token.run}`;

    try {
      if (options.regeneration && !(await deps.markOwner(sourceId, workflowId, token))) {
        throw new Error("durable_owner_not_set");
      }

      const input = { sourceId, regeneration: options.regeneration };
      const started = options.extras
        ? workflow.startExtractionWorkflow(input, token.run, options.extras)
        : workflow.startExtractionWorkflow(input, token.run);

      result.started.push(await withTimeout(started, timeoutMs, "durable_extraction_start"));
    } catch (err) {
      await settleFailedStart(sourceId, workflowId, options.regeneration, err, deps, result);
    }
  }

  return result;
}
