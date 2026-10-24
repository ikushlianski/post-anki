import { takeRecentChatMessages, type AskQaChatInput, type AskQaChatResult } from "@post-anki/shared";
import { formatTranscript } from "@post-anki/core";
import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { log } from "../shared/log.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import {
  getCurriculumContextForTopic,
  getCurriculumPromptContext,
  getModuleProgressSnapshots,
  type CurriculumPromptContext,
  type MergeModuleSnapshot,
} from "../curriculum/curriculum.repo.js";
import { webSearch } from "../probe/probe-grounding.js";
import type { QaChatState, QaChatToolsDeps } from "../mastra/qa-chat-tools.js";

export type QaChatError = "not_found";

const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again.";

const MAX_TOOL_STEPS = 4;

function transcriptBlock(transcript: AskQaChatInput["transcript"]): string {
  return formatTranscript(takeRecentChatMessages(transcript), { assistantLabel: "Tutor" });
}

function curriculumLine(ctx: CurriculumPromptContext): string {
  const parts = [`Curriculum: ${ctx.curriculumName}`, `subject: ${ctx.subjectName}`];

  if (ctx.curriculumDescription) {
    parts.push(ctx.curriculumDescription);
  }

  return parts.join(" — ");
}

function structureBlock(modules: MergeModuleSnapshot[]): string {
  if (modules.length === 0) {
    return "";
  }

  const lines = modules.map((m) => {
    const topics = m.topics.map((t) => t.title).join(", ");

    return topics ? `- ${m.title}: ${topics}` : `- ${m.title}`;
  });

  return ["Existing course structure:", ...lines].join("\n");
}

export async function askQaChat(
  input: AskQaChatInput,
): Promise<AskQaChatResult | { error: QaChatError }> {
  let curriculumId: string | null = null;
  let topicTitle: string | null = null;
  let topicSummary: string | null = null;

  if (input.topicId) {
    const topic = await getTopicRow(input.topicId);

    if (!topic) {
      return { error: "not_found" };
    }

    const ctx = await getCurriculumContextForTopic(input.topicId);

    if (!ctx) {
      return { error: "not_found" };
    }

    curriculumId = ctx.curriculumId;
    topicTitle = topic.title;
    topicSummary = topic.summary ?? null;
  } else if (input.curriculumId) {
    const promptContext = await getCurriculumPromptContext(input.curriculumId);

    if (!promptContext) {
      return { error: "not_found" };
    }

    curriculumId = input.curriculumId;
  }

  const promptContext = curriculumId
    ? await getCurriculumPromptContext(curriculumId)
    : null;
  const moduleSnapshots = curriculumId
    ? await getModuleProgressSnapshots(curriculumId)
    : [];

  const state: QaChatState = { suggestedSubtopics: null, citations: [] };

  const deps: QaChatToolsDeps = {
    state,
    curriculumId,
    listExistingTopicTitles: async () =>
      moduleSnapshots.flatMap((m) => m.topics.map((t) => t.title)),
    searchWeb: async (query) => {
      const outcome = await webSearch(
        `Search the web for current, authoritative information to answer this learner question: ${query}`,
        "qa_chat.web_search",
        { query },
        curriculumId ? { curriculumId } : {},
      );

      if (!outcome.ok) {
        return { text: "", citations: [] };
      }

      return { text: outcome.text, citations: outcome.citations };
    },
  };

  const prompt = buildPrompt(
    input,
    topicTitle,
    topicSummary,
    promptContext,
    moduleSnapshots,
  );

  const requestContext = new RequestContext([
    ["qaChatDeps", deps],
    ...(curriculumId ? ([["curriculumId", curriculumId]] as [string, string][]) : []),
  ]);

  const agent = getMastra().getAgent(AGENT_KEYS.qaChat);

  try {
    const result = await generateWithRetry(
      "qa_chat_reply",
      curriculumId,
      AGENT_KEYS.qaChat,
      () => agent.generate(prompt, { requestContext, maxSteps: MAX_TOOL_STEPS }),
    );

    const reply = result.text?.trim();

    if (reply) {
      return {
        reply,
        ...(state.suggestedSubtopics
          ? { suggestedSubtopics: state.suggestedSubtopics }
          : {}),
        ...(state.citations.length > 0 ? { citations: state.citations } : {}),
      };
    }
  } catch (err) {
    log.error({ err, curriculumId, topicId: input.topicId }, "qa_chat_failed");
  }

  return { reply: FALLBACK_REPLY };
}

function buildPrompt(
  input: AskQaChatInput,
  topicTitle: string | null,
  topicSummary: string | null,
  promptContext: CurriculumPromptContext | null,
  moduleSnapshots: MergeModuleSnapshot[],
): string {
  const history = transcriptBlock(input.transcript);
  const structure = structureBlock(moduleSnapshots);

  return [
    topicTitle ? `Current topic: ${topicTitle}` : null,
    topicSummary ? `Topic summary: ${topicSummary}` : null,
    promptContext ? curriculumLine(promptContext) : null,
    structure || null,
    history ? `Conversation so far:\n${history}` : null,
    `Learner: ${input.message}`,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}
