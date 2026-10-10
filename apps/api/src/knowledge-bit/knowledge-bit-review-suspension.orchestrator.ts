import type { ScheduleControlInput, ScheduleControlResult } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { knowledgeBits } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { withSubjectLock } from "../shared/merge-lock.js";
import { isLeech } from "./knowledge-bit-grade-schedule-leech.js";
import { getLocalDayWindow } from "./knowledge-bit-review.repo.js";
import { deriveSuspensionChange } from "./knowledge-bit-review-suspension.js";
import {
  readKnowledgeBitScheduleInTx,
  writeKnowledgeBitScheduleControlsInTx,
} from "./knowledge-bit-schedule.repo.js";

export type UpdateScheduleControlsOutcome =
  | ({ ok: true } & ScheduleControlResult)
  | { ok: false; error: "not_found" | "not_approved" };

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
    const current = await readKnowledgeBitScheduleInTx(tx, knowledgeBitId);
    const next = deriveSuspensionChange({
      current,
      input,
      now,
      buryUntil: endsAt,
    });

    await writeKnowledgeBitScheduleControlsInTx(tx, knowledgeBitId, next);

    return {
      ok: true as const,
      knowledgeBitId,
      suspended: next.suspendedAt !== null,
      buriedUntil: next.buriedUntil && next.buriedUntil > now ? next.buriedUntil.toISOString() : null,
      leech: isLeech(current?.lapses ?? 0),
    };
  });
}
