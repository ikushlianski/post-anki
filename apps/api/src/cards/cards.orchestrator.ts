import type { Gap } from "@post-anki/shared";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import {
  getCurriculumContextForTopic,
  getCurriculumPromptContext,
} from "../curriculum/curriculum.repo.js";
import { listGapsForTopic } from "../gap/gap.repo.js";
import { cardsPlanSchema } from "./cards-plan.schema.js";
import { replaceCardsContent, setCardsStatus } from "./cards.repo.js";

async function resolveCurriculumContext(topicId: string): Promise<string | undefined> {
  const ctx = await getCurriculumContextForTopic(topicId);

  if (!ctx) {
    return undefined;
  }

  const promptContext = await getCurriculumPromptContext(ctx.curriculumId);

  if (!promptContext) {
    return undefined;
  }

  return `${promptContext.curriculumName} (subject: ${promptContext.subjectName})`;
}

export function buildCardsPrompt(
  topic: { title: string; summary: string | null },
  gaps: Gap[],
  curriculumContext?: string,
): string {
  return [
    `Topic: ${topic.title}`,
    curriculumContext ? `Curriculum context: ${curriculumContext}` : "",
    topic.summary ? `Summary: ${topic.summary}` : "",
    "",
    "Known gaps for this topic:",
    gaps.length > 0
      ? gaps.map((gap) => `- ${gap.label}`).join("\n")
      : "(no gaps recorded yet — cover the topic's key concepts broadly)",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function compileCards(topicId: string): Promise<void> {
  try {
    const topic = await getTopicRow(topicId);

    if (!topic) {
      throw new Error("topic not found for cards compilation");
    }

    const [gaps, curriculumContext] = await Promise.all([
      listGapsForTopic(topicId),
      resolveCurriculumContext(topicId),
    ]);

    const prompt = buildCardsPrompt(topic, gaps, curriculumContext);

    const agent = getMastra().getAgent(AGENT_KEYS.cardsCompiler);
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: cardsPlanSchema },
    });

    if (!result.object) {
      throw new Error("cards compiler returned no structured plan");
    }

    await replaceCardsContent(topicId, result.object);

    log.info({ topicId, cards: result.object.cards.length }, "cards_compiled");
  } catch (err) {
    log.error({ err, topicId }, "cards_compile_failed");
    await setCardsStatus(topicId, "failed");
  }
}
