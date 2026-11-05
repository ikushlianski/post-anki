import {
  CHAT_QUEUE_MAX_PROPOSALS,
  CHAT_QUEUE_REPLY_MAX_TOKENS,
  type ChatQueueErrorCode,
  type ChatQueueThread,
  type RelatedCardSuggestion,
  type SendChatQueueMessageInput,
  type SendChatQueueMessageResult,
} from "@post-anki/shared";
import { RequestContext } from "@mastra/core/request-context";
import { getDb } from "../db/client.js";
import { countRecentLlmCallEventsByOp } from "../llm-call-events/llm-call-events.repo.js";
import { AGENT_KEYS, getMastra, startTracingSpan } from "../mastra/mastra.js";
import {
  CHAT_QUEUE_FALLBACK_CONTEXT_KEY,
  CHAT_QUEUE_WEB_TOOLS_CONTEXT_KEY,
} from "../mastra/knowledge-bit-chat-queue.agent.js";
import type { KnowledgeBitChatToolsDeps } from "../mastra/knowledge-bit-chat-tools.js";
import { generateWithRetry, isRateLimitError } from "../mastra/generate-with-retry.js";
import { log } from "../shared/log.js";
import {
  LlmBudgetCheckUnavailableError,
  LlmBudgetExceededError,
  assertLlmBudgetAvailable,
} from "../shared/spend-guard.js";
import {
  buildChatQueueTraceMetadata,
  buildChatQueueTracingOptions,
  chatQueueOutcomeFor,
  type ChatQueueTraceMetadata,
  type ChatQueueTraceOutcome,
} from "./knowledge-bit-chat-queue.trace.js";
import { extractRelatedCards } from "./knowledge-bit-chat-suggestions.js";
import { buildChatQueuePrompt } from "./knowledge-bit-chat-queue.prompt.js";
import { loadChatCardContext, lockChatState } from "./knowledge-bit-chat-queue.repo.js";
import {
  deleteLastChatExchange,
  insertChatTurn,
  listChatQueueMessages,
  toPublicMessages,
  turnsLeftFor,
  turnsUsed,
  type StoredChatMessage,
} from "./knowledge-bit-chat-queue-messages.repo.js";

export const CHAT_QUEUE_REPLY_OP = "knowledge_bit_chat_queue_reply";
export const CHAT_QUEUE_HOURLY_CAP = 60;
const HOUR_MS = 60 * 60 * 1000;
const WEB_REPLY_MAX_STEPS = 4;

export interface SendChatQueueMessageOptions {
  webTools?: KnowledgeBitChatToolsDeps;
}

export type ChatQueueFailure = ChatQueueErrorCode | "not_found" | "no_messages" | "model_failed";

export type ChatQueueResult<T> = { ok: true; value: T } | { ok: false; error: ChatQueueFailure };

const inFlight = new Set<string>();

function isChatThreadState(state: string | null): boolean {
  return state === "chat" || state === "approved";
}

function threadOf(messages: StoredChatMessage[]): ChatQueueThread {
  const turnsLeft = turnsLeftFor(messages);

  return { messages: toPublicMessages(messages), turnsLeft, capReached: turnsLeft === 0 };
}

function replayOf(messages: StoredChatMessage[], clientMessageId: string): SendChatQueueMessageResult | null {
  const index = messages.findIndex((entry) => entry.role === "user" && entry.clientMessageId === clientMessageId);
  const reply = index === -1 ? undefined : messages[index + 1];

  if (!reply || reply.role !== "assistant") {
    return null;
  }

  const { turnsLeft, capReached } = threadOf(messages);

  return { reply: reply.text, turnsLeft, capReached };
}

export async function getChatQueueThread(bitId: string): Promise<ChatQueueResult<ChatQueueThread>> {
  const card = await loadChatCardContext(bitId);

  if (!card) {
    return { ok: false, error: "not_found" };
  }

  if (!isChatThreadState(card.approvalState)) {
    return { ok: false, error: "not_in_chat" };
  }

  return { ok: true, value: threadOf(await listChatQueueMessages(bitId)) };
}

async function budgetGate(): Promise<ChatQueueFailure | null> {
  try {
    await assertLlmBudgetAvailable();
  } catch (err) {
    if (err instanceof LlmBudgetExceededError || err instanceof LlmBudgetCheckUnavailableError) {
      return "budget_paused";
    }

    throw err;
  }

  const used = await countRecentLlmCallEventsByOp(CHAT_QUEUE_REPLY_OP, HOUR_MS);

  return used + inFlight.size >= CHAT_QUEUE_HOURLY_CAP ? "budget_paused" : null;
}

async function persistTurn(
  bitId: string,
  input: SendChatQueueMessageInput,
  reply: string,
  usage: { inputTokens: number | null; outputTokens: number | null },
): Promise<ChatQueueFailure | null> {
  try {
    return await getDb().transaction(async (tx) => {
      if (!isChatThreadState(await lockChatState(tx, bitId))) {
        return "not_in_chat" as const;
      }

      await insertChatTurn(
        bitId,
        { clientMessageId: input.clientMessageId, userText: input.message, assistantText: reply, modelId: null, ...usage },
        tx,
      );

      return null;
    });
  } catch (err) {
    log.warn({ err, bitId }, "chat_queue_persist_failed");

    return "in_flight";
  }
}

export async function sendChatQueueMessage(
  bitId: string,
  input: SendChatQueueMessageInput,
  options: SendChatQueueMessageOptions = {},
): Promise<ChatQueueResult<SendChatQueueMessageResult>> {
  const card = await loadChatCardContext(bitId);

  if (!card) {
    return { ok: false, error: "not_found" };
  }

  if (!isChatThreadState(card.approvalState)) {
    return { ok: false, error: "not_in_chat" };
  }

  const messages = await listChatQueueMessages(bitId);
  const replay = replayOf(messages, input.clientMessageId);

  if (replay) {
    return { ok: true, value: replay };
  }

  if (turnsLeftFor(messages) === 0) {
    return { ok: false, error: "cap_reached" };
  }

  const traceMetadata = buildChatQueueTraceMetadata(bitId, turnsUsed(messages));
  const span = startTracingSpan("chat_queue.reply", { ...traceMetadata });

  if (inFlight.has(bitId)) {
    span?.end({ output: { ...traceMetadata, outcome: chatQueueOutcomeFor("in_flight") } });

    return { ok: false, error: "in_flight" };
  }

  inFlight.add(bitId);

  let outcome = chatQueueOutcomeFor("model_failed");

  try {
    const result = await generateReply(
      bitId,
      input,
      card,
      messages,
      traceMetadata,
      (value) => {
        outcome = value;
      },
      options.webTools,
    );

    if (result.ok) {
      outcome = "ok";
    }

    return result;
  } finally {
    inFlight.delete(bitId);
    span?.end({ output: { ...traceMetadata, outcome } });
  }
}

async function generateReply(
  bitId: string,
  input: SendChatQueueMessageInput,
  card: NonNullable<Awaited<ReturnType<typeof loadChatCardContext>>>,
  messages: StoredChatMessage[],
  traceMetadata: ChatQueueTraceMetadata,
  setOutcome: (outcome: ChatQueueTraceOutcome) => void,
  webTools?: KnowledgeBitChatToolsDeps,
): Promise<ChatQueueResult<SendChatQueueMessageResult>> {
  const blocked = await budgetGate();

  if (blocked) {
    setOutcome(chatQueueOutcomeFor(blocked));

    return { ok: false, error: blocked };
  }

  const prompt = buildChatQueuePrompt({
    body: card.body,
    background: card.background,
    sourceText: card.sourceText,
    history: toPublicMessages(messages),
    message: input.message,
  });
  const agent = getMastra().getAgent(AGENT_KEYS.knowledgeBitChatQueue);

  let reply: string;
  let suggestions: RelatedCardSuggestion[] | undefined;
  let usage: { inputTokens: number | null; outputTokens: number | null };

  try {
    const run = (fallback: boolean) =>
      generateWithRetry(
        CHAT_QUEUE_REPLY_OP,
        null,
        AGENT_KEYS.knowledgeBitChatQueue,
        () =>
          agent.generate(prompt, {
            maxSteps: webTools ? WEB_REPLY_MAX_STEPS : 1,
            modelSettings: { maxOutputTokens: CHAT_QUEUE_REPLY_MAX_TOKENS },
            tracingOptions: buildChatQueueTracingOptions(traceMetadata),
            ...(fallback || webTools
              ? {
                  requestContext: new RequestContext<unknown>([
                    ...(fallback ? ([[CHAT_QUEUE_FALLBACK_CONTEXT_KEY, true]] as [string, unknown][]) : []),
                    ...(webTools ? ([[CHAT_QUEUE_WEB_TOOLS_CONTEXT_KEY, webTools]] as [string, unknown][]) : []),
                  ]),
                }
              : {}),
          }),
        { knowledgeBitId: bitId },
      );
    const result = await run(false).catch((err: unknown) => {
      if (err instanceof LlmBudgetExceededError || err instanceof LlmBudgetCheckUnavailableError) {
        throw err;
      }

      log.warn({ err, bitId }, "chat_queue_primary_model_failed");

      return run(true);
    });

    const extracted = extractRelatedCards(result.text?.trim() ?? "", [], 0);

    reply = extracted.reply;
    suggestions = extracted.suggestions?.slice(0, CHAT_QUEUE_MAX_PROPOSALS);
    usage = {
      inputTokens: result.totalUsage?.inputTokens ?? result.usage?.inputTokens ?? null,
      outputTokens: result.totalUsage?.outputTokens ?? result.usage?.outputTokens ?? null,
    };
  } catch (err) {
    if (err instanceof LlmBudgetExceededError || err instanceof LlmBudgetCheckUnavailableError) {
      setOutcome("spend_guard");

      return { ok: false, error: "budget_paused" };
    }

    setOutcome(chatQueueOutcomeFor("model_failed", isRateLimitError(err)));
    log.error({ err, bitId }, "chat_queue_reply_failed");

    return { ok: false, error: "model_failed" };
  }

  if (!reply) {
    return { ok: false, error: "model_failed" };
  }

  const persistError = await persistTurn(bitId, input, reply, usage);

  if (persistError) {
    const replay = replayOf(await listChatQueueMessages(bitId), input.clientMessageId);

    return replay ? { ok: true, value: replay } : { ok: false, error: persistError };
  }

  const turnsLeft = Math.max(0, turnsLeftFor(messages) - 1);

  return {
    ok: true,
    value: { reply, ...(suggestions?.length ? { suggestions } : {}), turnsLeft, capReached: turnsLeft === 0 },
  };
}

export async function deleteLastChatQueueExchange(
  bitId: string,
): Promise<ChatQueueResult<{ turnsLeft: number; capReached: boolean }>> {
  const card = await loadChatCardContext(bitId);

  if (!card) {
    return { ok: false, error: "not_found" };
  }

  if (!isChatThreadState(card.approvalState)) {
    return { ok: false, error: "not_in_chat" };
  }

  if (inFlight.has(bitId)) {
    return { ok: false, error: "in_flight" };
  }

  inFlight.add(bitId);

  try {
    const remaining = await getDb().transaction(async (tx) => {
      if (!isChatThreadState(await lockChatState(tx, bitId))) {
        return "not_in_chat" as const;
      }

      return deleteLastChatExchange(bitId, tx);
    });

    if (remaining === "not_in_chat" || remaining === null) {
      return { ok: false, error: remaining === null ? "no_messages" : "not_in_chat" };
    }

    const { turnsLeft, capReached } = threadOf(remaining);

    return { ok: true, value: { turnsLeft, capReached } };
  } finally {
    inFlight.delete(bitId);
  }
}
