import { buildSubjectPathLabel, type SubjectHierarchyRow } from "@post-anki/core";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, knowledgeBits, knowledgeSources, subjects, topics } from "../db/schema.js";
import { bitApproved } from "../knowledge-bit/knowledge-bit-approval.repo.js";
import { effectiveSubjectIdSql } from "../knowledge-bit/knowledge-bit-subject.js";
import { pickSubjectKind } from "../subject/subject-kind.js";
import {
  SUBJECT_CHECK_DESCRIPTION_CHARS,
  SUBJECT_CHECK_SAMPLE_COUNT,
  trimToChars,
  type SubjectCheckCandidate,
  type SubjectCheckParent,
} from "./knowledge-source-subject-check.candidates.js";

const SAMPLE_BODY_SQL_CHARS = 400;

export interface SubjectCheckCandidateSet {
  candidates: SubjectCheckCandidate[];
  parents: SubjectCheckParent[];
  hierarchy: SubjectHierarchyRow[];
}

export async function listSubjectCheckSamples(
  subjectIds: string[],
  db: DbExecutor = getDb(),
): Promise<Map<string, string[]>> {
  if (subjectIds.length === 0) {
    return new Map();
  }

  const ranked = db
    .select({
      subjectId: sql<string>`${effectiveSubjectIdSql}`.as("subject_id"),
      body: sql<string>`left(${knowledgeBits.body}, ${SAMPLE_BODY_SQL_CHARS})`.as("body"),
      position: sql<number>`row_number() over (partition by ${effectiveSubjectIdSql} order by ${knowledgeBits.createdAt} desc, ${knowledgeBits.id} desc)`.as(
        "position",
      ),
    })
    .from(knowledgeBits)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(and(bitApproved, inArray(effectiveSubjectIdSql, subjectIds), sql`btrim(${knowledgeBits.body}) <> ''`))
    .as("ranked");
  const rows = await db
    .select({ subjectId: ranked.subjectId, body: ranked.body })
    .from(ranked)
    .where(lte(ranked.position, SUBJECT_CHECK_SAMPLE_COUNT))
    .orderBy(ranked.subjectId, ranked.position);
  const bySubject = new Map<string, string[]>();

  for (const row of rows) {
    bySubject.set(row.subjectId, [...(bySubject.get(row.subjectId) ?? []), row.body]);
  }

  return bySubject;
}

export async function listSubjectCheckCandidateSet(db: DbExecutor = getDb()): Promise<SubjectCheckCandidateSet> {
  const rows = await db
    .select({
      id: subjects.id,
      name: subjects.name,
      parentId: subjects.parentId,
      kind: subjects.kind,
      description: subjects.description,
      embedding: subjects.embedding,
    })
    .from(subjects);
  const parentIds = new Set(rows.flatMap((row) => (row.parentId === null ? [] : [row.parentId])));
  const leaves = rows.filter((row) => !parentIds.has(row.id));

  return {
    hierarchy: rows.map(({ id, name, parentId }) => ({ id, name, parentId })),
    parents: rows
      .filter((row) => parentIds.has(row.id))
      .map((row) => ({ id: row.id, label: buildSubjectPathLabel(row.id, rows) })),
    candidates: leaves.map((leaf) => ({
      id: leaf.id,
      label: buildSubjectPathLabel(leaf.id, rows),
      description: trimToChars(leaf.description, SUBJECT_CHECK_DESCRIPTION_CHARS),
      kind: pickSubjectKind(leaf.id, rows),
      embedding: leaf.embedding,
      samples: [],
    })),
  };
}
