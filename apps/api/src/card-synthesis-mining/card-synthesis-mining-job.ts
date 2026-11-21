import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import { assertLlmBudgetAvailable } from "../shared/spend-guard.js";
import { opPrefixFor } from "../llm-call-events/feature-budget.js";
import { clusterBits, type ClusteringResult } from "./card-synthesis-mining.clustering.js";
import {
  isMiningEnabled,
  miningRunLimits,
  miningSubjectIds,
  MINING_FEATURE_KEY,
} from "./card-synthesis-mining.config.js";
import { checkMiningGate } from "./card-synthesis-mining.budget.js";
import { mineCluster } from "./card-synthesis-mining.orchestrator.js";
import type { MineResult } from "./card-synthesis-mining.types.js";
import { countSynthesizedSince } from "./card-synthesis-mining-job.repo.js";
import { miningLedger } from "./card-synthesis-mining-ledger.repo.js";
import { withMiningRunLock } from "./card-synthesis-mining-lock.js";
import { markUnclusteredExamined } from "./card-synthesis-mining-marking.js";
import { selectMiningBatch, type MiningBatch } from "./card-synthesis-mining-selection.js";

export const MINING_MAX_CLUSTERS_PER_RUN = 6;
export const MINING_MAX_CONSECUTIVE_FAILURES = 3;
export const MINING_RUN_WALL_CLOCK_MS = 240_000;

export interface MiningJobQuery {
  dryRun?: boolean;
  limit?: number;
}

export type MiningJobStatus =
  | "disabled"
  | "nothing_to_do"
  | "dry_run"
  | "ok"
  | "capped"
  | "breaker_open"
  | "budget_exceeded"
  | "already_running";

export interface MiningJobSummary {
  status: MiningJobStatus;
  dryRun: boolean;
  runId: string | null;
  subjectId: string | null;
  selected: number;
  clusters: number;
  created: number;
  duplicates: number;
  notChain: number;
  ungrounded: number;
  failed: number;
  skipped: number;
  costUsdToday: number;
}

export interface MiningJobDeps {
  select: (allowed: string[], maxBits: number) => Promise<MiningBatch | null>;
  countCreatedSince: (since: Date) => Promise<number>;
  assertGlobalBudget: () => Promise<void>;
  checkGate: typeof checkMiningGate;
  mine: typeof mineCluster;
  markUnclustered: typeof markUnclusteredExamined;
  withLock: typeof withMiningRunLock;
  costToday: (now: Date) => Promise<number>;
  now: () => Date;
  newRunId: () => string;
}

const defaultDeps: MiningJobDeps = {
  select: (allowed, maxBits) => selectMiningBatch({ allowedSubjectIds: allowed, maxBits }),
  countCreatedSince: countSynthesizedSince,
  assertGlobalBudget: assertLlmBudgetAvailable,
  checkGate: checkMiningGate,
  mine: mineCluster,
  markUnclustered: markUnclusteredExamined,
  withLock: withMiningRunLock,
  costToday: async (now) => {
    const day = utcDayStart(now);
    const usage = await miningLedger.sumUsage(opPrefixFor(MINING_FEATURE_KEY), day, day);

    return usage.dayCostUsd;
  },
  now: () => new Date(),
  newRunId: () => newId("smr"),
};

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function emptySummary(status: MiningJobStatus, dryRun: boolean): MiningJobSummary {
  return {
    status,
    dryRun,
    runId: null,
    subjectId: null,
    selected: 0,
    clusters: 0,
    created: 0,
    duplicates: 0,
    notChain: 0,
    ungrounded: 0,
    failed: 0,
    skipped: 0,
    costUsdToday: 0,
  };
}

function tally(summary: MiningJobSummary, result: MineResult): void {
  switch (result.outcome) {
    case "synthesized":
      summary.created += 1;
      break;
    case "duplicate_existing":
      summary.duplicates += 1;
      break;
    case "not_chain":
      summary.notChain += 1;
      break;
    case "rejected_ungrounded":
      summary.ungrounded += 1;
      break;
    case "failed":
    case "failed_retryable":
    case "failed_budget":
      summary.failed += 1;
      break;
    default:
      summary.skipped += 1;
  }
}

async function mineAll(
  summary: MiningJobSummary,
  clustering: ClusteringResult,
  runId: string,
  subjectId: string,
  budget: { maxClusters: number; runLimit: number; maxNewCardsPerDay: number; dayStart: Date; createdBefore: number },
  deps: MiningJobDeps,
): Promise<void> {
  const startedAt = deps.now().getTime();
  let consecutiveFailures = 0;
  let index = 0;

  for (const cluster of clustering.clusters) {
    const createdToday = Math.max(
      await deps.countCreatedSince(budget.dayStart),
      budget.createdBefore + summary.created,
    );
    const overRun =
      index >= budget.maxClusters ||
      summary.created >= budget.runLimit ||
      createdToday >= budget.maxNewCardsPerDay ||
      deps.now().getTime() - startedAt >= MINING_RUN_WALL_CLOCK_MS;

    if (overRun) {
      summary.status = "capped";
      break;
    }

    index += 1;

    const result = await deps.mine(cluster, { runId, subjectId });

    tally(summary, result);

    if (result.outcome === "skipped_breaker") {
      summary.status = "breaker_open";
      break;
    }

    if (result.outcome.startsWith("skipped_")) {
      summary.status = "capped";
      break;
    }

    if (result.outcome === "failed_budget") {
      summary.status = "budget_exceeded";
      break;
    }

    const isFailure = result.outcome === "failed" || result.outcome === "failed_retryable";

    consecutiveFailures = isFailure ? consecutiveFailures + 1 : 0;

    if (consecutiveFailures >= MINING_MAX_CONSECUTIVE_FAILURES) {
      summary.status = "breaker_open";
      break;
    }
  }

  const handled = summary.created + summary.duplicates + summary.notChain + summary.ungrounded + summary.failed;

  summary.skipped += Math.max(0, clustering.clusters.length - handled - summary.skipped);
}

export async function runCardSynthesisMining(
  query: MiningJobQuery = {},
  overrides: Partial<MiningJobDeps> = {},
): Promise<MiningJobSummary> {
  const deps: MiningJobDeps = { ...defaultDeps, ...overrides };
  const dryRun = query.dryRun ?? false;

  if (!dryRun && !isMiningEnabled()) {
    return emptySummary("disabled", dryRun);
  }

  if (dryRun) {
    return runMining(query, deps);
  }

  const locked = await deps.withLock(() => runMining(query, deps));

  return locked.acquired ? locked.value : emptySummary("already_running", dryRun);
}

async function runMining(query: MiningJobQuery, deps: MiningJobDeps): Promise<MiningJobSummary> {
  const dryRun = query.dryRun ?? false;
  const allowed = miningSubjectIds();

  if (allowed.length === 0) {
    return emptySummary("nothing_to_do", dryRun);
  }

  const limits = miningRunLimits();
  const now = deps.now();
  const batch = await deps.select(allowed, limits.maxBits);

  if (!batch) {
    return emptySummary("nothing_to_do", dryRun);
  }

  const clustering = clusterBits(batch.bits.map((bit) => ({ id: bit.id, embedding: bit.embedding })));
  const summary: MiningJobSummary = {
    ...emptySummary(dryRun ? "dry_run" : "ok", dryRun),
    subjectId: batch.subjectId,
    selected: batch.bits.length,
    clusters: clustering.clusters.length,
    costUsdToday: await deps.costToday(now),
  };

  if (dryRun) {
    return summary;
  }

  const runId = deps.newRunId();
  const dayStart = utcDayStart(now);
  const createdBefore = await deps.countCreatedSince(dayStart);
  const newCardsLeft = Math.min(limits.maxNewCards - createdBefore, query.limit ?? Infinity);

  summary.runId = runId;
  await deps.markUnclustered(runId, clustering.unclusteredBitIds);

  if (newCardsLeft <= 0) {
    summary.status = "capped";
    summary.skipped = clustering.clusters.length;

    return summary;
  }

  try {
    await deps.assertGlobalBudget();
  } catch (err) {
    log.warn({ err, runId }, "card_synthesis_mining_global_budget_blocked");
    summary.status = "budget_exceeded";
    summary.skipped = clustering.clusters.length;

    return summary;
  }

  const gate = await deps.checkGate(runId, null);

  if (!gate.allowed) {
    summary.status = gate.reason === "breaker_open" ? "breaker_open" : "capped";
    summary.skipped = clustering.clusters.length;

    return summary;
  }

  const maxClusters = Math.min(MINING_MAX_CLUSTERS_PER_RUN, query.limit ?? MINING_MAX_CLUSTERS_PER_RUN);

  await mineAll(
    summary,
    clustering,
    runId,
    batch.subjectId,
    { maxClusters, runLimit: query.limit ?? Infinity, maxNewCardsPerDay: limits.maxNewCards, dayStart, createdBefore },
    deps,
  );
  summary.costUsdToday = await deps.costToday(deps.now());
  log.info({ ...summary }, "card_synthesis_mining_done");

  return summary;
}
