import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { loadEnv } from "../shared/env.js";
import { dynamicKnowledgeItemModel } from "./model.js";
import { readGenerateUsage } from "./generate-usage.js";
import type { ReportedUsage } from "./generate-usage.js";
import { getKnowledgeItemModelId } from "../admin-settings/admin-settings.repo.js";
import { generateWithRetry } from "./generate-with-retry.js";
import { getMastra, AGENT_KEYS } from "./mastra.js";
import { escapePromptTags } from "../shared/untrusted-prompt-text.js";
import {
  buildPhraseLesson,
  pickSentences,
  type MeetingPhraseAgentOutput,
} from "../knowledge-bit/meeting-phrase-draft.js";
import type { LessonDraft } from "../knowledge-bit/knowledge-bit-source-item-validation.js";
import { parsePhraseSourceText } from "../knowledge-source/phrase-source-text.js";
import { buildMeetingPhrasePrompt, MEETING_PHRASE_INSTRUCTIONS } from "./knowledge-bit-meeting-phrase.prompt.js";

const FIELD_MAX_CHARS = 200;
const SENTENCE_MAX_CHARS = 150;
const MEANING_MAX_CHARS = 100;
const FRONT_MAX_CHARS = 100;
const ATTEMPTS = 2;

export const meetingPhraseResultSchema = z
  .object({
    context: z.string().max(FIELD_MAX_CHARS),
    looksNonNative: z.boolean(),
    suggestion: z.string().max(FIELD_MAX_CHARS),
    chunk: z.string().min(1).max(FIELD_MAX_CHARS),
    sentences: z
      .array(
        z.object({
          text: z.string().min(1).max(SENTENCE_MAX_CHARS),
          meaning: z.string().min(1).max(MEANING_MAX_CHARS),
        }),
      )
      .max(3),
    russianMeaning: z.string().min(1).max(FRONT_MAX_CHARS),
    russianAlt: z.string().min(1).max(FRONT_MAX_CHARS),
    simpleExplanation: z.string().min(1).max(FRONT_MAX_CHARS),
    situation: z.string().min(1).max(FIELD_MAX_CHARS),
  })
  .refine((value) => !value.looksNonNative || value.suggestion.trim() !== "", {
    message: "suggestion is required when looksNonNative is true",
    path: ["suggestion"],
  });

export function createKnowledgeBitMeetingPhraseAgent(): Agent {
  return new Agent({
    id: "knowledge-bit-meeting-phrase",
    name: "Knowledge Bit Meeting Phrase",
    instructions: MEETING_PHRASE_INSTRUCTIONS,
    model: dynamicKnowledgeItemModel(loadEnv()),
  });
}

export interface RunMeetingPhraseOptions {
  modelId?: string;
  abortSignal?: AbortSignal;
  retryRateLimit?: boolean;
  onUsage?: (usage: ReportedUsage) => void;
}

export async function runMeetingPhraseCard(
  chunk: string,
  options: RunMeetingPhraseOptions = {},
): Promise<LessonDraft[]> {
  const source = parsePhraseSourceText(chunk);

  if (!source) {
    throw new Error("knowledge_bit_meeting_phrase_invalid_source");
  }

  const modelId = options.modelId ?? (await getKnowledgeItemModelId());
  const agent = getMastra().getAgent(AGENT_KEYS.knowledgeBitMeetingPhrase);
  const prompt = buildMeetingPhrasePrompt(
    escapePromptTags(source.phrase),
    source.hint ? escapePromptTags(source.hint) : null,
    source.unsure,
  );
  const requestContext = new RequestContext([["knowledgeItemModelId", modelId]]);
  let failure = "";
  let lastValid: MeetingPhraseAgentOutput | null = null;

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const result = await generateWithRetry(
      "knowledge_bit_meeting_phrase",
      null,
      AGENT_KEYS.knowledgeBitMeetingPhrase,
      () =>
        agent.generate(prompt, {
          structuredOutput: { schema: meetingPhraseResultSchema },
          requestContext,
          ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
          ...(options.retryRateLimit === false ? { modelSettings: { maxRetries: 0 } } : {}),
        }),
      { modelId, retryRateLimit: options.retryRateLimit },
    );
    const parsed = meetingPhraseResultSchema.safeParse(result.object);

    options.onUsage?.(readGenerateUsage(result));

    if (parsed.success) {
      const sentences = pickSentences(source, parsed.data);

      if (sentences) {
        return [buildPhraseLesson(source, parsed.data, chunk, sentences)];
      }

      lastValid = parsed.data;
      continue;
    }

    failure = parsed.error.message;
  }

  if (lastValid) {
    return [buildPhraseLesson(source, lastValid, chunk)];
  }

  throw new Error(`knowledge_bit_meeting_phrase_invalid_output: ${failure}`);
}
