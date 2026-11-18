import { and, asc, desc, eq, exists, sql } from "drizzle-orm";
import type {
  CardSubjectSuggestion,
  CardSubjectSuggestionStatus,
  SubjectCheckConfidence,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { cardSubjectSuggestions, curricula, knowledgeBits, knowledgeSources, subjects, topics } from "../db/schema.js";
import { bitApproved } from "../knowledge-bit/knowledge-bit-approval.repo.js";
import { effectiveSubjectIdSql } from "../knowledge-bit/knowledge-bit-subject.js";
import { newId } from "../shared/id.js";

export interface CardAwaitingSubject {
  id: string;
  body: string;
  knowledgeSourceId: string;
}

export interface NewCardSuggestion {
  knowledgeBitId: string;
  knowledgeSourceId: string;
  suggestedSubjectId: string | null;
  confidence: SubjectCheckConfidence | null;
}

export async function listCardsAwaitingSubject(limit: number): Promise<CardAwaitingSubject[]> {
  const db = getDb();

  return db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      knowledgeSourceId: knowledgeBits.knowledgeSourceId,
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(
      and(
        bitApproved,
        sql`${effectiveSubjectIdSql} is null`,
        sql`not ${exists(
          db
            .select({ one: cardSubjectSuggestions.id })
            .from(cardSubjectSuggestions)
            .where(eq(cardSubjectSuggestions.knowledgeBitId, knowledgeBits.id)),
        )}`,
      ),
    )
    .orderBy(asc(knowledgeBits.createdAt), asc(knowledgeBits.id))
    .limit(limit);
}

export async function insertCardSubjectSuggestions(items: NewCardSuggestion[]): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  const rows = await getDb()
    .insert(cardSubjectSuggestions)
    .values(
      items.map((item) => ({
        id: newId("cardsubsug"),
        knowledgeBitId: item.knowledgeBitId,
        knowledgeSourceId: item.knowledgeSourceId,
        suggestedSubjectId: item.suggestedSubjectId,
        confidence: item.confidence,
        status: item.suggestedSubjectId === null ? "no_match" : "pending",
      })),
    )
    .onConflictDoNothing({ target: cardSubjectSuggestions.knowledgeBitId })
    .returning({ id: cardSubjectSuggestions.id });

  return rows.length;
}

export async function listCardSubjectSuggestions(
  status: CardSubjectSuggestionStatus,
): Promise<CardSubjectSuggestion[]> {
  const rows = await getDb()
    .select({
      suggestion: cardSubjectSuggestions,
      cardBody: knowledgeBits.body,
      subjectName: subjects.name,
    })
    .from(cardSubjectSuggestions)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, cardSubjectSuggestions.knowledgeBitId))
    .leftJoin(subjects, eq(subjects.id, cardSubjectSuggestions.suggestedSubjectId))
    .where(eq(cardSubjectSuggestions.status, status))
    .orderBy(desc(cardSubjectSuggestions.createdAt), desc(cardSubjectSuggestions.id));

  return rows.map(({ suggestion, cardBody, subjectName }) => ({
    id: suggestion.id,
    knowledgeBitId: suggestion.knowledgeBitId,
    cardBody,
    suggestedSubjectId: suggestion.suggestedSubjectId,
    suggestedSubjectName: subjectName,
    confidence: suggestion.confidence === "high" || suggestion.confidence === "medium" ? suggestion.confidence : null,
    status: suggestion.status as CardSubjectSuggestionStatus,
    createdAt: suggestion.createdAt.toISOString(),
    resolvedAt: suggestion.resolvedAt ? suggestion.resolvedAt.toISOString() : null,
  }));
}
