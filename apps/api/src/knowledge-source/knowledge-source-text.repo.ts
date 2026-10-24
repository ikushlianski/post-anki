import { eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";

export async function getKnowledgeSourceText(
  sourceId: string,
  db: DbExecutor = getDb(),
): Promise<string | null> {
  const row = (
    await db
      .select({ rawText: knowledgeSources.rawText })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId))
      .limit(1)
  )[0];

  const text = row?.rawText?.trim() ?? "";

  return text.length > 0 ? text : null;
}
