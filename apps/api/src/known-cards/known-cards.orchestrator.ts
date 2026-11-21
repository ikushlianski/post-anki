import { recordLlmCallEvent } from "../llm-call-events/llm-call-events.repo.js";
import { log } from "../shared/log.js";
import { buildKnownCardsBlock } from "./known-cards.block.js";
import { checkKnownCardsGate } from "./known-cards.budget.js";
import {
  KNOWN_CARDS_JUDGE_AGENT_KEY,
  KNOWN_CARDS_OP_STEP,
  KNOWN_CARDS_TOTAL_DEADLINE_MS,
} from "./known-cards.config.js";
import { recordKnownCardsSkip } from "./known-cards-ledger.repo.js";
import { judgeKnownCards } from "./known-cards.judge.js";
import { retrieveKnownCardCandidates } from "./known-cards.retrieval.js";
import type { KnownCardsContext } from "./known-cards.types.js";

class KnownCardsDeadlineError extends Error {
  constructor() {
    super("known_cards_deadline");
  }
}

function withDeadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new KnownCardsDeadlineError()),
      KNOWN_CARDS_TOTAL_DEADLINE_MS,
    );
  });

  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

async function recordStep(
  ctx: KnownCardsContext,
  outcome: "ok" | "failed",
  durationMs: number,
  err?: unknown,
): Promise<void> {
  try {
    await recordLlmCallEvent({
      curriculumId: null,
      op: KNOWN_CARDS_OP_STEP,
      agentKey: KNOWN_CARDS_JUDGE_AGENT_KEY,
      purpose: "cards",
      knowledgeSourceId: ctx.knowledgeSourceId,
      outcome,
      durationMs,
      success: outcome === "ok",
      errorMessage:
        outcome === "ok"
          ? null
          : err instanceof Error
            ? err.message
            : String(err),
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    });
  } catch (writeErr) {
    log.warn({ err: writeErr }, "known_cards_step_record_failed");
  }
}

let probeInFlight = false;

interface Stats {
  retrieved: number;
  judged: number;
  exact: number;
  near: number;
  related: number;
}

async function run(
  chunkText: string,
  ctx: KnownCardsContext,
  stats: Stats,
): Promise<string> {
  const candidates = await retrieveKnownCardCandidates(
    chunkText,
    ctx.knowledgeSourceId,
  );

  stats.retrieved = candidates.length;

  if (candidates.length === 0) {
    return "";
  }

  const judged = await judgeKnownCards(
    chunkText,
    candidates,
    ctx.knowledgeSourceId,
  );

  stats.judged = judged.length;

  for (const card of judged) {
    stats[card.verdict] += 1;
  }

  for (const card of judged) {
    log.info(
      {
        knowledgeSourceId: ctx.knowledgeSourceId,
        verdict: card.verdict,
        reason: card.reason,
      },
      "known_cards_judge_reason",
    );
  }

  return buildKnownCardsBlock(judged);
}

export async function resolveKnownCardsBlock(
  chunkText: string,
  ctx: KnownCardsContext,
): Promise<string> {
  const startedAt = Date.now();
  const stats: Stats = {
    retrieved: 0,
    judged: 0,
    exact: 0,
    near: 0,
    related: 0,
  };
  let probing = false;

  try {
    const gate = await checkKnownCardsGate(ctx.knowledgeSourceId);

    if (!gate.allowed) {
      log.info(
        { ...ctx, outcome: "skipped", degradedReason: gate.reason },
        "known_cards_context",
      );

      return "";
    }

    if (gate.probe) {
      if (probeInFlight) {
        await recordKnownCardsSkip(
          "skipped_breaker",
          ctx.knowledgeSourceId,
        ).catch(() => undefined);

        return "";
      }

      probeInFlight = true;
      probing = true;
    }

    const block = await withDeadline(run(chunkText, ctx, stats));
    const durationMs = Date.now() - startedAt;

    await recordStep(ctx, "ok", durationMs);

    log.info(
      {
        ...ctx,
        ...stats,
        injected: block.length > 0,
        outcome: "ok",
        durationMs,
      },
      "known_cards_context",
    );

    return block;
  } catch (err) {
    const durationMs = Date.now() - startedAt;

    log.warn(
      {
        ...ctx,
        ...stats,
        injected: false,
        outcome: "failed",
        degradedReason: err instanceof Error ? err.message : "unknown",
        durationMs,
      },
      "known_cards_context",
    );

    await recordStep(ctx, "failed", durationMs, err);

    return "";
  } finally {
    if (probing) {
      probeInFlight = false;
    }
  }
}
