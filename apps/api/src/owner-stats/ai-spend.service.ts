import type { OwnerStatsAiSpend, OwnerStatsAiSpendQuery } from "@post-anki/shared";
import { purposeForAgent, type LlmPurpose } from "../llm-call-events/agent-purpose.js";
import { loadEnv } from "../shared/env.js";
import { readAiSpendRows, type AiSpendRow } from "./ai-spend.repo.js";
import { readTriageByModel } from "./triage-by-model.repo.js";
import { costUsd, priceFor, resolveModelId } from "./llm-pricing.js";

type Totals = Record<LlmPurpose, number>;

const emptyTotals = (): Totals => ({ cards: 0, chat: 0, other: 0 });

function classify(row: AiSpendRow): LlmPurpose {
  if (row.purpose === "cards" || row.purpose === "chat" || row.purpose === "other") {
    return row.purpose;
  }

  return purposeForAgent(row.agentKey);
}

export function foldAiSpend(rows: AiSpendRow[], env: string): OwnerStatsAiSpend {
  const byDay = new Map<string, Totals>();
  const byModel = new Map<string, number>();
  const totals = emptyTotals();
  const unpriced = { calls: 0, tokens: 0 };

  for (const row of rows) {
    const modelId = resolveModelId(row.modelId, row.agentKey);
    const price = modelId ? priceFor(modelId, new Date(`${row.date}T00:00:00Z`)) : null;

    if (!price) {
      unpriced.calls += row.calls;
      unpriced.tokens += row.unpricedTokens + row.promptTokens + row.completionTokens;
      continue;
    }

    unpriced.calls += row.calls - row.priceableCalls;
    unpriced.tokens += row.unpricedTokens;

    if (row.priceableCalls === 0) {
      continue;
    }

    const usd = costUsd(price, row.promptTokens, row.completionTokens);
    const purpose = classify(row);
    const day = byDay.get(row.date) ?? emptyTotals();

    day[purpose] += usd;
    byDay.set(row.date, day);
    totals[purpose] += usd;

    if (modelId) {
      byModel.set(modelId, (byModel.get(modelId) ?? 0) + usd);
    }
  }

  return {
    currency: "USD",
    estimated: true,
    days: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, cardsUsd: d.cards, chatUsd: d.chat, otherUsd: d.other })),
    totals: { cardsUsd: totals.cards, chatUsd: totals.chat, otherUsd: totals.other },
    byModel: [...byModel.entries()].map(([modelId, usd]) => ({ modelId, usd })).sort((a, b) => b.usd - a.usd),
    triageByModel: [],
    unpriced,
    env,
  };
}

export async function getAiSpend(query: OwnerStatsAiSpendQuery, now: Date = new Date()): Promise<OwnerStatsAiSpend> {
  const rows = await readAiSpendRows({ tz: query.tz, days: query.days, now });

  const triageByModel = await readTriageByModel({ tz: query.tz, days: query.days, now });

  return { ...foldAiSpend(rows, loadEnv().NODE_ENV ?? "development"), triageByModel };
}
