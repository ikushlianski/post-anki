import { eq, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";

export interface KnowledgeBitRow {
  id: string;
  body: string;
  knowledgeSourceId: string | null;
  approvalState: "pending" | "approved" | "rejected" | "superseded" | "inbox";
  isAiGenerated: boolean;
  sourceLinks: string[];
}

export async function getKnowledgeBitById(
  id: string,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitRow | null> {
  const rows = await db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      knowledgeSourceId: knowledgeBits.knowledgeSourceId,
      approvalState: knowledgeBits.approvalState,
      isAiGenerated: knowledgeBits.isAiGenerated,
      sourceLinks: knowledgeBits.sourceLinks,
    })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.id, id))
    .limit(1);

  const row = rows[0];

  return row
    ? {
        ...row,
        approvalState: row.approvalState as KnowledgeBitRow["approvalState"],
        sourceLinks: row.sourceLinks ?? [],
      }
    : null;
}

export async function getKnowledgeSourceRawText(
  id: string,
  db: DbExecutor = getDb(),
): Promise<string | null> {
  const row = (
    await db
      .select({ rawText: knowledgeSources.rawText })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, id))
      .limit(1)
  )[0];

  const text = row?.rawText?.trim() ?? "";

  return text.length > 0 ? text : null;
}

// Token returned by getKnowledgeSourceClaimToken. `run` is `updatedAt` in
// milliseconds; it doubles as the workflow-id counter (`${sourceId}:${run}`)
// and must equal `claimedAt.getTime()`. Both fields serve as a CAS guard in
// markSourceOwnedByDurable: an inconsistent token (run !== claimedAt.getTime())
// is rejected immediately, and a stale one is rejected by the DB CAS.
export interface KnowledgeSourceClaimToken {
  run: number;
  claimedAt: Date;
}

export async function getKnowledgeSourceClaimToken(
  sourceId: string,
  db: DbExecutor = getDb(),
): Promise<KnowledgeSourceClaimToken> {
  const row = (
    await db
      .select({ updatedAt: knowledgeSources.updatedAt })
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId))
      .limit(1)
  )[0];

  if (!row) {
    throw new Error(`source_not_found:${sourceId}`);
  }

  return { run: row.updatedAt.getTime(), claimedAt: row.updatedAt };
}
