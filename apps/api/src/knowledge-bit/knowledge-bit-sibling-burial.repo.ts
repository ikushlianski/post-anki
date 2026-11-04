import { and, eq, gt, isNull } from "drizzle-orm";
import { cardKeyFor } from "@post-anki/shared";
import {
  knowledgeBitQuestionVariants,
  knowledgeBitReviews,
  knowledgeBitSchedules,
  type KnowledgeBitBuriedSibling,
} from "../db/schema.js";
import type { Tx } from "../shared/merge-lock.js";
import { scheduleKeyIs } from "./knowledge-bit-schedule.repo.js";
import {
  deriveSiblingBurial,
  deriveSiblingRelease,
  type SiblingBurialRow,
} from "./knowledge-bit-sibling-burial.js";

export interface ActiveCardVariant {
  variantId: string;
  cardKey: string;
}

export async function listActiveCardVariantsInTx(
  tx: Tx,
  knowledgeBitId: string,
): Promise<ActiveCardVariant[]> {
  const rows = await tx
    .select({
      variantId: knowledgeBitQuestionVariants.id,
      kind: knowledgeBitQuestionVariants.kind,
      order: knowledgeBitQuestionVariants.order,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        eq(knowledgeBitQuestionVariants.knowledgeBitId, knowledgeBitId),
        isNull(knowledgeBitQuestionVariants.supersededAt),
      ),
    );

  return rows.map((row) => ({ variantId: row.variantId, cardKey: cardKeyFor(row) }));
}

async function readBurialRowsInTx(
  tx: Tx,
  knowledgeBitId: string,
): Promise<Map<string, SiblingBurialRow>> {
  const rows = await tx
    .select({
      cardKey: knowledgeBitSchedules.cardKey,
      reviewCount: knowledgeBitSchedules.reviewCount,
      dueAt: knowledgeBitSchedules.dueAt,
      suspendedAt: knowledgeBitSchedules.suspendedAt,
      buriedUntil: knowledgeBitSchedules.buriedUntil,
    })
    .from(knowledgeBitSchedules)
    .where(eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBitId));

  return new Map(rows.map(({ cardKey, ...row }) => [cardKey, row]));
}

async function setBuriedUntilInTx(
  tx: Tx,
  knowledgeBitId: string,
  cardKey: string,
  buriedUntil: Date | null,
): Promise<void> {
  await tx
    .insert(knowledgeBitSchedules)
    .values({ knowledgeBitId, cardKey, reviewCount: 0, phase: "new", buriedUntil })
    .onConflictDoUpdate({
      target: [knowledgeBitSchedules.knowledgeBitId, knowledgeBitSchedules.cardKey],
      set: { buriedUntil },
    });
}

export async function buryCardSiblingsInTx(
  tx: Tx,
  knowledgeBitId: string,
  gradedKey: string,
  activeKeys: string[],
  buryUntil: Date,
): Promise<KnowledgeBitBuriedSibling[]> {
  const rows = await readBurialRowsInTx(tx, knowledgeBitId);
  const buried = deriveSiblingBurial({ gradedKey, activeKeys, rows, buryUntil });

  for (const sibling of buried) {
    await setBuriedUntilInTx(tx, knowledgeBitId, sibling.cardKey, buryUntil);
  }

  return buried;
}

async function hasLiveReviewAfterInTx(
  tx: Tx,
  knowledgeBitId: string,
  cardKey: string,
  after: Date,
): Promise<boolean> {
  const rows = await tx
    .select({ id: knowledgeBitReviews.id })
    .from(knowledgeBitReviews)
    .where(
      and(
        eq(knowledgeBitReviews.knowledgeBitId, knowledgeBitId),
        eq(knowledgeBitReviews.cardKey, cardKey),
        isNull(knowledgeBitReviews.undoneAt),
        gt(knowledgeBitReviews.reviewedAt, after),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

export async function releaseCardSiblingsInTx(
  tx: Tx,
  knowledgeBitId: string,
  gradedAt: Date,
  buried: KnowledgeBitBuriedSibling[],
): Promise<string[]> {
  if (buried.length === 0) {
    return [];
  }

  const rows = await readBurialRowsInTx(tx, knowledgeBitId);
  const released: string[] = [];

  for (const sibling of buried) {
    const outcome = deriveSiblingRelease({
      sibling,
      row: rows.get(sibling.cardKey) ?? null,
      reviewedSinceGrade: await hasLiveReviewAfterInTx(tx, knowledgeBitId, sibling.cardKey, gradedAt),
    });

    if (outcome.action === "delete") {
      await tx.delete(knowledgeBitSchedules).where(scheduleKeyIs(knowledgeBitId, sibling.cardKey));
      released.push(sibling.cardKey);
    } else if (outcome.action === "restore") {
      await setBuriedUntilInTx(tx, knowledgeBitId, sibling.cardKey, outcome.buriedUntil);
      released.push(sibling.cardKey);
    }
  }

  return released;
}

export const variantIdsForKeys = (variants: ActiveCardVariant[], cardKeys: string[]): string[] =>
  variants.filter((variant) => cardKeys.includes(variant.cardKey)).map((variant) => variant.variantId);
