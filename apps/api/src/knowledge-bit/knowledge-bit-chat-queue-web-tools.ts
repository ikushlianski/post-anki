import { createKnowledgeBitWebTools } from "./knowledge-bit-web-tools.deps.js";

export const CHAT_QUEUE_SEARCH_OP = "chat_queue.web_search";
export const CHAT_QUEUE_MAX_SEARCHES = 2;
export const CHAT_QUEUE_MAX_PAGE_FETCHES = 1;
const CHAT_QUEUE_MAX_PAGE_CHARS = 6_000;

export function createChatQueueWebTools(bitId: string, sourceUrl: string | null | undefined) {
  return createKnowledgeBitWebTools({
    knowledgeBitId: bitId,
    seedCitedUrls: sourceUrl ? [sourceUrl] : [],
    searchOp: CHAT_QUEUE_SEARCH_OP,
    searchPurpose: "Search the web for authoritative information that helps a learner judge or improve one flashcard",
    maxSearches: CHAT_QUEUE_MAX_SEARCHES,
    maxPageFetches: CHAT_QUEUE_MAX_PAGE_FETCHES,
    maxPageChars: CHAT_QUEUE_MAX_PAGE_CHARS,
    forceTier: "cheap",
  });
}
