import { loadEnv } from "../shared/env.js";
import type { FeatureBudgetSpec, FeatureCaps } from "../llm-call-events/feature-budget.js";

export const MINING_FEATURE_KEY = "card_synthesis_mining";
export const MINING_OP_CLASSIFY = "card_synthesis_mining_classify";
export const MINING_OP_EMBED = "card_synthesis_mining_embed";
export const MINING_OP_WRITE = "card_synthesis_mining_write";
export const MINING_OP_STEP = "card_synthesis_mining_step";
export const MINING_AGENT_KEY = "cardSynthesisMining";

export const MINING_CLUSTER_SIMILARITY = 0.6;
export const MINING_DUPLICATE_SIMILARITY = 0.85;
export const MINING_MAX_BITS_PER_DAY = 60;
export const MINING_MAX_NEW_CARDS_PER_DAY = 3;

export const MINING_DEFAULT_CAPS: FeatureCaps = {
  dailyUsd: 0.05,
  dailyTokens: 150_000,
  monthlyUsd: 1,
  monthlyTokens: 3_000_000,
};

export const MINING_WORST_CASE_USD = 0.003;
export const MINING_WORST_CASE_TOKENS = 8_000;
export const MINING_BREAKER_FAILURES = 3;
export const MINING_BREAKER_COOLDOWN_MS = 60 * 60 * 1000;

const ON_VALUES = new Set(["true", "1", "on", "yes"]);

export interface MiningEnv {
  CARD_SYNTHESIS_MINING_ENABLED?: string;
  CARD_SYNTHESIS_MINING_SUBJECT_IDS?: string;
  CARD_SYNTHESIS_MINING_DAILY_BUDGET_USD?: number;
  CARD_SYNTHESIS_MINING_DAILY_TOKENS?: number;
  CARD_SYNTHESIS_MINING_MONTHLY_BUDGET_USD?: number;
  CARD_SYNTHESIS_MINING_MAX_BITS_PER_DAY?: number;
  CARD_SYNTHESIS_MINING_MAX_NEW_CARDS_PER_DAY?: number;
}

function readEnv(): MiningEnv {
  try {
    return loadEnv();
  } catch {
    return {
      CARD_SYNTHESIS_MINING_ENABLED: process.env.CARD_SYNTHESIS_MINING_ENABLED,
      CARD_SYNTHESIS_MINING_SUBJECT_IDS: process.env.CARD_SYNTHESIS_MINING_SUBJECT_IDS,
    };
  }
}

export function isMiningEnabled(env: MiningEnv = readEnv()): boolean {
  const raw = env.CARD_SYNTHESIS_MINING_ENABLED;

  return raw !== undefined && ON_VALUES.has(raw.trim().toLowerCase());
}

export function miningSubjectIds(env: MiningEnv = readEnv()): string[] {
  const ids = (env.CARD_SYNTHESIS_MINING_SUBJECT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  return [...new Set(ids)];
}

export function miningCaps(env: MiningEnv = readEnv()): FeatureCaps {
  return {
    dailyUsd: env.CARD_SYNTHESIS_MINING_DAILY_BUDGET_USD ?? MINING_DEFAULT_CAPS.dailyUsd,
    dailyTokens: env.CARD_SYNTHESIS_MINING_DAILY_TOKENS ?? MINING_DEFAULT_CAPS.dailyTokens,
    monthlyUsd: env.CARD_SYNTHESIS_MINING_MONTHLY_BUDGET_USD ?? MINING_DEFAULT_CAPS.monthlyUsd,
    monthlyTokens: MINING_DEFAULT_CAPS.monthlyTokens,
  };
}

export function miningRunLimits(env: MiningEnv = readEnv()): { maxBits: number; maxNewCards: number } {
  return {
    maxBits: env.CARD_SYNTHESIS_MINING_MAX_BITS_PER_DAY ?? MINING_MAX_BITS_PER_DAY,
    maxNewCards: env.CARD_SYNTHESIS_MINING_MAX_NEW_CARDS_PER_DAY ?? MINING_MAX_NEW_CARDS_PER_DAY,
  };
}

export function isMiningActive(env: MiningEnv = readEnv()): boolean {
  return isMiningEnabled(env) && miningSubjectIds(env).length > 0;
}

export function miningBudgetSpec(env: MiningEnv = readEnv()): FeatureBudgetSpec {
  return {
    featureKey: MINING_FEATURE_KEY,
    stepOp: MINING_OP_STEP,
    caps: miningCaps(env),
    worstCaseUsd: MINING_WORST_CASE_USD,
    worstCaseTokens: MINING_WORST_CASE_TOKENS,
    breaker: {
      failureThreshold: MINING_BREAKER_FAILURES,
      cooldownMs: MINING_BREAKER_COOLDOWN_MS,
    },
  };
}
