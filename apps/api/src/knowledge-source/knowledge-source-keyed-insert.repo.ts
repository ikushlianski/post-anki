import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { KnowledgeSource } from "./knowledge-source.repo.js";

export interface KeyedKnowledgeSourceItem {
  importKey: string;
  rawText: string;
}

export async function insertKeyedKnowledgeSources(
  items: readonly KeyedKnowledgeSourceItem[],
  subjectId: string,
  db: DbExecutor = getDb(),
): Promise<KnowledgeSource[]> {
  if (items.length === 0) {
    return [];
  }

  const rows = items.map((item) => ({
    id: newId("ks"),
    kind: "prose",
    rawText: item.rawText,
    status: "pending",
    subjectId,
    importKey: item.importKey,
  }));

  const inserted = await db
    .insert(knowledgeSources)
    .values(rows)
    .onConflictDoNothing({ target: knowledgeSources.importKey })
    .returning();

  return inserted.map((row) => ({ ...row, createdAt: row.createdAt ?? new Date() }));
}
