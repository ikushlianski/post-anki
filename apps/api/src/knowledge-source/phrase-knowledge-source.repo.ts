import { inArray } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { KnowledgeSource } from "./knowledge-source.repo.js";

export interface PhraseSourceItem {
  key: string;
  text: string;
}

export async function insertPhraseKnowledgeSources(
  items: readonly PhraseSourceItem[],
  subjectId: string,
  db: DbExecutor = getDb(),
): Promise<KnowledgeSource[]> {
  if (items.length === 0) {
    return [];
  }

  const rows = items.map((item) => ({
    id: newId("ks"),
    kind: "phrase",
    rawText: item.text,
    status: "pending",
    subjectId,
    importKey: item.key,
  }));

  const inserted = await db
    .insert(knowledgeSources)
    .values(rows)
    .onConflictDoNothing({ target: knowledgeSources.importKey })
    .returning();

  return inserted.map((row) => ({ ...row, createdAt: row.createdAt ?? new Date() }));
}

export async function findExistingImportKeys(
  keys: readonly string[],
  db: DbExecutor = getDb(),
): Promise<Set<string>> {
  if (keys.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ importKey: knowledgeSources.importKey })
    .from(knowledgeSources)
    .where(inArray(knowledgeSources.importKey, [...keys]));

  return new Set(rows.flatMap((row) => (row.importKey ? [row.importKey] : [])));
}
