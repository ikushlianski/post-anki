import { loadEnv } from "../shared/env.js";
import type { FeatureBudgetSpec, FeatureCaps } from "../llm-call-events/feature-budget.js";

export const KNOWN_CARDS_FEATURE_KEY = "known_cards";
export const KNOWN_CARDS_OP_EMBED = "known_cards_embed";
export const KNOWN_CARDS_OP_JUDGE = "known_cards_judge";
export const KNOWN_CARDS_OP_STEP = "known_cards_step";
export const KNOWN_CARDS_JUDGE_AGENT_KEY = "knownCardsJudge";

export const KNOWN_CARDS_TOP_K = 6;
export const KNOWN_CARDS_SIMILARITY_FLOOR = 0.6;
export const KNOWN_CARDS_MAX_CHUNKS_PER_SOURCE = 8;
export const KNOWN_CARDS_CHUNK_EMBED_CHARS = 2000;
export const KNOWN_CARDS_NOTE_EXCERPT_CHARS = 1500;
export const KNOWN_CARDS_BLOCK_MAX_ENTRIES = 5;
export const KNOWN_CARDS_BLOCK_MAX_CHARS = 1200;
export const KNOWN_CARDS_TOTAL_DEADLINE_MS = 20_000;
export const KNOWN_CARDS_JUDGE_DEADLINE_MS = 12_000;

export const KNOWN_CARDS_DEFAULT_CAPS: FeatureCaps = {
  dailyUsd: 0.1,
  dailyTokens: 350_000,
  monthlyUsd: 2,
  monthlyTokens: 7_000_000,
};

export const KNOWN_CARDS_WORST_CASE_USD = 0.002;
export const KNOWN_CARDS_WORST_CASE_TOKENS = 6_000;
export const KNOWN_CARDS_BREAKER_FAILURES = 5;
export const KNOWN_CARDS_BREAKER_COOLDOWN_MS = 30 * 60 * 1000;

const OFF_VALUES = new Set(["false", "0", "off", "no"]);

interface KnownCardsEnv {
  KNOWN_CARDS_CONTEXT_ENABLED?: string;
  KNOWN_CARDS_DAILY_BUDGET_USD?: number;
  KNOWN_CARDS_DAILY_TOKENS?: number;
  KNOWN_CARDS_MONTHLY_BUDGET_USD?: number;
  KNOWN_CARDS_MONTHLY_TOKENS?: number;
}

function readEnv(): KnownCardsEnv {
  try {
    return loadEnv();
  } catch {
    return { KNOWN_CARDS_CONTEXT_ENABLED: process.env.KNOWN_CARDS_CONTEXT_ENABLED };
  }
}

export function isKnownCardsEnabled(env: KnownCardsEnv = readEnv()): boolean {
  const raw = env.KNOWN_CARDS_CONTEXT_ENABLED;

  return raw === undefined || !OFF_VALUES.has(raw.trim().toLowerCase());
}

export function knownCardsCaps(env: KnownCardsEnv = readEnv()): FeatureCaps {
  return {
    dailyUsd: env.KNOWN_CARDS_DAILY_BUDGET_USD ?? KNOWN_CARDS_DEFAULT_CAPS.dailyUsd,
    dailyTokens: env.KNOWN_CARDS_DAILY_TOKENS ?? KNOWN_CARDS_DEFAULT_CAPS.dailyTokens,
    monthlyUsd: env.KNOWN_CARDS_MONTHLY_BUDGET_USD ?? KNOWN_CARDS_DEFAULT_CAPS.monthlyUsd,
    monthlyTokens: env.KNOWN_CARDS_MONTHLY_TOKENS ?? KNOWN_CARDS_DEFAULT_CAPS.monthlyTokens,
  };
}

export function knownCardsBudgetSpec(env: KnownCardsEnv = readEnv()): FeatureBudgetSpec {
  return {
    featureKey: KNOWN_CARDS_FEATURE_KEY,
    stepOp: KNOWN_CARDS_OP_STEP,
    caps: knownCardsCaps(env),
    worstCaseUsd: KNOWN_CARDS_WORST_CASE_USD,
    worstCaseTokens: KNOWN_CARDS_WORST_CASE_TOKENS,
    breaker: {
      failureThreshold: KNOWN_CARDS_BREAKER_FAILURES,
      cooldownMs: KNOWN_CARDS_BREAKER_COOLDOWN_MS,
    },
  };
}
