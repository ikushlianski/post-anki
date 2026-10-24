import { loadEnv, type Env } from "./env.js";
import { addDailySpendUsd, readDailySpendUsd } from "./llm-daily-spend.repo.js";

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

export class LlmBudgetCheckUnavailableError extends Error {
  readonly code = "LLM_BUDGET_CHECK_UNAVAILABLE";

  constructor(cause: unknown) {
    super("LLM daily budget could not be verified, so the paid call was refused. Try again shortly.", {
      cause,
    });
    this.name = "LlmBudgetCheckUnavailableError";
  }
}

// Fail closed: if the shared total cannot be read, a paid call is refused rather than risk overspending.
export async function assertLlmBudgetAvailable(): Promise<void> {
  const active = guardActive();

  if (!active) {
    return;
  }

  const s = current();
  let spentUsd: number;

  try {
    spentUsd = await readDailySpendUsd(s.day);
  } catch (err) {
    throw new LlmBudgetCheckUnavailableError(err);
  }

  s.spentUsd = Math.max(s.spentUsd, spentUsd);

  if (spentUsd >= active.budget) {
    throw new LlmBudgetExceededError(spentUsd, active.budget);
  }
}

// Sync best-effort check against the last total this process saw, for call sites that cannot await.
export function assertLlmBudgetKnownAvailable(): void {
  const active = guardActive();

  if (!active) {
    return;
  }

  const s = current();

  if (s.spentUsd >= active.budget) {
    throw new LlmBudgetExceededError(s.spentUsd, active.budget);
  }
}

// The call already happened and was paid for, so a failed write is logged, never thrown.
export async function recordLlmSpend(costUsd: number): Promise<void> {
  const active = guardActive();

  if (!active || costUsd <= 0) {
    return;
  }

  const s = current();
  let totalUsd: number;

  try {
    totalUsd = await addDailySpendUsd(s.day, costUsd);
  } catch {
    s.spentUsd += costUsd;
    warnLater({ costUsd }, "llm_spend_write_failed");

    return;
  }

  s.spentUsd = Math.max(s.spentUsd, totalUsd);

  if (totalUsd >= active.budget && !s.warnedCap) {
    s.warnedCap = true;
    warnLater({ spentUsd: totalUsd, budgetUsd: active.budget }, "llm_daily_budget_reached");
  } else if (totalUsd >= active.budget * WARN_RATIO && !s.warnedNear && !s.warnedCap) {
    s.warnedNear = true;
    warnLater({ spentUsd: totalUsd, budgetUsd: active.budget }, "llm_daily_budget_80_percent");
  }
}

export async function getLlmSpendTodayUsd(): Promise<number> {
  return readDailySpendUsd(current().day);
}

export function resetLlmSpendForTests(): void {
  state = { day: "", spentUsd: 0, warnedNear: false, warnedCap: false };
}

export function secondsUntilUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);

  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
