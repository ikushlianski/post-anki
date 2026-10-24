import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources } from "../db/schema.js";
import { bitApproved } from "../knowledge-bit/knowledge-bit-approval.repo.js";

export type McpSourceRow = {
  id: string;
  kind: string;
  rawText: string | null;
  summary: string | null;
  sourceUrl: string | null;
  subjectId: string | null;
  status: string;
  createdAt: Date;
};

export type McpSourceListRow = McpSourceRow & { approvedBitCount: number };

export type McpBitRow = {
  id: string;
  knowledgeSourceId: string;
  body: string;
  background: string | null;
  sourceLinks: string[] | null;
  topicId: string | null;
  approvalState: string;
};

export type McpVariantRow = {
  knowledgeBitId: string;
  kind: string;
  prompt: string;
  answer: string;
  sentence: string | null;
};

const sourceColumns = {
  id: knowledgeSources.id,
  kind: knowledgeSources.kind,
  rawText: knowledgeSources.rawText,
  summary: knowledgeSources.summary,
  sourceUrl: knowledgeSources.sourceUrl,
  subjectId: knowledgeSources.subjectId,
  status: knowledgeSources.status,
  createdAt: knowledgeSources.createdAt,
};

const bitColumns = {
  id: knowledgeBits.id,
  knowledgeSourceId: knowledgeBits.knowledgeSourceId,
  body: knowledgeBits.body,
  background: knowledgeBits.background,
  sourceLinks: knowledgeBits.sourceLinks,
  topicId: knowledgeBits.topicId,
  approvalState: knowledgeBits.approvalState,
};

export async function listKnowledgeSourcesPage(input: {
  subjectId?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: McpSourceListRow[]; total: number }> {
  const db = getDb();
  const where = input.subjectId ? eq(knowledgeSources.subjectId, input.subjectId) : undefined;

  const totalRows = await db.select({ value: count() }).from(knowledgeSources).where(where);
  const sources = await db
    .select(sourceColumns)
    .from(knowledgeSources)
    .where(where)
    .orderBy(desc(knowledgeSources.createdAt), desc(knowledgeSources.id))
    .limit(input.limit)
    .offset(input.offset);

  const counts =
    sources.length === 0
      ? []
      : await db
          .select({ sourceId: knowledgeBits.knowledgeSourceId, value: count() })
          .from(knowledgeBits)
          .where(
            and(
              bitApproved,
              inArray(
                knowledgeBits.knowledgeSourceId,
                sources.map((source) => source.id),
              ),
            ),
          )
          .groupBy(knowledgeBits.knowledgeSourceId);

  const countBySource = new Map(counts.map((row) => [row.sourceId, row.value]));

  return {
    rows: sources.map((source) => ({ ...source, approvedBitCount: countBySource.get(source.id) ?? 0 })),
    total: totalRows[0]?.value ?? 0,
  };
}

export async function getKnowledgeSourceForMcp(id: string): Promise<McpSourceRow | null> {
  const rows = await getDb().select(sourceColumns).from(knowledgeSources).where(eq(knowledgeSources.id, id));

  return rows[0] ?? null;
}

export async function listApprovedBitsForSourcePage(
  sourceId: string,
  limit: number,
  offset: number,
): Promise<{ rows: McpBitRow[]; total: number }> {
  const db = getDb();
  const where = and(eq(knowledgeBits.knowledgeSourceId, sourceId), bitApproved);

  const totalRows = await db.select({ value: count() }).from(knowledgeBits).where(where);
  const rows = await db
    .select(bitColumns)
    .from(knowledgeBits)
    .where(where)
    .orderBy(asc(knowledgeBits.ordinal))
    .limit(limit)
    .offset(offset);

  return { rows, total: totalRows[0]?.value ?? 0 };
}

export async function getKnowledgeBitForMcp(id: string): Promise<McpBitRow | null> {
  const rows = await getDb().select(bitColumns).from(knowledgeBits).where(eq(knowledgeBits.id, id));

  return rows[0] ?? null;
}

export async function listActiveVariantsForBits(bitIds: string[]): Promise<McpVariantRow[]> {
  if (bitIds.length === 0) {
    return [];
  }

  return getDb()
    .select({
      knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
      kind: knowledgeBitQuestionVariants.kind,
      prompt: knowledgeBitQuestionVariants.prompt,
      answer: knowledgeBitQuestionVariants.answer,
      sentence: knowledgeBitQuestionVariants.sentence,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        inArray(knowledgeBitQuestionVariants.knowledgeBitId, bitIds),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    )
    .orderBy(
      asc(knowledgeBitQuestionVariants.kind),
      asc(knowledgeBitQuestionVariants.order),
    );
}
