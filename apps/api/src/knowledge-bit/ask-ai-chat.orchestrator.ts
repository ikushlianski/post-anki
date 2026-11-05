import { CHAT_QUEUE_MAX_MESSAGE_CHARS } from "@post-anki/shared";
import { log } from "../shared/log.js";
import { GAP_TEXT_MAX_CHARS } from "../mastra/knowledge-bit-lessons.agent.js";
import { countRecentAskAiChatBits, insertAskAiChatBit, listHeldAskAiBits } from "./ask-ai-chat.repo.js";
import type { AskAiChatHandle } from "./ask-ai-extraction.js";
import { listChatQueueMessages } from "./knowledge-bit-chat-queue-messages.repo.js";
import { sendChatQueueMessage } from "./knowledge-bit-chat-queue.service.js";
import { createKnowledgeBitWebTools } from "./knowledge-bit-web-tools.deps.js";

export const ASK_AI_HOURLY_CAP = 3;
export const ASK_AI_MAX_SEARCHES = 2;
export const ASK_AI_MAX_PAGE_FETCHES = 1;
export const ASK_AI_SEARCH_OP = "ask_ai_chat.web_search";

const HOUR_MS = 60 * 60 * 1000;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;

export function sanitizeGapText(raw: string): string {
  return raw
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.min(GAP_TEXT_MAX_CHARS, CHAT_QUEUE_MAX_MESSAGE_CHARS));
}

export interface AskAiChatDeps {
  insertBit: typeof insertAskAiChatBit;
  listHeldBits: typeof listHeldAskAiBits;
  countRecentBits: typeof countRecentAskAiChatBits;
  hasMessages: (bitId: string) => Promise<boolean>;
  sendMessage: typeof sendChatQueueMessage;
  createWebTools: typeof createKnowledgeBitWebTools;
}

export function defaultAskAiChatDeps(): AskAiChatDeps {
  return {
    insertBit: insertAskAiChatBit,
    listHeldBits: listHeldAskAiBits,
    countRecentBits: countRecentAskAiChatBits,
    hasMessages: async (bitId) => (await listChatQueueMessages(bitId)).length > 0,
    sendMessage: sendChatQueueMessage,
    createWebTools: createKnowledgeBitWebTools,
  };
}

async function answerAskAiBit(
  bitId: string,
  sourceId: string,
  gapText: string,
  deps: AskAiChatDeps,
): Promise<void> {
  if (await deps.hasMessages(bitId)) {
    return;
  }

  if ((await deps.countRecentBits(HOUR_MS)) > ASK_AI_HOURLY_CAP) {
    log.info({ bitId, knowledgeSourceId: sourceId }, "ask_ai_chat_reply_paused_hourly_cap");

    return;
  }

  const webTools = deps.createWebTools({
    knowledgeBitId: bitId,
    searchOp: ASK_AI_SEARCH_OP,
    searchPurpose: "Search the web for authoritative information that answers this learner question",
    maxSearches: ASK_AI_MAX_SEARCHES,
    maxPageFetches: ASK_AI_MAX_PAGE_FETCHES,
    forceTier: "cheap",
  });
  const result = await deps.sendMessage(
    bitId,
    { clientMessageId: `ask-ai-${sourceId}`.slice(0, 100), message: gapText },
    { webTools: webTools.deps },
  );

  if (!result.ok) {
    log.warn({ bitId, knowledgeSourceId: sourceId, error: result.error }, "ask_ai_chat_reply_not_sent");
  }
}

export async function openAskAiChat(
  sourceId: string,
  rawGapText: string,
  deps: AskAiChatDeps = defaultAskAiChatDeps(),
): Promise<AskAiChatHandle | null> {
  const gapText = sanitizeGapText(rawGapText);

  if (!gapText) {
    return null;
  }

  const { id: bitId, active } = await deps.insertBit(sourceId, gapText);

  if (!active) {
    return null;
  }

  return {
    bitId,
    reply: () => answerAskAiBit(bitId, sourceId, gapText, deps),
  };
}

export const ASK_AI_RETRY_BATCH = 2;

export async function retryHeldAskAiReplies(deps: AskAiChatDeps = defaultAskAiChatDeps()): Promise<number> {
  if ((await deps.countRecentBits(HOUR_MS)) > ASK_AI_HOURLY_CAP) {
    return 0;
  }

  const held = await deps.listHeldBits(ASK_AI_RETRY_BATCH);

  for (const bit of held) {
    await answerAskAiBit(bit.id, bit.knowledgeSourceId, bit.body, deps);
  }

  return held.length;
}
