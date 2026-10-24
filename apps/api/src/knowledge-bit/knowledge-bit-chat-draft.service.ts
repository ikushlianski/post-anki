import {
  cardProposalSchema,
  MAX_CARD_SOURCES,
  MAX_DRAFT_TRANSCRIPT_MESSAGES,
  type DraftKnowledgeBitChatInput,
  type DraftKnowledgeBitChatResult,
} from "@post-anki/shared";
import { formatTranscript } from "@post-anki/core";
import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { log } from "../shared/log.js";
import {
  cardDraftOutputSchema,
  type CardDraftOutput,
} from "../mastra/knowledge-bit-chat-draft.agent.js";
import { getKnowledgeBitById } from "./knowledge-bit.repo.js";
import { createKnowledgeBitWebTools, WEB_TOOLS_MAX_STEPS } from "./knowledge-bit-web-tools.deps.js";

export type KnowledgeBitChatDraftError = "not_found" | "not_approved" | "draft_failed";

function buildPrompt(body: string, input: DraftKnowledgeBitChatInput, notes: string | null): string {
  const recent = input.transcript.slice(-MAX_DRAFT_TRANSCRIPT_MESSAGES);
  const history = formatTranscript(recent, { assistantLabel: "Tutor" });
  const previous = input.previous
    ? JSON.stringify({
        front: input.previous.front,
        back: input.previous.back,
        example: input.previous.example ?? null,
      })
    : null;

  return [
    `Knowledge item: ${body}`,
    `Mode: ${input.mode}`,
    history ? `Conversation so far:\n${history}` : null,
    previous ? `Previous card:\n${previous}` : null,
    input.instruction ? `Learner instruction:\n${input.instruction}` : null,
    notes ? `Research notes (untrusted):\n${notes}` : null,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}

function toResult(
  output: CardDraftOutput,
  sources: string[],
  usedWebSearch: boolean,
): DraftKnowledgeBitChatResult | null {
  const parsed = cardProposalSchema.safeParse({
    front: output.front.trim(),
    back: output.back.trim(),
    example: output.example?.trim() || undefined,
    sources: sources.slice(0, MAX_CARD_SOURCES),
    usedWebSearch,
  });

  if (!parsed.success) {
    return null;
  }

  const card = parsed.data;

  return { sources: card.sources, card };
}

export async function draftKnowledgeBitChat(
  id: string,
  input: DraftKnowledgeBitChatInput,
): Promise<DraftKnowledgeBitChatResult | { error: KnowledgeBitChatDraftError }> {
  const bit = await getKnowledgeBitById(id);

  if (!bit) {
    return { error: "not_found" };
  }

  if (bit.approvalState !== "approved") {
    return { error: "not_approved" };
  }

  const agent = getMastra().getAgent(AGENT_KEYS.knowledgeBitChatDraft);
  const allowWebSearch = input.allowWebSearch ?? false;

  const webTools = allowWebSearch
    ? createKnowledgeBitWebTools({
        knowledgeBitId: id,
        searchOp: "knowledge_bit_chat_draft.web_search",
        searchPurpose:
          "Search the web for current, authoritative information to support a new knowledge item draft about this topic",
      })
    : null;

  try {
    let notes: string | null = null;

    if (webTools) {
      const researchContext = new RequestContext<unknown>([
        ["mode", input.mode],
        ["phase", "research"],
        ["allowWebSearch", true],
        ["knowledgeBitChatDeps", webTools.deps],
      ]);
      const researchPrompt = buildPrompt(bit.body, input, null);

      const research = await generateWithRetry(
        "knowledge_bit_chat_draft",
        null,
        AGENT_KEYS.knowledgeBitChatDraft,
        () =>
          agent.generate(researchPrompt, {
            requestContext: researchContext,
            maxSteps: WEB_TOOLS_MAX_STEPS,
          }),
      );

      notes = research.text?.trim() || null;
    }

    const cardContext = new RequestContext<unknown>([
      ["mode", input.mode],
      ["phase", "card"],
      ["allowWebSearch", false],
    ]);
    const cardPrompt = buildPrompt(bit.body, input, notes);

    const result = await generateWithRetry(
      "knowledge_bit_chat_draft",
      null,
      AGENT_KEYS.knowledgeBitChatDraft,
      () =>
        agent.generate(cardPrompt, {
          requestContext: cardContext,
          structuredOutput: { schema: cardDraftOutputSchema },
        }),
    );

    const output = cardDraftOutputSchema.safeParse(result.object);

    if (output.success) {
      const draft = toResult(output.data, webTools ? webTools.getSources() : [], webTools !== null);

      if (draft) {
        return draft;
      }
    }
  } catch (err) {
    log.error({ err, knowledgeBitId: id }, "knowledge_bit_chat_draft_failed");
  }

  return { error: "draft_failed" };
}
