import type { AskKnowledgeBitChatInput, AskKnowledgeBitChatResult } from "@post-anki/shared";
import { formatTranscript } from "@post-anki/core";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { log } from "../shared/log.js";
import { getKnowledgeBitById } from "./knowledge-bit.repo.js";

export type KnowledgeBitChatError = "not_found";

const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again.";

function buildPrompt(body: string, input: AskKnowledgeBitChatInput): string {
  const history = formatTranscript(input.transcript ?? [], { assistantLabel: "Tutor" });

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

  const prompt = buildPrompt(bit.body, input);
  const agent = getMastra().getAgent(AGENT_KEYS.knowledgeBitChat);

  try {
    const result = await generateWithRetry(
      "knowledge_bit_chat_reply",
      null,
      AGENT_KEYS.knowledgeBitChat,
      () => agent.generate(prompt),
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
