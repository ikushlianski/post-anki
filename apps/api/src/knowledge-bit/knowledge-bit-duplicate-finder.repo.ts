import { and, cosineDistance, eq, ilike, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { curricula, knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources, subjects, topics } from "../db/schema.js";
import { applyEfSearch } from "../db/vector-search.js";
import { escapeLikePattern } from "../shared/escape-like-pattern.js";
import { effectiveSubjectIdSql } from "./knowledge-bit-subject.js";

export interface DuplicateCandidate {
  bitId: string;
  bitBody: string;
  prompt: string;
  answer: string;
  subjectId: string | null;
  subjectName: string | null;
  similarity: number | null;
}

const columns = {
  bitId: knowledgeBits.id,
  bitBody: knowledgeBits.body,
  prompt: knowledgeBitQuestionVariants.prompt,
  answer: knowledgeBitQuestionVariants.answer,
  subjectId: effectiveSubjectIdSql,
  subjectName: subjects.name,
};

function liveVariants() {
  return getDb()
    .select({ ...columns, similarity: sql<number | null>`null` })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(subjects, eq(subjects.id, effectiveSubjectIdSql));
}

const live = and(
  isNull(knowledgeBitQuestionVariants.supersededAt),
  notInArray(knowledgeBits.approvalState, ["rejected", "superseded"]),
);

export async function findLiteralCandidates(
  slice: string,
  cardKey: string,
  limit: number,
): Promise<DuplicateCandidate[]> {
  const pattern = `%${escapeLikePattern(slice)}%`;

  return liveVariants()
    .where(
      and(
        live,
        or(
          eq(knowledgeBitQuestionVariants.cardKey, cardKey),
          ilike(knowledgeBitQuestionVariants.prompt, pattern),
          ilike(knowledgeBits.body, pattern),
        ),
      ),
    )
    .limit(limit);
}

export async function findSemanticCandidates(
  embedding: number[],
  minSimilarity: number,
  limit: number,
): Promise<DuplicateCandidate[]> {
  const distance = cosineDistance(knowledgeBitQuestionVariants.embeddingVec, embedding);
  const similarity = sql<number>`1 - (${distance})`;

  return getDb().transaction(async (tx) => {
    await applyEfSearch(tx, limit);

    const rows = await tx
      .select({ ...columns, similarity })
      .from(knowledgeBitQuestionVariants)
      .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
      .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
      .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
      .leftJoin(subjects, eq(subjects.id, effectiveSubjectIdSql))
      .where(and(live, isNotNull(knowledgeBitQuestionVariants.embeddingVec), sql`${similarity} >= ${minSimilarity}`))
      .orderBy(distance)
      .limit(limit);

    return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
  });
}
