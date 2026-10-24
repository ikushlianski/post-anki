import {
  takeRecentChatMessages,
  type AskKnowledgeBitChatInput,
  type AskKnowledgeBitChatResult,
} from "@post-anki/shared";
import { formatTranscript } from "@post-anki/core";
import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { log } from "../shared/log.js";
import type { KnowledgeBitChatToolsDeps } from "../mastra/knowledge-bit-chat-tools.js";
import { getKnowledgeBitById } from "./knowledge-bit.repo.js";
import { createKnowledgeBitWebTools, WEB_TOOLS_MAX_STEPS } from "./knowledge-bit-web-tools.deps.js";

export type KnowledgeBitChatError = "not_found" | "not_approved";

const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again.";

function buildPrompt(body: string, input: AskKnowledgeBitChatInput): string {
  const history = formatTranscript(takeRecentChatMessages(input.transcript), { assistantLabel: "Tutor" });

  return [
    `Knowledge item: ${body}`,
    history ? `Conversation so far:\n${history}` : null,
    `Learner: ${input.message}`,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}

export async function askKnowledgeBitChat(
  knowledgeBitId: string,
  input: AskKnowledgeBitChatInput,
): Promise<AskKnowledgeBitChatResult | { error: KnowledgeBitChatError }> {
  const bit = await getKnowledgeBitById(knowledgeBitId);

  if (!bit) {
    return { error: "not_found" };
  }

  if (bit.approvalState !== "approved") {
    return { error: "not_approved" };
  }

  const prompt = buildPrompt(bit.body, input);
  const agent = getMastra().getAgent(AGENT_KEYS.knowledgeBitChat);

  const allowGeneralKnowledge = input.allowGeneralKnowledge ?? false;
  const allowWebSearch = input.allowWebSearch ?? false;

  const { deps } = createKnowledgeBitWebTools({
    knowledgeBitId,
    searchOp: "knowledge_bit_chat.web_search",
    searchPurpose:
      "Search the web for current, authoritative information to answer this learner question about this knowledge item",
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
          ...(allowWebSearch ? { maxSteps: WEB_TOOLS_MAX_STEPS } : {}),
        }),
    );

    const reply = result.text?.trim();

    if (reply) {
      return { reply };
    }
  } catch (err) {
    log.error({ err, knowledgeBitId }, "knowledge_bit_chat_failed");
  }

  return { reply: FALLBACK_REPLY };
}
