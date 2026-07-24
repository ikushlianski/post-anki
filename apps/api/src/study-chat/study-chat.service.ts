import type { AskStudyChatInput, AskStudyChatResult } from "@post-anki/shared";
import { summarizeLearningMap } from "@post-anki/core";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import {
  getCurriculumContextForTopic,
  getCurriculumPromptContext,
  getLearningMapSnapshots,
} from "../curriculum/curriculum.repo.js";
import { languageChatReplySchema } from "./language-chat-reply.schema.js";

export type StudyChatError = "not_found";

const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again.";

function transcriptBlock(transcript: AskStudyChatInput["transcript"]): string {
  if (!transcript || transcript.length === 0) {
    return "";
  }

  return transcript
    .map((m) => `${m.role === "user" ? "Learner" : "Mentor"}: ${m.text}`)
    .join("\n");
}

export async function askStudyChat(
  input: AskStudyChatInput,
): Promise<AskStudyChatResult | { error: StudyChatError }> {
  const topic = await getTopicRow(input.topicId);

  if (!topic) {
    return { error: "not_found" };
  }

  const ctx = await getCurriculumContextForTopic(input.topicId);

  if (!ctx) {
    return { error: "not_found" };
  }

  const promptContext = await getCurriculumPromptContext(ctx.curriculumId);
  const snapshots = await getLearningMapSnapshots();
  const otherCurricula = snapshots.filter((s) => s.curriculumId !== ctx.curriculumId);
  const learningMapSummary = summarizeLearningMap(otherCurricula);
  const history = transcriptBlock(input.transcript);

  const prompt = [
    `Current topic: ${topic.title}`,
    topic.summary ? `Topic summary: ${topic.summary}` : "",
    promptContext
      ? `Curriculum: ${promptContext.curriculumName} (subject: ${promptContext.subjectName})`
      : "",
    "",
    "Learner's personal learning map (what they have studied elsewhere):",
    learningMapSummary,
    history ? `\nConversation so far:\n${history}` : "",
    `\nLearner: ${input.message}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    if (promptContext?.subjectKind === "language-practice") {
      const agent = getMastra().getAgent(AGENT_KEYS.languageChat);
      const result = await agent.generate(prompt, {
        structuredOutput: { schema: languageChatReplySchema },
      });
      const reply = result.object?.languagePracticeReply?.trim();

      if (reply) {
        return { reply };
      }
    } else {
      const agent = getMastra().getAgent(AGENT_KEYS.studyChat);
      const result = await agent.generate(prompt);
      const reply = result.text?.trim();

      if (reply) {
        return { reply };
      }
    }
  } catch (err) {
    log.error({ err, topicId: input.topicId }, "study_chat_failed");
  }

  return { reply: FALLBACK_REPLY };
}
