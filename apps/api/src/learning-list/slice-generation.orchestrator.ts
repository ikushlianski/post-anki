import { eq, sql } from "drizzle-orm";
import { truncateSliceGeneration } from "@post-anki/core";
import { getCurriculumSourceRows, maxModuleOrder } from "../curriculum/curriculum.repo.js";
import { assembleAllSourceText } from "../curriculum/source-text.js";
import { getDb } from "../db/client.js";
import { gaps, learningListItems, modules, topics } from "../db/schema.js";
import { AGENT_KEYS, getMastra } from "../mastra/mastra.js";
import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import { advanceIngestionCursor } from "./learning-list.repo.js";
import { sliceGenerationPlanSchema, type SliceGenerationPlan } from "./slice-generation-plan.js";
import { buildSliceGenerationPrompt } from "./slice-generation-prompt.js";

export interface ReleasedSlice {
  itemId: string;
  topicIds: string[];
  questionsGenerated: number;
}

export interface SliceGenerationRequest {
  curriculumId: string;
  topicCount: number;
  questionCount: number;
}

async function existingTopicTitles(curriculumId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ title: topics.title })
    .from(topics)
    .where(eq(topics.curriculumId, curriculumId));

  return rows.map((row) => row.title);
}

// Called with no open transaction — the LLM call inside can take seconds,
// and holding a Postgres transaction (and its advisory lock) across that
// would starve the pool for every other release/answer in flight. The
// write side (`writeGeneratedSlice`) is a second, short, separately locked
// transaction that re-checks the ceiling against fresh state, so a
// concurrent release racing this same item can only ever under-write, never
// overshoot it.
export async function generateSliceContent(
  itemId: string,
  request: SliceGenerationRequest,
  now: string,
): Promise<ReleasedSlice | null> {
  const [sourceText, alreadyCoveredTitles, sourceRows] = await Promise.all([
    assembleAllSourceText(request.curriculumId),
    existingTopicTitles(request.curriculumId),
    getCurriculumSourceRows(request.curriculumId),
  ]);

  if (sourceText.trim().length === 0) {
    log.warn(
      { itemId, curriculumId: request.curriculumId },
      "learning_list_slice_generation_no_source_text",
    );

    return null;
  }

  const prompt = buildSliceGenerationPrompt({
    alreadyCoveredTitles,
    topicCount: request.topicCount,
    sourceText,
  });

  let result: { object?: SliceGenerationPlan };

  try {
    const agent = getMastra().getAgent(AGENT_KEYS.learningListSlice);

    result = await agent.generate(prompt, {
      structuredOutput: { schema: sliceGenerationPlanSchema },
    });
  } catch (err) {
    log.error(
      { err, itemId, curriculumId: request.curriculumId },
      "learning_list_slice_generation_failed",
    );

    return null;
  }

  if (!result.object) {
    log.warn(
      { itemId, curriculumId: request.curriculumId },
      "learning_list_slice_generation_empty",
    );

    return null;
  }

  const candidateTopics = truncateSliceGeneration(
    result.object.topics,
    request.topicCount,
    request.questionCount,
  );

  if (candidateTopics.length === 0) {
    return null;
  }

  const sourceId = sourceRows[0]?.id ?? null;

  return writeGeneratedSlice(itemId, request, candidateTopics, sourceId, now);
}

async function writeGeneratedSlice(
  itemId: string,
  request: SliceGenerationRequest,
  candidateTopics: ReturnType<typeof truncateSliceGeneration>,
  sourceId: string | null,
  now: string,
): Promise<ReleasedSlice | null> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${itemId})::bigint)`);

    const item = (
      await tx.select().from(learningListItems).where(eq(learningListItems.id, itemId)).limit(1)
    )[0];

    if (!item || item.curriculumId === null || item.questionCeiling === null) {
      return null;
    }

    const remaining = item.questionCeiling - item.questionsGenerated;

    if (remaining <= 0) {
      return null;
    }

    const finalTopics = truncateSliceGeneration(
      candidateTopics,
      request.topicCount,
      Math.min(request.questionCount, remaining),
    );

    if (finalTopics.length === 0) {
      return null;
    }

    const order = (await maxModuleOrder(item.curriculumId)) + 1;
    const moduleId = newId("mod");

    await tx.insert(modules).values({
      id: moduleId,
      curriculumId: item.curriculumId,
      title: `Slice ${order}`,
      order,
    });

    const topicIds: string[] = [];
    let questionsInserted = 0;

    for (const [index, candidate] of finalTopics.entries()) {
      const topicId = newId("top");

      await tx.insert(topics).values({
        id: topicId,
        moduleId,
        curriculumId: item.curriculumId,
        title: candidate.title,
        summary: candidate.summary,
        order: index + 1,
        included: true,
        sourceId,
      });

      topicIds.push(topicId);

      if (candidate.gaps.length > 0) {
        await tx.insert(gaps).values(
          candidate.gaps.map((gap) => ({
            id: newId("gap"),
            topicId,
            label: gap.label,
            depth: gap.depth,
            origin: "ai" as const,
            state: "open" as const,
            wanted: false,
            concern: null,
          })),
        );

        questionsInserted += candidate.gaps.length;
      }
    }

    await advanceIngestionCursor(itemId, item.questionsGenerated + questionsInserted, now, tx);

    log.info(
      {
        itemId,
        curriculumId: item.curriculumId,
        topics: topicIds.length,
        questions: questionsInserted,
      },
      "learning_list_slice_generated",
    );

    return { itemId, topicIds, questionsGenerated: questionsInserted };
  });
}
