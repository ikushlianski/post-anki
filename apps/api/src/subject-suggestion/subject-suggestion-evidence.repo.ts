import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { curricula, knowledgeBits, knowledgeSources, subjects, topics } from "../db/schema.js";
import { bitApproved } from "../knowledge-bit/knowledge-bit-approval.repo.js";
import { effectiveSubjectIdSql } from "../knowledge-bit/knowledge-bit-subject.js";

export interface EvidenceBit {
  id: string;
  body: string;
  embedding: number[];
}

export interface EvidenceSubject {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  embedding: number[] | null;
}

export interface SubjectSuggestionEvidence {
  listUnplacedBits(limit: number): Promise<EvidenceBit[]>;
  listSubjects(): Promise<EvidenceSubject[]>;
  countBitsBySubject(): Promise<Map<string, number>>;
  listBitsForSubjects(subjectIds: string[], limit: number): Promise<EvidenceBit[]>;
}

function bitsWithEffectiveSubject() {
  return getDb()
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      embedding: knowledgeBits.embeddingVec,
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId));
}

function withEmbedding(
  rows: { id: string; body: string; embedding: number[] | null }[],
): EvidenceBit[] {
  return rows.flatMap((row) =>
    row.embedding ? [{ id: row.id, body: row.body, embedding: row.embedding }] : [],
  );
}

export async function listUnplacedApprovedBits(limit: number): Promise<EvidenceBit[]> {
  const rows = await bitsWithEffectiveSubject()
    .where(
      and(bitApproved, isNotNull(knowledgeBits.embeddingVec), sql`${effectiveSubjectIdSql} is null`),
    )
    .orderBy(desc(knowledgeBits.createdAt), desc(knowledgeBits.id))
    .limit(limit);

  return withEmbedding(rows);
}

export async function listSubjectsForSuggestion(): Promise<EvidenceSubject[]> {
  return getDb()
    .select({
      id: subjects.id,
      name: subjects.name,
      description: subjects.description,
      parentId: subjects.parentId,
      embedding: subjects.embeddingVec,
    })
    .from(subjects);
}

export async function countApprovedBitsBySubject(): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({
      subjectId: effectiveSubjectIdSql,
      count: sql<number>`count(*)::int`,
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(bitApproved)
    .groupBy(effectiveSubjectIdSql);

  return new Map(rows.flatMap((row) => (row.subjectId === null ? [] : [[row.subjectId, row.count] as const])));
}

export async function listApprovedBitsForSubjects(
  subjectIds: string[],
  limit: number,
): Promise<EvidenceBit[]> {
  const rows = await bitsWithEffectiveSubject()
    .where(
      and(
        bitApproved,
        isNotNull(knowledgeBits.embeddingVec),
        inArray(effectiveSubjectIdSql, subjectIds),
      ),
    )
    .orderBy(desc(knowledgeBits.createdAt), desc(knowledgeBits.id))
    .limit(limit);

  return withEmbedding(rows);
}

export const subjectSuggestionEvidence: SubjectSuggestionEvidence = {
  listUnplacedBits: listUnplacedApprovedBits,
  listSubjects: listSubjectsForSuggestion,
  countBitsBySubject: countApprovedBitsBySubject,
  listBitsForSubjects: listApprovedBitsForSubjects,
};
