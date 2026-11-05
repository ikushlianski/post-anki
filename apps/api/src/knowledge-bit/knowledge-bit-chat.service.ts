import {
  takeRecentChatMessages,
  type AskKnowledgeBitChatInput,
  type AskKnowledgeBitChatResult,
} from "@post-anki/shared";
import { formatTranscript } from "@post-anki/core";
import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { getDb } from "../db/client.js";
import { log } from "../shared/log.js";
import type { KnowledgeBitChatToolsDeps } from "../mastra/knowledge-bit-chat-tools.js";
import { getKnowledgeBitById, getKnowledgeSourceRawText, type KnowledgeBitRow } from "./knowledge-bit.repo.js";
import { excerptAroundBody } from "./knowledge-bit-source-excerpt.js";
import { extractRelatedCards } from "./knowledge-bit-chat-suggestions.js";
import { lockChatState } from "./knowledge-bit-chat-queue.repo.js";
import { insertChatTurn } from "./knowledge-bit-chat-queue-messages.repo.js";
import { createKnowledgeBitWebTools } from "./knowledge-bit-web-tools.deps.js";

export type KnowledgeBitChatError = "not_found" | "not_approved";

const CHAT_MAX_SEARCHES = 2;
const CHAT_MAX_PAGE_FETCHES = 1;
const CHAT_MAX_STEPS = CHAT_MAX_SEARCHES + CHAT_MAX_PAGE_FETCHES + 1;

const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again.";

function sanitizeExcerpt(excerpt: string): string {
  return excerpt.replace(/<\/?\s*related-cards[^>]*>?/gi, "");
}

function buildPrompt(body: string, excerpt: string, input: AskKnowledgeBitChatInput): string {
  const history = formatTranscript(takeRecentChatMessages(input.transcript), { assistantLabel: "Tutor" });

  return [
    `Knowledge item: ${body}`,
    excerpt ? `Source material:\n<source-material>\n${sanitizeExcerpt(excerpt)}\n</source-material>` : null,
    history ? `Conversation so far:\n${history}` : null,
    `Learner: ${input.message}`,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}

async function loadSourceExcerpt(
  knowledgeBitId: string,
  bit: KnowledgeBitRow,
  allowWebSearch: boolean,
): Promise<string> {
  if (!allowWebSearch || !bit.knowledgeSourceId) {
    return "";
  }

  try {
    return excerptAroundBody(await getKnowledgeSourceRawText(bit.knowledgeSourceId), bit.body);
  } catch (err) {
    log.warn({ err, knowledgeBitId }, "knowledge_bit_chat_source_excerpt_failed");

    return "";
  }
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }

  const { code, cause } = err as { code?: unknown; cause?: unknown };

  return code === UNIQUE_VIOLATION || (cause !== undefined && isUniqueViolation(cause));
}

async function saveReviewChatTurn(
  knowledgeBitId: string,
  clientMessageId: string,
  userText: string,
  assistantText: string,
): Promise<void> {
  try {
    await getDb().transaction(async (tx) => {
      if ((await lockChatState(tx, knowledgeBitId)) !== "approved") {
        return;
      }

      await insertChatTurn(
        knowledgeBitId,
        { clientMessageId, userText, assistantText, modelId: null, inputTokens: null, outputTokens: null },
        tx,
      );
    });
  } catch (err) {
    if (!isUniqueViolation(err)) {
      log.warn({ err, knowledgeBitId }, "knowledge_bit_review_chat_save_failed");
    }
  }
}

export async function askKnowledgeBitChat(
  knowledgeBitId: string,
  input: AskKnowledgeBitChatInput,
): Promise<AskKnowledgeBitChatResult | { error: KnowledgeBitChatError }> {
  const bit = await getKnowledgeBitById(knowledgeBitId);

  if (!bit) {
    return { error: "not_found" };
  }

  if (bit.approvalState !== "approved" && bit.approvalState !== "inbox") {
    return { error: "not_approved" };
  }

  const allowWebSearch = input.allowWebSearch ?? false;
  const prompt = buildPrompt(bit.body, await loadSourceExcerpt(knowledgeBitId, bit, allowWebSearch), input);
  const agent = getMastra().getAgent(AGENT_KEYS.knowledgeBitChat);

  const allowGeneralKnowledge = input.allowGeneralKnowledge ?? false;

  const { deps, getSources, getUsage } = createKnowledgeBitWebTools({
    knowledgeBitId,
    searchOp: "knowledge_bit_chat.web_search",
    searchPurpose:
      "Search the web for current, authoritative information to answer this learner question about this knowledge item",
    maxSearches: CHAT_MAX_SEARCHES,
    maxPageFetches: CHAT_MAX_PAGE_FETCHES,
    forceTier: "cheap",
  });

  const requestContext = new RequestContext([
    ["allowGeneralKnowledge", allowGeneralKnowledge],
    ["allowWebSearch", allowWebSearch],
    ...(allowWebSearch
      ? ([["knowledgeBitChatDeps", deps]] as [string, KnowledgeBitChatToolsDeps][])
      : []),
  ]);

  try {
    const result = await generateWithRetry(
      "knowledge_bit_chat_reply",
      null,
      AGENT_KEYS.knowledgeBitChat,
      () =>
        agent.generate(prompt, {
          requestContext,
          ...(allowWebSearch ? { maxSteps: CHAT_MAX_STEPS } : {}),
        }),
    );

    const { reply, suggestions } = extractRelatedCards(
      result.text ?? "",
      getSources(),
      getUsage().searches,
    );

    if (reply) {
      if (bit.approvalState === "approved" && input.clientMessageId) {
        await saveReviewChatTurn(knowledgeBitId, input.clientMessageId, input.message, reply);
      }

      return suggestions ? { reply, suggestions } : { reply };
    }
  } catch (err) {
    log.error({ err, knowledgeBitId }, "knowledge_bit_chat_failed");
  }

  return { reply: FALLBACK_REPLY };
}
