import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants } from "../db/schema.js";

export async function bitHasNoteCards(id: string, db: DbExecutor = getDb()): Promise<boolean> {
  const [row] = await db
    .select({ id: knowledgeBitQuestionVariants.id })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        eq(knowledgeBitQuestionVariants.knowledgeBitId, id),
        inArray(knowledgeBitQuestionVariants.kind, ["cloze", "list_step", "list_next", "list_overview"]),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    )
    .limit(1);

  return row !== undefined;
}
