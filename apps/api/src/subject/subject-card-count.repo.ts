import { and, eq, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, knowledgeBits, knowledgeSources, subjects, topics } from "../db/schema.js";
import { cardSubjectIdSql } from "../knowledge-bit/knowledge-bit-card-subject.js";
import { bitApproved } from "../knowledge-bit/knowledge-bit-approval.repo.js";
import { hasActiveVariant } from "../knowledge-bit/knowledge-bit-browser.repo.js";

type SubjectNode = { id: string; parentId: string | null };

export function rollUpCardCounts(
  nodes: SubjectNode[],
  ownCounts: Map<string, number>,
): Map<string, number> {
  const children = new Map<string, string[]>();

  for (const node of nodes) {
    if (node.parentId !== null) {
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
    }
  }

  const totals = new Map<string, number>();
  const visiting = new Set<string>();

  const totalOf = (id: string): number => {
    const known = totals.get(id);

    if (known !== undefined) {
      return known;
    }

    if (visiting.has(id)) {
      return 0;
    }

    visiting.add(id);

    let total = ownCounts.get(id) ?? 0;

    for (const childId of children.get(id) ?? []) {
      total += totalOf(childId);
    }

    visiting.delete(id);
    totals.set(id, total);

    return total;
  };

  for (const node of nodes) {
    totalOf(node.id);
  }

  return totals;
}

export async function countApprovedCardsBySubject(
  db: DbExecutor = getDb(),
): Promise<Map<string, number>> {
  const [ownCounts, nodes] = await Promise.all([
    countOwnApprovedCards(db),
    db.select({ id: subjects.id, parentId: subjects.parentId }).from(subjects),
  ]);

  return rollUpCardCounts(nodes, ownCounts);
}

async function countOwnApprovedCards(db: DbExecutor): Promise<Map<string, number>> {
  const rows = await db
    .select({
      subjectId: cardSubjectIdSql,
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(knowledgeBits)
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(and(bitApproved, hasActiveVariant(db)))
    .groupBy(cardSubjectIdSql);

  const bySubject = new Map<string, number>();

  for (const row of rows) {
    if (row.subjectId !== null) {
      bySubject.set(row.subjectId, row.total);
    }
  }

  return bySubject;
}
