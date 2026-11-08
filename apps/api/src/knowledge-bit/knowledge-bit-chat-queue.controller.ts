import type http from "node:http";
import {
  CHAT_QUEUE_REMINDER_AFTER_DAYS,
  chatQueueSearchQuerySchema,
  snoozeChatQueueInput,
  sendChatQueueMessageInput,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import {
  countAllChatQueueKnowledgeBits,
  countChatQueueKnowledgeBits,
  listChatQueueKnowledgeBits,
  loadChatCardContext,
  moveKnowledgeBitToChatQueue,
  returnKnowledgeBitFromChatQueue,
  snoozeChatQueueKnowledgeBit,
} from "./knowledge-bit-chat-queue.repo.js";
import { buildChatExportMarkdown, slugifySubjectName } from "./knowledge-bit-chat-queue-export.markdown.js";
import { searchChatQueueMessages } from "./knowledge-bit-chat-queue-search.repo.js";
import { loadChatExportData } from "./knowledge-bit-chat-queue-export.repo.js";
import { retryHeldAskAiRepliesInBackground } from "./ask-ai-chat-retry.js";
import { sweepDecidedChatThreadsHourly } from "./knowledge-bit-chat-thread-retention.js";
import { getStaleChatQueueSummary } from "./knowledge-bit-chat-queue-stale.repo.js";
import {
  deleteLastChatQueueExchange,
  getChatQueueThread,
  sendChatQueueMessage,
  type ChatQueueFailure,
} from "./knowledge-bit-chat-queue.service.js";
import { createKnowledgeBitWebTools } from "./knowledge-bit-web-tools.deps.js";

const CHAT_QUEUE_LIST_LIMIT = 200;
export const CHAT_QUEUE_SEARCH_OP = "chat_queue.web_search";
export const CHAT_QUEUE_MAX_SEARCHES = 2;
export const CHAT_QUEUE_MAX_PAGE_FETCHES = 1;
const CHAT_QUEUE_MAX_PAGE_CHARS = 6_000;

const STATUS: Record<ChatQueueFailure, number> = {
  not_found: 404,
  not_in_chat: 409,
  no_messages: 404,
  in_flight: 409,
  cap_reached: 429,
  budget_paused: 423,
  proposal_not_pending: 409,
  model_failed: 502,
};

// POST /knowledge-bits/:id/chat-queue
export async function handleMoveKnowledgeBitToChatQueue(res: http.ServerResponse, id: string): Promise<void> {
  const result = await moveKnowledgeBitToChatQueue(id);

  if (!result.ok) {
    sendError(res, result.reason === "blocked" ? 409 : 404, result.reason);
    return;
  }

  sendJson(res, 200, { ok: true, chatCount: result.value });
}

// DELETE /knowledge-bits/:id/chat-queue
export async function handleReturnKnowledgeBitFromChatQueue(res: http.ServerResponse, id: string): Promise<void> {
  const result = await returnKnowledgeBitFromChatQueue(id);

  if (!result.ok) {
    sendError(res, result.reason === "blocked" ? 409 : 404, result.reason);
    return;
  }

  sendJson(res, 200, { ok: true });
}

// POST /knowledge-bits/:id/chat-queue/snooze
export async function handleSnoozeChatQueueKnowledgeBit(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, snoozeChatQueueInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await snoozeChatQueueKnowledgeBit(id, new Date(Date.now() + body.data.days * 86_400_000));

  if (!result.ok) {
    sendError(res, result.reason === "blocked" ? 409 : 404, result.reason);
    return;
  }

  sendJson(res, 200, { ok: true, snoozedUntil: result.value });
}

// DELETE /knowledge-bits/:id/chat-queue/snooze
export async function handleUnsnoozeChatQueueKnowledgeBit(res: http.ServerResponse, id: string): Promise<void> {
  const result = await snoozeChatQueueKnowledgeBit(id, null);

  if (!result.ok) {
    sendError(res, result.reason === "blocked" ? 409 : 404, result.reason);
    return;
  }

  sendJson(res, 200, { ok: true, snoozedUntil: null });
}

// GET /knowledge-bits/chat-queue
export async function handleListChatQueueKnowledgeBits(res: http.ServerResponse): Promise<void> {
  retryHeldAskAiRepliesInBackground();

  const [items, count, total] = await Promise.all([
    listChatQueueKnowledgeBits(CHAT_QUEUE_LIST_LIMIT),
    countChatQueueKnowledgeBits(),
    countAllChatQueueKnowledgeBits(),
  ]);

  sendJson(res, 200, { items, count, total, hasMore: total > items.length });
}

// GET /knowledge-bits/chat-queue/count
export async function handleCountChatQueueKnowledgeBits(res: http.ServerResponse): Promise<void> {
  sweepDecidedChatThreadsHourly();
  sendJson(res, 200, { count: await countChatQueueKnowledgeBits() });
}

// GET /knowledge-bits/:id/chat-messages
export async function handleGetChatQueueThread(res: http.ServerResponse, id: string): Promise<void> {
  const result = await getChatQueueThread(id);

  if (!result.ok) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result.value);
}

// DELETE /knowledge-bits/:id/chat-queue/messages/last
export async function handleDeleteLastChatQueueExchange(res: http.ServerResponse, id: string): Promise<void> {
  const result = await deleteLastChatQueueExchange(id);

  if (!result.ok) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, { ok: true, ...result.value });
}

// POST /knowledge-bits/:id/chat-messages
export async function handleSendChatQueueMessage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, sendChatQueueMessageInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const card = await loadChatCardContext(id);
  const webTools = createKnowledgeBitWebTools({
    knowledgeBitId: id,
    seedCitedUrls: card?.sourceUrl ? [card.sourceUrl] : [],
    searchOp: CHAT_QUEUE_SEARCH_OP,
    searchPurpose: "Search the web for authoritative information that helps a learner judge or improve one flashcard",
    maxSearches: CHAT_QUEUE_MAX_SEARCHES,
    maxPageFetches: CHAT_QUEUE_MAX_PAGE_FETCHES,
    maxPageChars: CHAT_QUEUE_MAX_PAGE_CHARS,
    forceTier: "cheap",
  });
  const result = await sendChatQueueMessage(id, body.data, {
    webTools: webTools.deps,
    getWebUsage: webTools.getUsage,
  });

  if (!result.ok) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result.value);
}

// GET /knowledge-bits/chat-queue/stale
export async function handleGetStaleChatQueueSummary(res: http.ServerResponse): Promise<void> {
  const cutoff = new Date(Date.now() - CHAT_QUEUE_REMINDER_AFTER_DAYS * 86_400_000);

  sendJson(res, 200, await getStaleChatQueueSummary(cutoff));
}

// GET /knowledge-bits/chat-queue/export?subjectId=
export async function handleExportChatQueueMarkdown(res: http.ServerResponse, subjectId: string | null): Promise<void> {
  if (!subjectId) {
    sendError(res, 400, "subject_required");
    return;
  }

  const data = await loadChatExportData(subjectId, CHAT_QUEUE_LIST_LIMIT);

  if (!data) {
    sendError(res, 404, "not_found");
    return;
  }

  res.writeHead(200, {
    "content-type": "text/markdown; charset=utf-8",
    "content-disposition": `attachment; filename="chat-${slugifySubjectName(data.subjectName)}.md"`,
  });
  res.end(buildChatExportMarkdown(data.subjectName, data.cards));
}

// GET /knowledge-bits/chat-queue/search?q=
export async function handleSearchChatQueueMessages(res: http.ServerResponse, q: string | null): Promise<void> {
  const parsed = chatQueueSearchQuerySchema.safeParse({ q: q ?? "" });

  if (!parsed.success) {
    sendError(res, 400, "invalid_query");
    return;
  }

  sendJson(res, 200, await searchChatQueueMessages(parsed.data.q));
}
