import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { cardTriageDecisions, knowledgeBits } from "../db/schema.js";

export const TRIAGE_HISTORY_ROW_CAP = 500;

export interface TriageHistoryRow {
  id: string;
  sessionId: string;
  bitId: string;
  verdict: string;
  reasonCode: string | null;
  note: string | null;
  decidedAt: Date;
  front: string | null;
  back: string | null;
  subjectId: string | null;
  extractionModelId: string | null;
  fusionModelIds: string[] | null;
  bitBody: string | null;
  bitVector: number[] | null;
  textMatch: boolean;
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listRecentTriageDecisions(since: Date, query: string): Promise<TriageHistoryRow[]> {
  const pattern = `%${escapeLikePattern(query)}%`;
  const textMatch = query
    ? sql<boolean>`(coalesce(${cardTriageDecisions.front}, '') ilike ${pattern} or coalesce(${cardTriageDecisions.back}, '') ilike ${pattern} or coalesce(${cardTriageDecisions.note}, '') ilike ${pattern})`
    : sql<boolean>`false`;

  return getDb()
    .select({
      id: cardTriageDecisions.id,
      sessionId: cardTriageDecisions.sessionId,
      bitId: cardTriageDecisions.knowledgeBitId,
      verdict: cardTriageDecisions.verdict,
      reasonCode: cardTriageDecisions.reasonCode,
      note: cardTriageDecisions.note,
      decidedAt: cardTriageDecisions.decidedAt,
      front: cardTriageDecisions.front,
      back: cardTriageDecisions.back,
      subjectId: cardTriageDecisions.subjectId,
      extractionModelId: cardTriageDecisions.extractionModelId,
      fusionModelIds: cardTriageDecisions.fusionModelIds,
      bitBody: knowledgeBits.body,
      bitVector: knowledgeBits.embeddingVec,
      textMatch,
    })
    .from(cardTriageDecisions)
    .leftJoin(knowledgeBits, eq(knowledgeBits.id, cardTriageDecisions.knowledgeBitId))
    .where(and(gte(cardTriageDecisions.decidedAt, since), isNull(cardTriageDecisions.undoneAt)))
    .orderBy(desc(cardTriageDecisions.decidedAt), desc(cardTriageDecisions.id))
    .limit(TRIAGE_HISTORY_ROW_CAP);
}

export async function findTriageDecisionById(
  id: string,
): Promise<typeof cardTriageDecisions.$inferSelect | null> {
  const [row] = await getDb().select().from(cardTriageDecisions).where(eq(cardTriageDecisions.id, id));

  return row ?? null;
}
