import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeSources } from "../db/schema.js";
import { DURABLE_HARD_CEILING_MS, DURABLE_OWNER_PREFIX } from "./durable-extraction.config.js";

export interface PendingKnowledgeSource {
  id: string;
  rawText: string | null;
  extractionModelId: string | null;
  subjectId: string | null;
  // The `updatedAt` value this exact claim set — an ownership token. Every
  // later write for this source must require it still matches, so a claim
  // reclaimed by `resetStaleProcessingKnowledgeSources` (or a second scan)
  // can never be corrupted by a late-finishing first attempt.
  claimedAt: Date;
}

export async function claimPendingKnowledgeSources(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<PendingKnowledgeSource[]> {
  const candidates = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.status, "pending"))
    .limit(limit);

  const claimed: PendingKnowledgeSource[] = [];

  for (const candidate of candidates) {
    const claimedAt = new Date();
    const rows = await db
      .update(knowledgeSources)
      .set({ status: "processing", updatedAt: claimedAt })
      .where(and(eq(knowledgeSources.id, candidate.id), eq(knowledgeSources.status, "pending")))
      .returning({
        id: knowledgeSources.id,
        rawText: knowledgeSources.rawText,
        extractionModelId: knowledgeSources.extractionModelId,
        subjectId: knowledgeSources.subjectId,
      });

    const claimedRow = rows[0];

    if (claimedRow) {
      claimed.push({ ...claimedRow, claimedAt });
    }
  }

  return claimed;
}

export async function markKnowledgeSourceFailed(
  id: string,
  reason: string,
  claimedAt: Date,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(knowledgeSources)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.id, id),
        eq(knowledgeSources.status, "processing"),
        eq(knowledgeSources.updatedAt, claimedAt),
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length > 0;
}

export async function markKnowledgeSourceBitsDetected(
  id: string,
  claimedAt: Date,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(knowledgeSources)
    .set({ status: "bits_detected", failureReason: null, nothingExtractedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.id, id),
        eq(knowledgeSources.status, "processing"),
        eq(knowledgeSources.updatedAt, claimedAt),
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length > 0;
}

export async function resetStaleProcessingKnowledgeSources(
  staleAfterMs: number,
  db: DbExecutor = getDb(),
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const durableCeiling = new Date(Date.now() - DURABLE_HARD_CEILING_MS);

  const rows = await db
    .update(knowledgeSources)
    .set({ status: "pending", failureReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.status, "processing"),
        lt(knowledgeSources.updatedAt, cutoff),
        sql`(${knowledgeSources.failureReason} IS NULL OR ${knowledgeSources.failureReason} NOT LIKE ${`${DURABLE_OWNER_PREFIX}%`} OR ${knowledgeSources.updatedAt} < ${durableCeiling})`,
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length;
}

const RUN_ID_SEPARATOR = "#";

function ownerMatches(workflowId: string) {
  const token = `${DURABLE_OWNER_PREFIX}${workflowId}`;

  return sql`(${knowledgeSources.failureReason} = ${token} OR ${knowledgeSources.failureReason} LIKE ${`${token.replace(/[\\%_]/g, "\\$&")}${RUN_ID_SEPARATOR}%`})`;
}

export async function claimOrLoadSourceForExtraction(
  id: string,
  options: { regeneration: boolean; workflowId: string; engineRunId?: string },
  db: DbExecutor = getDb(),
): Promise<PendingKnowledgeSource | null> {
  const ownerToken = `${DURABLE_OWNER_PREFIX}${options.workflowId}`;
  const writtenToken = options.engineRunId ? `${ownerToken}${RUN_ID_SEPARATOR}${options.engineRunId}` : ownerToken;
  const claimedAt = new Date();

  const claimed = options.regeneration
    ? []
    : await db
        .update(knowledgeSources)
        .set({ status: "processing", failureReason: writtenToken, updatedAt: claimedAt })
        .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.status, "pending")))
        .returning({
          id: knowledgeSources.id,
          rawText: knowledgeSources.rawText,
          extractionModelId: knowledgeSources.extractionModelId,
          subjectId: knowledgeSources.subjectId,
        });

  if (claimed[0]) {
    return { ...claimed[0], claimedAt };
  }

  const existing = (
    await db
      .select({
        id: knowledgeSources.id,
        rawText: knowledgeSources.rawText,
        extractionModelId: knowledgeSources.extractionModelId,
        subjectId: knowledgeSources.subjectId,
        updatedAt: knowledgeSources.updatedAt,
      })
      .from(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.id, id),
          eq(knowledgeSources.status, "processing"),
          ownerMatches(options.workflowId),
        ),
      )
      .limit(1)
  )[0];

  if (existing && options.engineRunId) {
    await db
      .update(knowledgeSources)
      .set({ failureReason: writtenToken })
      .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.status, "processing"), ownerMatches(options.workflowId)));
  }

  return existing ? { ...existing, claimedAt: existing.updatedAt } : null;
}

export async function failSourceByEngineRunId(
  engineRunId: string,
  reason: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const suffix = `${RUN_ID_SEPARATOR}${engineRunId}`.replace(/[\\%_]/g, "\\$&");
  const rows = await db
    .update(knowledgeSources)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.status, "processing"),
        sql`${knowledgeSources.failureReason} LIKE ${`${DURABLE_OWNER_PREFIX}%${suffix}`}`,
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length > 0;
}

export async function failSourceOwnedByWorkflow(
  id: string,
  workflowId: string,
  reason: string,
  db: DbExecutor = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(knowledgeSources)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSources.id, id),
        eq(knowledgeSources.status, "processing"),
        ownerMatches(workflowId),
      ),
    )
    .returning({ id: knowledgeSources.id });

  return rows.length > 0;
}
