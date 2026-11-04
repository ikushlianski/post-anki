import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitSchedules } from "../db/schema.js";
import { deriveEditScheduleChange } from "./knowledge-bit-card-edit-schedule.js";

export async function syncScheduleRowsAfterEditInTx(
  tx: DbExecutor,
  knowledgeBitId: string,
  before: string[],
  after: string[],
  now: Date,
): Promise<void> {
  const suspended = await tx
    .select({ cardKey: knowledgeBitSchedules.cardKey })
    .from(knowledgeBitSchedules)
    .where(
      and(
        eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBitId),
        isNotNull(knowledgeBitSchedules.suspendedAt),
      ),
    );
  const { removed, addedSuspended } = deriveEditScheduleChange({
    before,
    after,
    suspendedKeys: new Set(suspended.map((row) => row.cardKey)),
  });

  if (removed.length > 0) {
    await tx
      .delete(knowledgeBitSchedules)
      .where(
        and(
          eq(knowledgeBitSchedules.knowledgeBitId, knowledgeBitId),
          inArray(knowledgeBitSchedules.cardKey, removed),
        ),
      );
  }

  for (const cardKey of addedSuspended) {
    await tx
      .insert(knowledgeBitSchedules)
      .values({ knowledgeBitId, cardKey, reviewCount: 0, phase: "new", suspendedAt: now })
      .onConflictDoNothing();
  }
}
