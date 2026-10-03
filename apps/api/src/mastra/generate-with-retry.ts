import pRetry from "p-retry";
import { log } from "../shared/log.js";
import { recordLlmCallEvent } from "../llm-call-events/llm-call-events.repo.js";

// Every real network/model call to an LLM agent across the codebase should
// go through one of the two wrappers below so every call lands a row in
// `llm_call_events` — the shared home for that recording (and, for callers
// that want it, a bounded retry) since no single domain module owns every
// agent.generate() call site.
const AGENT_GENERATE_RETRIES = 2;

/**
 * `recordLlmCallEvent` already catches its own DB-write failures (see
 * llm-call-events.repo.ts) — this second layer of defense exists purely so
 * that a bug in that guarantee, or any other unexpected rejection from the
 * observability call itself, can never surface as a caller-visible failure.
 * Observability plumbing must never break or mask the actual LLM-call result.
 */
async function safeRecordLlmCallEvent(
  input: Parameters<typeof recordLlmCallEvent>[0],
): Promise<void> {
  try {
    await recordLlmCallEvent(input);
  } catch (err) {
    log.warn(
      { err, op: input.op, curriculumId: input.curriculumId },
      "llm_call_event_record_failed",
    );
  }
}

// Shape of Mastra's `LanguageModelV2Usage` (`@mastra/core`'s AI-SDK-v5-based
// generate() result) actually carries `inputTokens`/`outputTokens`, not the
// older `promptTokens`/`completionTokens` naming — confirmed against
// `@mastra/core@1.37.1`'s own installed type defs.
export type GenerateUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type GenerateResultWithUsage = {
  usage?: GenerateUsage;
  // `usage` alone reflects only the last tool-calling step; `totalUsage` is
  // the full multi-step aggregate — prefer it when present.
  totalUsage?: GenerateUsage;
};

function tokenCostFrom(result: GenerateResultWithUsage) {
  return {
    promptTokens:
      result.totalUsage?.inputTokens ?? result.usage?.inputTokens ?? null,
    completionTokens:
      result.totalUsage?.outputTokens ?? result.usage?.outputTokens ?? null,
    totalTokens:
      result.totalUsage?.totalTokens ?? result.usage?.totalTokens ?? null,
  };
}

/**
 * Full wrapper: bounded retry (2 retries, 3 attempts total) around `fn`
 * PLUS recording of the whole retry sequence's outcome, not each individual
 * attempt. Use this for a call site that has no retry/error-handling logic
 * of its own. `curriculumId` is `null` for a call with no curriculum in
 * scope (e.g. a subject- or topic-scoped call).
 */
export async function generateWithRetry<T extends GenerateResultWithUsage>(
  op: string,
  curriculumId: string | null,
  agentKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();

  let result: T;

  try {
    result = await pRetry(fn, {
      retries: AGENT_GENERATE_RETRIES,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        log.warn(
          { curriculumId, op, attempt: attemptNumber, retriesLeft, err: error },
          "agent_generate_retry",
        );
      },
    });
  } catch (err) {
    await safeRecordLlmCallEvent({
      curriculumId,
      op,
      agentKey,
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    });

    throw err;
  }

  await safeRecordLlmCallEvent({
    curriculumId,
    op,
    agentKey,
    durationMs: Date.now() - startedAt,
    success: true,
    errorMessage: null,
    ...tokenCostFrom(result),
  });

  return result;
}

/**
 * Recording-only half of `generateWithRetry`, for a call site that already
 * has its own retry/error-handling shape that must not change — times and
 * records `fn`'s outcome without imposing any retry policy, then rethrows
 * unchanged on failure so the caller's existing error handling is
 * unaffected.
 */
export async function recordGenerateCall<T extends GenerateResultWithUsage>(
  op: string,
  curriculumId: string | null,
  agentKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();

  let result: T;

  try {
    result = await fn();
  } catch (err) {
    await safeRecordLlmCallEvent({
      curriculumId,
      op,
      agentKey,
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    });

    throw err;
  }

  await safeRecordLlmCallEvent({
    curriculumId,
    op,
    agentKey,
    durationMs: Date.now() - startedAt,
    success: true,
    errorMessage: null,
    ...tokenCostFrom(result),
  });

  return result;
}
