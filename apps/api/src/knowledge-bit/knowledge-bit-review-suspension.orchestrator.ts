import type { ScheduleControlInput, ScheduleControlResult } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { knowledgeBits } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { withSubjectLock } from "../shared/merge-lock.js";
import { listActiveCardVariantsInTx } from "./knowledge-bit-sibling-burial.repo.js";
import { isLeech } from "./knowledge-bit-grade-schedule-leech.js";
import { getLocalDayWindow } from "./knowledge-bit-review.repo.js";
import { deriveSuspensionChange } from "./knowledge-bit-review-suspension.js";
import {
  readKnowledgeBitScheduleInTx,
  writeKnowledgeBitScheduleControlsInTx,
} from "./knowledge-bit-schedule.repo.js";

export type UpdateScheduleControlsOutcome =
  | ({ ok: true } & ScheduleControlResult)
  | { ok: false; error: "not_found" | "not_approved" | "variant_not_found" };

export async function updateKnowledgeBitScheduleControls(
  knowledgeBitId: string,
  input: ScheduleControlInput,
  now: Date = new Date(),
): Promise<UpdateScheduleControlsOutcome> {
  const [bit] = await getDb()
    .select({ approvalState: knowledgeBits.approvalState })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.id, knowledgeBitId))
    .limit(1);

  if (!bit) {
    return { ok: false, error: "not_found" };
  }

  if (bit.approvalState !== "approved") {
    return { ok: false, error: "not_approved" };
  }

  const { endsAt } = await getLocalDayWindow(input.tz, now);

  return withSubjectLock(knowledgeBitId, async (tx) => {
    const variants = await listActiveCardVariantsInTx(tx, knowledgeBitId);
    const named = input.variantId
      ? variants.find((variant) => variant.variantId === input.variantId)
      : undefined;

    if (input.variantId && !named) {
      return { ok: false as const, error: "variant_not_found" as const };
    }

    const wholeNoteKeys = [...new Set(variants.map((variant) => variant.cardKey))];
    const independentKeys = wholeNoteKeys.filter((key) => key !== "");
    const cardKeys = named
      ? [named.cardKey]
      : independentKeys.length > 0
        ? wholeNoteKeys
        : [""];
    const changes: { suspendedAt: Date | null; buriedUntil: Date | null; lapses: number }[] = [];

    for (const cardKey of cardKeys) {
      const current = await readKnowledgeBitScheduleInTx(tx, knowledgeBitId, cardKey);
      const next = deriveSuspensionChange({ current, input, now, buryUntil: endsAt });

      await writeKnowledgeBitScheduleControlsInTx(tx, knowledgeBitId, cardKey, next);
      changes.push({ ...next, lapses: current?.lapses ?? 0 });
    }

    const latestBuriedUntil = changes.reduce<Date | null>(
      (latest, change) =>
        change.buriedUntil && change.buriedUntil > now && (!latest || change.buriedUntil > latest)
          ? change.buriedUntil
          : latest,
      null,
    );

    return {
      ok: true as const,
      knowledgeBitId,
      suspended: changes.every((change) => change.suspendedAt !== null),
      buriedUntil: latestBuriedUntil?.toISOString() ?? null,
      leech: changes.some((change) => isLeech(change.lapses)),
      cardKey: named ? named.cardKey : null,
    };
  });
}
