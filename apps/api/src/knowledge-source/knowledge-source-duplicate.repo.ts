import { and, asc, eq, ilike, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";
import { hostOf, normalizeSourceUrl } from "./knowledge-source-duplicate.js";

export interface EarlierKnowledgeSource {
  id: string;
  addedAt: string;
}

function inSubject(subjectId: string | null) {
  return subjectId === null ? isNull(knowledgeSources.subjectId) : eq(knowledgeSources.subjectId, subjectId);
}

export async function findEarlierSourceByUrl(
  finalUrl: string,
  subjectId: string | null,
): Promise<EarlierKnowledgeSource | null> {
  const wanted = normalizeSourceUrl(finalUrl);
  const host = hostOf(finalUrl);

  if (wanted === null || host === null) {
    return null;
  }

  const rows = await getDb()
    .select({
      id: knowledgeSources.id,
      sourceUrl: knowledgeSources.sourceUrl,
      createdAt: knowledgeSources.createdAt,
    })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.kind, "prose"),
        inSubject(subjectId),
        isNotNull(knowledgeSources.sourceUrl),
        ilike(knowledgeSources.sourceUrl, `%${host}%`),
      ),
    )
    .orderBy(asc(knowledgeSources.createdAt));
  const match = rows.find((row) => row.sourceUrl !== null && normalizeSourceUrl(row.sourceUrl) === wanted);

  return match ? { id: match.id, addedAt: match.createdAt.toISOString() } : null;
}

export async function findEarlierSourcesByText(
  texts: string[],
  subjectId: string | null,
): Promise<Map<string, EarlierKnowledgeSource>> {
  const found = new Map<string, EarlierKnowledgeSource>();

  if (texts.length === 0) {
    return found;
  }

  const rows = await getDb()
    .select({
      id: knowledgeSources.id,
      rawText: knowledgeSources.rawText,
      createdAt: knowledgeSources.createdAt,
    })
    .from(knowledgeSources)
    .where(
      and(eq(knowledgeSources.kind, "prose"), inSubject(subjectId), inArray(knowledgeSources.rawText, texts)),
    )
    .orderBy(asc(knowledgeSources.createdAt));

  for (const row of rows) {
    if (row.rawText !== null && !found.has(row.rawText)) {
      found.set(row.rawText, { id: row.id, addedAt: row.createdAt.toISOString() });
    }
  }

  return found;
}
