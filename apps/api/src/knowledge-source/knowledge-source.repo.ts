import { eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface KnowledgeSource {
  id: string;
  kind: string;
  rawText: string | null;
  status: string;
  createdAt: Date;
  subjectId: string | null;
  extractionModelId: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
}

export async function insertKnowledgeSource(
  rawText: string,
  subjectId: string | null = null,
  extractionModelId: string | null = null,
  sourceUrl: string | null = null,
): Promise<KnowledgeSource> {
  const row = {
    id: newId("ks"),
    kind: "prose",
    rawText,
    status: "pending",
    subjectId,
    extractionModelId,
    ...(sourceUrl === null ? {} : { sourceUrl }),
  };

  await getDb().insert(knowledgeSources).values(row);

  return {
    ...row,
    createdAt: new Date(),
  };
}

export async function updateKnowledgeSourceSummary(sourceId: string, summary: string): Promise<void> {
  await getDb().update(knowledgeSources).set({ summary }).where(eq(knowledgeSources.id, sourceId));
}

// Batch counterpart to insertKnowledgeSource — one submission, several separate prose sources,
// each detected into its own knowledge bits independently once the scan picks it up.
export const MAX_SOURCES_PER_BATCH_ADD = 100;

export async function insertKnowledgeSources(
  rawTexts: string[],
  subjectId: string | null = null,
  extractionModelId: string | null = null,
): Promise<KnowledgeSource[]> {
  if (rawTexts.length === 0) {
    return [];
  }

  const rows = rawTexts.slice(0, MAX_SOURCES_PER_BATCH_ADD).map((rawText) => ({
    id: newId("ks"),
    kind: "prose",
    rawText,
    status: "pending",
    subjectId,
    extractionModelId,
  }));

  await getDb().insert(knowledgeSources).values(rows);

  return rows.map((row) => ({ ...row, createdAt: new Date() }));
}

// Backstop cap — the controller already stops reading from Notion at this
// limit; this slice guards the insert itself if it's ever called otherwise.
export const MAX_ROWS_PER_IMPORT = 500;

export async function insertKnowledgeSourcesFromNotion(
  items: { id: string; text: string }[],
  dataSourceId: string,
  db: DbExecutor = getDb(),
): Promise<KnowledgeSource[]> {
  if (items.length === 0) {
    return [];
  }

  const capped = items.slice(0, MAX_ROWS_PER_IMPORT);

  const rows = capped.map((item) => ({
    id: newId("ks"),
    kind: "notion",
    rawText: item.text,
    status: "pending",
    notionDatabaseId: dataSourceId,
    notionPageId: item.id,
  }));

  // notionPageId is unique, so re-importing the same database skips rows
  // already pulled in by an earlier call instead of duplicating them.
  const inserted = await db
    .insert(knowledgeSources)
    .values(rows)
    .onConflictDoNothing({ target: knowledgeSources.notionPageId })
    .returning();

  return inserted.map((row) => ({ ...row, createdAt: row.createdAt ?? new Date() }));
}
