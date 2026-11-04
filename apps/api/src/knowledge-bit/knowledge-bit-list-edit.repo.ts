import { and, eq, isNull } from "drizzle-orm";
import {
  buildOrderedListCards,
  formatOrderedListText,
  isOrderedListKind,
  orderedListStatement,
  parseOrderedListText,
  type OrderedListError,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitQuestionVariants } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { syncScheduleRowsAfterEditInTx } from "./knowledge-bit-card-edit-schedule.repo.js";

export interface EditedListCard {
  id: string;
  kind: string;
  order: number;
  prompt: string;
  answer: string;
}

export type EditKnowledgeBitListResult =
  | { ok: true; knowledgeBitId: string; variantId: string; cards: EditedListCard[] }
  | { error: "not_found" | "blocked" | "wrong_shape" }
  | { error: "invalid_list"; reason: OrderedListError };

const slotKey = (kind: string, order: number) => `${kind}:${order}`;

export async function editKnowledgeBitOrderedList(
  variantId: string,
  listText: string,
  db: DbExecutor = getDb(),
): Promise<EditKnowledgeBitListResult> {
  const parsed = parseOrderedListText(listText);

  return db.transaction(async (tx) => {
    const edited = (
      await tx
        .select({
          knowledgeBitId: knowledgeBitQuestionVariants.knowledgeBitId,
          kind: knowledgeBitQuestionVariants.kind,
          order: knowledgeBitQuestionVariants.order,
        })
        .from(knowledgeBitQuestionVariants)
        .where(and(eq(knowledgeBitQuestionVariants.id, variantId), isNull(knowledgeBitQuestionVariants.supersededAt)))
        .limit(1)
    )[0];

    if (!edited) {
      return { error: "not_found" as const };
    }

    if (!isOrderedListKind(edited.kind)) {
      return { error: "wrong_shape" as const };
    }

    const bit = (
      await tx
        .select({ approvalState: knowledgeBits.approvalState })
        .from(knowledgeBits)
        .where(eq(knowledgeBits.id, edited.knowledgeBitId))
        .for("update")
    )[0];

    if (!bit) {
      return { error: "not_found" as const };
    }

    if (bit.approvalState === "rejected" || bit.approvalState === "superseded") {
      return { error: "blocked" as const };
    }

    if (!parsed.ok) {
      return { error: "invalid_list" as const, reason: parsed.error };
    }

    const canonical = formatOrderedListText(parsed.list);
    const active = (
      await tx
        .select({
          id: knowledgeBitQuestionVariants.id,
          kind: knowledgeBitQuestionVariants.kind,
          order: knowledgeBitQuestionVariants.order,
          prompt: knowledgeBitQuestionVariants.prompt,
          answer: knowledgeBitQuestionVariants.answer,
          sentence: knowledgeBitQuestionVariants.sentence,
        })
        .from(knowledgeBitQuestionVariants)
        .where(
          and(
            eq(knowledgeBitQuestionVariants.knowledgeBitId, edited.knowledgeBitId),
            isNull(knowledgeBitQuestionVariants.supersededAt),
          ),
        )
    ).filter((row) => isOrderedListKind(row.kind));
    const activeBySlot = new Map(active.map((row) => [slotKey(row.kind, row.order), row]));
    const cards = buildOrderedListCards(parsed.list);
    const keptSlots = new Set(cards.map((card) => slotKey(card.kind, card.order)));
    const result: EditedListCard[] = [];

    for (const row of active) {
      if (!keptSlots.has(slotKey(row.kind, row.order))) {
        await supersede(tx, row.id);
      }
    }

    for (const card of cards) {
      const current = activeBySlot.get(slotKey(card.kind, card.order));

      if (current && current.prompt === card.prompt && current.answer === card.answer) {
        if (current.sentence !== canonical) {
          await tx
            .update(knowledgeBitQuestionVariants)
            .set({ sentence: canonical })
            .where(eq(knowledgeBitQuestionVariants.id, current.id));
        }

        result.push({ id: current.id, ...card });
        continue;
      }

      if (current) {
        await supersede(tx, current.id);
      }

      const id = newId("kbqv");

      await tx.insert(knowledgeBitQuestionVariants).values({
        id,
        knowledgeBitId: edited.knowledgeBitId,
        kind: card.kind,
        order: card.order,
        prompt: card.prompt,
        answer: card.answer,
        sentence: canonical,
      });
      result.push({ id, ...card });
    }

    await syncScheduleRowsAfterEditInTx(
      tx,
      edited.knowledgeBitId,
      active.map((row) => slotKey(row.kind, row.order)),
      cards.map((card) => slotKey(card.kind, card.order)),
      new Date(),
    );

    await tx
      .update(knowledgeBits)
      .set({ body: orderedListStatement(parsed.list) })
      .where(eq(knowledgeBits.id, edited.knowledgeBitId));

    const replacement =
      result.find((card) => card.kind === edited.kind && card.order === edited.order) ?? result[result.length - 1];

    if (!replacement) {
      return { error: "not_found" as const };
    }

    return { ok: true as const, knowledgeBitId: edited.knowledgeBitId, variantId: replacement.id, cards: result };
  });
}

async function supersede(tx: DbExecutor, variantId: string): Promise<void> {
  await tx
    .update(knowledgeBitQuestionVariants)
    .set({ supersededAt: new Date() })
    .where(eq(knowledgeBitQuestionVariants.id, variantId));
}
