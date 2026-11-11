import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBitQuestionVariants as variants,
  knowledgeBitReviews,
  knowledgeBitSchedules,
  knowledgeBits,
  knowledgeSources,
  subjects,
} from "../db/schema.js";
import type { ApproveWaitingCardsClient, WaitingCard } from "./approve-waiting-cards.js";
import { supersedeOtherVariantsIn } from "./knowledge-bit-triage.repo.js";

export function approveWaitingCardsClient(db: DbExecutor = getDb()): ApproveWaitingCardsClient {
  return {
    listWaiting: async () => {
      const bits = await db
        .select({
          id: knowledgeBits.id,
          subjectId: knowledgeSources.subjectId,
          subjectName: subjects.name,
          kind: knowledgeSources.kind,
        })
        .from(knowledgeBits)
        .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
        .leftJoin(subjects, eq(subjects.id, knowledgeSources.subjectId))
        .where(eq(knowledgeBits.approvalState, "pending"));
      const active = await db
        .select({ bitId: variants.knowledgeBitId, id: variants.id })
        .from(variants)
        .innerJoin(knowledgeBits, eq(knowledgeBits.id, variants.knowledgeBitId))
        .where(and(eq(knowledgeBits.approvalState, "pending"), isNull(variants.supersededAt)))
        .orderBy(asc(variants.knowledgeBitId), asc(variants.order));
      const byBit = new Map<string, string[]>();

      for (const row of active) {
        byBit.set(row.bitId, [...(byBit.get(row.bitId) ?? []), row.id]);
      }

      return bits.map(
        (bit): WaitingCard => ({
          id: bit.id,
          subjectId: bit.subjectId,
          subjectName: bit.subjectName,
          activeVariantIds: byBit.get(bit.id) ?? [],
          isPhrase: bit.kind === "phrase",
        }),
      );
    },
    approve: (cards) =>
      db.transaction(async (tx) => {
        const approved = await tx
          .update(knowledgeBits)
          .set({ approvalState: "approved", reviewFlag: null, decidedAt: new Date() })
          .where(
            and(
              inArray(knowledgeBits.id, cards.map((card) => card.id)),
              eq(knowledgeBits.approvalState, "pending"),
            ),
          )
          .returning({ id: knowledgeBits.id });
        const done = new Set(approved.map((row) => row.id));

        for (const card of cards) {
          const [first] = card.activeVariantIds;

          if (done.has(card.id) && card.isPhrase && first && card.activeVariantIds.length > 1) {
            await supersedeOtherVariantsIn(tx, card.id, [first]);
          }
        }

        return approved.length;
      }),
    countApprovedUnseen: async () => {
      const row = (
        await db
          .select({ count: sql<number>`count(*)::int` })
          .from(knowledgeBits)
          .where(
            and(
              eq(knowledgeBits.approvalState, "approved"),
              sql`exists (select 1 from ${variants} where ${variants.knowledgeBitId} = ${knowledgeBits.id} and ${variants.supersededAt} is null)`,
              sql`not exists (select 1 from ${knowledgeBitSchedules} where ${knowledgeBitSchedules.knowledgeBitId} = ${knowledgeBits.id} and ${knowledgeBitSchedules.reviewCount} > 0)`,
              sql`not exists (select 1 from ${knowledgeBitReviews} where ${knowledgeBitReviews.knowledgeBitId} = ${knowledgeBits.id})`,
            ),
          )
      )[0];

      return row?.count ?? 0;
    },
  };
}
