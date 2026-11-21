import { ZodError } from "zod";
import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import { LlmBudgetExceededError } from "../shared/spend-guard.js";
import { checkMiningGate, recordMiningClusterStep } from "./card-synthesis-mining.budget.js";
import { loadEvidenceCards } from "./card-synthesis-mining.cards.repo.js";
import { classifyCluster } from "./card-synthesis-mining.classifier.js";
import { hasNearDuplicateOverview } from "./card-synthesis-mining.duplicate-gate.js";
import { MINING_MAX_EVIDENCE_CARDS } from "./card-synthesis-mining.prompt.js";
import {
  composeOverviewCard,
  submitOverview,
  synthesisImportKey,
  synthesisSourceExists,
} from "./card-synthesis-mining.submit.js";
import {
  UngroundedOverviewError,
  type EvidenceCard,
  type MineResult,
  type MiningOutcome,
  type OverviewCard,
} from "./card-synthesis-mining.types.js";
import { writeOverview } from "./card-synthesis-mining.writer.js";
import { insertMiningCluster } from "./card-synthesis-mining-ledger.repo.js";
import { markClusterExamined } from "./card-synthesis-mining-marking.js";
import type { MiningCluster } from "./card-synthesis-mining.clustering.js";

export interface MineDeps {
  checkGate: typeof checkMiningGate;
  loadCards: (bitIds: string[]) => Promise<EvidenceCard[]>;
  sourceExists: (key: string) => Promise<boolean>;
  classify: typeof classifyCluster;
  hasDuplicate: typeof hasNearDuplicateOverview;
  write: typeof writeOverview;
  submit: typeof submitOverview;
  recordStep: typeof recordMiningClusterStep;
  insertCluster: typeof insertMiningCluster;
  markExamined: typeof markClusterExamined;
}

export interface MineContext {
  runId: string;
  subjectId: string;
  clusterId?: string;
  deps?: Partial<MineDeps>;
}

const defaultDeps: MineDeps = {
  checkGate: checkMiningGate,
  loadCards: loadEvidenceCards,
  sourceExists: synthesisSourceExists,
  classify: classifyCluster,
  hasDuplicate: hasNearDuplicateOverview,
  write: writeOverview,
  submit: submitOverview,
  recordStep: recordMiningClusterStep,
  insertCluster: insertMiningCluster,
  markExamined: markClusterExamined,
};

interface Pipeline {
  outcome: MiningOutcome;
  sourceId: string | null;
  bitId: string | null;
  card: OverviewCard | null;
}

const gateOutcome: Record<string, MiningOutcome> = {
  disabled: "skipped_disabled",
  cap_daily: "skipped_cap",
  cap_monthly: "skipped_cap",
  breaker_open: "skipped_breaker",
};

function ended(outcome: MiningOutcome, card: OverviewCard | null = null): Pipeline {
  return { outcome, sourceId: null, bitId: null, card };
}

async function runPipeline(
  cluster: MiningCluster,
  ctx: MineContext,
  clusterId: string,
  deps: MineDeps,
): Promise<Pipeline> {
  const audit = { runId: ctx.runId, clusterId };
  const cards = await deps.loadCards(cluster.bitIds.slice(0, MINING_MAX_EVIDENCE_CARDS));
  const key = synthesisImportKey(ctx.subjectId, cards.map((card) => card.id));

  if (await deps.sourceExists(key)) {
    return ended("duplicate_existing");
  }

  const verdict = await deps.classify(cards, audit);

  if (!verdict.isChain) {
    log.info({ clusterId, reason: verdict.reason }, "card_synthesis_mining_not_chain");

    return ended("not_chain");
  }

  if (await deps.hasDuplicate(verdict.title, audit)) {
    return ended("duplicate_existing");
  }

  let card: OverviewCard;

  try {
    card = composeOverviewCard(verdict.title, await deps.write(cards, verdict.title, audit), cards);
  } catch (err) {
    if (err instanceof UngroundedOverviewError) {
      log.warn({ clusterId, err: err.message }, "card_synthesis_mining_ungrounded");

      return ended("rejected_ungrounded");
    }

    throw err;
  }

  const submitted = await deps.submit(card, ctx.subjectId, key);

  if (submitted.status === "already_present") {
    return ended("duplicate_existing", card);
  }

  return { outcome: "synthesized", sourceId: submitted.sourceId, bitId: submitted.bitId, card };
}

async function persistCluster(
  cluster: MiningCluster,
  ctx: MineContext,
  clusterId: string,
  result: Pipeline,
  deps: MineDeps,
): Promise<void> {
  try {
    await deps.insertCluster({
      id: clusterId,
      runId: ctx.runId,
      subjectId: ctx.subjectId,
      bitIds: cluster.bitIds,
      evidenceBitIds: result.card?.evidenceBitIds ?? [],
      evidenceLink: result.card?.evidenceLink ?? null,
      outcome: result.outcome,
      sourceId: result.sourceId,
    });
    await deps.markExamined(ctx.runId, clusterId, cluster, result.outcome);
  } catch (err) {
    log.warn({ err, clusterId, runId: ctx.runId }, "card_synthesis_mining_persist_failed");
  }
}

const INVALID_OUTPUT_PREFIX = "card_synthesis_invalid_output";

export function classifyMiningFailure(err: unknown): MiningOutcome {
  if (err instanceof LlmBudgetExceededError) {
    return "failed_budget";
  }

  if (err instanceof ZodError || (err instanceof Error && err.message.startsWith(INVALID_OUTPUT_PREFIX))) {
    return "failed";
  }

  return "failed_retryable";
}

export async function mineCluster(cluster: MiningCluster, ctx: MineContext): Promise<MineResult> {
  const deps: MineDeps = { ...defaultDeps, ...ctx.deps };
  const clusterId = ctx.clusterId ?? newId("smc");
  const startedAt = Date.now();

  try {
    const gate = await deps.checkGate(ctx.runId, clusterId);

    if (!gate.allowed) {
      const outcome = gateOutcome[gate.reason] ?? "skipped_gate";

      return { outcome, clusterId, sourceId: null, bitId: null };
    }

    const result = await runPipeline(cluster, ctx, clusterId, deps);

    await deps.recordStep("ok", ctx.runId, clusterId, Date.now() - startedAt);
    await persistCluster(cluster, ctx, clusterId, result, deps);

    return { outcome: result.outcome, clusterId, sourceId: result.sourceId, bitId: result.bitId };
  } catch (err) {
    log.warn({ err, clusterId, runId: ctx.runId }, "card_synthesis_mining_cluster_failed");

    const outcome = classifyMiningFailure(err);

    try {
      await deps.recordStep("failed", ctx.runId, clusterId, Date.now() - startedAt, err);
      await persistCluster(cluster, ctx, clusterId, ended(outcome), deps);
    } catch (innerErr) {
      log.warn({ err: innerErr, clusterId }, "card_synthesis_mining_failure_record_failed");
    }

    return { outcome, clusterId, sourceId: null, bitId: null };
  }
}
