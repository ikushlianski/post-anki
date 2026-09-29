import type { DraftKnowledgeBitChatInput, DraftKnowledgeBitChatResult } from "@post-anki/shared";
import { formatTranscript } from "@post-anki/core";
import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { log } from "../shared/log.js";
import { getKnowledgeBitById } from "./knowledge-bit.repo.js";

export type KnowledgeBitChatDraftError = "not_found" | "draft_failed";

function buildPrompt(body: string, input: DraftKnowledgeBitChatInput): string {
  const history = formatTranscript(input.transcript, { assistantLabel: "Tutor" });

  return [
    `Knowledge item: ${body}`,
    `Mode: ${input.mode}`,
    history ? `Conversation so far:\n${history}` : null,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}

export async function draftKnowledgeBitChat(
  id: string,
  input: DraftKnowledgeBitChatInput,
): Promise<DraftKnowledgeBitChatResult | { error: KnowledgeBitChatDraftError }> {
  const bit = await getKnowledgeBitById(id);

  if (!bit) {
    return { error: "not_found" };
  }

  const prompt = buildPrompt(bit.body, input);
  const agent = getMastra().getAgent(AGENT_KEYS.knowledgeBitChatDraft);

  const requestContext = new RequestContext([["mode", input.mode]]);

  try {
    const result = await generateWithRetry(
      "knowledge_bit_chat_draft",
      null,
      AGENT_KEYS.knowledgeBitChatDraft,
      () => agent.generate(prompt, { requestContext }),
    );

    const proposedBody = result.text?.trim();

    if (proposedBody) {
      return { proposedBody };
    }
  } catch (err) {
    log.error({ err, knowledgeBitId: id }, "knowledge_bit_chat_draft_failed");
  }

  return { error: "draft_failed" };
}
