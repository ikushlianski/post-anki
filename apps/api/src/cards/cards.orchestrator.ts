import type { Gap, TopicCardSet } from "@post-anki/shared";
import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { log } from "../shared/log.js";
import { withSubjectLock } from "../shared/merge-lock.js";
import { getTopicRow } from "../topic/topic-progress.repo.js";
import {
  getCurriculumContextForTopic,
  getCurriculumPromptContext,
} from "../curriculum/curriculum.repo.js";
import { listGapsForTopic } from "../gap/gap.repo.js";
import { cardsPlanSchema } from "./cards-plan.schema.js";
import { embedVariantsForTopic } from "./cards-embedding.orchestrator.js";
import {
  getCardsByTopic,
  hasCardsGeneratedOrInProgress,
  replaceCardsContent,
  setCardsStatus,
  startGeneratingCards,
} from "./cards.repo.js";

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

async function claimCardsGeneration(topicId: string): Promise<boolean> {
  return withSubjectLock(topicId, async (tx) => {
    if (await hasCardsGeneratedOrInProgress(topicId, tx)) {
      return true;
    }

    await startGeneratingCards(topicId, tx);
    return false;
  });
}

// Unlike the explicit "Generate cards" button, a background trigger must
// never queue a duplicate generation on top of one already ready or in flight.
// Serialized per topic via withSubjectLock.
export async function maybeStartCardsInBackground(topicId: string): Promise<void> {
  const alreadyClaimed = await claimCardsGeneration(topicId);

  if (alreadyClaimed) {
    return;
  }

  void compileCards(topicId).catch((err) =>
    log.error({ err, topicId }, "cards_compile_dispatch_failed"),
  );
}

// Same claim as maybeStartCardsInBackground, but awaits compileCards so a fan-out caller can cap concurrency.
export async function startCardsInBackgroundAndWait(topicId: string): Promise<void> {
  const alreadyClaimed = await claimCardsGeneration(topicId);

  if (alreadyClaimed) {
    return;
  }

  await compileCards(topicId);
}

export interface StartCardsManuallyResult {
  cardSet: TopicCardSet;
  alreadyInProgress: boolean;
}

// Same per-topic lock as the background trigger, but unlike it, a manual
// click against a "ready" set is a deliberate regenerate, not a duplicate.
export async function startCardsManually(topicId: string): Promise<StartCardsManuallyResult> {
  const result = await withSubjectLock(topicId, async (tx) => {
    const existing = await getCardsByTopic(topicId, tx);

    if (existing?.status === "generating" && (await hasCardsGeneratedOrInProgress(topicId, tx))) {
      return { cardSet: existing, alreadyInProgress: true };
    }

    const cardSet = await startGeneratingCards(topicId, tx);
    return { cardSet, alreadyInProgress: false };
  });

  if (!result.alreadyInProgress) {
    void compileCards(topicId).catch((err) =>
      log.error({ err, topicId }, "cards_compile_dispatch_failed"),
    );
  }

  return result;
}

export async function compileCards(topicId: string): Promise<void> {
  try {
    const topic = await getTopicRow(topicId);

    if (!topic) {
      throw new Error("topic not found for cards compilation");
    }

    const [gaps, curriculumContext, curriculumCtx] = await Promise.all([
      listGapsForTopic(topicId),
      resolveCurriculumContext(topicId),
      getCurriculumContextForTopic(topicId),
    ]);

    const prompt = buildCardsPrompt(topic, gaps, curriculumContext);

    const agent = getMastra().getAgent(AGENT_KEYS.cardsCompiler);
    const result = await generateWithRetry(
      "cards_compile",
      curriculumCtx?.curriculumId ?? null,
      AGENT_KEYS.cardsCompiler,
      () =>
        agent.generate(prompt, {
          structuredOutput: { schema: cardsPlanSchema },
          requestContext: curriculumCtx
            ? new RequestContext([["curriculumId", curriculumCtx.curriculumId]])
            : undefined,
        }),
    );

    if (!result.object) {
      throw new Error("cards compiler returned no structured plan");
    }

    await replaceCardsContent(topicId, result.object);

    log.info({ topicId, cards: result.object.cards.length }, "cards_compiled");

    // Cards are usable without embeddings — a failure here never fails
    // generation; the global scan can backfill anything missed.
    await embedVariantsForTopic(topicId).catch((err) =>
      log.error({ err, topicId }, "cards_embedding_failed"),
    );
  } catch (err) {
    log.error({ err, topicId }, "cards_compile_failed");
    await setCardsStatus(topicId, "failed");
  }
}
