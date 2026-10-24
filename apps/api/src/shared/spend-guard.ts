import { loadEnv, type Env } from "./env.js";

function warnLater(fields: Record<string, number>, message: string): void {
  void import("./log.js").then(({ log }) => log.warn(fields, message));
}

export class LlmBudgetExceededError extends Error {
  readonly code = "LLM_BUDGET_EXCEEDED";

  constructor(
    readonly spentUsd: number,
    readonly budgetUsd: number,
  ) {
    super(
      `LLM daily budget reached: spent about $${spentUsd.toFixed(4)} of $${budgetUsd} (UTC day). Raise LLM_DAILY_BUDGET_USD or wait for the next UTC day.`,
    );
    this.name = "LlmBudgetExceededError";
  }
}

// Blended USD per 1M tokens (input and output averaged); estimates, not billing.
const USD_PER_MILLION_TOKENS: Record<string, number> = {
  "openrouter/deepseek/deepseek-v4-flash": 0.3,
  "openrouter/openai/gpt-4o-mini": 0.4,
  "openrouter/deepseek/deepseek-v4-pro": 2,
  "openai/text-embedding-3-small": 0.02,
};
const DEFAULT_USD_PER_MILLION_TOKENS = 1;
export const FLAT_CALL_TOKEN_ESTIMATE = 4000;
export const FLAT_TRANSCRIPTION_USD = 0.005;
const WARN_RATIO = 0.8;

interface DayState {
  day: string;
  spentUsd: number;
  warnedNear: boolean;
  warnedCap: boolean;
}

let state: DayState = { day: "", spentUsd: 0, warnedNear: false, warnedCap: false };

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function current(): DayState {
  const day = utcDay();

  if (state.day !== day) {
    state = { day, spentUsd: 0, warnedNear: false, warnedCap: false };
  }

  return state;
}

// Env is validated at boot, so a load failure only happens in unit tests without env.
function tryLoadEnv(): Env | null {
  try {
    return loadEnv();
  } catch {
    return null;
  }
}

export function isCheapLlmMode(): boolean {
  return tryLoadEnv()?.LLM_MODE === "cheap";
}

function guardActive(): { budget: number } | null {
  const env = tryLoadEnv();

  if (!env || env.LLM_MODE === "mock" || env.LLM_DAILY_BUDGET_USD <= 0) {
    return null;
  }

  return { budget: env.LLM_DAILY_BUDGET_USD };
}

export function estimateCostUsd(modelId: string, tokens: number | null | undefined): number {
  const rate = USD_PER_MILLION_TOKENS[modelId] ?? DEFAULT_USD_PER_MILLION_TOKENS;

  return ((tokens ?? FLAT_CALL_TOKEN_ESTIMATE) / 1_000_000) * rate;
}

export function assertLlmBudgetAvailable(): void {
  const active = guardActive();

  if (!active) {
    return;
  }

  const s = current();

  if (s.spentUsd >= active.budget) {
    throw new LlmBudgetExceededError(s.spentUsd, active.budget);
  }
}

export function recordLlmSpend(costUsd: number): void {
  const active = guardActive();

  if (!active || costUsd <= 0) {
    return;
  }

  const s = current();

  s.spentUsd += costUsd;

  if (s.spentUsd >= active.budget && !s.warnedCap) {
    s.warnedCap = true;
    warnLater({ spentUsd: s.spentUsd, budgetUsd: active.budget }, "llm_daily_budget_reached");
  } else if (s.spentUsd >= active.budget * WARN_RATIO && !s.warnedNear && !s.warnedCap) {
    s.warnedNear = true;
    warnLater({ spentUsd: s.spentUsd, budgetUsd: active.budget }, "llm_daily_budget_80_percent");
  }
}

export function getLlmSpendTodayUsd(): number {
  return current().spentUsd;
}

export function resetLlmSpendForTests(): void {
  state = { day: "", spentUsd: 0, warnedNear: false, warnedCap: false };
}

export function secondsUntilUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);

  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
