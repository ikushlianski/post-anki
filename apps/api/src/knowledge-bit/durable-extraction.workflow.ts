import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { loadEnv } from "../shared/env.js";
import { log } from "../shared/log.js";
import { defaultGenerateItemsDeps } from "./detect-knowledge-bits.orchestrator.js";
import { DURABLE_MAX_RECOVERY_ATTEMPTS, safeFailureReason } from "./durable-extraction.config.js";
import {
  claimOrLoadSourceForExtraction,
  failProcessingSourcesWithEndedWorkflows,
  failSourceOwnedByWorkflow,
  getKnowledgeSourceRawText,
} from "./knowledge-bit.repo.js";
import {
  chunkStep,
  claimStep,
  failStep,
  finishStep,
  planStep,
  type DurableExtractionInput,
  type DurableSourceSnapshot,
  type DurableOutcome,
  type DurableStepDeps,
} from "./durable-extraction.steps.js";
import type { SourceItemDraft } from "./knowledge-bit-source-item-validation.js";

function stepDeps(): DurableStepDeps {
  return {
    ...defaultGenerateItemsDeps(),
    claimOrLoad: (sourceId, options) => claimOrLoadSourceForExtraction(sourceId, options),
    loadRawText: getKnowledgeSourceRawText,
  };
}

// Engine tables store whatever a step throws, including enumerable properties and causes. Provider
// and database errors can carry the prompt or the response body, so every step throws a fresh plain
// error with a short code; the full error goes to the application log only.
async function plainFailure<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    log.error({ err }, "durable_extraction_step_failed");

    throw new Error(safeFailureReason(err));
  }
}

async function extractSource(input: DurableExtractionInput): Promise<DurableOutcome> {
  const deps = stepDeps();
  const workflowId = DBOS.workflowID ?? `${input.sourceId}:unknown`;
  let snapshot: DurableSourceSnapshot | null = null;

  try {
    snapshot = await DBOS.runStep(() => plainFailure(() => claimStep(input, workflowId, deps)), { name: "claim" });

    if (!snapshot) {
      return { status: "skipped", inserted: 0, failureReason: null };
    }

    const claimed = snapshot;
    const plan = await DBOS.runStep(() => plainFailure(() => planStep(claimed, deps)), { name: "plan" });

    if (plan.status === "failed") {
      return await DBOS.runStep(() => plainFailure(() => failStep(claimed, plan.reason, deps)), { name: "fail" });
    }

    const results: (SourceItemDraft[] | null)[] = [];
    let failureReason: string | null = null;

    for (let index = 0; index < plan.chunkCount; index += 1) {
      try {
        results.push(
          await DBOS.runStep(() => plainFailure(() => chunkStep(claimed, index, deps)), {
            name: `chunk-${index}`,
            retriesAllowed: false,
          }),
        );
      } catch (err) {
        failureReason ??= safeFailureReason(err);
        results.push(null);
        log.error({ err, knowledgeSourceId: claimed.id }, "knowledge_bit_source_items_chunk_failed");
      }
    }

    return await DBOS.runStep(
      () => plainFailure(() => finishStep(claimed, plan.firstOrdinal, results, failureReason, deps)),
      { name: "finish" },
    );
  } catch (err) {
    const reason = safeFailureReason(err);

    if (snapshot) {
      const claimed = snapshot;

      await DBOS.runStep(() => plainFailure(() => failStep(claimed, reason, deps)), { name: "guard" });
    } else {
      await DBOS.runStep(
        () => plainFailure(() => failSourceOwnedByWorkflow(input.sourceId, workflowId, reason)),
        { name: "release" },
      );
    }

    throw new Error(reason);
  }
}

const extractSourceWorkflow = DBOS.registerWorkflow(extractSource, {
  name: "extractSource",
  maxRecoveryAttempts: DURABLE_MAX_RECOVERY_ATTEMPTS,
});

let launching: Promise<void> | null = null;

export function createExecutorId(): string {
  return `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
}

export function buildDbosConfig(env: ReturnType<typeof loadEnv>, executorID: string = createExecutorId()) {
  return {
    name: "post-anki-api",
    systemDatabaseUrl: env.DATABASE_URL,
    executorID: env.DBOS_EXECUTOR_ID?.trim() || executorID,
    ...(env.DBOS_APPLICATION_VERSION?.trim() ? { applicationVersion: env.DBOS_APPLICATION_VERSION.trim() } : {}),
  };
}

export function launchDurableExtraction(): Promise<void> {
  launching ??= (async () => {
    const env = loadEnv();
    const config = buildDbosConfig(env);

    DBOS.setConfig(config);
    await DBOS.launch();
    log.info(
      { applicationVersion: config.applicationVersion ?? "derived from code", executorId: config.executorID },
      "durable_extraction_launched",
    );
    await reconcileEndedWorkflows();
  })().catch((err) => {
    launching = null;
    throw err;
  });

  return launching;
}

export async function reconcileEndedWorkflows(): Promise<string[]> {
  try {
    const failed = await failProcessingSourcesWithEndedWorkflows(DBOS.executorID);

    if (failed.length > 0) {
      log.warn({ failed }, "durable_extraction_ended_workflows_marked_failed");
    }

    return failed;
  } catch (err) {
    log.error({ err }, "durable_extraction_reconcile_failed");

    return [];
  }
}

export async function startExtractionWorkflow(
  input: DurableExtractionInput,
  run: number,
): Promise<string> {
  const workflowID = `${input.sourceId}:${run}`;
  const handle = await DBOS.startWorkflow(extractSourceWorkflow, { workflowID })(input);

  void handle.getResult().catch((err: unknown) => {
    log.error({ err, workflowID }, "durable_extraction_failed");
  });

  return workflowID;
}

export async function shutdownDurableExtraction(): Promise<void> {
  if (launching) {
    await DBOS.shutdown();
  }
}
