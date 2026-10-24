import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import {
  bitOpenForVariantGeneration,
  type VariantGenerationScope,
} from "./knowledge-bit-variant-generation-gate.js";
import type { KnowledgeBitQuestionVariantKind } from "@post-anki/shared";
import { getDb, type Db, type DbExecutor } from "../db/client.js";
import { knowledgeBits } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { insertQuestionVariant, type KnowledgeBitForQuestionGenerationScan } from "./knowledge-bit-question-variant.repo.js";

// A failed bit stays a candidate until it hits the attempts cap, mirroring the fill-blank pipeline.
export const WH_QUESTION_GENERATION_MAX_ATTEMPTS = 3;

// A claim older than this is treated as abandoned and becomes claimable again.
export const WH_QUESTION_GENERATION_CLAIM_STALE_MINUTES = 10;

function staleClaimCutoff(): Date {
  return new Date(Date.now() - WH_QUESTION_GENERATION_CLAIM_STALE_MINUTES * 60 * 1000);
}

export async function listKnowledgeBitsForWhQuestionGenerationScan(
  limit: number,
  scope: VariantGenerationScope = {},
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
        isNull(knowledgeBits.whQuestionGeneratedAt),
        bitOpenForVariantGeneration(scope),
        or(
          isNull(knowledgeBits.whQuestionGenerationFailedAt),
          lt(knowledgeBits.whQuestionGenerationAttempts, WH_QUESTION_GENERATION_MAX_ATTEMPTS),
        ),
        or(
          isNull(knowledgeBits.whQuestionGenerationClaimedAt),
          lt(knowledgeBits.whQuestionGenerationClaimedAt, staleClaimCutoff()),
        ),
      ),
    )
    .orderBy(asc(knowledgeBits.createdAt))
    .limit(limit);
}

// Atomic claim-then-act: the UPDATE's WHERE re-checks every candidate condition, so only one
// of two racing scans wins. Token, not timestamp, is the identity. Also re-checks body against
// what the scan read, so a concurrent edit (which resets these columns to null) can't let a stale
// claim through the same window before the reset lands.
export async function claimKnowledgeBitForWhQuestionGeneration(
  id: string,
  expectedBody: string,
  scope: VariantGenerationScope = {},
  db: DbExecutor = getDb(),
): Promise<string | null> {
  const claimToken = newId("whgc");
  const claimed = await db
    .update(knowledgeBits)
    .set({ whQuestionGenerationClaimedAt: new Date(), whQuestionGenerationClaimToken: claimToken })
    .where(
      and(
        eq(knowledgeBits.id, id),
        eq(knowledgeBits.body, expectedBody),
        isNull(knowledgeBits.whQuestionGeneratedAt),
        bitOpenForVariantGeneration(scope),
        or(
          isNull(knowledgeBits.whQuestionGenerationFailedAt),
          lt(knowledgeBits.whQuestionGenerationAttempts, WH_QUESTION_GENERATION_MAX_ATTEMPTS),
        ),
        or(
          isNull(knowledgeBits.whQuestionGenerationClaimedAt),
          lt(knowledgeBits.whQuestionGenerationClaimedAt, staleClaimCutoff()),
        ),
      ),
    )
    .returning({ id: knowledgeBits.id });

  return claimed.length > 0 ? claimToken : null;
}

export class WhQuestionGenerationClaimLostError extends Error {
  constructor() {
    super("knowledge_bit_wh_question_generation_claim_lost");
  }
}

// Throws instead of silently no-op'ing on a lost claim — a plain 0-row UPDATE would otherwise let
// a losing scan's transaction still commit its variant insert, orphaning a row never marked generated.
export async function markWhQuestionGenerated(
  id: string,
  claimToken: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  const updated = await db
    .update(knowledgeBits)
    .set({
      whQuestionGeneratedAt: new Date(),
      whQuestionGenerationClaimedAt: null,
      whQuestionGenerationClaimToken: null,
    })
    .where(
      and(
        eq(knowledgeBits.id, id),
        isNull(knowledgeBits.whQuestionGeneratedAt),
        eq(knowledgeBits.whQuestionGenerationClaimToken, claimToken),
      ),
    )
    .returning({ id: knowledgeBits.id });

  if (updated.length === 0) {
    throw new WhQuestionGenerationClaimLostError();
  }
}

// Same claim-ownership throw as markWhQuestionGenerated — a lost claim here just means another
// scan already resolved this bit, which the orchestrator treats as harmless and continues past.
export async function markWhQuestionGenerationFailed(
  id: string,
  claimToken: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  const updated = await db
    .update(knowledgeBits)
    .set({
      whQuestionGenerationFailedAt: new Date(),
      whQuestionGenerationAttempts: sql`${knowledgeBits.whQuestionGenerationAttempts} + 1`,
      whQuestionGenerationClaimedAt: null,
      whQuestionGenerationClaimToken: null,
    })
    .where(
      and(
        eq(knowledgeBits.id, id),
        isNull(knowledgeBits.whQuestionGeneratedAt),
        eq(knowledgeBits.whQuestionGenerationClaimToken, claimToken),
      ),
    )
    .returning({ id: knowledgeBits.id });

  if (updated.length === 0) {
    throw new WhQuestionGenerationClaimLostError();
  }
}

// Same atomicity guarantee as recordGeneratedFillBlankVariant, mirrored for the wh_question pass.
export async function recordGeneratedQuestionVariant(
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
    await markWhQuestionGenerated(knowledgeBitId, claimToken, tx);
  });
}
