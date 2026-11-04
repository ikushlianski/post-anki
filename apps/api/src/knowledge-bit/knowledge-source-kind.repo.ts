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

export async function loadTargetPhrases(sourceId: string): Promise<string[]> {
  const [row] = await getDb()
    .select({ targetPhrases: knowledgeSources.targetPhrases })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, sourceId))
    .limit(1);

  return row?.targetPhrases ?? [];
}
