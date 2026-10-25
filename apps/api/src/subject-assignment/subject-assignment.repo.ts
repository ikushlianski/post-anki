import { and, asc, eq, exists, isNull } from "drizzle-orm";
import type { SubjectCheckConfidence } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";
import { SUBJECT_ASSIGNMENT_CARD_SAMPLE_COUNT } from "./subject-assignment.config.js";

export interface SourceAwaitingSubject {
  id: string;
  rawText: string | null;
  summary: string | null;
  cardBodies: string[];
}

export async function listSourcesAwaitingSubject(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<SourceAwaitingSubject[]> {
  const sources = await db
    .select({ id: knowledgeSources.id, rawText: knowledgeSources.rawText, summary: knowledgeSources.summary })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.status, "bits_detected"),
        isNull(knowledgeSources.subjectId),
        isNull(knowledgeSources.subjectSuggestionCheckedAt),
        exists(
          db
            .select({ one: knowledgeBits.id })
            .from(knowledgeBits)
            .where(and(eq(knowledgeBits.knowledgeSourceId, knowledgeSources.id), eq(knowledgeBits.approvalState, "pending"))),
        ),
      ),
    )
    .orderBy(asc(knowledgeSources.createdAt))
    .limit(limit);

  return Promise.all(
    sources.map(async (source) => {
      const cards = await db
        .select({ body: knowledgeBits.body })
        .from(knowledgeBits)
        .where(and(eq(knowledgeBits.knowledgeSourceId, source.id), eq(knowledgeBits.approvalState, "pending")))
        .orderBy(asc(knowledgeBits.ordinal))
        .limit(SUBJECT_ASSIGNMENT_CARD_SAMPLE_COUNT);

      return { ...source, cardBodies: cards.map((card) => card.body) };
    }),
  );
}

export async function recordSubjectSuggestion(
  sourceId: string,
  proposal: { subjectId: string; confidence: SubjectCheckConfidence } | null,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(knowledgeSources)
    .set({
      suggestedSubjectId: proposal?.subjectId ?? null,
      suggestedSubjectConfidence: proposal?.confidence ?? null,
      subjectSuggestionCheckedAt: new Date(),
    })
    .where(and(eq(knowledgeSources.id, sourceId), isNull(knowledgeSources.subjectId)));
}
