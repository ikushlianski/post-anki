import { and, eq, inArray, like, notInArray, sql } from "drizzle-orm";
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
  provenance: { kind?: string; origin?: string; status?: string } = {},
): Promise<KnowledgeSource[]> {
  if (items.length === 0) {
    return [];
  }

  const rows = items.map((item) => ({
    id: newId("ks"),
    kind: provenance.kind ?? "prose",
    rawText: item.rawText,
    status: provenance.status ?? "pending",
    subjectId,
    importKey: item.importKey,
    textKey: item.textKey ?? null,
    origin: provenance.origin ?? null,
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

export const UNUSABLE_SOURCE_STATUSES = ["failed", "nothing_extracted"] as const;

export interface SourceTextRef {
  id: string;
  rawText: string;
}

export async function findSourcesByNormalizedText(
  subjectId: string,
  normalizedTexts: readonly string[],
  db: DbExecutor = getDb(),
): Promise<SourceTextRef[]> {
  if (normalizedTexts.length === 0) {
    return [];
  }

  const normalizedColumn = sql<string>`lower(regexp_replace(btrim(regexp_replace(translate(${knowledgeSources.rawText}, ${"‘’“”"}::text, ${`''""`}::text), ${"\\s+"}::text, ' ', 'g')), ${"[\\s.,!?;:…]+$"}::text, ''))`;

  const rows = await db
    .select({ id: knowledgeSources.id, rawText: knowledgeSources.rawText })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.subjectId, subjectId),
        notInArray(knowledgeSources.status, [...UNUSABLE_SOURCE_STATUSES]),
        inArray(normalizedColumn, [...normalizedTexts]),
      ),
    );

  return rows.flatMap((row) => (row.rawText ? [{ id: row.id, rawText: row.rawText }] : []));
}
