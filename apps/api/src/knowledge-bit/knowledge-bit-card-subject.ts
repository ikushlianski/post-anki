import { eq, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { curricula, knowledgeBits, knowledgeSources, topics } from "../db/schema.js";

// A placed card belongs to its curriculum's subject; an unplaced one to its source's subject.
export const cardSubjectIdSql = sql<string | null>`case when ${knowledgeBits.topicId} is null then ${knowledgeSources.subjectId} else ${curricula.subjectId} end`;

export async function readCardSubjectId(
  bitId: string,
  db: DbExecutor,
): Promise<string | null> {
  const [row] = await db
    .select({ subjectId: cardSubjectIdSql })
    .from(knowledgeBits)
    .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
    .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(eq(knowledgeBits.id, bitId));

  return row?.subjectId ?? null;
}
