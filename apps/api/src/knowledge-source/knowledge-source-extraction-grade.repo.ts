import { eq, sql } from "drizzle-orm";
import { KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS, type SourceExtractionGrade } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSourceExtractionGrade, knowledgeSources } from "../db/schema.js";
import { resolveFeedbackModelId } from "../knowledge-bit/knowledge-bit-feedback.model-id.js";
import { newId } from "../shared/id.js";

export async function upsertSourceExtractionGrade(
  sourceId: string,
  input: { rating: number; note?: string | undefined },
  db: DbExecutor = getDb(),
): Promise<SourceExtractionGrade | null> {
  const source = (
    await db
      .select({
        subjectId: knowledgeSources.subjectId,
        extractionModelId: knowledgeSources.extractionModelId,
        extractionRun: knowledgeSources.extractionRun,
      })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId))
      .limit(1)
  )[0];

  if (!source) {
    return null;
  }

  const note = input.note?.trim() ? input.note.trim().slice(0, KNOWLEDGE_BIT_FEEDBACK_NOTE_MAX_CHARS) : null;
  const modelId = await resolveFeedbackModelId(source.extractionModelId);

  await db
    .insert(knowledgeSourceExtractionGrade)
    .values({
      id: newId("kseg"),
      knowledgeSourceId: sourceId,
      subjectId: source.subjectId,
      modelId,
      runNumber: source.extractionRun,
      rating: input.rating,
      note,
    })
    .onConflictDoUpdate({
      target: [knowledgeSourceExtractionGrade.knowledgeSourceId, knowledgeSourceExtractionGrade.runNumber],
      set: { rating: input.rating, note, modelId, updatedAt: sql`now()` },
    });

  return { rating: input.rating, note, run: source.extractionRun };
}
