import { buildSubjectPathLabel, type SubjectHierarchyRow } from "@post-anki/core";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, knowledgeBits, knowledgeSources, subjects, topics } from "../db/schema.js";
import { bitApproved } from "../knowledge-bit/knowledge-bit-approval.repo.js";
import { effectiveSubjectIdSql } from "../knowledge-bit/knowledge-bit-subject.js";
import { pickSubjectKind } from "../subject/subject-kind.js";
import {
  SUBJECT_CHECK_DESCRIPTION_CHARS,
  buildCandidateSamples,
  trimToChars,
  type SubjectCheckCandidate,
  type SubjectCheckParent,
} from "./knowledge-source-subject-check.candidates.js";

const SAMPLE_SCAN_LIMIT = 1_000;

export interface SubjectCheckCandidateSet {
  candidates: SubjectCheckCandidate[];
  parents: SubjectCheckParent[];
  hierarchy: SubjectHierarchyRow[];
}

async function listApprovedStatementsBySubject(
  subjectIds: string[],
  db: DbExecutor,
): Promise<Map<string, string[]>> {
  if (subjectIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ subjectId: effectiveSubjectIdSql, body: knowledgeBits.body })
    .from(knowledgeBits)
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .where(and(bitApproved, inArray(effectiveSubjectIdSql, subjectIds)))
    .orderBy(desc(knowledgeBits.createdAt))
    .limit(SAMPLE_SCAN_LIMIT);
  const bySubject = new Map<string, string[]>();

  for (const row of rows) {
    if (row.subjectId) {
      bySubject.set(row.subjectId, [...(bySubject.get(row.subjectId) ?? []), row.body]);
    }
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
  const statements = await listApprovedStatementsBySubject(
    leaves.map((leaf) => leaf.id),
    db,
  );

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
      samples: buildCandidateSamples(statements.get(leaf.id) ?? []),
    })),
  };
}
