import { and, eq, isNull } from "drizzle-orm";
import { buildClozeCards, parseCloze, stripClozeMarkers, type ClozeError } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeBitQuestionVariants } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { syncScheduleRowsAfterEditInTx } from "./knowledge-bit-card-edit-schedule.repo.js";

export interface EditedClozeCard {
  id: string;
  order: number;
  prompt: string;
  answer: string;
}

export type EditKnowledgeBitClozeNoteResult =
  | { ok: true; knowledgeBitId: string; variantId: string; cards: EditedClozeCard[] }
  | { error: "not_found" | "blocked" | "wrong_shape" }
  | { error: "invalid_note"; reason: ClozeError };

export async function editKnowledgeBitClozeNote(
  variantId: string,
  note: string,
  db: DbExecutor = getDb(),
): Promise<EditKnowledgeBitClozeNoteResult> {
  const parsed = parseCloze(note);

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

    if (edited.kind !== "cloze") {
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
      return { error: "invalid_note" as const, reason: parsed.error };
    }

    const active = await tx
      .select({
        id: knowledgeBitQuestionVariants.id,
        order: knowledgeBitQuestionVariants.order,
        prompt: knowledgeBitQuestionVariants.prompt,
        answer: knowledgeBitQuestionVariants.answer,
        sentence: knowledgeBitQuestionVariants.sentence,
      })
      .from(knowledgeBitQuestionVariants)
      .where(
        and(
          eq(knowledgeBitQuestionVariants.knowledgeBitId, edited.knowledgeBitId),
          eq(knowledgeBitQuestionVariants.kind, "cloze"),
          isNull(knowledgeBitQuestionVariants.supersededAt),
        ),
      );
    const activeByOrder = new Map(active.map((row) => [row.order, row]));
    const cards = buildClozeCards(parsed.note);
    const keptOrders = new Set(cards.map((card) => card.n));
    const result: EditedClozeCard[] = [];

    for (const row of active) {
      if (!keptOrders.has(row.order)) {
        await supersede(tx, row.id);
      }
    }

    for (const card of cards) {
      const current = activeByOrder.get(card.n);

      if (current && current.prompt === card.prompt && current.answer === card.answer && current.sentence === note) {
        result.push({ id: current.id, order: card.n, prompt: card.prompt, answer: card.answer });
        continue;
      }

      if (current) {
        await supersede(tx, current.id);
      }

      const id = newId("kbqv");

      await tx.insert(knowledgeBitQuestionVariants).values({
        id,
        knowledgeBitId: edited.knowledgeBitId,
        kind: "cloze",
        order: card.n,
        prompt: card.prompt,
        answer: card.answer,
        sentence: note,
      });
      result.push({ id, order: card.n, prompt: card.prompt, answer: card.answer });
    }

    await syncScheduleRowsAfterEditInTx(
      tx,
      edited.knowledgeBitId,
      active.map((row) => `cloze:${row.order}`),
      cards.map((card) => `cloze:${card.n}`),
      new Date(),
    );

    await tx
      .update(knowledgeBits)
      .set({ body: stripClozeMarkers(parsed.note) })
      .where(eq(knowledgeBits.id, edited.knowledgeBitId));

    const replacement = result.find((card) => card.order === edited.order) ?? result[0];

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
