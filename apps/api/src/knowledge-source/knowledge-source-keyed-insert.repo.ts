import { and, inArray, like, notInArray } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { KnowledgeSource } from "./knowledge-source.repo.js";

export interface KeyedKnowledgeSourceItem {
  importKey: string;
  rawText: string;
  textKey?: string;
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
    textKey: item.textKey ?? null,
  }));

  const inserted = await db
    .insert(knowledgeSources)
    .values(rows)
    .onConflictDoNothing({ target: knowledgeSources.importKey })
    .returning();

  return inserted.map((row) => ({ ...row, createdAt: row.createdAt ?? new Date() }));
}

export interface KeyedSourceRef {
  id: string;
  importKey: string;
  status: string;
}

export async function findSourcesByImportKeys(
  keys: readonly string[],
  db: DbExecutor = getDb(),
): Promise<KeyedSourceRef[]> {
  if (keys.length === 0) {
    return [];
  }

  const rows = await db
    .select({ id: knowledgeSources.id, importKey: knowledgeSources.importKey, status: knowledgeSources.status })
    .from(knowledgeSources)
    .where(inArray(knowledgeSources.importKey, [...keys]));

  return rows.flatMap((row) => (row.importKey ? [{ id: row.id, importKey: row.importKey, status: row.status }] : []));
}

export async function findAnkiTextKeysTakenElsewhere(
  textKeys: readonly string[],
  ownImportKeys: readonly string[],
  db: DbExecutor = getDb(),
): Promise<string[]> {
  if (textKeys.length === 0) {
    return [];
  }

  const rows = await db
    .selectDistinct({ textKey: knowledgeSources.textKey })
    .from(knowledgeSources)
    .where(
      and(
        inArray(knowledgeSources.textKey, [...textKeys]),
        like(knowledgeSources.importKey, "anki:%"),
        ownImportKeys.length > 0 ? notInArray(knowledgeSources.importKey, [...ownImportKeys]) : undefined,
      ),
    );

  return rows.flatMap((row) => (row.textKey ? [row.textKey] : []));
}
