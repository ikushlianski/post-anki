import { eq, inArray } from "drizzle-orm";
import type { CurriculumDetail, TopicRecommendation } from "@post-anki/shared";
import { openGaps } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { topicRecommendations } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { getCurriculumDetail } from "../curriculum/curriculum.repo.js";

export { getCurriculumDetail };

export interface TopicSummary {
  topicId: string;
  topicTitle: string;
  maturity: number;
  attempts: number;
  openGapLabels: string[];
}

export function summarizeTopics(detail: CurriculumDetail): TopicSummary[] {
  return detail.modules
    .flatMap((m) => m.topics)
    .filter((t) => t.included)
    .map((t) => ({
      topicId: t.id,
      topicTitle: t.title,
      maturity: t.progress.maturity,
      attempts: t.progress.attempts,
      openGapLabels: openGaps(t.gaps ?? [], t.depth).map((g) => g.label),
    }));
}

function rowToRecommendation(row: typeof topicRecommendations.$inferSelect): TopicRecommendation {
  return {
    topicId: row.topicId,
    text: row.text,
    citations: row.citations,
    generatedAt: row.generatedAt.toISOString(),
  };
}

export async function getRecommendationsForTopics(
  topicIds: string[],
): Promise<TopicRecommendation[]> {
  if (topicIds.length === 0) {
    return [];
  }

  const rows = await getDb()
    .select()
    .from(topicRecommendations)
    .where(inArray(topicRecommendations.topicId, topicIds));

  return rows.map(rowToRecommendation);
}

export async function saveRecommendation(
  topicId: string,
  text: string,
  citations: string[],
  generatedAt: string,
): Promise<TopicRecommendation> {
  const db = getDb();

  await db.delete(topicRecommendations).where(eq(topicRecommendations.topicId, topicId));

  await db.insert(topicRecommendations).values({
    id: newId("rec"),
    topicId,
    text,
    citations,
    generatedAt: new Date(generatedAt),
  });

  return { topicId, text, citations, generatedAt };
}
