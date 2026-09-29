import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { KnowledgeBitQuestionVariantKind } from "@post-anki/shared";
import { getDb, type Db, type DbExecutor } from "../db/client.js";
import { knowledgeBits } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { insertQuestionVariant, type KnowledgeBitForQuestionGenerationScan } from "./knowledge-bit-question-variant.repo.js";

// A failed bit stays a candidate until it hits the attempts cap.
export const FILL_BLANK_GENERATION_MAX_ATTEMPTS = 3;

// A claim older than this is treated as abandoned and becomes claimable again.
export const FILL_BLANK_GENERATION_CLAIM_STALE_MINUTES = 10;

function staleClaimCutoff(): Date {
  return new Date(Date.now() - FILL_BLANK_GENERATION_CLAIM_STALE_MINUTES * 60 * 1000);
}

export async function listKnowledgeBitsForFillBlankGenerationScan(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<KnowledgeBitForQuestionGenerationScan[]> {
  return db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
    })
    .from(knowledgeBits)
    .where(
      and(
        isNull(knowledgeBits.fillBlankGeneratedAt),
        or(
          isNull(knowledgeBits.fillBlankGenerationFailedAt),
          lt(knowledgeBits.fillBlankGenerationAttempts, FILL_BLANK_GENERATION_MAX_ATTEMPTS),
        ),
        or(
          isNull(knowledgeBits.fillBlankGenerationClaimedAt),
          lt(knowledgeBits.fillBlankGenerationClaimedAt, staleClaimCutoff()),
        ),
      ),
    )
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
}

// Atomic claim-then-act (mirrors resolvePlacementSuggestion): the UPDATE's WHERE re-checks every
// candidate condition, so only one of two racing scans wins. Token, not timestamp, is the identity.
// Also re-checks body against what the scan read, so a concurrent edit (which resets these columns
// to null) can't let a stale claim through the same window before the reset lands.
export async function claimKnowledgeBitForFillBlankGeneration(
  id: string,
  expectedBody: string,
  db: DbExecutor = getDb(),
): Promise<string | null> {
  const claimToken = newId("fbgc");
  const claimed = await db
    .update(knowledgeBits)
    .set({ fillBlankGenerationClaimedAt: new Date(), fillBlankGenerationClaimToken: claimToken })
    .where(
      and(
        eq(knowledgeBits.id, id),
        eq(knowledgeBits.body, expectedBody),
        isNull(knowledgeBits.fillBlankGeneratedAt),
        or(
          isNull(knowledgeBits.fillBlankGenerationFailedAt),
          lt(knowledgeBits.fillBlankGenerationAttempts, FILL_BLANK_GENERATION_MAX_ATTEMPTS),
        ),
        or(
          isNull(knowledgeBits.fillBlankGenerationClaimedAt),
          lt(knowledgeBits.fillBlankGenerationClaimedAt, staleClaimCutoff()),
        ),
      ),
    )
    .returning({ id: knowledgeBits.id });

  return claimed.length > 0 ? claimToken : null;
}

export class FillBlankGenerationClaimLostError extends Error {
  constructor() {
    super("knowledge_bit_fill_blank_generation_claim_lost");
  }
}

// Throws instead of silently no-op'ing on a lost claim — a plain 0-row UPDATE would otherwise let
// a losing scan's transaction still commit its variant insert, orphaning a row never marked generated.
export async function markFillBlankGenerated(
  id: string,
  claimToken: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  const updated = await db
    .update(knowledgeBits)
    .set({
      fillBlankGeneratedAt: new Date(),
      fillBlankGenerationClaimedAt: null,
      fillBlankGenerationClaimToken: null,
    })
    .where(
      and(
        eq(knowledgeBits.id, id),
        isNull(knowledgeBits.fillBlankGeneratedAt),
        eq(knowledgeBits.fillBlankGenerationClaimToken, claimToken),
      ),
    )
    .returning({ id: knowledgeBits.id });

  if (updated.length === 0) {
    throw new FillBlankGenerationClaimLostError();
  }
}

// Same claim-ownership throw as markFillBlankGenerated — a lost claim here just means another scan
// already resolved this bit, which the orchestrator treats as harmless and continues past.
export async function markFillBlankGenerationFailed(
  id: string,
  claimToken: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  const updated = await db
    .update(knowledgeBits)
    .set({
      fillBlankGenerationFailedAt: new Date(),
      fillBlankGenerationAttempts: sql`${knowledgeBits.fillBlankGenerationAttempts} + 1`,
      fillBlankGenerationClaimedAt: null,
      fillBlankGenerationClaimToken: null,
    })
    .where(
      and(
        eq(knowledgeBits.id, id),
        isNull(knowledgeBits.fillBlankGeneratedAt),
        eq(knowledgeBits.fillBlankGenerationClaimToken, claimToken),
      ),
    )
    .returning({ id: knowledgeBits.id });

  if (updated.length === 0) {
    throw new FillBlankGenerationClaimLostError();
  }
}

// Same atomicity guarantee as recordGeneratedQuestionVariant, mirrored for the fill-blank pass.
export async function recordGeneratedFillBlankVariant(
  knowledgeBitId: string,
  kind: KnowledgeBitQuestionVariantKind,
  order: number,
  prompt: string,
  answer: string,
  claimToken: string,
  db: Db = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await insertQuestionVariant(knowledgeBitId, kind, order, prompt, answer, tx);
    await markFillBlankGenerated(knowledgeBitId, claimToken, tx);
  });
}
