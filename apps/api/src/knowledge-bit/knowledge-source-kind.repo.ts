import type { KnowledgeHighlight } from "@post-anki/shared";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";

export async function loadKnowledgeSourceKind(sourceId: string): Promise<string> {
  const [row] = await getDb()
    .select({ kind: knowledgeSources.kind })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, sourceId))
    .limit(1);

  return row?.kind ?? "prose";
}

export const ANKI_IMPORT_KEY_PREFIX = "anki:";

export async function loadIsAnkiImport(sourceId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ importKey: knowledgeSources.importKey })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, sourceId))
    .limit(1);

  return row?.importKey?.startsWith(ANKI_IMPORT_KEY_PREFIX) ?? false;
}

export async function loadTargetPhrases(sourceId: string): Promise<string[]> {
  const [row] = await getDb()
    .select({ targetPhrases: knowledgeSources.targetPhrases })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, sourceId))
    .limit(1);

  return row?.targetPhrases ?? [];
}

export async function loadHighlights(sourceId: string): Promise<KnowledgeHighlight[]> {
  const [row] = await getDb()
    .select({ highlights: knowledgeSources.highlights })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, sourceId))
    .limit(1);

  return row?.highlights ?? [];
}
